import { expect, it } from 'vitest';
import { createLoginAttemptLimit } from './login-attempts.js';

it('holds counters until the window ends and then admits attempts again', () => {
  let now = 0;
  const take = createLoginAttemptLimit(1, () => now);
  expect(take('first')).toBeUndefined();
  expect(take('first')).toBe(60);
  expect(take('second')).toBeUndefined();
  now = 59_500;
  expect(take('first')).toBe(1);
  now = 60_000;
  expect(take('first')).toBeUndefined();
  expect(take('second')).toBeUndefined();
});

it('refuses new keys when full without evicting existing counters', () => {
  const take = createLoginAttemptLimit(2, () => 0);
  for (let i = 0; i < 4096; i++) expect(take(String(i))).toBeUndefined();
  expect(take('overflow')).toBe(60);
  expect(take('0')).toBeUndefined();
  expect(take('0')).toBe(60);
});
