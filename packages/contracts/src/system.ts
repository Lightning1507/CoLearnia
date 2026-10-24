import { z } from 'zod';

export const dependencyStateSchema = z.enum(['connected', 'disconnected', 'disabled']);
export const systemStatusSchema = z.strictObject({
  name: z.literal('CoLearnia'),
  database: dependencyStateSchema,
  media: dependencyStateSchema,
  ready: z.boolean(),
});

export type SystemStatus = z.infer<typeof systemStatusSchema>;
