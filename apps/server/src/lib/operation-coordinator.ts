import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

export const defaultCoordinatorOptions = {
  maxPendingPerKey: 64,
  maxOperations: 1024,
  waitTimeoutMs: 5000,
};

export type CoordinationScope = { userId?: string; workspaceId?: string };
export type CoordinationFailure = 'BUSY' | 'TIMEOUT' | 'ABORTED' | 'INVALID_CONTEXT';
export class CoordinationError extends Error {
  constructor(public readonly code: CoordinationFailure) {
    super(`Operation coordination: ${code}`);
    this.name = 'CoordinationError';
  }
}

export type CoordinationInput = { signal?: AbortSignal; waitTimeoutMs?: number };

export interface CoordinationContext {
  readonly scope: Readonly<CoordinationScope>;
  // Valid only within the callback's async execution and while its locks remain held.
  assertHeld(required: CoordinationScope): void;
  // Only a User-only context may visit one Workspace at a time.
  withWorkspace<T>(
    workspaceId: string,
    work: (context: CoordinationContext) => Promise<T> | T,
    input?: CoordinationInput,
  ): Promise<T>;
}

type Waiter = { grant: () => void };
type Gate = { waiters: Waiter[] };
// Detect nested entry even through another instance: one domain must not silently use its own gate.
const execution = new AsyncLocalStorage<CoordinationContext>();

function keys(scope: CoordinationScope): string[] {
  if (
    (!scope.userId && !scope.workspaceId) ||
    [scope.userId, scope.workspaceId].some((id) => id !== undefined && !/^[a-f\d]{24}$/i.test(id))
  ) {
    throw new TypeError('Coordination requires valid User/Workspace ObjectIds');
  }
  return [
    ...(scope.userId ? [`user:${scope.userId.toLowerCase()}`] : []),
    ...(scope.workspaceId ? [`workspace:${scope.workspaceId.toLowerCase()}`] : []),
  ];
}

