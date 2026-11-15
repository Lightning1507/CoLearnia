import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { createSessionMetadataWrite } from './session-metadata-write.js';
import type { SessionMutationRepository } from './session-metadata-write.js';

function setup() {
  const at = new Date();
  const input = {
    sessionId: new Types.ObjectId(),
    epoch: randomUUID(),
    workspaceId: new Types.ObjectId(),
    channelId: new Types.ObjectId(),
    hostUserId: new Types.ObjectId(),
    participantId: new Types.ObjectId(),
    at,
  };
  const proof: Awaited<ReturnType<SessionMutationRepository['readMutation']>> = {
    version: {
      __v: 0,
      _id: input.sessionId,
      epoch: input.epoch,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      hostUserId: input.hostUserId,
      revision: 0,
      status: 'ACTIVE',
      startedAt: at,
      endedAt: null,
      createdAt: at,
      updatedAt: at,
    },
    participant: {
      __v: 0,
      _id: input.participantId,
      sessionId: input.sessionId,
      userId: input.hostUserId,
      joinedAt: at,
      leftAt: null,
      lastScope: { kind: 'MAIN' },
      lastScopeAt: at,
      createdAt: at,
      updatedAt: at,
    },
    activeParticipants: 1,
  };
  const repository: {
    [K in keyof SessionMutationRepository]: ReturnType<typeof vi.fn<SessionMutationRepository[K]>>;
  } = {
    create: vi.fn(async () => {
      throw new Error('Lost acknowledgement');
    }),
    join: vi.fn(async () => {
      throw new Error('Lost acknowledgement');
    }),
    beginEnding: vi.fn(async () => {
      throw new Error('Lost acknowledgement');
    }),
    completeEnding: vi.fn(async () => {
      throw new Error('Lost acknowledgement');
    }),
    readMutation: vi.fn(async () => proof),
  };
  return { input, proof, repository };
}
describe('metadata write read-back', () => {
  it('confirms the exact committed create and never writes it again', async () => {
    const f = setup();
    const write = createSessionMetadataWrite(f.repository, { kind: 'create', input: f.input });
    const [one, two] = await Promise.all([write.run(), write.run()]);
    expect(two).toEqual(one);
    expect(one).toEqual({ revision: 0, participantId: f.input.participantId });
    await write.run();
    expect(f.repository.create).toHaveBeenCalledOnce();
    expect(f.repository.readMutation).toHaveBeenCalledOnce();
  });
  it('keeps an absent/read-failed result unknown, then only reads when it becomes visible', async () => {
    const f = setup();
    f.repository.readMutation.mockRejectedValueOnce(new Error('Read unavailable'));
    f.repository.readMutation.mockResolvedValueOnce({
      version: null,
      participant: null,
      activeParticipants: 0,
    });
    const write = createSessionMetadataWrite(f.repository, { kind: 'create', input: f.input });
    await expect(write.run()).rejects.toThrow();
    await expect(write.run()).rejects.toThrow();
    await expect(write.run()).resolves.toMatchObject({ revision: 0 });
    expect(f.repository.create).toHaveBeenCalledOnce();
    expect(f.repository.readMutation).toHaveBeenCalledTimes(3);
  });
  it.each(['revision', 'epoch', 'timestamp', 'participant', 'scope', 'host'] as const)(
    'rejects mismatching %s instead of inferring success from revision',
    async (field) => {
      const f = setup();
      const version = f.proof.version!,
        participant = f.proof.participant!;
      if (field === 'revision') version.revision++;
      if (field === 'epoch') version.epoch = randomUUID();
      if (field === 'timestamp') version.updatedAt = new Date(f.input.at.getTime() + 1);
      if (field === 'participant') participant.userId = new Types.ObjectId();
      if (field === 'scope') participant.lastScope = { kind: 'GROUP', groupId: randomUUID() };
      if (field === 'host') version.hostUserId = null;
      const write = createSessionMetadataWrite(f.repository, { kind: 'create', input: f.input });
      await expect(write.run()).rejects.toThrow();
      await expect(write.run()).rejects.toThrow();
      expect(f.repository.create).toHaveBeenCalledOnce();
    },
  );
  it('recovers the existing participation id returned by join upsert', async () => {
    const f = setup();
    f.proof.version!.revision = 5;
    const write = createSessionMetadataWrite(f.repository, {
      kind: 'join',
      input: {
        sessionId: f.input.sessionId,
        epoch: f.input.epoch,
        expectedRevision: 4,
        userId: f.input.hostUserId,
        participantId: new Types.ObjectId(),
        at: f.input.at,
      },
    });
    expect((await write.run()).participantId).toEqual(f.input.participantId);
    expect(f.repository.join).toHaveBeenCalledOnce();
  });
  it('requires terminal metadata and no active participation before confirming completion', async () => {
    const f = setup();
    Object.assign(f.proof.version!, {
      status: 'ENDED',
      revision: 2,
      hostUserId: null,
      endedAt: f.input.at,
    });
    const write = createSessionMetadataWrite(f.repository, {
      kind: 'completeEnding',
      input: {
        sessionId: f.input.sessionId,
        epoch: f.input.epoch,
        expectedRevision: 1,
        at: f.input.at,
      },
    });
    await expect(write.run()).rejects.toThrow();
    f.proof.activeParticipants = 0;
    await expect(write.run()).resolves.toEqual({ revision: 2 });
    expect(f.repository.completeEnding).toHaveBeenCalledOnce();
  });
  it('rechecks the current guard after read and before replaying confirmed metadata', async () => {
    const f = setup();
    let allowed = true;
    const guard = () => {
      if (!allowed) throw new Error('Stale runtime');
    };
    f.repository.readMutation.mockImplementationOnce(async () => {
      allowed = false;
      return f.proof;
    });
    const write = createSessionMetadataWrite(f.repository, { kind: 'create', input: f.input });
    await expect(write.run(guard)).rejects.toThrow('Stale runtime');
    allowed = true;
    await write.run(guard);
    allowed = false;
    await expect(write.run(guard)).rejects.toThrow('Stale runtime');
    expect(f.repository.create).toHaveBeenCalledOnce();
  });
});
