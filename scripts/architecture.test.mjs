import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';
import { root } from './check-harness.mjs';

const eslint = new ESLint({ cwd: root });
async function boundaries(file, code) {
  const [result] = await eslint.lintText(code, { filePath: resolve(root, file) });
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  return result.messages.filter((m) => m.ruleId === 'architecture/boundaries');
}

for (const [label, file, code] of [
  [
    'relative web to server',
    'apps/web/src/example.ts',
    "import { x } from '../../server/src/app.js';",
  ],
  ['package web to server', 'apps/web/src/example.ts', "import { x } from '@colearnia/server';"],
  [
    'server to web re-export',
    'apps/server/src/example.ts',
    "export * from '../../web/src/main.js';",
  ],
  [
    'contract to app',
    'packages/contracts/src/example.ts',
    "import type { X } from '../../../apps/server/src/app.js';",
  ],
  ['contract to database', 'packages/contracts/src/example.ts', "export { x } from 'mongoose';"],
  ['contract dynamic media', 'packages/contracts/src/example.ts', "const x = import('mediasoup');"],
  [
    'contract type import',
    'packages/contracts/src/example.ts',
    "type X = import('mediasoup').Worker;",
  ],
  ['contract CommonJS', 'packages/contracts/src/example.ts', "const x = require('socket.io');"],
]) {
  test(`reject boundary: ${label}`, async () => {
    assert.equal((await boundaries(file, code)).length, 1);
  });
}

for (const [label, file, code] of [
  ['web uses contracts', 'apps/web/src/example.ts', "import { x } from '@colearnia/contracts';"],
  [
    'server media adapter',
    'apps/server/src/live/media/example.ts',
    "import { x } from 'mediasoup';",
  ],
  ['contract uses Zod', 'packages/contracts/src/example.ts', "import { z } from 'zod';"],
  ['contract local helper', 'packages/contracts/src/example.ts', "export * from './common.js';"],
]) {
  test(`allow boundary: ${label}`, async () => {
    assert.equal((await boundaries(file, code)).length, 0);
  });
}
