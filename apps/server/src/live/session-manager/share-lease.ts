import { randomUUID } from 'node:crypto';
import { requestIdSchema, sameSessionScope, screenPickerLeaseMs } from '@colearnia/contracts';
import type { LiveContext, MediaSource, SessionCleanupRequest } from '@colearnia/contracts';
import {
  canPublishMedia,
  canReceiveMedia,
  resolveSessionPolicyContext,
} from '../policy/session-policy.js';
import type { SessionPolicyInput } from '../policy/session-policy.js';
import type { HeldTransitionContext } from './session-transition.js';

export const sharePickerLeaseMs = screenPickerLeaseMs;

// All methods run synchronously inside the same session gate as policy transitions.
export type HeldShareContext = SessionPolicyInput & { assertHeld(): void };
export type ShareLease = Readonly<{
  leaseId: string;
  leaseGeneration: number;
  expiresAtMs: number;
}>;
export type ShareLeaseRef = Pick<ShareLease, 'leaseId' | 'leaseGeneration'>;
export type SharePublication = ShareLeaseRef & { publicationId: string };
type ShareError =
  'AUTH_REQUIRED' | 'FORBIDDEN' | 'CONFLICT' | 'SHARE_BUSY' | 'DEPENDENCY_UNAVAILABLE';
type Result<T> = { ok: true; value: T } | { ok: false; errorCode: ShareError };
type Slot = {
  lease: ShareLease;
  owner: LiveContext;
  state: 'RESERVED' | 'OWNED' | 'RELEASING';
  publicationId?: string;
  publication?: { close(): boolean; isStopped(): boolean };
};

export type HeldShareLease = {
  leases: ReturnType<typeof createShareLeaseRegistry>;
  held: HeldShareContext;
  retire(ref: ShareLeaseRef): Promise<void>;
};

function screen(source: MediaSource) {
  return source === 'SCREEN' || source === 'SCREEN_AUDIO';
}

function sameOwner(left: LiveContext, right: LiveContext) {
  return (
    left.participantId === right.participantId &&
    left.auth.userId === right.auth.userId &&
    left.auth.authSessionId === right.auth.authSessionId &&
    left.callGeneration === right.callGeneration &&
    left.audienceEpoch === right.audienceEpoch &&
    left.access.membershipId === right.access.membershipId &&
    left.access.membershipIncarnation === right.access.membershipIncarnation &&
    sameSessionScope(left.scope, right.scope) &&
    (left.scope.type !== 'GROUP' ||
      right.scope.type !== 'GROUP' ||
      (left.scope.mode === 'ACTIVITY' &&
        right.scope.mode === 'ACTIVITY' &&
        left.scope.roundId === right.scope.roundId))
  );
}

