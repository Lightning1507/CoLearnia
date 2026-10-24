import { z } from 'zod';

export const resourceIdSchema = z.string().min(1).max(128);
export const requestIdSchema = z.uuid();

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  requestId: requestIdSchema,
});

export type ApiResponse<T> = { data: T; requestId: string };
export type ApiError = z.infer<typeof apiErrorSchema>;
