import { z } from 'zod';

export const resourceIdSchema = z.string().min(1).max(128);
export const requestIdSchema = z.uuid();

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    fieldErrors: z
      .array(z.strictObject({ field: z.string().min(1), message: z.string().min(1) }))
      .optional(),
    retryAfterMs: z.number().int().nonnegative().optional(),
  }),
  requestId: requestIdSchema,
});

export const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.strictObject({ data: dataSchema, requestId: requestIdSchema });

// One schema per command: the data branch must describe the actual result.
export const commandAckSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.union([apiResponseSchema(dataSchema), apiErrorSchema]);

export type ApiResponse<T> = { data: T; requestId: string };
export type ApiError = z.infer<typeof apiErrorSchema>;