// One registry per live session incarnation. Dispose with that session's runtime.
export function createShareLeaseRegistry(sessionId: string, epoch: string) {
  const slots = new Map<string, Slot>();
  let generation = 0;

  function sameLease(slot: Slot, ref?: ShareLeaseRef) {
    return (
      !!ref &&
      slot.lease.leaseId === ref.leaseId &&
      slot.lease.leaseGeneration === ref.leaseGeneration
    );
  }

  function assertSession(held: Pick<HeldShareContext, 'assertHeld' | 'session' | 'nowMs'>) {
    held.assertHeld();
    if (held.session.sessionId !== sessionId || held.session.epoch !== epoch) {
      throw new Error('Share registry belongs to another session incarnation');
    }
    if (!Number.isFinite(held.nowMs)) throw new TypeError('Invalid share clock');
  }

  function scopeKey(context: LiveContext) {
    return context.scope.type === 'MAIN' ? 'MAIN' : context.scope.groupId;
  }

  function currentSlot(held: HeldShareContext, key: string) {
    const slot = slots.get(key);
    if (
      slot &&
      ((slot.state === 'RESERVED' && slot.lease.expiresAtMs <= held.nowMs) ||
        slot.publication?.isStopped())
    ) {
      closeSlot(key, slot);
      return slots.get(key);
    }
    return slot;
  }

  function authority(held: HeldShareContext): Result<LiveContext> {
    assertSession(held);
    const resolved = resolveSessionPolicyContext(held);
    if (!resolved.ok) return resolved;
    if (!canPublishMedia(held, 'SCREEN')) return { ok: false, errorCode: 'FORBIDDEN' };
    return { ok: true, value: resolved.context };
  }

  function ownedSlot(held: HeldShareContext, ref?: ShareLeaseRef): Result<Slot> {
    const resolved = authority(held);
    if (!resolved.ok) return resolved;
    const slot = currentSlot(held, scopeKey(resolved.value));
    if (
      !slot ||
      slot.state === 'RELEASING' ||
      !sameLease(slot, ref) ||
      !sameOwner(slot.owner, resolved.value)
    )
      return { ok: false, errorCode: 'CONFLICT' };
    return { ok: true, value: slot };
  }

  function closeSlot(key: string, slot: Slot) {
    slot.state = 'RELEASING';
    const closed = slot.publication?.close() ?? true;
    if (closed && slots.get(key) === slot) slots.delete(key);
  }

  return {
    bindPublicationHeld(
      held: HeldShareContext,
      publication: SharePublication,
      lifecycle: NonNullable<Slot['publication']>,
    ) {
      const result = ownedSlot(held, publication);
      if (
        !result.ok ||
        result.value.publicationId !== publication.publicationId ||
        result.value.publication
      )
        return false;
      result.value.publication = lifecycle;
      return true;
    },

    retireHeld(
      held: Pick<HeldShareContext, 'assertHeld' | 'session' | 'nowMs'>,
      ref: ShareLeaseRef,
    ) {
      assertSession(held);
      for (const [key, slot] of slots) if (sameLease(slot, ref)) closeSlot(key, slot);
    },

    stopHeld(held: HeldShareContext, ref: ShareLeaseRef): boolean {
      assertSession(held);
      const resolved = resolveSessionPolicyContext(held);
      if (!resolved.ok) return false;
      const { context } = resolved;
      // Stop is cleanup of an exact old lease. A scope change must not hide it.
      for (const [key, slot] of slots) {
        const { owner } = slot;
        if (
          !sameLease(slot, ref) ||
          owner.participantId !== context.participantId ||
          owner.callGeneration !== context.callGeneration ||
          owner.auth.authSessionId !== context.auth.authSessionId ||
          owner.auth.userId !== context.auth.userId
        )
          continue;
        closeSlot(key, slot);
        return true;
      }
      return false;
    },

    acquireHeld(held: HeldShareContext): Result<ShareLease> {
      const resolved = authority(held);
      if (!resolved.ok) return resolved;
      const key = scopeKey(resolved.value);
      if (currentSlot(held, key)) return { ok: false, errorCode: 'SHARE_BUSY' };
      if (generation === Number.MAX_SAFE_INTEGER) return { ok: false, errorCode: 'CONFLICT' };
      const lease = Object.freeze({
        leaseId: randomUUID(),
        leaseGeneration: ++generation,
        expiresAtMs: held.nowMs + sharePickerLeaseMs,
      });
      slots.set(key, { lease, owner: resolved.value, state: 'RESERVED' });
      return { ok: true, value: lease };
    },

    // Bind the SCREEN command before I/O. M3 deduplicates this publication's pending/result.
    reservePublishHeld(
      held: HeldShareContext,
      ref: ShareLeaseRef,
      publicationId: string,
    ): Result<ShareLease & SharePublication> {
      const result = ownedSlot(held, ref);
      if (!result.ok) return result;
      if (
        !requestIdSchema.safeParse(publicationId).success ||
        (result.value.publicationId && result.value.publicationId !== publicationId)
      )
        return { ok: false, errorCode: 'CONFLICT' };
      result.value.publicationId = publicationId;
      return { ok: true, value: { ...result.value.lease, publicationId } };
    },

    // Call after asynchronous Producer creation, before attaching/resuming it.
    commitHeld(held: HeldShareContext, publication: SharePublication): Result<ShareLease> {
      const result = ownedSlot(held, publication);
      if (!result.ok) return result;
      if (!result.value.publicationId || result.value.publicationId !== publication.publicationId)
        return { ok: false, errorCode: 'CONFLICT' };
      result.value.state = 'OWNED';
      return { ok: true, value: result.value.lease };
    },

    canPublishHeld(
      held: HeldShareContext,
      source: MediaSource,
      stage: 'CREATE' | 'READY',
      ref?: ShareLeaseRef & { publicationId?: string },
    ): boolean {
      assertSession(held);
      if (!canPublishMedia(held, source)) return false;
      if (!screen(source)) return true;
      const result = ownedSlot(held, ref);
      if (!result.ok) return false;
      if (source === 'SCREEN_AUDIO') return result.value.state === 'OWNED';
      return (
        !!result.value.publicationId &&
        result.value.publicationId === ref?.publicationId &&
        (stage === 'CREATE' ? result.value.state === 'RESERVED' : result.value.state === 'OWNED')
      );
    },

    canReceiveHeld(
      held: HeldShareContext,
      publisherParticipantId: string,
      source: MediaSource,
      ref?: ShareLeaseRef,
    ): boolean {
      assertSession(held);
      if (!canReceiveMedia(held, publisherParticipantId, source)) return false;
      if (!screen(source)) return true;
      const participant = held.session.participants.get(publisherParticipantId);
      if (!participant) return false;
      const publisher = authority({
        ...held,
        request: {
          auth: participant.auth,
          sessionId,
          epoch,
          callGeneration: participant.callGeneration,
        },
        access: participant.currentAccess,
      });
      if (!publisher.ok) return false;
      const slot = currentSlot(held, scopeKey(publisher.value));
      return (
        !!slot &&
        slot.state === 'OWNED' &&
        sameLease(slot, ref) &&
        sameOwner(slot.owner, publisher.value)
      );
    },

    // Cancel needs current authority. Revocation/track-ended uses the cleanup path below.
    cancelHeld(held: HeldShareContext, ref: ShareLeaseRef): boolean {
      const result = ownedSlot(held, ref);
      if (!result.ok || result.value.state !== 'RESERVED') return false;
      closeSlot(scopeKey(result.value.owner), result.value);
      return true;
    },

    // Trusted lifecycle callers capture the old generation before changing ownership.
    closeFor(
      held: Pick<HeldShareContext, 'assertHeld' | 'session' | 'nowMs'>,
      participantId: string,
      callGeneration: number,
    ) {
      assertSession(held);
      for (const [key, slot] of slots) {
        if (
          slot.owner.participantId === participantId &&
          slot.owner.callGeneration === callGeneration
        )
          closeSlot(key, slot);
      }
    },

    // Server-owned Producer close/track-ended callbacks must retain their original lease ID.
    beginReleaseHeld(held: HeldShareContext, ref: ShareLeaseRef): boolean {
      assertSession(held);
      for (const [key, slot] of slots) {
        if (!sameLease(slot, ref)) continue;
        if (slot.publication || slot.state === 'RESERVED') closeSlot(key, slot);
        else slot.state = 'RELEASING';
        return true;
      }
      return false;
    },

    // Retain published slots until SCREEN and SCREEN_AUDIO are both closed by M3.
    // Return exact lease IDs as cleanup handles. A stale handle never clears a new slot.
    revokeHeld(
      held: HeldShareContext & Pick<HeldTransitionContext, 'isCurrent'>,
      request: SessionCleanupRequest,
    ): readonly ShareLease[] {
      assertSession(held);
      if (request.sessionId !== sessionId || request.epoch !== epoch || !held.isCurrent(request))
        return [];
      const affected: ShareLease[] = [];
      for (const [key, slot] of slots) {
        const target = request.target;
        const owner = slot.owner;
        const matches =
          target.type === 'SCOPE'
            ? sameSessionScope(owner.scope, target.scope)
            : 'callGeneration' in request &&
              owner.participantId === target.participantId &&
              owner.callGeneration === request.callGeneration &&
              (target.type === 'PARTICIPANT' ||
                (owner.audienceEpoch === target.audienceEpoch &&
                  sameSessionScope(owner.scope, target.scope)));
        if (!matches) continue;
        affected.push(slot.lease);
        if (slot.publication || slot.state === 'RESERVED') closeSlot(key, slot);
        else slot.state = 'RELEASING';
      }
      return affected;
    },

    releaseHeld(held: HeldShareContext, ref: ShareLeaseRef): boolean {
      assertSession(held);
      for (const [key, slot] of slots) {
        if (!sameLease(slot, ref) || slot.state !== 'RELEASING') continue;
        closeSlot(key, slot);
        return !slots.has(key);
      }
      return false;
    },
  };
}
