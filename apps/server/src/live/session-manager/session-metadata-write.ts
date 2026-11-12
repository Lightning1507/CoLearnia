import type { createSessionRepository } from './session-repository.js';

type Repository = ReturnType<typeof createSessionRepository>;
type Kind = 'create' | 'join' | 'beginEnding' | 'completeEnding';
type Intent = { [K in Kind]: { kind: K; input: Parameters<Repository[K]>[0] } }[Kind];
export type SessionMutationRepository = Pick<Repository, Kind | 'readMutation'>;
type Result = { revision: number; participantId?: import('mongoose').Types.ObjectId };

// One captured write, then read-only recovery. Absence or a later revision never
// proves rollback; metadata alone never grants socket/media authority.
export function createSessionMetadataWrite(repository: SessionMutationRepository, intent: Intent) {
  let started = false;
  let running: Promise<Result> | undefined;
  let confirmed: Result | undefined;
  async function readBack(guard: () => void): Promise<Result> {
    guard();
    const { input, kind } = intent;
    const proof = await repository.readMutation({
      sessionId: input.sessionId,
      epoch: input.epoch,
      ...(kind === 'create' ? { userId: intent.input.hostUserId } : {}),
      ...(kind === 'join' ? { userId: intent.input.userId } : {}),
    });
    guard();
    const version = proof.version;
    const expectedRevision = kind === 'create' ? 0 : intent.input.expectedRevision + 1;
    const status =
      kind === 'beginEnding' ? 'ENDING' : kind === 'completeEnding' ? 'ENDED' : 'ACTIVE';
    if (
      !version ||
      !version._id.equals(input.sessionId) ||
      version.epoch !== input.epoch ||
      version.revision !== expectedRevision ||
      version.status !== status ||
      version.updatedAt.getTime() !== input.at.getTime()
    )
      throw new Error('Session metadata result is unconfirmed');
    let participantId: Result['participantId'];
    if (kind === 'create' || kind === 'join') {
      const participant = proof.participant;
      const userId = kind === 'create' ? intent.input.hostUserId : intent.input.userId;
      if (
        !participant ||
        !participant.sessionId.equals(input.sessionId) ||
        !participant.userId.equals(userId) ||
        participant.leftAt !== null ||
        participant.joinedAt.getTime() !== input.at.getTime() ||
        participant.lastScope?.kind !== 'MAIN' ||
        participant.lastScopeAt?.getTime() !== input.at.getTime()
      )
        throw new Error('Session participation result is unconfirmed');
      if (
        kind === 'create' &&
        (!participant._id.equals(intent.input.participantId) ||
          !version.workspaceId.equals(intent.input.workspaceId) ||
          !version.channelId.equals(intent.input.channelId) ||
          !version.hostUserId?.equals(intent.input.hostUserId))
      )
        throw new Error('Session creation result is unconfirmed');
      participantId = participant._id;
    }
    if (
      kind === 'completeEnding' &&
      (version.hostUserId !== null ||
        version.endedAt?.getTime() !== input.at.getTime() ||
        proof.activeParticipants !== 0)
    )
      throw new Error('Session end result is unconfirmed');
    return { revision: expectedRevision, ...(participantId ? { participantId } : {}) };
  }
  return {
    async run(guard: () => void = () => {}): Promise<Result> {
      guard();
      if (confirmed) return confirmed;
      if (running) {
        const result = await running;
        guard();
        return result;
      }
      running = (async () => {
        if (!started) {
          started = true;
          try {
            let result: Result;
            switch (intent.kind) {
              case 'create':
                result = await repository.create(intent.input);
                break;
              case 'join':
                result = await repository.join(intent.input);
                break;
              case 'beginEnding':
                result = await repository.beginEnding(intent.input, guard);
                break;
              case 'completeEnding':
                result = await repository.completeEnding(intent.input, guard);
                break;
            }
            guard();
            confirmed = result;
            return result;
          } catch {
            // Keep the write spent even if its acknowledgement/guard failed.
          }
        }
        const result = await readBack(guard);
        confirmed = result;
        return result;
      })();
      try {
        return await running;
      } finally {
        running = undefined;
      }
    },
  };
}
