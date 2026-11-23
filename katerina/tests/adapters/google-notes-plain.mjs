import { fork, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export const id = 'google-ai-studio/notes-plain';
export const source = fileURLToPath(new URL('../../' + id + '/', import.meta.url));
const preload = fileURLToPath(new URL('../loopback.cjs', import.meta.url));

export async function start(t) {
  const directory = await mkdtemp(join(tmpdir(), 'soen321-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null && child.pid) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
    await rm(directory, { force: true, recursive: true });
  });

  for (const entry of ['server.ts', 'server', 'package.json', 'bun.lock', 'tsconfig.json']) {
    await cp(join(source, entry), join(directory, entry), { recursive: true });
  }

  const components = join(directory, 'src', 'components');
  await mkdir(components, { recursive: true });
  await cp(join(source, 'src', 'components', 'MarkdownView.tsx'), join(components, 'MarkdownView.tsx'));
  const probe = join(directory, 'markdown-probe.mjs');
  await cp(new URL('../markdown-probe.mjs', import.meta.url), probe);

  const env = {
    PATH: process.env.PATH,
    HOME: directory,
    TMPDIR: directory,
    BUN_INSTALL_CACHE_DIR: join(directory, 'cache'),
  };
  function install(args) {
    return spawnSync(process.env.BUN_BIN || 'bun', args, {
      cwd: directory, env, stdio: 'ignore', timeout: 180_000,
    });
  }
  const bun = spawnSync(process.env.BUN_BIN || 'bun', ['--version'], {
    cwd: directory, env, encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (bun.status !== 0) return { blocked: 'Bun executable unavailable.' };
  let installation = install(['install', '--frozen-lockfile']);
  const lockMode = installation.status === 0 ? 'frozen' : 'reconciled in staging';
  if (installation.status !== 0 && installation.error?.code !== 'ETIMEDOUT') {
    installation = install(['install']);
  }
  if (installation.status !== 0) return { blocked: 'Staged dependency installation failed.' };

  child = fork(join(directory, 'server.ts'), [], {
    execArgv: ['--require', preload, '--import', 'tsx'],
    cwd: directory,
    env: { ...env, NODE_ENV: 'production', PORT: '0', JWT_SECRET: randomBytes(48).toString('hex') },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const port = await new Promise(resolve => {
    const timer = setTimeout(() => finish(null), 15_000);
    function finish(value) {
      clearTimeout(timer);
      resolve(value);
    }
    child.once('message', message => finish(message.port));
    child.once('exit', () => finish(null));
    child.once('error', () => finish(null));
  });
  if (!port) return { blocked: 'The staged server did not start.' };

  const base = 'http://127.0.0.1:' + port;
  async function request(path, { method = 'GET', body, cookie } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + '/api' + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual', signal: AbortSignal.timeout(5_000),
    });
    return {
      status: response.status,
      cookie: response.headers.getSetCookie()[0] || '',
      body: await response.json().catch(() => null),
    };
  }

  const health = await request('/health').catch(() => null);
  if (health?.status !== 200 || health.body?.status !== 'ok') {
    return { blocked: 'The staged server did not pass its health check.' };
  }

  return {
    request,
    bun: bun.stdout.trim(),
    lockMode,
    renderInertMarkup() {
      const rendered = spawnSync(process.execPath, ['--import', 'tsx', probe], {
        cwd: directory, env, stdio: 'ignore', timeout: 10_000,
      });
      if (![0, 2].includes(rendered.status)) throw new Error('Markdown renderer failed');
      return rendered.status === 0;
    },
    versions: Object.fromEntries(await Promise.all(
      ['better-sqlite3', 'bcryptjs', 'express', 'tsx', 'jsonwebtoken', 'esbuild', 'react', 'react-dom'].map(async name => {
        const metadata = await readFile(join(directory, 'node_modules', name, 'package.json'), 'utf8');
        return [name, JSON.parse(metadata).version];
      }),
    )),
    passwordStorage(ids, password) {
      const db = new DatabaseSync(join(directory, 'data', 'notes.db'), { readOnly: true });
      try {
        const rows = db.prepare('SELECT password_hash FROM users WHERE id IN (?, ?)').all(...ids);
        const hashes = rows.map(row => row.password_hash);
        return {
          rows: rows.length,
          bcrypt: hashes.every(hash => /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(hash)),
          plaintext: hashes.includes(password),
          distinctSalts: new Set(hashes.map(hash => hash.slice(7, 29))).size === 2,
        };
      } finally {
        db.close();
      }
    },
  };
}
