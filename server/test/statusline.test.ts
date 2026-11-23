// Statusline tap (scripts/statusline-tap.mjs, tested as a real process) and the installer
// (scripts/statusline-install.ts). All with FAKE HOME and config dirs in temp folders.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decodeOriginal,
  detectNodeCommand,
  encodeOriginal,
  planInstall,
  planUninstall,
  run,
  TAP_SCRIPT,
  tildify,
  unwrapCommand,
  wrapCommand,
  writeSettings,
  type RunOptions,
} from '../../scripts/statusline-install';
import { HAS_POSIX_MODES, posixShell, tempDir } from './fixtures';

const TAP = resolve(__dirname, '../../scripts/statusline-tap.mjs');
const { originalShell } = (await import(pathToFileURL(TAP).href)) as { originalShell: (env?: NodeJS.ProcessEnv) => string | true };
const SH = posixShell();
const NOW_S = Math.floor(Date.now() / 1000);

function statusJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    hook_event_name: 'Status',
    session_id: 'sess-1',
    transcript_path: '/fake/home/.claude-conta2/projects/-x-proj/sess-1.jsonl',
    cwd: '/x/proj',
    model: { id: 'claude-teste', display_name: 'Teste' },
    workspace: { current_dir: '/x/proj', project_dir: '/x/proj' },
    cost: { total_cost_usd: 1.23 },
    rate_limits: {
      five_hour: { used_percentage: 42.5, resets_at: NOW_S + 3_600 },
      seven_day: { used_percentage: 15, resets_at: NOW_S + 86_400 },
    },
    ...over,
  });
}

