import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  checkHarness,
  configFiles,
  localLinks,
  localTarget,
  root,
  sources,
} from './check-harness.mjs';

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'colearnia-harness-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const required = new Set([...sources, ...configFiles]);
  for (const file of sources) {
    for (const link of localLinks(await readFile(resolve(root, file), 'utf8'))) {
      required.add(localTarget(root, file, link));
    }
  }
  for (const file of required) {
    await mkdir(dirname(join(base, file)), { recursive: true });
    await copyFile(resolve(root, file), join(base, file));
  }
  execFileSync('git', ['init', '--quiet', base], { stdio: 'pipe' });
  return base;
}

test('links ignore fences, inline code, anchors and external URLs; decode local paths', () => {
  const markdown =
    '[doc](a.md#part) [space](<dir/a%20b.md>) [web](https://example.org) [anchor](#local)\n' +
    '`[fake](inline.md)`\n```md\n[fake](fence.md)\n```\n';
  assert.deepEqual(localLinks(markdown), ['a.md', 'dir/a b.md']);
  assert.throws(() => localLinks('[bad](a%ZZ.md)'), URIError);
});

test('local path resolution rejects traversal, absolute and encoded escapes', () => {
  const base = resolve('fixture');
  assert.equal(localTarget(base, 'docs/a.md', '../README.md'), 'README.md');
  for (const link of ['../../outside.md', '/outside.md']) {
    assert.throws(() => localTarget(base, 'docs/a.md', link), /outside repository/);
  }
  const [decoded] = localLinks('[escape](%2e%2e/%2e%2e/outside.md)');
  assert.throws(() => localTarget(base, 'docs/a.md', decoded), /outside repository/);
});

test('complete independent checkout passes without staging or committing', async (t) => {
  assert.ok((await checkHarness(await fixture(t))) > sources.length);
});

test('missing required source fails', async (t) => {
  const base = await fixture(t);
  await rm(join(base, 'docs/database/model.md'));
  await assert.rejects(checkHarness(base), /ENOENT/);
});

test('broken local link fails', async (t) => {
  const base = await fixture(t);
  await writeFile(join(base, 'AGENTS.md'), '[missing](docs/absent.md)\n', { flag: 'a' });
  await assert.rejects(checkHarness(base), /ENOENT/);
});

test('ignored source fails even if file exists', async (t) => {
  const base = await fixture(t);
  await writeFile(join(base, '.gitignore'), '\ndocs/database/model.md\n', { flag: 'a' });
  await assert.rejects(checkHarness(base), /Required sources are ignored/);
});

test('personal paths and overlong entry point fail', async (t) => {
  const base = await fixture(t);
  const file = join(base, 'AGENTS.md');
  const before = await readFile(file, 'utf8');
  await writeFile(file, `${before}\n/Users/example/private/repo\n`);
  await assert.rejects(checkHarness(base), /Personal absolute path/);
  await writeFile(file, 'rule\n'.repeat(101));
  await assert.rejects(checkHarness(base), /exceeds 100 lines/);
});

test(
  'symlink source cannot escape the checkout',
  { skip: process.platform === 'win32' },
  async (t) => {
    const base = await fixture(t);
    await rm(join(base, 'docs/database/model.md'));
    await symlink(resolve(root, 'docs/database/model.md'), join(base, 'docs/database/model.md'));
    await assert.rejects(checkHarness(base), /symlink escapes/);
  },
);

const pins = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const nodePin = pins.devEngines.runtime.version;
const pnpmPin = pins.packageManager;
for (const [label, file, from, to] of [
  ['Node file', '.node-version', nodePin, '0.0.0'],
  ['lock runtime', 'pnpm-lock.yaml', `specifier: runtime:${nodePin}`, 'specifier: runtime:0.0.0'],
  ['Docker node', 'apps/server/Dockerfile', `node:${nodePin}`, 'node:0.0.0'],
  ['Docker pnpm', 'apps/web/Dockerfile', pnpmPin, 'pnpm@0.0.0'],
  ['CI pnpm', '.github/workflows/ci.yml', pnpmPin, 'pnpm@0.0.0'],
  ['runbook', 'docs/runbooks/local-development.md', nodePin, '0.0.0'],
  ['README', 'README.md', nodePin, '0.0.0'],
  [
    'types',
    'package.json',
    `"@types/node": "${pins.devDependencies['@types/node']}"`,
    '"@types/node": "0.0.0"',
  ],
]) {
  test(`runtime drift fails: ${label}`, async (t) => {
    const base = await fixture(t);
    const path = join(base, file);
    const content = await readFile(path, 'utf8');
    assert.ok(content.includes(from), 'mutation must change a real pin');
    await writeFile(path, content.replaceAll(from, to));
    await assert.rejects(checkHarness(base), /differs/);
  });
}

test('removed command or disconnected harness gate fails', async (t) => {
  const base = await fixture(t);
  const path = join(base, 'package.json');
  const pkg = JSON.parse(await readFile(path, 'utf8'));
  delete pkg.scripts.doctor;
  pkg.scripts.check = 'pnpm lint';
  await writeFile(path, JSON.stringify(pkg));
  await assert.rejects(
    checkHarness(base),
    /Missing package script: doctor[\s\S]*must start with harness/,
  );
});
