import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep, basename } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
const { values } = parseArgs({
  options: {
    help: { type: 'boolean' },
    ttl: { type: 'string', default: '60' },
    delay: { type: 'string', default: '120' },
  },
});
if (values.help) {
  console.log(
    'Diagnostic only: node --env-file=.env.turn.local scripts/diagnose-cloudflare-turn.mjs [--ttl 60] [--delay 120]. Exit 0 means observations completed, never expiry verified. Requires Python 3 and local Chrome/Edge.',
  );
  process.exit(0);
}
const ttl = Number(values.ttl),
  delay = Number(values.delay);
if (
  !Number.isInteger(ttl) ||
  ttl < 1 ||
  ttl > 172800 ||
  !Number.isInteger(delay) ||
  delay < 21 ||
  delay > 3600
) {
  console.error('ttl must be 1..172800 and delay 21..3600');
  process.exit(2);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const base =
  'https://rtc.live.cloudflare.com/v1/turn/keys/' + process.env.TURN_KEY_ID + '/credentials';
const issued = [];
const out = (event, data) => console.log(JSON.stringify({ event, ...data }));
const safeEnv = { ...process.env };
delete safeEnv.TURN_KEY_ID;
delete safeEnv.TURN_KEY_API_TOKEN;
async function api(path, body) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.TURN_KEY_API_TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    const error = Error('TURN API rejected request');
    error.status = r.status;
    throw error;
  }
  return { status: r.status, data: r.status === 204 ? null : await r.json() };
}
async function generate(ttl) {
  const { data } = await api('/generate-ice-servers', { ttl });
  const c = data.iceServers.find((x) => x.username);
  if (!c) throw Error('Credential absent');
  issued.push(c);
  return c;
}
function python(c) {
  const r = spawnSync('python', ['-u', 'scripts/verify-cloudflare-turn.py', '--allocate-stdin'], {
    cwd: root,
    env: safeEnv,
    input: JSON.stringify(c),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 45000,
  });
  if (r.status !== 0) throw Error('Python allocation probe failed');
  return JSON.parse(r.stdout.trim()).result;
}
let child, ws, profile;
async function browserSetup() {
  const executable = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  if (!executable) throw Error('Isolated browser unavailable');
  profile = mkdtempSync(resolve(tmpdir(), 'colearnia-turn-diagnostic-'));
  child = spawn(
    executable,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true, env: safeEnv },
  );
  for (let i = 0; i < 100 && !existsSync(profile + '/DevToolsActivePort'); i++)
    await new Promise((r) => setTimeout(r, 100));
  const port = readFileSync(profile + '/DevToolsActivePort', 'utf8').split('\n')[0];
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  ws = new WebSocket(tabs.find((x) => x.type === 'page').webSocketDebuggerUrl);
  await new Promise((ok, no) => {
    ws.onopen = ok;
    ws.onerror = () => no(Error('Browser connection failed'));
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const entry = pending.get(m.id);
    if (entry) {
      clearTimeout(entry.timer);
      pending.delete(m.id);
      entry.resolve(m);
    }
  };
  return (expression) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(Error('Browser probe timeout'));
      }, 25000);
      pending.set(key, { resolve, timer });
      ws.send(
        JSON.stringify({
          id: key,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });
}
async function chrome(send, c) {
  const result = await send(
    `(async()=>{const c=${JSON.stringify(c)};const pc=new RTCPeerConnection({iceTransportPolicy:'relay',iceServers:[{urls:['turns:turn.cloudflare.com:443?transport=tcp'],username:c.username,credential:c.credential}]});let relays=0;const errors=new Set();pc.onicecandidate=e=>{if(e.candidate?.type==='relay')relays++;};pc.onicecandidateerror=e=>errors.add(e.errorCode);let timer;try{pc.createDataChannel('probe');await pc.setLocalDescription(await pc.createOffer());const complete=await new Promise(resolve=>{timer=setTimeout(()=>resolve(false),18000);pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==='complete')resolve(true);};if(pc.iceGatheringState==='complete')resolve(true);});return {complete,relayFound:relays>0,errorCodes:[...errors]};}finally{clearTimeout(timer);pc.close();}})()`,
  );
  const value = result.result?.result?.value;
  if (!value) throw Error('Browser measurement failed');
  return value;
}
try {
  if (!process.env.TURN_KEY_ID || !process.env.TURN_KEY_API_TOKEN)
    throw Error('TURN environment missing');
  const used = await generate(ttl),
    unused = await generate(ttl);
  const start = performance.now();
  const change = used.credential.at(-1) === '0' ? '1' : '0';
  const altered = { ...used, credential: used.credential.slice(0, -1) + change };
  out('python-baseline', {
    ttl,
    valid: python(used),
    sameLengthTampered: python(altered),
    swappedCredential: python({ ...used, credential: unused.credential }),
  });
  const send = await browserSetup();
  out('browser-baseline', {
    valid: await chrome(send, used),
    sameLengthTampered: await chrome(send, altered),
  });
  for (const target of [ttl + 20, ttl + delay]) {
    out('waiting', { targetAgeSeconds: target });
    await new Promise((r) =>
      setTimeout(r, Math.max(0, target * 1000 - (performance.now() - start))),
    );
    out('expiry-observation', {
      ageSeconds: Math.round((performance.now() - start) / 1000),
      used: python(used),
      unused: python(unused),
    });
  }
  const fresh = await generate(ttl);
  out('browser-after-ttl', {
    ageSeconds: Math.round((performance.now() - start) / 1000),
    oldUsed: await chrome(send, used),
    oldUnused: await chrome(send, unused),
    freshControl: await chrome(send, fresh),
  });
  out('result', {
    status: 'diagnostic-only',
    expiryVerified: false,
    scope: 'diagnostic',
    credentialTtlSeconds: ttl,
    protocol: 'tls',
    port: 443,
    applicationCallVerified: false,
  });
} catch (error) {
  out('diagnostic-error', { errorType: error.name });
  process.exitCode = 1;
} finally {
  for (const c of issued) {
    try {
      const r = await api('/' + encodeURIComponent(c.username) + '/revoke');
      out('revoke', { status: r.status });
    } catch (error) {
      out('revoke-error', { errorType: error.name, httpStatus: error.status ?? null });
    }
  }
  if (ws) ws.close();
  if (child) {
    child.kill();
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (profile) {
    const target = resolve(profile),
      parent = resolve(tmpdir());
    if (
      target.startsWith(parent + sep) &&
      basename(target).startsWith('colearnia-turn-diagnostic-')
    ) {
      try {
        rmSync(target, { recursive: true, force: true });
      } catch {
        out('profile-cleanup', { pending: true });
      }
    }
  }
}
