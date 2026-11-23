import { fork, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const preload = fileURLToPath(new URL('./loopback.cjs', import.meta.url));

export function secret() {
  return 'Fixture-' + randomBytes(24).toString('hex') + '!A1';
}

async function command(binary, args, options) {
  const child = spawn(binary, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', chunk => { output = (output + chunk).slice(-24000); });
  }
  const timeout = setTimeout(() => child.kill('SIGKILL'), 180_000);
  try {
    const [code] = await once(child, 'close');
    return { code, output };
  } catch {
    return { code: null, output: '' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function stage(t, app) {
  const directory = await mkdtemp(join(tmpdir(), 'soen321-'));
  const source = join(root, app.id);
  let child;
  t.after(async () => {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGKILL');
      await exit;
    }
    await rm(directory, { recursive: true, force: true });
  });
  const google = app.id.startsWith('google-');
  const files = new Set(['package.json', ...app.files, app.entry]);
  const lock = google ? 'bun.lock' : 'package-lock.json';
  const hasLock = await stat(join(source, lock)).then(() => true, () => false);
  if (hasLock) files.add(lock);
  for (const file of files) await cp(join(source, file), join(directory, file), { recursive: true });
  const data = join(directory, 'data');
  await mkdir(data);
  const dbPath = join(data, google && app.booking ? 'appointments.db' : app.booking ? 'booking.db' : 'notes.db');
  const legacy = !google && app.notes !== 'forms';
  const runtime = legacy && process.env.LEGACY_NODE ? process.env.LEGACY_NODE : process.execPath;
  const env = {
    PATH: runtime.slice(0, runtime.lastIndexOf('/')) + ':' + process.env.PATH,
    HOME: directory, TMPDIR: directory, DATA_DIR: data, DB_PATH: dbPath,
    BUN_INSTALL_CACHE_DIR: join(directory, 'bun-cache'), npm_config_cache: join(directory, 'npm-cache'),
    npm_config_nodedir: legacy ? process.env.LEGACY_NODE_HEADERS || '' : '',
  };
  const runtimeVersion = await command(runtime, ['--version'], { cwd: directory, env });
  if (runtimeVersion.code !== 0) return { blocked: 'Selected Node runtime unavailable.' };

  const binary = google ? process.env.BUN_BIN || 'bun' : 'npm';
  const tool = await command(binary, ['--version'], { cwd: directory, env });
  if (tool.code !== 0) return { blocked: (google ? 'Bun' : 'npm') + ' unavailable.' };
  let lockMode = hasLock ? 'frozen' : 'manifest ranges';
  const options = { cwd: directory, env };
  let install = await command(binary, google
    ? ['install', '--frozen-lockfile']
    : [hasLock ? 'ci' : 'install', '--no-audit', '--no-fund'], options);
  if (google && /lockfile (had changes|is frozen)|lockfile would change/i.test(install.output)) {
    lockMode = 'reconciled in staging';
    install = await command(binary, ['install'], options);
  }
  const metadata = { node: runtimeVersion.output.trim(), installer: tool.output.trim(), lockMode };
  if (install.code !== 0) {
    const reason = /node-gyp|node-pre-gyp|prebuild|CXX|gyp ERR/i.test(install.output)
      ? 'Native dependency installation failed.'
      : /ENOTFOUND|EAI_AGAIN|Could not resolve host/i.test(install.output)
        ? 'Registry resolution failed.'
        : 'Dependency installation failed.';
    return { ...metadata, blocked: reason };
  }
  if (app.build) {
    const build = await command(binary, ['run', 'build'], options);
    if (build.code !== 0) return { ...metadata, blocked: 'Production frontend build failed in staging.' };
  }
  const dependencies = {};
  for (const name of ['express', 'better-sqlite3', 'bcrypt', 'bcryptjs', 'sqlite3', 'node-gyp', 'ejs', 'express-session', 'jsonwebtoken']) {
    const path = join(directory, 'node_modules', name, 'package.json');
    const text = await readFile(path, 'utf8').catch(() => null);
    if (text) dependencies[name] = JSON.parse(text).version;
  }
  const adminPassword = secret();
  child = fork(join(directory, app.entry), [], {
    execPath: runtime, execArgv: ['--require', preload],
    cwd: directory, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: {
      ...env, PORT: '0', NODE_ENV: 'production', LOCAL_HTTP_TEST: 'true',
      SESSION_SECRET: secret(), JWT_SECRET: secret(), ADMIN_PASSWORD: adminPassword,
      ADMIN_NAME: 'Fixture admin', ADMIN_EMAIL: 'fixture-admin@example.test',
    },
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
  const port = await new Promise(resolve => {
    const timer = setTimeout(() => finish(null), 15_000);
    function finish(value) { clearTimeout(timer); resolve(value); }
    child.once('message', message => finish(message.port));
    child.once('close', () => finish(null));
    child.once('error', () => finish(null));
  });
  if (!port) {
    const kind = /bindings file|NODE_MODULE_VERSION|dlopen/i.test(stderr) ? ' Native module load failed.' : '';
    return { ...metadata, dependencies, blocked: 'The staged server did not start.' + kind };
  }
  async function request(path, { method = 'GET', session, body, headers = {}, form = false } = {}) {
    if (!path.startsWith('/') || path.startsWith('//')) throw Error('Invalid local route');
    const requestHeaders = { ...headers };
    if (session?.cookie) requestHeaders.Cookie = session.cookie;
    if (session?.csrf && !form) requestHeaders['X-CSRF-Token'] = session.csrf;
    if (body !== undefined) requestHeaders['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
    const response = await fetch('http://127.0.0.1:' + port + path, {
      method, headers: requestHeaders, redirect: 'manual', signal: AbortSignal.timeout(5000),
      body: body === undefined ? undefined : form ? new URLSearchParams(body) : JSON.stringify(body),
    });
    const text = await response.text();
    const setCookie = response.headers.getSetCookie()[0] || '';
    let json;
    if (response.headers.get('content-type')?.includes('application/json')) json = JSON.parse(text);
    return { status: response.status, json, text, setCookie, location: response.headers.get('location') };
  }
  function database(callback, readOnly = true) {
    const db = new DatabaseSync(dbPath, { readOnly });
    try { return callback(db); } finally { db.close(); }
  }
  function sessionCount() {
    const db = new DatabaseSync(app.notes === 'plain-json' ? join(data, 'sessions.db') : dbPath, { readOnly: true });
    try { return db.prepare('SELECT count(*) AS count FROM sessions').get().count; }
    finally { db.close(); }
  }
  return { ...metadata, dependencies, request, database, sessionCount, adminPassword };
}