// Each call starts real processes (on Windows, also the original command's Git Bash): with the whole suite running,
// it exceeds the default 5 s.
describe('statusline-tap.mjs', { timeout: 20_000 }, () => {
  let tmp: ReturnType<typeof tempDir>;
  let env: NodeJS.ProcessEnv;
  let usageDir: string;

  beforeEach(() => {
    tmp = tempDir();
    usageDir = join(tmp.dir, 'usage');
    // Fake HOME and an explicit usage folder: the test never touches ~/.habblaud or ~/.claude*.
    // CLAUDE_CODE_GIT_BASH_PATH: the same Git Bash as SH for the original command too (Windows).
    env = { PATH: process.env.PATH, HOME: join(tmp.dir, 'home'), HABBLAUD_USAGE_DIR: usageDir, CLAUDE_CODE_GIT_BASH_PATH: process.env.CLAUDE_CODE_GIT_BASH_PATH };
  });
  afterEach(() => tmp.cleanup());

  const tap = (args: string[], input: string, extraEnv: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [TAP, ...args], { input, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 10_000 });

  it.skipIf(!SH)('passes stdin to the original command and writes ONLY the limits, atomically and with mode 600', () => {
    const input = statusJson();
    const r = tap(['--', 'cat'], input);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(input);
    const files = readdirSync(usageDir);
    expect(files).toEqual(['.claude-conta2.json']);
    const file = join(usageDir, files[0]);
    if (HAS_POSIX_MODES) expect(statSync(file).mode & 0o777).toBe(0o600);
    const rec = JSON.parse(readFileSync(file, 'utf8'));
    expect(Object.keys(rec).sort()).toEqual(['accountId', 'configDir', 'fetchedAt', 'five_hour', 'seven_day']);
    expect(rec).toMatchObject({
      accountId: '.claude-conta2',
      configDir: resolve('/fake/home/.claude-conta2'),
      five_hour: { utilization: 42.5, resets_at: NOW_S + 3_600 },
      seven_day: { utilization: 15, resets_at: NOW_S + 86_400 },
    });
    expect(Math.abs(rec.fetchedAt - Date.now())).toBeLessThan(30_000);
    // Nothing from the rest of stdin (cost, session, cwd...).
    const raw = readFileSync(file, 'utf8');
    for (const leak of ['sess-1', 'total_cost_usd', '/x/proj', 'claude-teste']) expect(raw).not.toContain(leak);
  });

  it.skipIf(!SH)('exits with the original command\'s code; commands with pipes and quotes still work', () => {
    expect(tap(['--', 'exit', '7'], statusJson()).status).toBe(7);
    // The installer puts the complex command in single quotes; Claude Code's shell strips them and the tap gets the
    // whole command as a single argument.
    const complex = `printf '%s|' "a b" | tr a-z A-Z`;
    const viaShell = spawnSync(SH!, ['-c', `"${process.execPath}" "${TAP}" -- ${encodeOriginal(complex)}`], {
      input: statusJson(),
      env,
      encoding: 'utf8',
    });
    expect(viaShell.status).toBe(0);
    expect(viaShell.stdout).toBe('A B|');
  });

  it('no original command: prints nothing, but captures', () => {
    const r = tap([], statusJson());
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(existsSync(join(usageDir, '.claude-conta2.json'))).toBe(true);
  });

  it.skipIf(!SH)('no rate_limits, invalid JSON or an impossible usage folder: never gets in the statusline\'s way', () => {
    const noLimits = statusJson({ rate_limits: undefined });
    expect(tap(['--', 'cat'], noLimits).stdout).toBe(noLimits);
    expect(tap(['--', 'cat'], 'this is not json').stdout).toBe('this is not json');
    expect(existsSync(usageDir)).toBe(false);
    // HABBLAUD_USAGE_DIR points at a file: the write fails silently.
    writeFileSync(join(tmp.dir, 'arquivo'), 'x');
    const r = tap(['--', 'echo', 'ok'], statusJson(), { HABBLAUD_USAGE_DIR: join(tmp.dir, 'arquivo') });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('ok\n');
    expect(r.stderr).toBe('');
  });

  it('no transcript_path: CLAUDE_CONFIG_DIR (first in the list) and then ~/.claude', () => {
    tap([], statusJson({ transcript_path: undefined }), { CLAUDE_CONFIG_DIR: '/other/.claude-work,/x' });
    expect(JSON.parse(readFileSync(join(usageDir, '.claude-work.json'), 'utf8')).configDir).toBe(resolve('/other/.claude-work'));
    tap([], statusJson({ transcript_path: undefined }));
    expect(JSON.parse(readFileSync(join(usageDir, '.claude.json'), 'utf8')).configDir).toBe(join(env.HOME!, '.claude'));
  });

  it('doesn\'t rewrite identical values within 10 s', () => {
    tap([], statusJson());
    const file = join(usageDir, '.claude-conta2.json');
    const first = JSON.parse(readFileSync(file, 'utf8')).fetchedAt;
    tap([], statusJson());
    expect(JSON.parse(readFileSync(file, 'utf8')).fetchedAt).toBe(first);
    tap([], statusJson({ rate_limits: { five_hour: { used_percentage: 43, resets_at: NOW_S + 3_600 } } }));
    const changed = JSON.parse(readFileSync(file, 'utf8'));
    expect(changed.five_hour.utilization).toBe(43);
    expect(changed.seven_day).toBeUndefined();
  });

  it.skipIf(process.platform === 'win32')('originalShell outside Windows: Node\'s default shell (/bin/sh)', () => {
    expect(originalShell({ PATH: process.env.PATH })).toBe(true);
  });

  it.runIf(process.platform === 'win32')('originalShell on Windows: CLAUDE_CODE_GIT_BASH_PATH or the Git Bash next to the PATH\'s git.exe', () => {
    const git = join(tmp.dir, 'Git');
    for (const f of ['cmd/git.exe', 'mingw64/bin/git.exe', 'bin/bash.exe', 'outro/bash.exe']) {
      mkdirSync(dirname(join(git, f)), { recursive: true });
      writeFileSync(join(git, f), '');
    }
    const bash = join(git, 'bin', 'bash.exe');
    expect(originalShell({ PATH: join(git, 'cmd') })).toBe(bash);
    expect(originalShell({ PATH: join(git, 'mingw64', 'bin') })).toBe(bash);
    expect(originalShell({ PATH: join(git, 'cmd'), CLAUDE_CODE_GIT_BASH_PATH: join(git, 'outro', 'bash.exe') })).toBe(join(git, 'outro', 'bash.exe'));
    expect(originalShell({ PATH: join(git, 'cmd'), CLAUDE_CODE_GIT_BASH_PATH: join(git, 'nao-existe.exe') })).toBe(bash);
    expect(originalShell({ PATH: tmp.dir })).toBe(true);
    expect(originalShell({})).toBe(true);
    // A relative PATH entry doesn't count: it would resolve against the current folder.
    const code = `const m = await import(${JSON.stringify(pathToFileURL(TAP).href)}); console.log(m.originalShell({ PATH: 'Git/cmd' }));`;
    expect(spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: tmp.dir, encoding: 'utf8' }).stdout.trim()).toBe('true');
  });
});

