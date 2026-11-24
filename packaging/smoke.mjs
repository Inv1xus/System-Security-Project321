import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--amd64')) {
  throw Error('Usage: node packaging/smoke.mjs [--amd64]');
}
const amd64 = args[0] === '--amd64';
const report = amd64 ? 'smoke-results-amd64.md' : 'smoke-results.md';
const project = 'soen321-smoke-' + randomBytes(4).toString('hex');
const composeArgs = ['compose', '--env-file', '/dev/null', '-p', project];
const environment = { ...process.env };
delete environment.SOEN321_ADMIN_PASSWORD;
delete environment.SOEN321_ADMIN_EMAIL;

const probes = {
  'google-notes-default': { path: '/', database: 'notes.db', api: '/api/health', status: 200 },
  'google-notes-secure': { path: '/', database: 'notes.db', api: '/api/health', status: 200 },
  'google-booking-default': { path: '/', database: 'appointments.db', api: '/api/health', status: 200 },
  'google-booking-secure': { path: '/', database: 'appointments.db', api: '/api/health', status: 200 },
  'kiro-notes-default': { path: '/', database: 'notes.db', api: '/api/notes', status: 401 },
  'kiro-notes-secure': { path: '/login', database: 'notes.db', api: '/notes', status: 302 },
  'kiro-booking-default': { path: '/', database: 'booking.db', api: '/api/bookings', status: 401 },
  'kiro-booking-secure': { path: '/', database: 'booking.db', api: '/api/bookings', status: 401 },
};

