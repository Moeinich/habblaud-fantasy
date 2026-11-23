import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuiet } from '../log';
import { tempDir } from '../test/fixtures';
import { accountIds, codexDirsRefused, discoverClaudeDirs, detectAccounts, isClaudeDir, isCodexHome, parseClaudeAliases, shortcutsByDir } from './detect';
import { AccountsService } from './service';
import { rollover, STALE_AFTER_MS, usageFromCache, usageFromWindows, UsageStore } from './usage';

setQuiet(true);

// An absolute root on Windows too (there resolve adds the drive letter).
const H = resolve('/Users/fulano');

describe('shell aliases', () => {
  it('only alias lines that invoke claude; CLAUDE_CONFIG_DIR expanded', () => {
    const rc = [
      'export OPENAI_API_KEY="sk-secret"',
      "alias ll='ls -la'",
      "alias claude2='CLAUDE_CONFIG_DIR=\"$HOME/.claude-conta2\" claude --permission-mode auto'",
      "alias c='claude --permission-mode auto'",
      "alias f='claude --permission-mode auto --agent frinus'",
      "alias d='CLAUDE_CONFIG_DIR=\"$HOME/.claude-conta2\" claude --permission-mode auto'",
      'alias e="CLAUDE_CONFIG_DIR=~/.claude-work/ claude"',
      "alias sq='claude-squad'",
      "  # alias x='claude'",
      "alias w='cd ~/.claude && ls'",
    ].join('\n');
    expect(parseClaudeAliases(rc, H)).toEqual([
      { name: 'claude2', configDir: join(H, '.claude-conta2') },
      { name: 'c' },
      { name: 'f' },
      { name: 'd', configDir: join(H, '.claude-conta2') },
      { name: 'e', configDir: join(H, '.claude-work') },
    ]);
  });

  it('prefers the shortest alias (tie: the first) and uses upper case', () => {
    const m = shortcutsByDir(
      [{ name: 'claude2', configDir: join(H, '.claude-conta2') }, { name: 'c' }, { name: 'f' }, { name: 'd', configDir: join(H, '.claude-conta2') }],
      H,
    );
    expect(m.get(join(H, '.claude'))).toBe('C');
    expect(m.get(join(H, '.claude-conta2'))).toBe('D');
  });

  it('ids disambiguated when two dirs have the same basename', () => {
    expect(accountIds(['/a/.claude', '/b/.claude', '/c/.claude-x'])).toEqual(['.claude', '.claude~2', '.claude-x']);
  });
});

