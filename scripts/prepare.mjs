import { existsSync } from 'node:fs';

// CI/container builds need no local hooks; Docker build context deliberately excludes .git.
if (process.env.CI !== 'true' && process.env.NODE_ENV !== 'production' && existsSync('.git')) {
  const { default: husky } = await import('husky');
  const message = husky();
  if (message) {
    console.error(message);
    process.exitCode = 1;
  }
}
