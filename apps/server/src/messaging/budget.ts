import { z } from 'zod';

const positiveLimit = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const queueLimit = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const messagingHandlerClassSchema = z.enum([
  'text',
  'history',
  'subscription',
  'upload',
  'download',
  'frame',
  'recording',
  'avatar',
]);

const operationBudgetSchema = z.strictObject({
  processInFlight: positiveLimit,
  processQueued: queueLimit,
  processBytes: positiveLimit,
  perUserInFlight: positiveLimit,
  perScopeInFlight: positiveLimit,
  payloadBytes: positiveLimit,
  queueWaitMs: positiveLimit,
  executionMs: positiveLimit,
});

// No defaults: missing/unreviewed budgets must leave the corresponding handler disabled.
export const messagingBudgetSchema = z
  .strictObject({
    process: z.strictObject({
      inFlight: positiveLimit,
      queued: queueLimit,
      bytes: positiveLimit,
    }),
    database: z.strictObject({
      maxPoolSize: positiveLimit,
      waitQueueTimeoutMs: positiveLimit,
      queryTimeoutMs: positiveLimit,
    }),
    revocation: z.strictObject({
      reservedInFlight: positiveLimit,
      cleanupBatchSize: positiveLimit,
      executionMs: positiveLimit,
    }),
    handlers: z.partialRecord(messagingHandlerClassSchema, operationBudgetSchema),
  })
  .superRefine((value, context) => {
    const reject = (path: string[], message: string) =>
      context.addIssue({ code: 'custom', path, message });
    if (value.revocation.reservedInFlight >= value.process.inFlight) {
      reject(['revocation', 'reservedInFlight'], 'Must leave capacity for ordinary operations.');
    }
    for (const [name, budget] of Object.entries(value.handlers)) {
      if (budget.processInFlight > value.process.inFlight - value.revocation.reservedInFlight) {
        reject(['handlers', name, 'processInFlight'], 'Exceeds ordinary process capacity.');
      }
      if (budget.processQueued > value.process.queued) {
        reject(['handlers', name, 'processQueued'], 'Exceeds process queue capacity.');
      }
      if (budget.processBytes > value.process.bytes || budget.payloadBytes > budget.processBytes) {
        reject(['handlers', name, 'processBytes'], 'Exceeds byte capacity.');
      }
      if (
        budget.perUserInFlight > budget.processInFlight ||
        budget.perScopeInFlight > budget.processInFlight
      ) {
        reject(['handlers', name], 'User and scope limits must fit the operation capacity.');
      }
    }
  });

export type MessagingBudget = z.infer<typeof messagingBudgetSchema>;