describe('statusline-install.ts (pure functions)', () => {
  it('tildify: ~/ for what is in HOME (on Windows, also with \\), the rest as is', () => {
    const home = resolve('/u/fulano');
    expect(tildify(home, home)).toBe('~');
    expect(tildify(join(home, '.claude', 'settings.json'), home)).toBe('~/.claude/settings.json');
    expect(tildify(`${home}-outro`, home)).toBe(`${home}-outro`);
    expect(tildify(resolve('/x/y'), home)).toBe(resolve('/x/y'));
  });

  const tapPath = '/repo/habblaud/scripts/statusline-tap.mjs';

  it('wraps and unwraps preserving the original command', () => {
    expect(wrapCommand('node', tapPath, 'npx -y ccstatusline')).toBe('node "/repo/habblaud/scripts/statusline-tap.mjs" -- npx -y ccstatusline');
    expect(wrapCommand('node', tapPath)).toBe('node "/repo/habblaud/scripts/statusline-tap.mjs"');
    for (const original of ['npx -y ccstatusline', `bash -c 'echo "oi" | head -1'`, '~/.claude/statusline.sh 2>/dev/null', `echo 'it'"'"'s'`]) {
      const wrapped = wrapCommand('/opt/homebrew/bin/node', tapPath, original);
      expect(unwrapCommand(wrapped)).toEqual({ tapPath, original });
    }
    expect(unwrapCommand(wrapCommand('node', '/path with $ and "/statusline-tap.mjs', 'x'))).toEqual({ tapPath: '/path with $ and "/statusline-tap.mjs', original: 'x' });
    expect(unwrapCommand('npx -y ccstatusline')).toBeUndefined();
    expect(decodeOriginal(encodeOriginal('a | b'))).toBe('a | b');
  });

  it('install and uninstall plans', () => {
    const settings = { model: 'opus', statusLine: { type: 'command', command: 'npx -y ccstatusline', padding: 0 }, permissions: { allow: ['Bash(ls:*)'] } };
    const inst = planInstall(settings, 'node', tapPath);
    expect(inst.action).toBe('install');
    if (inst.action !== 'install') return;
    expect(inst.settings).toEqual({ ...settings, statusLine: { type: 'command', command: wrapCommand('node', tapPath, 'npx -y ccstatusline'), padding: 0 } });
    expect(Object.keys(inst.settings)).toEqual(['model', 'statusLine', 'permissions']);
    expect(planInstall(inst.settings, 'node', tapPath).action).toBe('none');
    // The repo moved: updates the path without losing the original.
    const moved = planInstall(inst.settings, 'node', '/new/scripts/statusline-tap.mjs');
    expect(moved.action === 'install' && unwrapCommand(String((moved.settings.statusLine as { command: string }).command))).toEqual({ tapPath: '/new/scripts/statusline-tap.mjs', original: 'npx -y ccstatusline' });
    const un = planUninstall(inst.settings);
    expect(un.action === 'uninstall' && un.settings).toEqual(settings);
    expect(planUninstall(settings).action).toBe('none');
    // No statusLine: creates one with just the tap; removing takes the field out.
    const created = planInstall({ model: 'x' }, 'node', tapPath);
    expect(created.action === 'install' && created.settings).toEqual({ model: 'x', statusLine: { type: 'command', command: wrapCommand('node', tapPath) } });
    expect(created.action === 'install' && planUninstall(created.settings)).toMatchObject({ action: 'uninstall', settings: { model: 'x' } });
    expect(planInstall({ statusLine: 'texto' }, 'node', tapPath).action).toBe('skip');
    expect(planInstall({ statusLine: { type: 'outro' } }, 'node', tapPath).action).toBe('skip');
  });

  // Stable macOS and Linux locations; on Windows the binary is node.exe and the command is always "node".
  it.skipIf(process.platform === 'win32')('a stable node on the PATH becomes an absolute path; nvm/fnm become just "node"', () => {
    const home = '/Users/fulano';
    const has = (set: string[]) => (p: string) => set.includes(p);
    expect(detectNodeCommand({ PATH: '/opt/homebrew/bin:/usr/bin' }, home, has(['/opt/homebrew/bin/node', '/usr/bin/node']))).toBe('/opt/homebrew/bin/node');
    expect(detectNodeCommand({ PATH: `${home}/.nvm/versions/node/v24.1.0/bin:/opt/homebrew/bin` }, home, has([`${home}/.nvm/versions/node/v24.1.0/bin/node`, '/opt/homebrew/bin/node']))).toBe('node');
    expect(detectNodeCommand({ PATH: '' }, home, () => false)).toBe('node');
  });
});

