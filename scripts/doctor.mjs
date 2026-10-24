import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const major = Number(process.versions.node.split('.')[0]);
console.log(`Node: ${process.version} ${major === 24 ? '(target)' : '(project targets Node 24)'}`);
console.log(`Root .env: ${existsSync('.env') ? 'present' : 'missing — copy .env.example to .env'}`);
console.log(`Lockfile: ${existsSync('pnpm-lock.yaml') ? 'present' : 'missing — run pnpm install'}`);
const result = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
  encoding: 'utf8',
});
console.log(
  `Docker engine: ${result.status === 0 ? result.stdout.trim() : 'not running or unavailable'}`,
);
if (major !== 24) process.exitCode = 1;