function docker(args) {
  return spawnSync('docker', args, {
    cwd: root, env: environment, encoding: 'utf8', timeout: 75_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
let snapshot;
const compose = (...args) => docker([
  ...composeArgs, '--project-directory', root, '-f', snapshot ?? join(root, 'compose.yaml'), ...args,
]);

async function get(port, path) {
  const response = await fetch('http://127.0.0.1:' + port + path, {
    redirect: 'manual', signal: AbortSignal.timeout(2000),
  });
  await response.body?.cancel();
  return response;
}

async function smoke(service, config, row) {
  if (row.image !== 'Present') return;
  const expected = probes[service];
  const container = compose('ps', '--all', '--quiet', service).stdout?.trim();
  if (!container) { row.note = 'Container unavailable'; return; }

  const inspected = docker(['inspect', '--format',
    '{{json .State.Status}}{{println}}{{json .HostConfig.PortBindings}}{{println}}{{json .HostConfig.Tmpfs}}', container]);
  if (inspected.status !== 0) { row.note = 'Container inspection failed'; return; }
  const [state, bindings, tmpfs] = inspected.stdout.trim().split('\n').map(value => JSON.parse(value));
  row.startup = state;
  const port = config.ports[0].published;
  const hostBindings = bindings?.['3000/tcp'] ?? [];
  row.loopback = Object.keys(bindings ?? {}).length === 1 && hostBindings.length === 1
    && hostBindings[0].HostIp === '127.0.0.1' && hostBindings[0].HostPort === String(port);
  row.tmpfs = typeof tmpfs?.['/app/data'] === 'string';
  if (state !== 'running' || !row.loopback || !row.tmpfs) return;

  if (amd64) {
    const runtime = compose('exec', '-T', service, 'node', '-p', 'process.platform + "/" + process.arch');
    row.runtime = runtime.status === 0 && runtime.stdout.trim() === 'linux/x64';
  }

  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      const page = await get(port, expected.path);
      const api = await get(port, expected.api);
      row.page = 'HTTP ' + page.status;
      row.endpoint = 'HTTP ' + api.status;
      const responseType = expected.status === 302
        ? api.headers.get('location') === '/login'
        : api.headers.get('content-type')?.includes('application/json');
      row.http = page.status === 200 && Boolean(page.headers.get('content-type')?.includes('text/html'))
        && api.status === expected.status && Boolean(responseType);
      if (row.http) break;
    } catch {
      row.note = 'Waiting for HTTP';
    }
    await delay(400);
  }

  const sqlite = compose('exec', '-T', service, 'node', '-e',
    'const fs = require("node:fs"); const file = fs.openSync(process.argv[1], "r"); const header = Buffer.alloc(16); fs.readSync(file, header); fs.closeSync(file); process.exit(Number(header.toString("ascii") !== "SQLite format 3\\0"));',
    '/app/data/' + expected.database);
  row.sqlite = sqlite.status === 0;
  if (row.http) delete row.note;
}

const rendered = compose(...(amd64 ? ['-f', join(root, 'compose.amd64.yaml')] : []), 'config', '--format', 'json');
if (rendered.status !== 0) throw Error('Compose configuration could not be resolved.');
const config = JSON.parse(rendered.stdout);
const services = Object.keys(probes);
if (Object.keys(config.services).length !== services.length) throw Error('Expected exactly eight services.');
const tags = new Set();
const hostPorts = new Set();
for (const service of services) {
  const app = config.services[service];
  const port = app?.ports?.[0];
  if (!app?.image || tags.has(app.image) || app.ports.length !== 1 || port.host_ip !== '127.0.0.1'
      || port.target !== 3000 || hostPorts.has(port.published) || app.volumes?.length
      || !Array.isArray(app.tmpfs) || !app.tmpfs.some(item => item.startsWith('/app/data:'))
      || (amd64 && (app.platform !== 'linux/amd64' || !app.image.endsWith(':1.0.0-amd64')))) {
    throw Error('Unexpected isolation or image configuration for ' + service);
  }
  tags.add(app.image);
  hostPorts.add(port.published);
}

const results = Object.fromEntries(services.map(service => {
  const info = docker(['image', 'inspect', '--format', '{{.Os}}/{{.Architecture}}', config.services[service].image]);
  const platform = info.status === 0 ? info.stdout.trim() : null;
  const image = !platform ? 'Missing' : amd64 && platform !== 'linux/amd64' ? 'Wrong platform' : 'Present';
  return [service, { image, platform, startup: 'Untested' }];
}));
const available = services.filter(service => results[service].image === 'Present');
let cleanup = false;
let launch = false;
const directory = mkdtempSync(join(tmpdir(), 'soen321-compose-'));
try {
  snapshot = join(directory, 'compose.json');
  writeFileSync(snapshot, rendered.stdout, { mode: 0o600 });
  if (available.length) {
    launch = compose('up', '-d', '--no-build', '--pull', 'never', ...available).status === 0;
    await Promise.all(available.map(async service => {
      try {
        await smoke(service, config.services[service], results[service]);
      } catch {
        results[service].note = 'Smoke inspection failed';
      }
    }));
  }
} finally {
  if (snapshot) cleanup = compose('down', '--volumes', '--remove-orphans').status === 0;
  rmSync(directory, { force: true, recursive: true });
}

const passed = row => row.image === 'Present' && row.startup === 'running'
  && row.loopback && row.tmpfs && row.sqlite && row.http && (!amd64 || row.runtime);
const engine = docker(['version', '--format', '{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}']);
const version = docker(['compose', 'version', '--short']);
const value = item => item === undefined ? 'Untested' : item ? 'Pass' : 'Fail';
const lines = [
  amd64 ? '# Docker packaging smoke results · Linux AMD64' : '# Docker packaging smoke results', '',
  'These startup and HTTP checks are separate from the T01–T06 security evaluation.', '',
  'Run date (UTC) — ' + new Date().toISOString().slice(0, 10),
  '',
  'Engine — ' + (engine.stdout?.trim() || 'Unavailable'),
  'Compose — ' + (version.stdout?.trim() || 'Unavailable'),
  '',
  'Compose configuration validated eight unique image tags and host ports, each published only on IPv4 loopback.',
  amd64
    ? 'Image platforms were verified by Docker inspection. Node reported Linux x64 inside each passing container.'
    : 'A present image means the tagged image was available locally when smoke testing started.',
  '',
  amd64
    ? '| Service | Image platform | AMD64 runtime | Startup | Loopback | Temporary mount | SQLite header | Page | API or redirect | Smoke |'
    : '| Service | Image | Startup | Loopback | Temporary mount | SQLite header | Page | API or redirect | Smoke |',
  amd64 ? '|---|---|---|---|---|---|---|---|---|---|' : '|---|---|---|---|---|---|---|---|---|',
  ...services.map(service => {
    const row = results[service];
    const image = amd64 ? [row.platform || row.image, value(row.runtime)] : [row.image];
    return '| ' + [service, ...image, row.startup, value(row.loopback), value(row.tmpfs), value(row.sqlite),
      row.page || 'Untested', row.endpoint || 'Untested', passed(row) ? 'Pass' : row.note || 'Fail'].join(' | ') + ' |';
  }),
  '',
  'Compose startup command — ' + (launch ? 'Successful' : 'Incomplete') + '.',
  'Smoke project cleanup — ' + (cleanup ? 'Successful' : 'Failed for ' + project) + '.', '',
];
writeFileSync(new URL('./' + report, import.meta.url), lines.join('\n'));
console.log(services.filter(service => passed(results[service])).length + '/8 smoke checks passed. See packaging/' + report + '.');
if (!cleanup || !launch || services.some(service => !passed(results[service]))) process.exitCode = 1;