describe('statusline-install.ts (files, fake HOME)', () => {
  let tmp: ReturnType<typeof tempDir>;
  let home: string;
  let out: string[];
  const original = { model: 'opus', statusLine: { type: 'command', command: 'npx -y ccstatusline', padding: 0 }, env: { FOO: '1' } };

  beforeEach(() => {
    tmp = tempDir();
    home = join(tmp.dir, 'home');
    out = [];
    mkdirSync(join(home, '.claude', 'projects'), { recursive: true });
    mkdirSync(join(home, '.claude-conta2', 'sessions'), { recursive: true });
    writeFileSync(join(home, '.claude', 'settings.json'), `${JSON.stringify(original, null, 2)}\n`, { mode: 0o644 });
  });
  afterEach(() => tmp.cleanup());

  const exec = (command: RunOptions['command'], extra: Partial<RunOptions> = {}) =>
    run(
      { command, dryRun: false, nodeCmd: process.execPath, ...extra },
      { env: { HOME: home, HABBLAUD_USAGE_DIR: join(tmp.dir, 'usage') }, home, now: new Date(2026, 9, 6, 14, 5, 9), tapPath: TAP_SCRIPT, out: (l) => out.push(l) },
    );
  const read = (acc: string) => JSON.parse(readFileSync(join(home, acc, 'settings.json'), 'utf8'));

  it('install: backup, only statusLine changes, permission preserved; again = nothing to do', () => {
    expect(exec('install')).toBe(0);
    const c = read('.claude');
    expect(c.model).toBe('opus');
    expect(c.env).toEqual({ FOO: '1' });
    expect(c.statusLine).toEqual({ type: 'command', command: wrapCommand(process.execPath, TAP_SCRIPT, 'npx -y ccstatusline'), padding: 0 });
    if (HAS_POSIX_MODES) expect(statSync(join(home, '.claude', 'settings.json')).mode & 0o777).toBe(0o644);
    const backup = join(home, '.claude', 'settings.json.habblaud-backup-20261006-140509');
    expect(JSON.parse(readFileSync(backup, 'utf8'))).toEqual(original);
    // An account without settings.json: creates one with just the tap's statusline (no backup, there was nothing).
    expect(read('.claude-conta2')).toEqual({ statusLine: { type: 'command', command: wrapCommand(process.execPath, TAP_SCRIPT) } });
    expect(readdirSync(join(home, '.claude-conta2'))).not.toContain(expect.stringContaining('backup'));

    out = [];
    expect(exec('install')).toBe(0);
    expect(out.join('\n')).toContain('already installed');
    expect(readdirSync(join(home, '.claude')).filter((f) => f.includes('backup'))).toHaveLength(1);
  });

  it.skipIf(!SH)('the installed command really works: passes the output through and captures usage', () => {
    exec('install');
    const cmd: string = read('.claude').statusLine.command.replace('npx -y ccstatusline', 'cat');
    const usageDir = join(tmp.dir, 'usage');
    const input = statusJson({ transcript_path: join(home, '.claude', 'projects', '-p', 's.jsonl') });
    const r = spawnSync(SH!, ['-c', cmd], { input, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, HABBLAUD_USAGE_DIR: usageDir } });
    expect(r.stdout).toBe(input);
    expect(JSON.parse(readFileSync(join(usageDir, '.claude.json'), 'utf8')).five_hour.utilization).toBe(42.5);
  });

  it('status and uninstall put everything back as it was', () => {
    exec('install');
    out = [];
    exec('status');
    expect(out.join('\n')).toMatch(/\.claude \(.*\): installed \(in front of: npx -y ccstatusline\); no usage captured yet/);
    expect(exec('uninstall')).toBe(0);
    expect(read('.claude')).toEqual(original);
    expect(read('.claude-conta2')).toEqual({});
    out = [];
    exec('uninstall');
    expect(out.join('\n')).toContain('wasn\'t installed');
  });

  it('old name: install moves ~/.codetown to ~/.habblaud (even with HABBLAUD_USAGE_DIR elsewhere); status and uninstall don\'t', () => {
    mkdirSync(join(home, '.codetown', 'usage'), { recursive: true });
    writeFileSync(join(home, '.codetown', 'usage', '.claude.json'), '{"fetchedAt":1}');
    exec('status');
    exec('uninstall');
    exec('install', { dryRun: true });
    expect(existsSync(join(home, '.codetown', 'usage', '.claude.json'))).toBe(true);
    expect(out.filter((l) => l.includes('old name'))).toEqual(['~ ~/.codetown (old name) goes to ~/.habblaud (dry run: nothing moved)']);
    out = [];
    expect(exec('install')).toBe(0);
    expect(out[0]).toBe('✓ ~/.codetown (old name) is now ~/.habblaud.');
    expect(existsSync(join(home, '.codetown'))).toBe(false);
    expect(readFileSync(join(home, '.habblaud', 'usage', '.claude.json'), 'utf8')).toBe('{"fetchedAt":1}');
    expect(read('.claude').statusLine.command).toBe(wrapCommand(process.execPath, TAP_SCRIPT, 'npx -y ccstatusline'));
    // Already migrated: nothing to say.
    out = [];
    exec('install');
    expect(out.join('\n')).not.toContain('old name');
  });

  // On Windows chmod doesn't remove write access to a folder: the rename would go through.
  it.skipIf(!HAS_POSIX_MODES)('old name: if it can\'t be moved, warns and installs anyway', () => {
    mkdirSync(join(home, '.codetown', 'usage'), { recursive: true });
    // Read-only HOME: renaming ~/.codetown fails (the accounts inside stay writable).
    chmodSync(home, 0o555);
    try {
      expect(exec('install')).toBe(0);
    } finally {
      chmodSync(home, 0o755);
    }
    expect(out[0]).toMatch(/^! couldn't move ~\/\.codetown to ~\/\.habblaud \(.+\); move the folder by hand\.$/);
    expect(existsSync(join(home, '.codetown', 'usage'))).toBe(true);
    expect(read('.claude').statusLine.command).toContain('statusline-tap.mjs');
  });

  it('--dry-run doesn\'t write; invalid JSON is never overwritten', () => {
    const before = readFileSync(join(home, '.claude', 'settings.json'), 'utf8');
    exec('install', { dryRun: true });
    expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).toBe(before);
    expect(existsSync(join(home, '.claude-conta2', 'settings.json'))).toBe(false);
    writeFileSync(join(home, '.claude-conta2', 'settings.json'), '{ broken');
    expect(exec('install')).toBe(1);
    expect(readFileSync(join(home, '.claude-conta2', 'settings.json'), 'utf8')).toBe('{ broken');
    expect(out.join('\n')).toContain('invalid JSON');
  });

  it('writeSettings: without a race, writes and the backup is the content the rename replaced', () => {
    const file = join(home, '.claude', 'settings.json');
    const raw = readFileSync(file, 'utf8');
    const next = { ...original, statusLine: { type: 'command', command: 'tap' } };
    const backup = writeSettings(file, next, raw, new Date(2026, 9, 6, 14, 5, 9));
    expect(backup).toBe(`${file}.habblaud-backup-20261006-140509`);
    expect(readFileSync(backup!, 'utf8')).toBe(raw);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(next);
    if (HAS_POSIX_MODES) expect(statSync(file).mode & 0o777).toBe(0o644);
  });

  it('writeSettings: a concurrent edit between the read and the write aborts and the file stays intact', () => {
    const file = join(home, '.claude', 'settings.json');
    const raw = readFileSync(file, 'utf8');
    const concurrent = `${JSON.stringify({ ...original, enabledPlugins: { outro: true } }, null, 2)}\n`;
    expect(concurrent).not.toBe(raw);
    writeFileSync(file, concurrent);
    let message = '';
    try {
      writeSettings(file, { ...original, statusLine: { type: 'command', command: 'tap' } }, raw, new Date(2026, 9, 6, 14, 5, 9));
    } catch (err) {
      message = (err as Error).message;
    }
    // The key written in between stays in the file: the install aborts and leaves no backup or temp file.
    expect(readFileSync(file, 'utf8')).toBe(concurrent);
    expect(message).toMatch(/run the command again/);
    expect(readdirSync(join(home, '.claude')).filter((f) => f.includes('habblaud-backup') || f.includes('habblaud-tmp'))).toEqual([]);
  });
});
