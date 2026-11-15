import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  mediaBootstrapQuerySchema,
  mediaBootstrapResponseSchema,
  mediaContextHeaderSchema,
  mediaHttpContextIssueAckSchema,
  mediaHttpContextIssueInputSchema,
  mediaIceCredentialsBodySchema,
  mediaIceCredentialsResponseSchema,
  mediaRestParamsSchema,
  requestIdSchema,
} from '@colearnia/contracts';
import type { AuthenticatedContext } from '@colearnia/contracts';
import { authFailure, requireVerifiedSession } from '../../auth/http-auth.js';
import type { AuthResponse, createHttpAuth } from '../../auth/http-auth.js';
import { CoordinationError } from '../../lib/operation-coordinator.js';
import { MainJoinError } from '../session-manager/main-join-registry.js';
import { MediaBootstrapError } from './media-bootstrap.js';
import type { createMediaBootstrap } from './media-bootstrap.js';

type Service = ReturnType<typeof createMediaBootstrap>;
const message = 'Không thể chuẩn bị kết nối media.';
function codeFor(error: unknown) {
  if (error instanceof MediaBootstrapError) return error.code;
  if (
    error instanceof MainJoinError &&
    ['AUTH_REQUIRED', 'FORBIDDEN', 'NOT_FOUND', 'SESSION_ENDED', 'CONFLICT'].includes(error.code)
  )
    return 'FORBIDDEN';
  if (error instanceof CoordinationError) return 'DEPENDENCY_UNAVAILABLE';
  return 'DEPENDENCY_UNAVAILABLE';
}

export function createMediaBootstrapRouter(
  auth: ReturnType<typeof createHttpAuth>,
  service: Service,
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/:sessionId/media/bootstrap', auth.requireAuth, async (req, res: AuthResponse) => {
    const verified = requireVerifiedSession(res);
    if (!verified) return;
    const path = mediaRestParamsSchema.safeParse(req.params);
    const query = mediaBootstrapQuerySchema.safeParse(req.query);
    if (!path.success || !query.success) return authFailure(res, 'VALIDATION_ERROR', message);
    const proof = mediaContextHeaderSchema.safeParse(req.get('X-Media-Context'));
    if (!proof.success) return authFailure(res, 'FORBIDDEN', message);
    const data = { ...path.data, ...query.data };
    try {
      await service.bootstrap(data, verified.context, proof.data, (routerRtpCapabilities) => {
        res.json(
          mediaBootstrapResponseSchema.parse({
            data: { ...data, routerRtpCapabilities },
            requestId: res.locals.requestId,
          }),
        );
      });
    } catch (error) {
      if (!res.headersSent) authFailure(res, codeFor(error), message);
    }
  });
  router.post(
    '/:sessionId/media/ice-credentials',
    auth.requireAuth,
    auth.requireCsrf,
    async (req, res: AuthResponse) => {
      const verified = requireVerifiedSession(res);
      if (!verified) return;
      const path = mediaRestParamsSchema.safeParse(req.params);
      const body = mediaIceCredentialsBodySchema.safeParse(req.body);
      if (!path.success || !body.success) return authFailure(res, 'VALIDATION_ERROR', message);
      const proof = mediaContextHeaderSchema.safeParse(req.get('X-Media-Context'));
      if (!proof.success) return authFailure(res, 'FORBIDDEN', message);
      const { requestId, ...context } = body.data;
      const data = { ...path.data, ...context };
      try {
        await service.ice(data, verified.context, proof.data, requestId, (result) => {
          res.json(
            mediaIceCredentialsResponseSchema.parse({
              data: { ...data, ...result },
              requestId: res.locals.requestId,
            }),
          );
        });
      } catch (error) {
        if (!res.headersSent) authFailure(res, codeFor(error), message);
      }
    },
  );
  return router;
}

type Socket = {
  id: string;
  connected: boolean;
  on(
    event: 'media.httpContext.issue',
    callback: (raw: unknown, ack?: (value: unknown) => void) => void,
  ): unknown;
  once(event: 'disconnect', callback: () => void): unknown;
};

export function attachMediaBootstrapSocket(
  socket: Socket,
  service: Service,
  readAuth: () => AuthenticatedContext | null,
) {
  socket.once('disconnect', () => service.revokeSocket(socket.id));
  socket.on('media.httpContext.issue', (raw, ack) => {
    if (typeof ack !== 'function') return;
    const requestId =
      requestIdSchema.safeParse(
        raw && typeof raw === 'object' && 'requestId' in raw ? raw.requestId : undefined,
      ).data ?? randomUUID();
    const fail = (code: string) => ack({ requestId, error: { code, message } });
    const auth = readAuth();
    if (!auth) return fail('AUTH_REQUIRED');
    if (!socket.connected) return fail('FORBIDDEN');
    const input = mediaHttpContextIssueInputSchema.safeParse(raw);
    if (!input.success) return fail('VALIDATION_ERROR');
    let sent = false;
    void service
      .issue(socket.id, auth, input.data, (result) => {
        if (!socket.connected) {
          service.revokeSocket(socket.id);
          return;
        }
        const reply = mediaHttpContextIssueAckSchema.parse({
          requestId,
          data: { status: 'completed', result },
        });
        sent = true;
        ack(reply);
      })
      .catch((error) => {
        if (!sent) fail(codeFor(error));
      });
  });
}