describe('account detection', () => {
  let tmp: ReturnType<typeof tempDir>;
  let home: string;
  beforeEach(() => {
    tmp = tempDir();
    home = tmp.dir;
    mkdirSync(join(home, '.claude', 'projects'), { recursive: true });
    mkdirSync(join(home, '.claude-conta2', 'sessions'), { recursive: true });
    mkdirSync(join(home, '.claude-vazio'), { recursive: true });
    writeFileSync(join(home, '.claude.json'), '{}');
    writeFileSync(
      join(home, '.zshrc'),
      "alias c='claude'\nalias d='CLAUDE_CONFIG_DIR=\"$HOME/.claude-conta2\" claude'\nexport TOKEN=do-not-read\n",
    );
  });
  afterEach(() => tmp.cleanup());

  it('discovers $HOME/.claude* with projects/ or sessions/, default first', () => {
    expect(discoverClaudeDirs({}, home)).toEqual([join(home, '.claude'), join(home, '.claude-conta2')]);
    const extra = join(home, 'other');
    mkdirSync(extra);
    expect(discoverClaudeDirs({ CLAUDE_CONFIG_DIR: extra }, home)).toContain(extra);
    expect(discoverClaudeDirs({ HABBLAUD_CLAUDE_DIRS: ' /x/a , ~/b ' }, home)).toEqual([resolve('/x/a'), join(home, 'b')]);
  });

  it('a Codex folder (CODEX_HOME) never becomes a Claude Code account, by any path', () => {
    // A synthetic CODEX_HOME: sessions/YYYY/MM/DD (rollouts), locks, config.toml and auth.json (never opened).
    const codex = join(home, '.codex');
    mkdirSync(join(codex, 'sessions', '2026', '10', '09'), { recursive: true });
    mkdirSync(join(codex, 'thread-writer-locks'), { recursive: true });
    writeFileSync(join(codex, 'config.toml'), 'model = "x"\n');
    writeFileSync(join(codex, 'auth.json'), '{}');
    // A CODEX_HOME with a name the $HOME search picks up (.claude*): only with sessions/YYYY/.
    const disguised = join(home, '.claude-codex');
    mkdirSync(join(disguised, 'sessions', '2026'), { recursive: true });
    for (const marker of ['thread-writer-locks', 'archived_sessions', 'config.toml', 'auth.json', 'sessions/2026']) {
      const p = join(home, `codex-${marker.replace('/', '-')}`);
      if (marker.includes('.')) {
        mkdirSync(join(p, 'sessions'), { recursive: true });
        writeFileSync(join(p, marker), '');
      } else mkdirSync(join(p, marker), { recursive: true });
      expect(isCodexHome(p), marker).toBe(true);
      expect(isClaudeDir(p), marker).toBe(false);
    }
    // Claude Code accounts still count: sessions/ empty or with <pid>.json, and projects/ always wins.
    writeFileSync(join(home, '.claude-conta2', 'sessions', '123.json'), '{}');
    for (const p of [join(home, '.claude'), join(home, '.claude-conta2')]) expect(isClaudeDir(p)).toBe(true);
    const mixed = join(home, '.claude-mixed');
    mkdirSync(join(mixed, 'projects'), { recursive: true });
    writeFileSync(join(mixed, 'config.toml'), '');
    expect(isCodexHome(mixed)).toBe(false);
    expect(isCodexHome(join(home, 'does-not-exist'))).toBe(false);
    expect(isCodexHome(join(home, '.claude-vazio'))).toBe(false);

    expect(discoverClaudeDirs({}, home)).toEqual([join(home, '.claude'), join(home, '.claude-conta2'), mixed]);
    expect(codexDirsRefused({}, home)).toEqual([disguised]);
    // CLAUDE_CONFIG_DIR and HABBLAUD_CLAUDE_DIRS pointing at Codex: left out (the rest of the list stays the same).
    expect(discoverClaudeDirs({ CLAUDE_CONFIG_DIR: codex }, home)).not.toContain(codex);
    expect(codexDirsRefused({ CLAUDE_CONFIG_DIR: codex }, home)).toEqual([disguised, codex]);
    expect(discoverClaudeDirs({ HABBLAUD_CLAUDE_DIRS: `~/.claude,~/.codex,/x/a` }, home)).toEqual([join(home, '.claude'), resolve('/x/a')]);
    expect(codexDirsRefused({ HABBLAUD_CLAUDE_DIRS: `~/.claude,~/.codex,/x/a` }, home)).toEqual([codex]);
    const env = { HABBLAUD_ACCOUNTS: JSON.stringify([{ id: '.codex', mountDir: codex }]) };
    expect(discoverClaudeDirs(env, home)).not.toContain(codex);
  });

  it('reads only the allowed fields of .claude.json, shortcuts and colors', () => {
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({
        oauthAccount: { emailAddress: 'a@company.com', organizationName: 'Company', displayName: 'A', billingType: 'x', accountUuid: 'no' },
        mcpServers: { s: { env: { SECRET: 'must-not-leak' } } },
      }),
    );
    writeFileSync(
      join(home, '.claude-conta2', '.claude.json'),
      JSON.stringify({
        oauthAccount: { emailAddress: 'b@personal.com' },
        cachedUsageUtilization: { fetchedAtMs: 1000, utilization: { five_hour: { utilization: 10, resets_at: null } } },
      }),
    );
    const accs = detectAccounts([join(home, '.claude'), join(home, '.claude-conta2'), join(home, '.claude-vazio')], { home, env: {} });
    expect(accs).toEqual([
      { id: '.claude', configDir: join(home, '.claude'), short: 'C', name: 'Account C', color: '#f08a3c', email: 'a@company.com', organization: 'Company' },
      {
        id: '.claude-conta2',
        configDir: join(home, '.claude-conta2'),
        short: 'D',
        name: 'Account D',
        color: '#4aa8e8',
        email: 'b@personal.com',
        cachedUsage: { fetchedAtMs: 1000, utilization: { five_hour: { utilization: 10, resets_at: null } } },
      },
      { id: '.claude-vazio', configDir: join(home, '.claude-vazio'), short: 'A', name: 'Account A', color: '#5cc97b' },
    ]);
    expect(JSON.stringify(accs)).not.toContain('must-not-leak');
  });

  it('HABBLAUD_ACCOUNTS (Docker) overrides metadata matching by id or mountDir', () => {
    const env = {
      HABBLAUD_ACCOUNTS: JSON.stringify([
        { id: '.claude', configDir: '/Users/x/.claude', mountDir: join(home, '.claude'), short: 'C', email: 'host@x.com', plan: 'Max', color: '#000000' },
        { mountDir: join(home, '.claude-conta2'), configDir: '/Users/x/.claude-conta2', short: 'D', name: 'Personal', cachedUsage: { fetchedAtMs: 5 } },
      ]),
    };
    const accs = detectAccounts([join(home, '.claude'), join(home, '.claude-conta2')], { home: '/none', env });
    expect(accs[0]).toMatchObject({ id: '.claude', configDir: '/Users/x/.claude', short: 'C', name: 'Account C', email: 'host@x.com', plan: 'Max', color: '#000000' });
    expect(accs[1]).toMatchObject({ id: '.claude-conta2', configDir: '/Users/x/.claude-conta2', short: 'D', name: 'Personal', cachedUsage: { fetchedAtMs: 5 } });
  });
});

