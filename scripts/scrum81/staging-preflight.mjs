import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { pathToFileURL } from 'node:url';

export function stagingOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Expected an explicit HTTPS origin without credentials, path or query');
  }
  return url.origin;
}

// No cookies, redirects, authorization headers, response bodies or resolved IPs are logged.
export function probe(url) {
  return new Promise((resolve) => {
    const req = request(url, { rejectUnauthorized: true, method: 'GET' }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > 65_536) {
          req.destroy();
          resolve({ error: 'response-too-large' });
        } else chunks.push(chunk);
      });
      res.on('error', () => resolve({ error: 'response-error' }));
      res.on('end', () => {
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          // HTML frontend and non-JSON failures are classified by the caller.
        }
        resolve({
          status: res.statusCode,
          data: body?.data,
          authRequired: body?.error?.code === 'AUTH_REQUIRED',
          size,
          contentType: res.headers['content-type'],
        });
      });
    });
    const deadline = setTimeout(() => req.destroy(), 8000);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', () => resolve({ error: 'tls-or-network-error' }));
    req.end();
  });
}

export async function preflight(value, dependencies = {}) {
  const origin = stagingOrigin(value);
  const resolveHost = dependencies.lookup ?? lookup;
  const get = dependencies.probe ?? probe;
  let dns = 'PASS';
  try {
    await resolveHost(new URL(origin).hostname);
  } catch {
    dns = 'FAIL';
  }
  const checks = [{ check: 'dns-this-network', status: dns }];
  if (dns === 'PASS') {
    for (const path of ['/', '/api/v1/system/status', '/api/v1/auth/me']) {
      const response = await get(`${origin}${path}`);
      let pass = false;
      if (path === '/') {
        pass =
          response.status === 200 &&
          response.size > 0 &&
          response.contentType?.includes('text/html');
      } else if (path.endsWith('/status')) {
        pass =
          response.status === 200 &&
          response.data?.name === 'CoLearnia' &&
          response.data?.ready === true &&
          response.data?.database === 'connected' &&
          response.data?.media === 'connected';
      } else {
        pass = response.status === 401 && response.authRequired === true;
      }
      checks.push({
        check: path === '/api/v1/auth/me' ? 'anonymous-auth-rejected' : path,
        status: pass ? 'PASS' : 'FAIL',
        httpStatus: response.status ?? null,
        ...(response.error ? { error: response.error } : {}),
      });
    }
  }
  return {
    task: 'SCRUM-81',
    observedAt: new Date().toISOString(),
    origin,
    scope: 'single-network-public-http-preflight',
    status: checks.every((check) => check.status === 'PASS') ? 'PASS' : 'FAIL',
    checks,
    acceptance:
      'BLOCKED: authenticated signaling, two networks, MAIN media and rollback unverified',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--origin') {
    console.error(
      'Usage: pnpm exec node scripts/scrum81/staging-preflight.mjs --origin https://HOST',
    );
    process.exitCode = 2;
  } else {
    try {
      const result = await preflight(process.argv[3]);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.status === 'PASS' ? 0 : 1;
    } catch {
      console.error(
        'Invalid target: provide an explicit HTTPS origin without credentials or path.',
      );
      process.exitCode = 2;
    }
  }
}