export function createOperationCoordinator(options = defaultCoordinatorOptions) {
  for (const value of Object.values(options)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid coordinator limit');
  }
  const limits = { ...options };
  const gates = new Map<string, Gate>();
  let operations = 0;
  const totals = {
    completed: 0,
    rejected: 0,
    waitMs: 0,
    holdMs: 0,
    workspaceVisits: 0,
    workspaceRejected: 0,
    workspaceWaitMs: 0,
    workspaceHoldMs: 0,
  };

  function waitBudget(input: CoordinationInput): number {
    const timeout = input.waitTimeoutMs ?? limits.waitTimeoutMs;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > limits.waitTimeoutMs) {
      throw new TypeError('Wait timeout must be positive and no longer than configured budget');
    }
    return timeout;
  }

  async function acquire(key: string, signal: AbortSignal, deadline: number): Promise<() => void> {
    if (signal.aborted) throw new CoordinationError('ABORTED');
    if (performance.now() >= deadline) throw new CoordinationError('TIMEOUT');
    let gate = gates.get(key);
    if (!gate) {
      gate = { waiters: [] };
      gates.set(key, gate);
    } else {
      if (gate.waiters.length >= limits.maxPendingPerKey) throw new CoordinationError('BUSY');
      const waitingGate = gate;
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', aborted);
        };
        const remove = (code: CoordinationFailure) => {
          const index = waitingGate.waiters.indexOf(waiter);
          if (index < 0) return;
          waitingGate.waiters.splice(index, 1);
          cleanup();
          reject(new CoordinationError(code));
        };
        const aborted = () => remove('ABORTED');
        const waiter: Waiter = {
          grant: () => {
            cleanup();
            resolve();
          },
        };
        waitingGate.waiters.push(waiter);
        signal.addEventListener('abort', aborted, { once: true });
        const timer = setTimeout(
          () => remove('TIMEOUT'),
          Math.max(0, deadline - performance.now()),
        );
      });
    }
    const ownedGate = gate;
    return () => {
      const next = ownedGate.waiters.shift();
      if (next) next.grant();
      else gates.delete(key);
    };
  }

  return {
    // A snapshot without scope IDs or other user data. Counters are process-local.
    stats() {
      return {
        operations,
        keys: gates.size,
        pending: [...gates.values()].reduce((sum, gate) => sum + gate.waiters.length, 0),
        ...totals,
      };
    },
    async run<T>(
      scope: CoordinationScope,
      work: (context: CoordinationContext) => Promise<T> | T,
      input: CoordinationInput = {},
    ): Promise<T> {
      if (execution.getStore()) throw new CoordinationError('INVALID_CONTEXT');
      const requested = keys(scope);
      const timeout = waitBudget(input);
      if (operations >= limits.maxOperations) {
        totals.rejected++;
        throw new CoordinationError('BUSY');
      }
      operations++;
      const started = performance.now();
      const deadline = started + timeout;
      const signal = input.signal ?? new AbortController().signal;
      const releases: (() => void)[] = [];
      let active = false;
      let acceptingChildren = true;
      let activeChild: Promise<unknown> | undefined;
      let enteredAt: number | undefined;
      const context: CoordinationContext = Object.freeze({
        scope: Object.freeze({
          ...(scope.userId ? { userId: scope.userId.toLowerCase() } : {}),
          ...(scope.workspaceId ? { workspaceId: scope.workspaceId.toLowerCase() } : {}),
        }),
        withWorkspace<T>(
          workspaceId: string,
          work: (context: CoordinationContext) => Promise<T> | T,
          childInput: CoordinationInput = {},
        ): Promise<T> {
          try {
            if (
              !active ||
              !acceptingChildren ||
              execution.getStore() !== context ||
              !context.scope.userId ||
              context.scope.workspaceId ||
              activeChild
            ) {
              throw new CoordinationError('INVALID_CONTEXT');
            }
            const childScope = {
              userId: context.scope.userId,
              workspaceId: workspaceId.toLowerCase(),
            };
            const [workspaceKey] = keys({ workspaceId });
            // keys() has validated this required single-key scope.
            if (!workspaceKey) throw new CoordinationError('INVALID_CONTEXT');
            const childTimeout = waitBudget(childInput);
            const childSignal = childInput.signal
              ? AbortSignal.any([signal, childInput.signal])
              : signal;
            const task = (async () => {
              const childStarted = performance.now();
              const childDeadline = childStarted + childTimeout;
              let release: (() => void) | undefined;
              let childActive = false;
              let childEnteredAt: number | undefined;
              const childContext: CoordinationContext = Object.freeze({
                scope: Object.freeze(childScope),
                assertHeld(required: CoordinationScope) {
                  if (
                    !childActive ||
                    execution.getStore() !== childContext ||
                    keys(required).some((key) => !keys(childScope).includes(key))
                  ) {
                    throw new CoordinationError('INVALID_CONTEXT');
                  }
                },
                async withWorkspace() {
                  throw new CoordinationError('INVALID_CONTEXT');
                },
              });
              try {
                release = await acquire(workspaceKey, childSignal, childDeadline);
                if (childSignal.aborted) throw new CoordinationError('ABORTED');
                if (performance.now() >= childDeadline) throw new CoordinationError('TIMEOUT');
                childActive = true;
                childEnteredAt = performance.now();
                totals.workspaceWaitMs += childEnteredAt - childStarted;
                return await execution.run(childContext, () => work(childContext));
              } catch (error) {
                if (childEnteredAt === undefined) totals.workspaceRejected++;
                throw error;
              } finally {
                childActive = false;
                if (childEnteredAt !== undefined) {
                  totals.workspaceVisits++;
                  totals.workspaceHoldMs += performance.now() - childEnteredAt;
                }
                release?.();
              }
            })();
            activeChild = task;
            // Drain even a mistakenly unawaited child before releasing User below.
            // Also attach a rejection handler so a pending child cannot become unhandled.
            const finished = () => {
              if (activeChild === task) activeChild = undefined;
            };
            void task.then(finished, finished);
            return task;
          } catch (error) {
            return Promise.reject(error);
          }
        },
        assertHeld(required: CoordinationScope) {
          if (
            !active ||
            execution.getStore() !== context ||
            keys(required).some((key) => !requested.includes(key))
          ) {
            throw new CoordinationError('INVALID_CONTEXT');
          }
        },
      });
      try {
        for (const key of requested) releases.push(await acquire(key, signal, deadline));
        // Cancellation/deadline can happen after the final handoff and before this continuation.
        if (signal.aborted) throw new CoordinationError('ABORTED');
        if (performance.now() >= deadline) throw new CoordinationError('TIMEOUT');
        active = true;
        enteredAt = performance.now();
        totals.waitMs += enteredAt - started;
        const result = await execution.run(context, () => work(context));
        acceptingChildren = false;
        await activeChild;
        return result;
      } catch (error) {
        if (enteredAt === undefined) totals.rejected++;
        throw error;
      } finally {
        acceptingChildren = false;
        // A failing/returning parent must not release User while its child still owns Workspace.
        await activeChild?.catch(() => undefined);
        active = false;
        if (enteredAt !== undefined) {
          totals.holdMs += performance.now() - enteredAt;
          totals.completed++;
        }
        for (const release of releases.reverse()) release();
        operations--;
      }
    },
  };
}

export type OperationCoordinator = ReturnType<typeof createOperationCoordinator>;
