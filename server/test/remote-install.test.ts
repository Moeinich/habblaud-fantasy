// npm run remote:install / ingest:token (scripts/remote-install.ts, scripts/ingest-token.ts) with a fake HOME, a fake
// Claude Code CLI and a fake server: settings env written (mode 600), plugin installed, token checked; uninstall
// removes only what it added; ingest:token prints the token once and stores only its hash.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run as tokenRun } from '../../scripts/ingest-token';
import { describeSettings, normalizeServer, parseArgs, run, withServer } from '../../scripts/remote-install';
import { HAS_POSIX_MODES, tempDir } from './fixtures';

const TOKEN = `hbl1.mac-anna.${'a'.repeat(43)}`;

function fakeClaude() {
  const calls: string[][] = [];
  const installed = new Set<string>();
  const runner = (args: string[]) => {
    calls.push(args);
    const cmd = args.join(' ');
    if (cmd === 'plugin marketplace list --json') return { code: 0, stdout: '[]', stderr: '' };
    if (cmd === 'plugin list --json') return { code: 0, stdout: JSON.stringify([...installed].map((id) => ({ id, scope: 'user', enabled: true }))), stderr: '' };
    if (args[1] === 'install') installed.add(args[2]);
    if (args[1] === 'uninstall') installed.delete(args[2]);
    return { code: 0, stdout: '', stderr: '' };
  };
  return { calls, runner };
}

const okFetch = (async () => new Response(JSON.stringify({ ok: true, machine: { id: 'mac-anna', name: 'mac-anna' } }), { status: 200 })) as typeof fetch;

describe('remote:install', () => {
  it('arguments: https only, a real token (also from HABBLAUD_SERVER_TOKEN)', () => {
    expect(normalizeServer('https://pi.tail.ts.net/')).toBe('https://pi.tail.ts.net');
    expect(normalizeServer('http://pi.tail.ts.net')).toBeUndefined();
    expect(() => parseArgs(['install', '--server', 'https://pi.tail.ts.net', '--token', 'x'], {})).toThrow();
    expect(parseArgs(['install', '--server', 'https://pi.tail.ts.net'], { HABBLAUD_SERVER_TOKEN: TOKEN })).toMatchObject({ token: TOKEN, server: 'https://pi.tail.ts.net' });
  });

  it('withServer keeps the other env keys; uninstall removes only ours', () => {
    const s = withServer({ env: { FOO: '1' }, model: 'x' }, { url: 'https://pi', token: TOKEN });
    expect(s).toEqual({ env: { FOO: '1', HABBLAUD_SERVER_URL: 'https://pi', HABBLAUD_SERVER_TOKEN: TOKEN }, model: 'x' });
    expect(describeSettings(s)).toEqual({ url: 'https://pi', machine: 'mac-anna' });
    expect(withServer(s, undefined)).toEqual({ env: { FOO: '1' }, model: 'x' });
    expect(withServer(withServer({}, { url: 'https://pi', token: TOKEN }), undefined)).toEqual({});
  });

  it('install writes the env (600) and installs habblaud-remote; uninstall undoes it', async () => {
    const tmp = tempDir();
    try {
      const acc = join(tmp.dir, '.claude');
      mkdirSync(join(acc, 'projects'), { recursive: true });
      writeFileSync(join(acc, 'settings.json'), JSON.stringify({ env: { KEEP: 'yes' } }), { mode: 0o644 });
      const claude = fakeClaude();
      const out: string[] = [];
      const ctx = { env: { HOME: tmp.dir }, home: tmp.dir, claude: claude.runner, out: (l: string) => out.push(l) };
      const opts = parseArgs(['install', '--server', 'https://pi.tail.ts.net', '--token', TOKEN, '--account', acc], {});
      if (opts === 'help') throw new Error('help');
      expect(await run(opts, ctx, okFetch)).toBe(0);
      const settings = JSON.parse(readFileSync(join(acc, 'settings.json'), 'utf8'));
      expect(settings.env).toEqual({ KEEP: 'yes', HABBLAUD_SERVER_URL: 'https://pi.tail.ts.net', HABBLAUD_SERVER_TOKEN: TOKEN });
      if (HAS_POSIX_MODES) expect(statSync(join(acc, 'settings.json')).mode & 0o777).toBe(0o600);
      expect(claude.calls.some((c) => c.join(' ') === 'plugin install habblaud-remote@habblaud --scope user')).toBe(true);

      const un = parseArgs(['uninstall', '--account', acc], {});
      if (un === 'help') throw new Error('help');
      expect(await run(un, ctx, okFetch)).toBe(0);
      expect(JSON.parse(readFileSync(join(acc, 'settings.json'), 'utf8'))).toEqual({ env: { KEEP: 'yes' } });
      expect(claude.calls.some((c) => c.join(' ') === 'plugin uninstall habblaud-remote@habblaud --scope user')).toBe(true);
    } finally {
      tmp.cleanup();
    }
  });

  it('a refused token stops before writing anything', async () => {
    const tmp = tempDir();
    try {
      const acc = join(tmp.dir, '.claude');
      mkdirSync(join(acc, 'projects'), { recursive: true });
      const claude = fakeClaude();
      const out: string[] = [];
      const opts = parseArgs(['install', '--server', 'https://pi.tail.ts.net', '--token', TOKEN, '--account', acc], {});
      if (opts === 'help') throw new Error('help');
      const refused = (async () => new Response('{"error":"x"}', { status: 401 })) as typeof fetch;
      expect(await run(opts, { env: {}, home: tmp.dir, claude: claude.runner, out: (l) => out.push(l) }, refused)).toBe(1);
      expect(() => statSync(join(acc, 'settings.json'))).toThrow();
      expect(claude.calls).toEqual([]);
    } finally {
      tmp.cleanup();
    }
  });
});

describe('ingest:token', () => {
  it('prints the token once, stores only its hash, lists and removes', () => {
    const tmp = tempDir();
    try {
      const env = { HABBLAUD_DATA_DIR: tmp.dir };
      const out: string[] = [];
      expect(tokenRun(['add', 'mac-anna', '--label', 'Anna Mac'], env, (l) => out.push(l))).toBe(0);
      const token = out.map((l) => l.trim()).find((l) => l.startsWith('hbl1.'))!;
      expect(token).toMatch(/^hbl1\.mac-anna\./);
      const file = readFileSync(join(tmp.dir, 'ingest-machines.json'), 'utf8');
      expect(file).not.toContain(token.split('.')[2]);
      if (HAS_POSIX_MODES) expect(statSync(join(tmp.dir, 'ingest-machines.json')).mode & 0o777).toBe(0o600);
      const list: string[] = [];
      tokenRun(['list'], env, (l) => list.push(l));
      expect(list[0]).toMatch(/^mac-anna \(Anna Mac\)/);
      expect(tokenRun(['add', 'Bad Name'], env, () => {})).toBe(1);
      tokenRun(['remove', 'mac-anna'], env, () => {});
      const after: string[] = [];
      tokenRun(['list'], env, (l) => after.push(l));
      expect(after.join('\n')).not.toContain('mac-anna');
    } finally {
      tmp.cleanup();
    }
  });
});
