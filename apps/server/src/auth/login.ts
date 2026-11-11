import type { LoginInput } from '@colearnia/contracts';
import mongoose from 'mongoose';
import { isDatabaseUnavailableError } from '../lib/database.js';
import type { Database } from '../lib/database.js';
import { CoordinationError } from '../lib/operation-coordinator.js';
import type { createOperationCoordinator } from '../lib/operation-coordinator.js';
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

      return await coordinator.run(
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

            if (isSessionToken(previousToken)) {
              const now = new Date();
              await AuthSession.updateOne(
                {
                  tokenHash: hashAuthToken(previousToken),
                  revokedAt: null,
                  expiresAt: { $gt: now },
                },
                { revokedAt: now },
                { session, maxTimeMS: 5000 },
              );
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
      );
    } catch (error) {
      if (
        error instanceof mongoose.mongo.MongoError &&
        error.hasErrorLabel('UnknownTransactionCommitResult')
      ) {
        throw new LoginUnconfirmedError();
      }
      if (
        error instanceof PasswordWorkBusyError ||
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
