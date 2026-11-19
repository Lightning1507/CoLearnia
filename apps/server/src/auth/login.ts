import type { AuthenticatedContext, LoginInput } from '@colearnia/contracts';
import mongoose from 'mongoose';
import { isDatabaseUnavailableError } from '../lib/database.js';
import type { createSessionRevocation } from './session-revocation.js';
import type { Database } from '../lib/database.js';
import { CoordinationError } from '../lib/operation-coordinator.js';
import type { createOperationCoordinator } from '../lib/operation-coordinator.js';
import { AccessRevocationError } from '../workspaces/access-revocation.js';
import { authModels } from './models.js';
import { PasswordWorkBusyError, runPasswordWork, verifyPassword } from './password-hash.js';
import { hashAuthToken, isSessionToken, newSessionCredentials } from './session-credentials.js';

export class InvalidCredentialsError extends Error {}
export class LoginUnavailableError extends Error {}
export class LoginUnconfirmedError extends Error {}

export function createLogin(
  database: Database,
  indexesReady: () => boolean,
  ttlSeconds: number,
  coordinator: Pick<ReturnType<typeof createOperationCoordinator>, 'run'>,
  revocation?: Pick<
    ReturnType<typeof createSessionRevocation>,
    | 'prepareReplacement'
    | 'claimReplacement'
    | 'finishReplacement'
    | 'revoke'
    | 'isDenied'
    | 'isReplacementUncertain'
    | 'isReplacementRunning'
  >,
) {
  const { User, AuthSession } = authModels(database.connection);

  return async function login(
    input: LoginInput,
    previousToken: string | undefined,
    signal: AbortSignal,
  ) {
    if (!indexesReady() || !database.isConnected()) throw new LoginUnavailableError();
    try {
      const candidate = await User.findOne({ emailNormalized: input.email, status: 'ACTIVE' })
        .select({ _id: 1, passwordHash: 1 })
        .maxTimeMS(5000)
        .lean();
      const matches = await runPasswordWork(
        () => verifyPassword(input.password, candidate?.passwordHash),
        signal,
      );
      if (!candidate || !matches) throw new InvalidCredentialsError();

      const previous = isSessionToken(previousToken)
        ? await AuthSession.findOne({ tokenHash: hashAuthToken(previousToken) })
            .select('_id userId expiresAt revokedAt')
            .readConcern('majority')
            .maxTimeMS(5000)
            .lean()
        : null;
      const oldAuth: AuthenticatedContext | undefined = previous
        ? {
            userId: previous.userId.toHexString(),
            authSessionId: previous._id.toHexString(),
            expiresAt: previous.expiresAt.toISOString(),
          }
        : undefined;
      // A retry after an uncertain write performs a durable revoke, not another
      // login transaction. Its exact old-session write orders against the original
      // transaction CAS even if the driver returned while Mongo was still working.
      if (oldAuth && revocation?.isDenied(oldAuth)) {
        if (revocation.isReplacementRunning(oldAuth)) throw new LoginUnconfirmedError();
        const uncertain = revocation.isReplacementUncertain(oldAuth);
        if (previous?.revokedAt || uncertain) {
          const reconciled = await revocation.revoke(oldAuth);
          // Never clear cookies from this failed response: it may arrive after a
          // newer login in another tab. A subsequent explicit login may proceed
          // once durable revocation is confirmed, without restoring the old scope.
          if (uncertain || !reconciled) throw new LoginUnconfirmedError();
        }
      }
      // An expired cookie can outlive the browser/TTL cleanup. It is not an
      // active session replacement; pending/unknown work was reconciled above.
      const replace =
        oldAuth && previous && !previous.revokedAt && previous.expiresAt.getTime() > Date.now()
          ? oldAuth
          : undefined;
      if (replace) {
        if (!revocation) throw new LoginUnavailableError();
        // Recheck under the target User gate before installing an irreversible deny.
        await coordinator.run(
          { userId: candidate._id.toHexString() },
          async () => {
            signal.throwIfAborted();
            const current = await User.exists({
              _id: candidate._id,
              status: 'ACTIVE',
              passwordHash: candidate.passwordHash,
            }).maxTimeMS(5000);
            if (!current) throw new InvalidCredentialsError();
          },
          { signal },
        );
        if (!(await revocation.prepareReplacement(replace))) throw new LoginUnconfirmedError();
      }

      if (replace && !revocation!.claimReplacement(replace)) throw new LoginUnconfirmedError();
      const result = await coordinator
        .run(
          { userId: candidate._id.toHexString() },
          async () => {
            const credentials = newSessionCredentials(ttlSeconds);
            return database.transaction(async (session) => {
              signal.throwIfAborted();
              // Password changes use the same User gate. Recheck even on a transaction retry.
              const current = await User.findOne({
                _id: candidate._id,
                status: 'ACTIVE',
                passwordHash: candidate.passwordHash,
              })
                .select('_id emailNormalized displayName avatar.secureUrl')
                .session(session)
                .maxTimeMS(5000)
                .lean();
              if (!current) throw new InvalidCredentialsError();

              if (replace) {
                // Exact-id CAS serializes competing replacements, including cross-account
                // login, without nesting two User gates. Driver callback retries reuse
                // this target; a losing request cannot insert its new session.
                const replaced = await AuthSession.updateOne(
                  { _id: replace.authSessionId, userId: replace.userId, revokedAt: null },
                  { $set: { revokedAt: new Date() } },
                  { session, maxTimeMS: 5000 },
                );
                if (replaced.matchedCount !== 1) throw new LoginUnconfirmedError();
              }
              await new AuthSession({
                userId: current._id,
                tokenHash: credentials.tokenHash,
                expiresAt: credentials.expiresAt,
              }).save({ session });
              signal.throwIfAborted();

              return {
                token: credentials.token,
                expiresAt: credentials.expiresAt,
                user: {
                  id: current._id.toHexString(),
                  email: current.emailNormalized,
                  displayName: current.displayName,
                  avatarUrl: current.avatar?.secureUrl ?? null,
                },
              };
            });
          },
          { signal },
        )
        .then(
          (value) => {
            if (replace) revocation!.finishReplacement(replace, 'committed');
            return value;
          },
          (error: unknown) => {
            // A network/dependency error is not evidence that an attempted DB
            // write rolled back, even when the driver omitted its commit label.
            const uncertain =
              (error instanceof mongoose.mongo.MongoError &&
                error.hasErrorLabel('UnknownTransactionCommitResult')) ||
              isDatabaseUnavailableError(error);
            if (replace)
              revocation!.finishReplacement(replace, uncertain ? 'unknown' : 'not_committed');
            if (replace && uncertain) throw new LoginUnconfirmedError();
            throw error;
          },
        );
      if (replace && !(await revocation!.revoke(replace))) throw new LoginUnconfirmedError();
      return result;
    } catch (error) {
      if (
        error instanceof mongoose.mongo.MongoError &&
        error.hasErrorLabel('UnknownTransactionCommitResult')
      ) {
        throw new LoginUnconfirmedError();
      }
      if (
        error instanceof PasswordWorkBusyError ||
        error instanceof AccessRevocationError ||
        (error instanceof CoordinationError &&
          (error.code === 'BUSY' || error.code === 'TIMEOUT')) ||
        isDatabaseUnavailableError(error) ||
        !database.isConnected()
      ) {
        throw new LoginUnavailableError();
      }
      throw error;
    }
  };
}
