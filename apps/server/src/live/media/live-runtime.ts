import type { AppConfig } from '../../config/env.js';
import { createMediaRuntime } from './runtime.js';
import { bindWorkerFailure } from './worker-failure.js';

type Runtime = Awaited<ReturnType<typeof createMediaRuntime>>;
type FailureRegistry = Parameters<typeof bindWorkerFailure>[1];

// Shared startup path used by main.ts and the app/native integration suite.
// MAIN composition supplies its real registry once auth/access/cleanup are mounted.
export async function startLiveRuntime(
  config: AppConfig,
  options: {
    closeAdmission(): void;
    report(result: 'SETTLED' | 'FAILED'): void;
    mountRegistry?(runtime: Runtime): Promise<FailureRegistry> | FailureRegistry;
    createWorker?: NonNullable<Parameters<typeof createMediaRuntime>[1]>['createWorker'];
  },
) {
  const runtime = await createMediaRuntime(
    config,
    options.createWorker ? { createWorker: options.createWorker } : {},
  );
  const detachAdmission = runtime.onFailure(() => options.closeAdmission());
  let detachRegistry: (() => void) | undefined;
  try {
    if (options.mountRegistry) {
      const registry = await options.mountRegistry(runtime);
      detachRegistry = bindWorkerFailure(runtime, registry, options.report);
    }
    return {
      ...runtime,
      close() {
        detachRegistry?.();
        detachAdmission();
        runtime.close();
      },
    };
  } catch (error) {
    options.closeAdmission();
    detachRegistry?.();
    detachAdmission();
    runtime.close();
    throw error;
  }
}
