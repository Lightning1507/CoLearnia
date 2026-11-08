import { loadConfig } from '../config/env.js';
import { createOperationCoordinator } from './operation-coordinator.js';

const config = loadConfig();
// The application-owned instance. Inject this exact object into M1/M2/M4 services.
// The factory remains available for isolated tests, not per-domain production locks.
export const operationCoordinator = createOperationCoordinator({
  maxPendingPerKey: config.COORDINATOR_MAX_PENDING_PER_KEY,
  maxOperations: config.COORDINATOR_MAX_OPERATIONS,
  waitTimeoutMs: config.COORDINATOR_WAIT_TIMEOUT_MS,
});