describe('usage (5h and weekly)', () => {
  const NOW = Date.parse('2026-10-06T12:00:00Z');
  const windows = {
    five_hour: { utilization: 42.5, resets_at: '2026-10-06T14:00:00.123+00:00' },
    seven_day: { utilization: 15, resets_at: '2026-10-09T23:00:00Z' },
    seven_day_opus: null,
    seven_day_sonnet: { utilization: 3, resets_at: null },
    extra_usage: { is_enabled: false },
  };

  it('normalizes the windows in the Claude Code format', () => {
    expect(usageFromWindows(windows, 'cache', NOW)).toEqual({
      source: 'cache',
      fetchedAt: NOW,
      fiveHour: { utilization: 42.5, resetsAt: Date.parse('2026-10-06T14:00:00.123Z') },
      sevenDay: { utilization: 15, resetsAt: Date.parse('2026-10-09T23:00:00Z') },
      sevenDaySonnet: { utilization: 3 },
    });
    expect(usageFromWindows({}, 'cache', NOW)).toBeUndefined();
  });

  it('cache: fetchedAtMs becomes fetchedAt; old = stale; nothing = disabled', () => {
    const store = new UsageStore();
    expect(store.view('x', NOW).status).toBe('disabled');
    store.set('x', usageFromCache({ fetchedAtMs: NOW - 5 * 60_000, utilization: windows })!);
    expect(store.view('x', NOW).status).toBe('ok');
    expect(store.view('x', NOW + STALE_AFTER_MS).status).toBe('stale');
  });

  it('windows whose reset has passed have no data (never a made-up 0%)', () => {
    const u = usageFromWindows(windows, 'cache', NOW)!;
    // Before the weekly reset, but after the 5h session's.
    const r = rollover(u, Date.parse('2026-10-06T15:00:00Z'));
    expect(r.fiveHour).toBeUndefined();
    expect(r.sevenDay).toEqual({ utilization: 15, resetsAt: Date.parse('2026-10-09T23:00:00Z') });
    // Without a reset time: still counts.
    expect(r.sevenDaySonnet).toEqual({ utilization: 3 });
    const later = rollover(u, Date.parse('2026-10-10T00:00:00Z'));
    expect(later.fiveHour).toBeUndefined();
    expect(later.sevenDay).toBeUndefined();
    expect(later).toMatchObject({ source: 'cache', fetchedAt: NOW });
    // The original isn't changed.
    expect(u.fiveHour?.utilization).toBe(42.5);
  });

  it('the source with the most recent numbers wins; clearing a source brings back the other', () => {
    const store = new UsageStore();
    store.set('x', usageFromWindows(windows, 'cache', NOW - 3_600_000)!);
    store.set('x', usageFromWindows({ ...windows, five_hour: { utilization: 77, resets_at: null } }, 'statusline', NOW - 60_000)!);
    expect(store.view('x', NOW)).toMatchObject({ status: 'ok', usage: { source: 'statusline', fiveHour: { utilization: 77 } } });
    expect(store.clear('x', 'statusline')).toBe(true);
    expect(store.view('x', NOW)).toMatchObject({ status: 'stale', usage: { source: 'cache' } });
  });

  it('AccountsService: accounts of another tool (list from outside), unique ids and pushed usage', () => {
    const tmp = tempDir();
    try {
      const dir = join(tmp.dir, '.claude');
      mkdirSync(join(dir, 'sessions'), { recursive: true });
      let changes = 0;
      let now = NOW;
      const svc = new AccountsService({ dirs: [dir], home: tmp.dir, env: {}, onChange: () => changes++, now: () => now });
      const det = (id: string) => ({ id, configDir: `/Users/x/${id}`, short: 'X', name: 'Codex', color: '#10a37f' });
      changes = 0;
      const set = svc.setProviderAccounts('codex', [
        { dir: join(tmp.dir, '.codex'), detected: det('.codex') },
        { dir: join(tmp.dir, 'b', '.codex'), detected: det('.codex') },
        // Same id as a Claude Code account: disambiguated.
        { dir: join(tmp.dir, 'c', '.claude'), detected: det('.claude') },
      ]);
      expect(set.map((e) => [e.id, e.provider, e.detected.id, e.detected.provider])).toEqual([
        ['.codex', 'codex', '.codex', 'codex'],
        ['.codex~2', 'codex', '.codex~2', 'codex'],
        ['.claude~2', 'codex', '.claude~2', 'codex'],
      ]);
      expect(changes).toBe(1);
      // The same list again: same ids, no change notice.
      expect(svc.setProviderAccounts('codex', set.map((e) => ({ dir: e.dir, detected: det(basename(e.dir)) }))).map((e) => e.id)).toEqual([
        '.codex',
        '.codex~2',
        '.claude~2',
      ]);
      expect(changes).toBe(1);
      // entries() = Claude Code only (watcher, history and statusline); the rest sees them all.
      expect(svc.entries().map((e) => [e.id, e.provider])).toEqual([['.claude', 'claude']]);
      expect(svc.entriesOf('codex').map((e) => e.id)).toEqual(['.codex', '.codex~2', '.claude~2']);
      expect(svc.allEntries().map((e) => e.id)).toEqual(['.claude', '.codex', '.codex~2', '.claude~2']);
      expect(svc.find('.codex~2')?.dir).toBe(join(tmp.dir, 'b', '.codex'));
      expect(svc.idForDir(join(tmp.dir, '.codex'))).toBe('.codex');
      const infos = svc.list(new Map([['.codex', 2]]));
      expect(infos[0]).not.toHaveProperty('provider');
      expect(infos[1]).toMatchObject({ id: '.codex', provider: 'codex', sessions: 2, usageStatus: 'disabled', configDir: '/Users/x/.codex' });

      // Usage pushed by the source (origin 'codex'), with the account without a quota.
      changes = 0;
      expect(svc.setUsage('.codex', { source: 'codex', fetchedAt: NOW - 60_000, fiveHour: { utilization: 12.5, resetsAt: NOW + 3_600_000 } })).toBe(true);
      expect(changes).toBe(1);
      expect(svc.setUsage('.codex', { source: 'codex', fetchedAt: NOW - 60_000, fiveHour: { utilization: 12.5, resetsAt: NOW + 3_600_000 } })).toBe(false);
      expect(changes).toBe(1);
      svc.setUsage('.codex~2', { source: 'codex', fetchedAt: NOW, noQuota: true });
      expect(svc.list(new Map()).find((a) => a.id === '.codex')).toMatchObject({ usageStatus: 'ok', usage: { source: 'codex', fiveHour: { utilization: 12.5 } } });
      expect(svc.list(new Map()).find((a) => a.id === '.codex~2')?.usage).toEqual({ source: 'codex', fetchedAt: NOW, noQuota: true });
      // Ages like the other origins (the periodic refresh notices and reports it).
      now = NOW + STALE_AFTER_MS;
      changes = 0;
      svc.refresh();
      expect(changes).toBe(1);
      expect(svc.usageView('.codex').status).toBe('stale');
      expect(svc.clearUsage('.codex', 'codex')).toBe(true);
      expect(svc.usageView('.codex').status).toBe('disabled');

      // An account that left loses its stored usage; an empty list removes the tool.
      svc.setProviderAccounts('codex', [{ dir: join(tmp.dir, '.codex'), detected: det('.codex') }]);
      expect(svc.usageView('.codex~2').status).toBe('disabled');
      svc.setProviderAccounts('codex', []);
      expect(svc.allEntries().map((e) => e.id)).toEqual(['.claude']);
      expect(svc.list(new Map()).map((a) => a.id)).toEqual(['.claude']);
    } finally {
      tmp.cleanup();
    }
  });

  it('AccountsService reads the /usage cache from the account\'s .claude.json', () => {
    const tmp = tempDir();
    try {
      const dir = join(tmp.dir, '.claude-conta2');
      mkdirSync(join(dir, 'sessions'), { recursive: true });
      let changes = 0;
      const svc = new AccountsService({ dirs: [dir], home: tmp.dir, env: {}, onChange: () => changes++, now: () => NOW });
      expect(svc.list(new Map())[0].usageStatus).toBe('disabled');
      writeFileSync(join(dir, '.claude.json'), JSON.stringify({ cachedUsageUtilization: { fetchedAtMs: NOW - 60_000, utilization: windows } }));
      svc.refresh();
      const info = svc.list(new Map([['.claude-conta2', 3]]))[0];
      expect(info).toMatchObject({ id: '.claude-conta2', sessions: 3, usageStatus: 'ok', usage: { source: 'cache', fiveHour: { utilization: 42.5 } } });
      expect(changes).toBeGreaterThan(0);
    } finally {
      tmp.cleanup();
    }
  });
});
