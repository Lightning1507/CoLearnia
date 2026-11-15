// Offline subprocess fixture. No Cloudflare request or browser process is created.
import * as fs from 'node:fs';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';

const fileSystem = fs.default;
const exists = fileSystem.existsSync;
const remove = fileSystem.rmSync;
fileSystem.existsSync = (path) => (String(path).endsWith('/chrome.exe') ? true : exists(path));
fileSystem.rmSync = (path, options) => {
  remove(path, options);
  console.log(JSON.stringify({ event: 'fixture-profile-cleanup', removed: !exists(path) }));
};
childProcess.spawn = () => {
  const child = new EventEmitter();
  child.kill = () => true;
  setImmediate(() => child.emit('error', new Error('fixture browser launch denied')));
  return child;
};
childProcess.spawnSync = () => ({
  status: 0,
  stdout: JSON.stringify({ result: { accepted: true } }),
});
syncBuiltinESMExports();
let sequence = 0;
globalThis.fetch = async (url) => {
  if (String(url).endsWith('/generate-ice-servers')) {
    sequence++;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        iceServers: [
          {
            username: `fixture-user-${sequence}`,
            credential: 'fixture-password',
          },
        ],
      }),
    };
  }
  if (String(url).endsWith('/revoke')) return { ok: true, status: 204 };
  throw new Error('Unexpected fixture request');
};
