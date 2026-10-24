import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

export function affectsDeployment(path) {
  return (
    /(^|\/)(Dockerfile(?:\.[^/]+)?|[^/]+\.Dockerfile|package\.json|tsconfig[^/]*\.json)$/.test(
      path,
    ) ||
    /^(docker-compose[^/]*\.ya?ml|compose[^/]*\.ya?ml|\.dockerignore|\.node-version|\.npmrc|\.env\.example|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/.test(
      path,
    ) ||
    path.startsWith('infra/') ||
    path === 'scripts/prepare.mjs' ||
    path === 'scripts/docker-smoke-required.mjs' ||
    path === '.github/workflows/ci.yml'
  );
}

if (process.env.GITHUB_EVENT_PATH) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let required = true;
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    const base = event.pull_request?.base.sha ?? event.before;
    const head = event.pull_request?.head.sha ?? event.after;
    if (!base || !head) throw new Error('Missing comparison revisions');
    if (!/^0+$/.test(base)) {
      const range = `${base}${event.pull_request ? '...' : '..'}${head}`;
      const paths = execFileSync('git', ['diff', '--name-only', '-z', range], {
        encoding: 'utf8',
      }).split('\0');
      required = paths.some(affectsDeployment);
    }
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `required=${required}\n`);
  console.log(
    required
      ? 'Deployment changes: run Docker smoke.'
      : 'No deployment changes: skip Docker build.',
  );
}
