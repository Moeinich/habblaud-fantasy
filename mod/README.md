# Habblaud Claude Code plugins

The repository is also a Claude Code plugin marketplace: `.claude-plugin/marketplace.json` (at the root)
lists the `habblaud` marketplace with three plugins, one in each folder here: the `habblaud` mod (observe only),
`habblaud-permissoes` (answer permission requests from the office) and `habblaud-mensagens` (send messages from the
office). `npm run mod:install` installs all three; `--sem-permissoes` and `--sem-mensagens` leave out the
respective plugin. The versions follow `package.json` (the `server/test/mod.test.ts` test fails if they diverge).

Tested with **Claude Code 2.1.293** (`habblaud-mensagens`, for now only through `claude plugin test` on
2.1.295). Mods (TypeScript hooks loaded by Claude Code itself) exist from 2.1.287 on; the API is still
"early access" and may change between versions. On earlier versions, use the usual installers
(`npm run usage:install` and `npm run hooks:install`); sending messages from the office only exists with the mod. The
installation is covered in the main README.

## `habblaud` — the mod

`habblaud/hooks/register.ts`, a single module, no build. It connects each session to the office without reading the conversation:

- **Plan usage (5h and weekly):** at session start and on every `session.measure` (after each turn and when
  a limit moves by a point) it reads `$.session.usage().rateLimits` and writes `~/.habblaud/usage/<account>.json` (or to
  `HABBLAUD_USAGE_DIR`) in the same format as the statusline tap, plus `"source": "mod"`. It replaces
  `npm run usage:install`: your statusline is left untouched. The account is the folder in `CLAUDE_CONFIG_DIR` (the first
  item) or `~/.claude` (`~` is `HOME`; on Windows without it, `USERPROFILE`). Identical values written less than
  10 s ago are not rewritten; a write failure is silent.
- **"Needs you" below the prompt:** every 5 s it asks the local Habblaud
  (`GET http://127.0.0.1:<HABBLAUD_PORT or 4747>/api/mod/summary`) who is waiting, already excluding this session and its
  subagents, and shows `🏢 Valentina precisa de você em loja-virtual` or
  `🏢 2 precisam de você: Valentina (loja-virtual), Elias (app-mobile)` (up to 3 names, then "and N more").
  Nobody waiting or Habblaud down: the line disappears; while it is down, the queries drop to every 30 s until
  it is back. Only in sessions that draw a UI (`claude -p` queries nothing).
- **`/habblaud`:** a summary of the whole office, answered by the mod itself (it does not call the model and uses no quota):

  ```
  Habblaud 0.3.0 em http://localhost:4747
  7 agentes · 3 trabalhando · 2 precisam de você
  ✋ Valentina (loja-virtual): aprovar uma permissão · dá para responder pelo escritório
  ✋ Elias (app-mobile): responder no terminal
  ```

  When it is down: `O Habblaud não respondeu em http://localhost:4747. Para subir: npm run docker:up na pasta do Habblaud.`

### What it accesses

Output of `claude plugin validate --strict mod/habblaud` (the static analysis Claude Code runs before
loading the module; nothing outside this list is called):

```
❯ ./register.ts hooks: session.start, session.measure, command.run{command=habblaud}
❯ ./register.ts answers its own command: command.run{command=habblaud}
❯ ./register.ts calls: $.clock.after (via askHabblaud), $.clock.every (via schedule), $.clock.now (via writeUsage), $.command.register, $.env.get (via readEnv), $.fs.write (via writeUsage), $.http.fetch (via askHabblaud), $.session.id (via poll), $.session.surfaces (via poll), $.session.usage, $.ui.status (via setStatus)
❯ ./register.ts env writes: nothing
❯ ./register.ts env reads: CLAUDE_CONFIG_DIR, HABBLAUD_PORT, HABBLAUD_USAGE_DIR, HOME, USERPROFILE
```

In plain words: it only observes (no hook decides anything: it does not approve tools, change prompts or read messages),
writes a single file (the usage one), talks only to `127.0.0.1` and reads five environment variables. `$.clock.after` is the
2 s deadline on each query to Habblaud (`$.http.fetch` does not accept an AbortSignal).

## `habblaud-permissoes` — answer permission requests from the office

A plain `PermissionRequest` hook (no mod), in `habblaud-permissoes/hooks/hooks.json`:

```json
{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/permission-hook.mjs\"", "timeout": 86430, "statusMessage": "Aguardando resposta no Habblaud" }] }
```

The `hooks/permission-hook.mjs` script is the same one `npm run hooks:install` installs (single source; plain Node, only
`node:*`, because Claude Code copies only the plugin folder to the cache). It sends the request to the local Habblaud
and waits for the answer for up to 5 min; the dialog stays in the terminal and whichever answer comes first wins. With
Habblaud down or no page open, it exits immediately. Port: `HABBLAUD_PORT` (default 4747); wait:
`HABBLAUD_PERMISSION_TIMEOUT` (default 300 s, up to 86400 s = 24 h; the hook timeout in the plugin is 86430 s). To approve
from your phone while away from the computer, put `"env": { "HABBLAUD_PERMISSION_TIMEOUT": "86400" }` in the account's `settings.json`:
it applies to sessions opened afterwards. Background subagents only show the dialog when the hook finishes,
which is why the default stays at 5 min. Requires `node` 22+ on the session's `PATH`.

