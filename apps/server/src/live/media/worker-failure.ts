import type { createMediaRuntime } from './runtime.js';

// Bind once when the composition has constructed its registry. A dead runtime is
// never attached to a replacement registry or replayed as a new failure operation.
export function bindWorkerFailure(
  runtime: Pick<Awaited<ReturnType<typeof createMediaRuntime>>, 'onFailure'>,
  registry: { handleRouterFailure(ids: readonly string[]): Promise<unknown> },
  report: (result: 'SETTLED' | 'FAILED') => void,
) {
  return runtime.onFailure((event) => {
    try {
      void registry
        .handleRouterFailure(event.routerIds)
        .then(
          () => report('SETTLED'),
          () => report('FAILED'),
        )
        .catch(() => {});
    } catch {
      report('FAILED');
    }
  });
}
