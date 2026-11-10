import type { RegisterInput } from '@colearnia/contracts';
import mongoose from 'mongoose';
import { isDatabaseUnavailableError } from '../lib/database.js';
import type { Database } from '../lib/database.js';
import { authModels } from './models.js';
import { hashPassword, PasswordWorkBusyError, runPasswordWork } from './password-hash.js';
import { newSessionCredentials } from './session-credentials.js';

export class EmailExistsError extends Error {}
export class RegistrationUnavailableError extends Error {}
export class RegistrationUnconfirmedError extends Error {}

export function createRegistration(
  database: Database,
  indexesReady: () => boolean,
  ttlSeconds: number,
) {
  const { User, AuthSession } = authModels(database.connection);

  return async function register(input: RegisterInput, signal: AbortSignal) {
    if (!indexesReady() || !database.isConnected()) throw new RegistrationUnavailableError();
    try {
      const passwordHash = await runPasswordWork(() => hashPassword(input.password), signal);
      signal.throwIfAborted();
      const credentials = newSessionCredentials(ttlSeconds);
      const user = await database.transaction(async (session) => {
        signal.throwIfAborted();
        const user = await new User({
          emailNormalized: input.email,
          displayName: input.displayName,
          passwordHash,
        }).save({ session });
        await new AuthSession({
          userId: user._id,
          tokenHash: credentials.tokenHash,
          expiresAt: credentials.expiresAt,
        }).save({ session });
        return user;
      });
      return {
        token: credentials.token,
        expiresAt: credentials.expiresAt,
        user: {
          id: user._id.toHexString(),
          email: user.emailNormalized,
          displayName: user.displayName,
          avatarUrl: null,
        },
      };
    } catch (error) {
      if (
        error instanceof mongoose.mongo.MongoServerError &&
        error.code === 11000 &&
        Object.keys(error.keyPattern ?? {}).length === 1 &&
        error.keyPattern?.emailNormalized === 1
      ) {
        throw new EmailExistsError();
      }
      if (
        error instanceof mongoose.mongo.MongoError &&
        error.hasErrorLabel('UnknownTransactionCommitResult')
      ) {
        throw new RegistrationUnconfirmedError();
      }
      if (
        error instanceof PasswordWorkBusyError ||
        isDatabaseUnavailableError(error) ||
        !database.isConnected()
      ) {
        throw new RegistrationUnavailableError();
      }
      throw error;
    }
  };
}