`claude plugin validate --strict mod/habblaud-permissoes`: `✔ Validation passed` (the validator also checks the
`hooks.json` schema).

## `habblaud-mensagens` — messages from the office

`habblaud-mensagens/hooks/register.ts`, a single module, no build. It takes what you type in the office
(in the agent panel or in the terminal opened with the T key) into the session, as if you had typed it in the terminal:

- **Polling:** every 2 s, only in sessions that draw a UI (`claude -p` queries nothing),
  `POST http://127.0.0.1:<HABBLAUD_PORT or 4747>/api/mod/inbox` with `{session, account}`. The query also marks the
  session as present: that is what makes the page show the agent's message box (without the plugin, the page shows a hint
  to install it). When Habblaud is down, or answers something else (403 with messages turned off, 404 on a version without the
  route), it drops to querying every 30 s until it is back.
- **Delivery:** each message, in order, goes through `$.prompt.submit({ text, asUser: true })`. The model reads the text as
  its own, without the "The habblaud-mensagens plugin sent a message" (the session log still says it came from the plugin), and the
  text goes exactly as typed. If the session is in the middle of a turn, Claude Code holds the prompt and runs it
  in a turn of its own when the current one ends (a plugin prompt never enters the middle of a turn, the way a typed one
  can). A hook that rejects the message (`{drop}`) or an exception becomes a failure, with the reason, on the page.
- **Acknowledgement:** a `POST /api/mod/inbox/ack` with the result of each one (`{session, results: [{id, ok, error?}]}`).
  Waiting for a message takes at most 2 s: past that, the session is busy, the message is in its queue and
  counts as delivered (the following ones go right after, in order). That way a round never exceeds a few seconds and
  the server's presence (10 s) and acknowledgement (30 s) windows do not expire while the session is busy; the price is that a rejection
  after those 2 s does not reach the page.

It is kept separate from the `habblaud` mod on purpose: that one only observes; this one acts, typing into the session on your behalf. To
go without it: `npm run mod:install -- --sem-mensagens` (one already installed stays; to remove it:
`claude plugin uninstall habblaud-mensagens@habblaud`). `npm run docker:up` updates the plugin for those who already have it,
but does not install it by itself: on an account with the mod and without it, it only gives the hint to run `npm run mod:install`.

### What it accesses

Output of `claude plugin validate --strict mod/habblaud-mensagens`:

```
❯ ./register.ts hooks: session.start
❯ ./register.ts calls: $.clock.after (via waitAtMost), $.clock.every (via schedule), $.env.get (via readEnv), $.http.fetch (via postJson), $.prompt.submit (via submitOne), $.session.id (via round), $.session.surfaces (via round)
❯ ./register.ts env writes: nothing
❯ ./register.ts env reads: CLAUDE_CODE_ENTRYPOINT, CLAUDE_CONFIG_DIR, HABBLAUD_PORT, HOME, USERPROFILE
```

In plain words: a single hook (`session.start`, which starts the round timer); the only action on the session is
`$.prompt.submit` for the messages; it does not read the conversation, writes no file, talks only to `127.0.0.1` and reads four
environment variables (the account comes from `CLAUDE_CONFIG_DIR`, as in the mod). `$.clock.after` is the 2 s deadline on each
request to Habblaud and on each `$.prompt.submit`.

Port: `HABBLAUD_PORT` (default 4747). Requires Claude Code 2.1.287+ and a Habblaud with messages turned on: the
same lock as the terminal and permissions (port bound to `127.0.0.1` and a local Host header) and `HABBLAUD_MENSAGENS`
not turned off (`0`, `false`, `off` or `no` turn it off). Any process on this machine that talks to Habblaud
can send a message to the sessions that have the plugin: hence the local lock.

## Development

```bash
claude --plugin-dir mod/habblaud                     # carrega o mod numa sessão, sem instalar (recarrega ao salvar)
claude -p "/habblaud" --plugin-dir mod/habblaud      # testa o comando sem sessão interativa (não chama o modelo)
cd mod/habblaud && claude plugin test                # testes do mod (tests/*.test.ts), sem sessão, login nem rede
cd mod/habblaud-mensagens && claude plugin test      # idem para o plugin de mensagens
claude plugin validate --strict mod/habblaud         # análise estática + manifesto (idem para as outras pastas e .)
npx tsc -p mod/habblaud                              # tipos (depois de carregar o mod uma vez com --plugin-dir)
```

When a mod is loaded, Claude Code writes the types for the installed version to `<folder>/.claude-plugin/types/` and a
`<folder>/tsconfig.json` that extends them; both are generated and kept out of git (`mod/.gitignore`). The mods' tests
import `claude-code/testing` and only run through `claude plugin test`: `npm test` (vitest) and
`npm run typecheck` do not look at this folder.
