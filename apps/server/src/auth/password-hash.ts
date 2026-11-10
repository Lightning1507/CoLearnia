import { randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';

const commonPasswords = new Set([
  '123456789012345',
  '1234567890123456',
  '111111111111111',
  'aaaaaaaaaaaaaaa',
  'passwordpassword',
  'password12345678',
  'password123456789',
  'qwertyuiopasdfgh',
  'qwerty123456789',
  'iloveyouiloveyou',
  'colearniacolearnia',
  'colearnia123456',
]);

export function isCommonPassword(password: string) {
  return commonPasswords.has(password.toLowerCase());
}

const hashOptions = {
  type: argon2id,
  memoryCost: 32768,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export function hashPassword(password: string) {
  return hash(password, {
    ...hashOptions,
    salt: randomBytes(16),
  });
}

// Synthetic PHC record with the same work factors. Its result never authenticates a user.
const dummyHash =
  `$argon2id$v=19$m=${hashOptions.memoryCost},t=${hashOptions.timeCost},p=${hashOptions.parallelism}$` +
  Buffer.alloc(16).toString('base64').replace(/=+$/, '') +
  '$' +
  Buffer.alloc(hashOptions.hashLength).toString('base64').replace(/=+$/, '');

export async function verifyPassword(password: string, passwordHash?: string): Promise<boolean> {
  const matches = await verify(passwordHash ?? dummyHash, password);
  return passwordHash !== undefined && matches;
}

export class PasswordWorkBusyError extends Error {}

type QueuedWork = { start: () => boolean };

// Native work holds its slot until it settles.
export function createPasswordWorkGate(waitMs = 250) {
  let active = false;
  const waiting: QueuedWork[] = [];

  function release() {
    while (waiting.length) {
      if (waiting[0]!.start()) return;
    }
    active = false;
  }

  return async function run<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    if (active) {
      if (waiting.length >= 2) throw new PasswordWorkBusyError();

      await new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + waitMs;

        function removeWaiter() {
          const index = waiting.indexOf(waiter);
          if (index !== -1) waiting.splice(index, 1);
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
        }

        function onAbort() {
          removeWaiter();
          reject(signal.reason);
        }

        function onTimeout() {
          removeWaiter();
          reject(new PasswordWorkBusyError());
        }

        const waiter = {
          start() {
            if (performance.now() >= deadline) {
              onTimeout();
              return false;
            }
            removeWaiter();
            resolve();
            return true;
          },
        };
        const timer = setTimeout(onTimeout, waitMs);
        waiting.push(waiter);
        signal.addEventListener('abort', onAbort, { once: true });
      });
    } else {
      active = true;
    }

    try {
      signal.throwIfAborted();
      return await work();
    } finally {
      release();
    }
  };
}

// Registration, login and password changes share this gate in the server process.
export const runPasswordWork = createPasswordWorkGate();
