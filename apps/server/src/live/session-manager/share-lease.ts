import { randomUUID } from 'node:crypto';
import { sameSessionScope } from '@colearnia/contracts';
import type { LiveContext, MediaSource, SessionCleanupRequest } from '@colearnia/contracts';
import {
  canPublishMedia,
  canReceiveMedia,
  resolveSessionPolicyContext,
} from '../policy/session-policy.js';
import type { SessionPolicyInput } from '../policy/session-policy.js';
import type { HeldTransitionContext } from './session-transition.js';

export const sharePickerLeaseMs = 30_000;

// All methods run synchronously inside the same session gate as policy transitions.
export type HeldShareContext = SessionPolicyInput & { assertHeld(): void };
export type ShareLease = Readonly<{ leaseId: string; expiresAtMs: number }>;
type ShareError =
  'AUTH_REQUIRED' | 'FORBIDDEN' | 'CONFLICT' | 'SHARE_BUSY' | 'DEPENDENCY_UNAVAILABLE';
type Result<T> = { ok: true; value: T } | { ok: false; errorCode: ShareError };
type Slot = {
  lease: ShareLease;
  owner: LiveContext;
  state: 'RESERVED' | 'OWNED' | 'RELEASING';
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

  function assertSession(held: HeldShareContext) {
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
    if (slot?.state === 'RESERVED' && slot.lease.expiresAtMs <= held.nowMs) {
      slots.delete(key);
      return undefined;
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

  function ownedSlot(held: HeldShareContext, leaseId: string): Result<Slot> {
    const resolved = authority(held);
    if (!resolved.ok) return resolved;
    const slot = currentSlot(held, scopeKey(resolved.value));
    if (
      !slot ||
      slot.state === 'RELEASING' ||
      slot.lease.leaseId !== leaseId ||
      !sameOwner(slot.owner, resolved.value)
    )
      return { ok: false, errorCode: 'CONFLICT' };
    return { ok: true, value: slot };
  }

  return {
    acquireHeld(held: HeldShareContext): Result<ShareLease> {
      const resolved = authority(held);
      if (!resolved.ok) return resolved;
      const key = scopeKey(resolved.value);
      if (currentSlot(held, key)) return { ok: false, errorCode: 'SHARE_BUSY' };
      const lease = Object.freeze({
        leaseId: randomUUID(),
        expiresAtMs: held.nowMs + sharePickerLeaseMs,
      });
      slots.set(key, { lease, owner: resolved.value, state: 'RESERVED' });
      return { ok: true, value: lease };
    },

    // Call after asynchronous Producer creation, before attaching/resuming it.
    commitHeld(held: HeldShareContext, leaseId: string): Result<ShareLease> {
      const result = ownedSlot(held, leaseId);
      if (!result.ok) return result;
      result.value.state = 'OWNED';
      return { ok: true, value: result.value.lease };
    },

    canPublishHeld(
      held: HeldShareContext,
      source: MediaSource,
      stage: 'CREATE' | 'READY',
      leaseId?: string,
    ): boolean {
      assertSession(held);
      if (!canPublishMedia(held, source)) return false;
      if (!screen(source)) return true;
      const result = ownedSlot(held, leaseId ?? '');
      return (
        result.ok && (result.value.state === 'OWNED' || (stage === 'CREATE' && source === 'SCREEN'))
      );
    },

    canReceiveHeld(
      held: HeldShareContext,
      publisherParticipantId: string,
      source: MediaSource,
      leaseId?: string,
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
        slot.lease.leaseId === leaseId &&
        sameOwner(slot.owner, publisher.value)
      );
    },

    // Cancel needs current authority. Revocation/track-ended uses the cleanup path below.
    cancelHeld(held: HeldShareContext, leaseId: string): boolean {
      const result = ownedSlot(held, leaseId);
      if (!result.ok || result.value.state !== 'RESERVED') return false;
      slots.delete(scopeKey(result.value.owner));
      return true;
    },

    // Server-owned Producer close/track-ended callbacks must retain their original lease ID.
    beginReleaseHeld(held: HeldShareContext, leaseId: string): boolean {
      assertSession(held);
      for (const [key, slot] of slots) {
        if (slot.lease.leaseId !== leaseId) continue;
        if (slot.state === 'RESERVED') slots.delete(key);
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
    ): readonly string[] {
      assertSession(held);
      if (request.sessionId !== sessionId || request.epoch !== epoch || !held.isCurrent(request))
        return [];
      const affected: string[] = [];
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
        affected.push(slot.lease.leaseId);
        if (slot.state === 'RESERVED') slots.delete(key);
        else slot.state = 'RELEASING';
      }
      return affected;
    },

    releaseHeld(held: HeldShareContext, leaseId: string): boolean {
      assertSession(held);
      for (const [key, slot] of slots) {
        if (slot.lease.leaseId !== leaseId || slot.state !== 'RELEASING') continue;
        slots.delete(key);
        return true;
      }
      return false;
    },
  };
}
