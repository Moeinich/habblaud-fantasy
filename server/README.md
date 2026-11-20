# Habblaud server

Plain Node (no runtime dependencies). It watches the **open** Claude Code sessions across all accounts on the machine,
maintains the office model and broadcasts everything over SSE.

```
npm run dev      # server + Vite (middleware, HMR) at http://127.0.0.1:4747
npm run build && npm start   # production: serves dist/client
```

## Data sources (read-only)

| What | Where |
| --- | --- |
| Open sessions and status (busy/idle/waiting) | `<config>/sessions/<pid>.json` (+ live PID, outside Docker) |
| Activities, tasks, title, numbers | `<config>/projects/<cwd>/<sessionId>.jsonl` (reads the last ~1 MB at boot; the beginning in the background) |
| Subagents (including from workflows) | `<config>/projects/<cwd>/<sessionId>/subagents/**/agent-*.jsonl` + `.meta.json` |
| Account (email, organization) and usage cache | `~/.claude.json` (default account) or `<config>/.claude.json` — only those fields |
| Live usage (5h and weekly) | `~/.habblaud/usage/<account>.json`, written by the Habblaud mod (`npm run mod:install`) or by `scripts/statusline-tap.mjs` (`npm run usage:install`) |
| Account shortcut (`c`, `d`...) | `alias x='... claude ...'` lines in `~/.zshrc`, `~/.bashrc`, `~/.zprofile`, `~/.bash_profile` |

**Forks** (subagents that inherit the parent's context): the transcript starts with a `fork-context-ref` line, the
copy of the parent's `Agent` call (same `tool_use` id as in `.meta.json`) and its result ("Fork started…") together
with the fork's instruction. The parser ignores that copy — otherwise the inherited result looks like the end of the
subagent and the fork never enters the office — and uses the text after `</fork-boilerplate>` as its request.

## Waiting on the shell

The `shell` status (see `shared/types.ts`) is an agent that ended its turn with command(s) running in the
background. It comes from the registry (`"status": "shell"`, Claude Code 2.1.292+, which does not count monitors); in versions that
do not write `shell`, an `idle` registry entry + a background Bash with no notification for less than 12 h becomes `shell`.

`sources/shells.ts` tracks, per session (main and subagents), the `ShellJob`s published in `AgentInfo.shells`:
Bash with `run_in_background` (the id becomes the `backgroundTaskId` from the tool_result), foreground Bash still
without a result (`background: false`; it disappears from its place while the session waits for approval) and `Monitor` (`kind: 'monitor'`).
Ending: a `<task-notification>` (a `queue-operation`/`enqueue` line, a user message or an attachment) matching `task-id` or
`tool-use-id`; `TaskStop`/`KillShell`/`KillBash`; end of turn/interruption (foreground); `/clear` or ended session;
jobs that predate the current process (resumed session) or are older than 24 h. The end of a background
shell becomes the activity `tool: 'ShellDone'` (`error` = failed/interrupted; the world celebrates or mourns) and a notice;
while the status is `shell`, the bubble reads "⏳ Waiting on the shell: <label>" (`tool: 'ShellWait'`).

## GitHub in the office

`sources/github.ts` finds GitHub events in the transcripts, with no token and no network (it works in Docker): the parser keeps the
calls of interest (Bash with `git push`/`gh pr create|merge|checks`/`gh run watch|view`/`gh release create`, with
heredocs already stripped and chained commands split, and tools from GitHub MCP servers) and reads their result:

- **preferred source:** `toolUseResult.gitOperation`, written by Claude Code itself (`{pr: {number, url, action:
  'created'|'merged'}, push: {branch}}`);
- **command output:** the `…/pull/<n>` URL from `gh pr create`; `gh pr merge` with no error or failure sign (and without `--auto`);
  `abc..def  main -> main` / `* [new branch]` lines after `To <remote>`; the header `✓|X <branch> <workflow> · <id>`
  or `completed with '<conclusion>'` from `gh run watch|view`, `--json`/`--jq` with the conclusion, `gh pr checks` (tabs, summary
  or `--json`; pending does not count); the `…/releases/tag/<tag>` URL from `gh release create` (a draft does not count); MCP JSON;
- **exit code:** `gh run watch --exit-status` or `gh pr checks` as the last command, with no pipe (otherwise the code belongs to
  another program) — in the foreground ("Exit code N") or in the background (summary of the `<task-notification>`). ≥ 128
  (killed) and 8 (`gh pr checks` pending) do not count.

A command that failed, was blocked or was interrupted produces no event (only red CI uses the error). The `github` signal becomes
`Office.githubEvent`: an activity `tool: 'GitHub'` (`shared/github.ts`) and, only live (never on the initial load or for
lines older than 2 min), a notice and a room effect, published in `RoomInfo.effect` (`{kind: 'party'|'alarm', text, at,
until, agentId}`): a party (PR opened/merged, release) for 12 s; an alarm (red CI) until a green CI in the room (which becomes a
party) or 10 min. A push only shows a notice. The same CI seen again within 2 min does not repeat the notice.

## API

| Route | Description |
| --- | --- |
| `GET /api/stream` | SSE: `snapshot`, `feed`, `notice` events (see `shared/types.ts`); ping every 15 s |
| `GET /api/snapshot` | current `OfficeSnapshot` |
| `GET /api/agents/:id` | `AgentDetail` (history of up to 200 activities) |
| `GET /api/agents/:id/terminal` | terminal SSE: `init` and `append` events (`TerminalMessage`); only with a local bind (see below) |
| `PUT /api/agents/:id/character` | project character: `{name, seed, parts}` (see below); `200 {ok}`, `400`, `404` (not the main agent of an open session), `409` (name in use); only with local access |
| `DELETE /api/agents/:id/character` | "Back to random": deletes the room's character; `200 {ok}` or `404`; only with local access |
| `GET /api/sessions/recent` | `RecentSessionsResponse`: sessions from the last 7 days across all accounts (up to 150); same lock as the terminal |
| `GET /api/sessions/:account/:sessionId/terminal` | SSE of the conversation of a history session (same protocol as the terminal); same lock |
| `GET /api/stats?day=YYYY-MM-DD&tz=<IANA>&source=real\|demo` | `DayStatsResponse` for "My day" (see below); defaults: today, the server's time zone, demo if enabled and the day is today |
| `GET /api/stats/days?tz=<IANA>` | `StatsDaysResponse`: days with real data (and demo data, if enabled), most recent first |
| `GET /api/timeline/days` | `{recording, days:[{day, bytes, from, to}]}`: days recorded for the timelapse, from the most recent to the oldest |
| `GET /api/timeline/:day` | the day's file (`YYYY-MM-DD`) as JSONL (`application/x-ndjson`, gzip if accepted); 400 for an invalid day, 404 with no recording |
| `GET /api/health` | `{ok, version, demo, docker, terminal, permissions, messages, updates:{state, latest, available}, sources, accounts:[{id, usageStatus}]}` |
| `POST /api/demo` | `{enabled: boolean}` turns simulated agents on/off (mixed in with the real ones) |
| `GET /api/mod/summary?account=&session=` | `ModSummary` for the Claude Code mod: `{version, agents, working, waiting:[{id, name, room, account, waitingFor, since, answerable}]}`, without the demo and without the asker's own session (see below) |
| `GET /api/updates` | `{version, ...UpdateStatus}`: the version in use and the result of the new-version check (see below) |
| `POST /api/updates/check` | "Check now": queries GitHub (at most once every 30 s) and returns `{version, ...UpdateStatus}` |
| `/api/world/*` | Habblaud World (account, character and building; on by default, `HABBLAUD_WORLD=0` turns it off): only through the local port with a local `Host`; see below |
| `POST /api/permissions` | (hook) registers a permission request: `201 {id, expiresAt}` or `200 {skip}`; only with a local bind (see below) |
| `GET /api/permissions/:id/wait` | (hook) long-poll of up to 25 s (`?timeout=` in seconds): `{status: 'pending' \| 'decided' \| 'released', ...}` |
| `GET /api/permissions/:id` | (page) request detail with the arguments (`PermissionRequestInfo` with `input`) |
| `POST /api/permissions/:id/decision` | (page) `PermissionDecision`: `{behavior: 'allow' \| 'deny' \| 'terminal' \| 'answer', message?, interrupt?, suggestion?, answers?}` |
| `POST /api/messages` | (page) `{agentId, text}`: sends a message to a main agent; `201 OutboxMessage`; only with a local bind (see below) |
| `GET /api/messages/:id` | (page) message status (`OutboxMessage`: `queued` \| `sent` \| `delivered` \| `failed`) |
| `POST /api/mod/inbox` | (plugin `habblaud-mensagens`) `{session, account?}`: marks the session's presence and delivers `{messages: InboxMessage[]}` |
| `POST /api/mod/inbox/ack` | (plugin) `{session, results: [{id, ok, error?}]}`: acknowledges each delivered message (or the failure) |

The snapshot (SSE and `GET /api/snapshot`) carries only the last 8 activities of each agent in `recent`; the history
of up to 200 (including the beginning of long transcripts, read in the background) comes from `GET /api/agents/:id`.

Edge (`http/guard.ts`, applies to the API, static files and Vite): `Host` must be `localhost`/`*.localhost`, an IP
or a name from `HABBLAUD_ALLOWED_HOSTS` (against DNS rebinding) → otherwise 403; `POST` to `/api/*` requires
`Content-Type: application/json` (415) and an `Origin` that is same-origin or local (403), against CSRF. JSON responses
go out with `nosniff` and `Cross-Origin-Resource-Policy: same-origin`, with no CORS.

## New version

`updates/checker.ts` queries `GET https://api.github.com/repos/<owner>/<name>/releases/latest`, with no token, 5 s after
startup and then every 6 h (1 h after a failure). The repository comes from the `repository` field of `package.json`
(a fork only needs to change that field). The query sends `If-None-Match` with the previous ETag, because a
304 response does not count against the limit of 60 unauthenticated queries per hour. The result (`repo`, `checkedAt`, `etag`, `latest`, `url`,
`publishedAt`) is stored in `<dataDir>/updates.json`, so a restart does not repeat the query before it is due. The tag must
follow semver (`v1.2.3` or `1.2.3-beta.1`) and is compared with the `package.json` version. Responses: 404 = no
release (`ok` without `latest`); 403/429 = GitHub rate limit (`error`). On a failure, the last known release stays
valid. The status goes in the snapshot at `meta.updates` (`UpdateStatus` in `shared/types.ts`) and, when it changes, the snapshot is
republished. The release link is only accepted if it belongs to the repository itself on GitHub. A new version that is found is
announced once in the log. `HABBLAUD_UPDATE_CHECK=0` turns it off (`state: 'off'`, no queries).

Each version has its own section in `CHANGELOG.md`; a test fails if the `package.json` version has no section, and
`npm run release` (`scripts/release.ts`) creates the tag and the release with that section's text as the notes.

## Terminal

`GET /api/agents/:id/terminal` (`http/terminal.ts`) streams the session's conversation — prompts, replies,
tools and results, as Claude Code shows them — assembled from the transcript by `sources/terminal.ts`, with
secrets masked and texts truncated. On connect (and on every reconnection) an `init` arrives with the last 500
entries from the final ~4 MB of the transcript (`truncated: true` if part of the conversation was left out); after that, 400 ms polling
sends `append` with the new entries. A truncated/replaced or swapped transcript (`/clear` in the same process) =
`init` again; a missing file = keeps trying. Demo agents have no transcript: the fictional conversation comes
from `shared/demo/terminal.ts` (updated every 500 ms). Ping every 15 s, at most 8 terminals at the same time, and
a client with more than 8 MB accumulated is disconnected. What is typed in the terminal footer goes out as a message (see
[Messaging through the office](#messaging-through-the-office)); the stream remains read-only.

The feature only exists with a **local bind** (`config.ts`, `terminalOffReason`), since it shows the whole conversation:

- Node: `HABBLAUD_HOST` loopback (127.0.0.0/8, `::1`, `localhost`); `0.0.0.0`, `::` or a network IP turn it off;
- Docker: the process always listens on `0.0.0.0` inside the container, so what counts is the port published on the host,
  `HABBLAUD_BIND` (`docker-compose.yml` passes the same value to the container): loopback turns it on; absent, empty or
  anything else turns it off;
- `HABBLAUD_TERMINAL=0` always turns it off; no variable turns the terminal on with the port exposed.

In addition, each request needs a local `Host` (`localhost`, `*.localhost`, 127.x or `[::1]`): network IPs and
names from `HABBLAUD_ALLOWED_HOSTS` (proxies, tunnels) get 403. The state goes out in `meta.terminal` of the snapshot and in
`terminal` in `/api/health`. Errors before the stream respond with JSON `{error}`: 403 (off, or access that is not
local), 404 (unknown agent or transcript), 405 (method other than `GET`), 429 (too many terminals) and 500
(unreadable transcript).

## Timeline (timelapse)

`history/timeline.ts` records the office for the client's timelapse in `<HABBLAUD_DATA_DIR>/timeline/YYYY-MM-DD.jsonl`
(the server's local day; in Docker, `/data/timeline`). Format and reconstruction are in `shared/timeline.ts`; one record per line:

- `{"t":"k", at, v, every, boot?, rooms, agents, accounts}`: **keyframe**, the complete state. It opens each file, is
  repeated every 5 min (`every`) and marks the server boot;
- `{"t":"d", at, rooms?, agents?, accounts?}`: **delta**, only what changed (`[id, object | null]` for rooms and accounts;
  `[id, changed fields | null]` for agents, with `null` = a field or agent that left);
- `{"t":"end", at, reason?}`: the server stopped (`SIGTERM`/`SIGINT`) or the day hit the limit (`reason: "limit"`).

Each new snapshot from the `Hub` is recorded (`hub.onSnapshot`, that is, each `Office` commit with a change), throttled to
1 s and only when something the player draws changes. Per agent: id, kind, parentId, room, name, look, role, account,
status (with `statusSince`), waitingFor, activity (`kind`, `icon`, `text`, `at`, `tool`, `error`), seed,
background, title and summarized shells (without the command); agents, rooms and accounts from demo mode (`demo:`) carry
`demo: true`. Accounts have no email, organization or folder. No transcript at all: it is the same exposure as `/api/snapshot`,
which is why the routes work with any bind.

- **Limits:** above 20 MB in a day, a delta every 15 s and a keyframe every 15 min; above 30 MB, it stops until the day rolls over.
- **Retention:** the last 7 days (counting today); only `YYYY-MM-DD.jsonl` files are deleted.
- **Disk failures:** they never take the server down: a warning in the log, a new attempt in 1 min, restarting with a keyframe.
- **Gaps:** with no record for more than ~1.5× `every` (or after an `end`), the player shows "no data".
- `HABBLAUD_TIMELINE=0` turns recording off (the routes keep serving the days already recorded).

The day in the URL is only accepted as a valid date in `YYYY-MM-DD` and the file path is built only from it
(no `..`, encoded slashes or null bytes). `scripts/demo-timeline.ts` (`npm run demo:timeline`) uses the same
recorder, with a simulated clock and the `DemoSimulator`, to generate entire days using only fictional data.
## My day (daily stats)

`history/daystats.ts` samples the office snapshot every 1 s and passes the agents to the pure tracker in
`shared/daystats.ts`, which integrates, per agent, the time since the previous sample into the status the agent was in
(`working`, `waiting`, `shell`, `idle`; `done` and `offline` do not count), splitting the interval at `statusSince`.
Intervals longer than 2 min between samples (server stopped, computer asleep) do not count. Waits for you are
episodes of continuous `waiting` (those under 3 s are left out of the ranking); "wall-clock time with someone
waiting" is the union of the intervals of all agents.

- **Counts:** `AgentStats` is cumulative per agent, so it counts what exceeds the highest value ever seen (re-reading a
  rewritten transcript does not count again). An agent that already existed (boot, `/resume`) becomes a baseline in the first
  20 s (90 s at boot, while the beginning of long transcripts is read in the background); a subagent born during
  observation and a new session (or `/clear`) count from zero. An impossible jump in one sample (more than 60 tools or 5 M
  tokens) is treated as a re-read. Cost that shows up on an old agent is the session total: it only becomes a reference.
  Prompts come from `prompt` activities after the server started; tasks, from what raises the completed count.
  An agent that disappears and returns keeps its baseline for 6 h.
- **1-hour buckets aligned to UTC** (per room, per account and who was present: sessions and subagents), stored
  per file day in the server's time zone. The requested day is assembled at query time, in the browser's `tz` time zone: in Docker
  (UTC) the panel's day still starts at the user's midnight.
- **Files:** `<dataDir>/stats/YYYY-MM-DD.json` (`StatsDayFile`, version 1), written every 30 s and on shutdown
  (temp file + `rename`); at boot it loads yesterday and today, indexes the rest and deletes those older than 30 days (again
  at each day rollover). An unreadable file becomes `.corrupt` and the day starts over; disk errors only produce a log warning.
- **Demo:** agents with a `demo:` id never enter the real data. With demo on there is a separate bucket, in memory only,
  seeded with a fictional history from yesterday until now and fed live (`shared/demo/daystats.ts`).
- **Exposure:** only aggregate numbers and project, account and agent names (the same as `/api/snapshot`), so the route
  does not have the terminal's local-bind lock. Errors: 400 (`day` not in the `YYYY-MM-DD` format, nonexistent date, day in the
  future, repeated parameter, invalid `tz` or `source`), 404 (no data, outside retention or demo off), 405.

Static files (`http/static.ts`): `/bundle/*` (hashed Vite output, `build.assetsDir`) with a 1-year `immutable` cache;
the rest (`index.html`, `client/public` at `/assets/*`) with `no-cache` + `ETag`/`Last-Modified` (304).

## Session history

`sources/history.ts` lists, on demand, the top-level transcripts `<config>/projects/*/<sessionId>.jsonl` of
each account (UUID-shaped name; subagents are left out) modified in the last 7 days, the 150 most recent.
From each file it reads only the first 64 KB (project = `cwd` from the first line that has it, first activity, the first
prompt) and the last 64 KB (title and last activity; with no title line there, it searches the last 512 KB),
using asynchronous reads and a cache per valid path as long as mtime and size do not change. The title follows the agent's
(`custom-title`/`custom-title.json` > `agent-name` > `ai-title` > `last-prompt`) and, with none, is the first prompt.
An open session (main agent of the account and `sessionId` in the office) goes out with `open: true` and `agentId`; one that
ended without any line with a timestamp is omitted. The list goes from the most recent activity to the oldest.

`GET /api/sessions/:account/:sessionId/terminal` (`http/sessions.ts`) uses the same reader as the agent terminal
(`TerminalStreams.attachSession`: `init` with the last 500 entries from the final ~4 MB, then `append`, with 2 s polling
in case the session is resumed) and counts toward the limit of 8 terminals. Validation: the account must be one of the
known ones (404), the id must be UUID-shaped (400) and the file, with links resolved (`realpath`), must lie
inside the account's `projects/` folder (404); segments that do not decode respond 400. Both routes require the same
terminal lock (feature on and local `Host`, otherwise 403) and only accept `GET` (the list also `HEAD`; otherwise 405).
## Answering through the office

Claude Code's `PermissionRequest` hook (`mod/habblaud-permissoes/hooks/permission-hook.mjs`, with `matcher: "*"`:
through the `habblaud-permissoes` plugin on Claude Code 2.1.287+ or installed in `<account>/settings.json` by
`npm run hooks:install`) runs **alongside** the terminal's permission dialog: whichever you
answer first wins. In background subagents Claude Code runs the hook first and only shows the dialog after
it exits. The hook sends the request (`session_id`, `agent_id`/`agent_type`, `cwd`, `tool_name`, `tool_input` with truncated texts,
`permission_suggestions` and its own `timeout_ms`) and waits; on `decided` it prints
`hookSpecificOutput.decision` (`allow`, with `updatedPermissions` = the original suggestion that was chosen, or `deny` with
`message`/`interrupt`); on `released`, an error or a timeout it exits without printing anything (the terminal decides).

Questions (`AskUserQuestion`) go through the same path. The request carries `questions` (masked and truncated, with the original
position of each question and option in `index`; they also go in the snapshot) and the page answers with
`{behavior: 'answer', answers: [{question, options?, other?}]}`, by position. The registry checks it against the stored original
shape (each question once; without `multiSelect`, one option or free text; `other` up to 2,000
characters) and delivers `{status: 'decided', behavior: 'answer', answers}`; the hook swaps the positions for the original texts
from stdin and prints `allow` with `updatedInput` = the original input plus `answers` (`{question: "Label A,
Label B, free text"}`, as the hooks documentation says to answer `AskUserQuestion`). A plain `allow` on a
question is refused (400); `deny` works. A question the office cannot show in full (more than 4, or
none valid) is not diverted (`unsupported-tool`).

`permissions/registry.ts` (`PermissionRegistry`):

- only accepts the request when some page is connected through a local `Host` (`Hub.localSize`) and the session is known
  (main by `session_id`; subagent by `<session_id>:<agent_id>`, or the main one with `subagent` = type);
  otherwise `{skip: 'no-viewers' | 'unknown-session' | 'unsupported-tool' | 'too-many'}` (max. 32 open);
- publishes each agent's oldest request in `AgentInfo.permission` (without `input`, which only comes out through the detail;
  `queued` = how many are waiting after it) and sets the agent to `waiting`; a `PermissionRequest` activity in the feed and a notice
  "asks for permission" (deduped against "needs you"); approving/denying also become activities;
- releases the hook (`released`) when: `terminal` on the page, hook timeout + 5 s (`expired`), no hook
  waiting for 8 s (`orphan`), the agent left (`gone`) or an answer in the terminal itself (`answered`): Claude Code
  does not end the hook when you answer there, so the registry finds the call at the end of the transcript
  (`permissions/transcript.ts`: name + argument signature, the most recent without a result) and waits for its
  `tool_result`; without the call, a main agent that was `waiting` in the session registry and left it 3 s ago;
- decisions that were not fetched are kept for 30 s; demo requests (`demo:perm-…`) go to the simulator.

The routes (`permissions/http.ts`) follow the terminal lock: without `ServerConfig.terminal` → 403 on
all of them; a `Host` that is not local → 403. The guard already requires JSON and a local `Origin` on `POST`s. Errors: 400 (invalid body, suggestion
or answer), 404 (unknown, already delivered or expired request), 405, 409 (already answered).

## Messaging through the office

The page sends text to a main agent (`POST /api/messages`, through the agent drawer or the terminal footer) and
the session's `habblaud-mensagens` plugin fetches it (`POST /api/mod/inbox`, every 2 s) and delivers it with
`$.prompt.submit({ text, asUser: true })`: the model reads it as if you had typed it. Then it acknowledges
(`POST /api/mod/inbox/ack`). Plugin details are in [`mod/README.md`](../mod/README.md).

`messages/registry.ts` (`MessageRegistry`):

- **presence:** each plugin poll marks the session (the main agent with that `sessionId`, and the same `account` if
  provided); seen within the last 10 s, the agent goes out in the snapshot with `canMessage: true`. The snapshot only changes when presence changes;
- **queue:** up to 5 open messages per agent (429) and 20,000 characters per message; the text goes as typed,
  never appears in responses to the page or in the log, and is discarded when the message is resolved;
- **states:** `queued` → `sent` (the plugin fetched it) → `delivered` or `failed`. `queued` without being fetched within 60 s, `sent`
  without acknowledgement within 30 s or an agent that left = `failed`, with the reason. `delivered` = it entered the session or its queue
  (with the agent busy, it enters when the agent finishes the turn). Resolved ones stay 10 min for the `GET`;
- once delivered: a ✉️ "Message via Habblaud" activity on the agent (the detail masked and truncated); demo agents receive
  fictional messages, delivered in ~1 s, with no real session.

The routes (`messages/http.ts`) follow the terminal lock plus one more switch: `ServerConfig.messages` = terminal on and
`HABBLAUD_MENSAGENS` not turned off (`0`, `false`, `off`, `no`). Off or a `Host` that is not local → 403 on all of them.
Errors of `POST /api/messages`: 400 (invalid body, empty or too-long text), 404 (unknown agent), 409 (the
agent does not receive: subagent, left, or session without the plugin connected) and 429. The state goes out in `meta.messages` of the
snapshot and in `messages` in `/api/health`.

Any local process can call these routes (like the permission ones): turning messages on means accepting that a
program on the machine itself can type into the sessions that have the plugin.

## Project character

`PUT /api/agents/:id/character` (`http/app.ts`, rules in `Office.setCharacter`) chooses the name and appearance of the main
agent `:id` and stores it as the character of its room (the normalized cwd), in `names.json` › `rooms`:
`{name, look, seed, parts?, owner?, at}`.

The body has three fields:

- `name`: 1 to 24 characters, in NFC, with repeated spaces collapsed and no control characters;
- `seed`: an integer from 0 to 4294967295;
- `parts`: pieces from `shared/appearance.ts`, with the styles from the enums and colors as `#rrggbb`. The client applies the pieces
  on top of `appearanceFromSeed(seed, {look})`.

Rules:

- When a main agent arrives in a room that has a character, and the name is free, it is born with `name`, `look`, `seed`,
  `parts` and `custom: true`. Whoever is leaving does not count, because it is usually the same session reopened. If the name is
  not free, the usual random draw applies.
- The character has an owner (`owner`, the `sessionId` of whoever received or saved it last; `/clear` passes the owner to the
  new session): a session that is not the owner and already has a stored name keeps its own, so that a Habblaud restart
  does not swap identities or change a session's character in the middle of it.
- Chosen names are reserved: the random draw does not hand them out, case-insensitively. The `PUT` responds `409`
  for the name of someone present (including from the demo) or the name from another room.
- `/clear` keeps the character and does not store the chosen name as the new session's drawn name.
- The `DELETE` deletes the room's character, and the agent goes back to the session's drawn name and to the id's seed.
- Lock: the same as the terminal's (local bind and local `Host`). Without it, `403`. A subagent, demo or unknown agent gets
  `404`.
- A character unused for 60 days disappears, like the names.

## Codex

Agent sources (`sources/source.ts`): `SourceSet` joins the Claude Code one (`ClaudeWatcher`) and, when there are Codex
folders, the Codex one (`sources/codex/`); the history likewise (`HistorySet`). Codex agents, accounts, sources and history
sessions carry `provider: 'codex'` (absent = Claude Code). Ids: `<account>:<threadId>`, `sessionId` = threadId.

- **Accounts** (`sources/codex/accounts.ts`): `HABBLAUD_CODEX_DIRS` (overrides) or `CODEX_HOME` and `~/.codex*` that look
  like Codex (`isCodexHome`: `thread-writer-locks/`, `archived_sessions/`, `config.toml`, `auth.json` or
  `sessions/YYYY/`, without `projects/`, which only Claude Code creates). A Codex folder never becomes a Claude Code account.
  `auth.json` and `config.toml` are never read; the plan comes from `rate_limits.plan_type`.
- **Open sessions** (`sources/codex/files.ts`, `source.ts`): `thread-writer-locks/<threadId>.lock` existing for 3 s
  (quick maintenance locks are left out; the lock is never opened). A lock without a rollout = an open, empty session: the
  lock does not say the folder, so the main agent only enters when the rollout (created on the 1st prompt) or a hook gives the cwd.
  A lock and rollout idle for 12 h, with no hook event = a crash lock. Without the
  locks folder: a rollout modified in the last 30 min. A hook event holds the presence for 60 s.
- **Rollout** (`sources/codex/rollout.ts`): `sessions/YYYY/MM/DD/rollout-*-<threadId>.jsonl` (the folder is the creation
  date; a resumed session stays in the old file) and `archived_sessions/`, read with `FileTail`. "Paginated" (default) and "legacy"
  formats; `.zst` is ignored with a warning. Status from `task_started`/`task_complete`/
  `turn_aborted`; activities from `item_completed` (`CommandExecution` like Bash, `FileChange`, `McpToolCall`,
  messages and reasoning); tokens without adding the cache again (in Codex it is already inside the input); no cost; plan
  usage from `token_count.rate_limits` (window of 300 min = 5 h, 10080 = week; `primary` null with
  `rate_limit_reached_type` = `noQuota`), pushed with `accounts.setUsage`. Subagents = threads with
  `source.subagent.thread_spawn.parent_thread_id`; internal threads (guardian, review, compact, memory) are left out.
- **Terminal and history** (`sources/codex/terminal.ts`, `history.ts`): the terminal parser is chosen per agent
  (`SourceSet.parserFor`).
- **Hook events** (`POST /api/codex/events`, `codex/http.ts`; the hook is `mod/habblaud-codex/hook.mjs`): only with a local
  `Host` and a loopback connection (outside Docker). They go to the source's `CodexLive.applyHookEvent`: matched by account
  (by the `codexHome` folder) and `agent_id ?? session_id` (in Codex, `session_id` is the ROOT thread). SessionStart makes the
  agent appear, UserPromptSubmit/PreToolUse = working (with the current activity), PermissionRequest = waiting
  ("approve a command"), Stop = idle, SessionEnd closes.
- **Approving through the office** (`permissions/*`, `permissions/codex.ts`): the same `POST /api/permissions` with
  `provider: 'codex'`, `account` and `codexHome`; no suggestions, no questions, no transcript lookup; `interrupt` or
  `suggestion` on a Codex request = 400. The hook waits up to `permissionTimeoutS` from `~/.habblaud/codex-hook.json`
  (default 25 s) and prints only `allow` or `deny` (+`message`). Codex only shows the approval in the terminal after the hook
  finishes.
- **Messages** (`messages/*`, `messages/codex.ts`): for Codex agents, `codex queue --thread=<id> --message=<text>`
  with `CODEX_HOME` = the account's folder (on the host). Outside Docker the server runs the command (`HABBLAUD_CODEX_BIN` or `codex`
  from the PATH); in Docker, the host helper (`npm run codex:bridge`) fetches at `POST /api/codex/bridge/poll` and acknowledges at
  `/ack` (same lock as messages). `canMessage` = there is a deliverer (binary found, or helper seen within the last 10 s).
  Return 0 = it entered the session's queue (`delivered`); Codex consumes the queue every ~10 s, when the session goes idle.

## Habblaud World

On by default, pointing at `server.habblaud.com` (`DEFAULT_WORLD_URL` in `config.ts`); nothing leaves the computer
before the person creates an account and signs in, and `HABBLAUD_WORLD=0` turns everything off (what leaves the computer:
`docs/world/privacidade.md`; how to change it: `shared/world/README.md`). The protocol with the world server is `shared/world/protocol.ts` (source of truth, with
`schema.json`). On this side, `world/`:

- `settings.ts`: `<dataDir>/world.json` `{deviceId, token, email, access, player?, paused?, left?, updatedAt, theme?}`, mode 600
  and atomic writes. The device token only leaves here in the `Authorization: Bearer` header of calls to the world
  server and in the WebSocket `hello`: never in the browser, the snapshot, the log or the URL. `theme` (the Appearance choice,
  `auto` by default) stays even without a session (the file becomes just `{theme}`); `paused` and `left` (left the world,
  always with `paused`) belong to the session.
- `client.ts`: the `/v1/*` routes with native `fetch` (15 s timeout, no following of redirects, response of up to
  256 KB copied field by field; the data export, up to 8 MB and as received). A world server error comes back as
  `{status, code}` (maintenance, `503 maintenance`); network, timeout and a response in the wrong shape get
  `world_unreachable`, `world_timeout` and `world_bad_response`.
- `altcha.ts`: the anti-bot challenge for sign-up and email requests, solved here by brute force (SHA-256), in
  batches of 5,000 attempts that hand control back to the event loop.
- `service.ts`: the account (one operation at a time). `/v1/me` is re-read at most every 30 s (or with `?refresh=1`) and, on the
  waiting list, by itself every 30 min (`waitingPollMs`; a timer that does not hold the process open), so that approval reaches the
  snapshot without anyone clicking; a 401 from the world server on a route with a token deletes the session here (`lastError:
  session_expired`); signing in again revokes the previous device; signing out deletes `world.json` even without a response from the
  server. `lastError` carries only known codes (`worldLastError` in `shared/world/api.ts`): network and timeout become
  `network`, anything else the interface does not know becomes `unknown`. Pausing, resuming and leaving the world go to the world
  server in a queue (in the order requested); a resume with no response (network, timeout, 429, 5xx) retries with the uplink's
  reconnection backoff (2 s to 60 s), until it succeeds or the building is paused again. Deleting the account (Phase 6): the code
  comes from `POST /v1/me/delete`; with `POST /v1/me/delete/confirm` accepted (or a `goodbye: deleted`), it closes the uplink and
  waits, deletes the entire `world.json` (theme included, `store.erase`) and the last shipment, and the status becomes no account with
  `lastError: account_deleted`. Exporting the data (`GET /v1/me/export`) just relays the JSON.
- `uplink.ts`: the building in the world, over WebSocket (Node's global `WebSocket`) at `<HABBLAUD_WORLD_URL>/v1/socket`
  (`wss://`; `ws://127.0.0.1` and `ws://host.docker.internal` only in dev mode). It connects only with an approved account, the character created and the
  terminal lock; paused or out of the world, only while the World scene is open (the viewer signals it through `cityChanged`) and with
  no `uplink` at all (not even the `welcome`'s): only `hello`, `ping`/`pong` and the scene's commands. It sends the `hello` (`{v, version, build: {commit, dirty}, locale, token}`) and, on each `welcome`, the
  whole packet; afterwards, on each change in the office (`Office.onChange`) or every minute, it projects
  (`shared/world/projection.ts`) and sends if it changed: 3 s after the first change, at most one shipment every 5 s.
  `{t: 'ping'}` every 30 s (no reply for 75 s, reconnects). Reconnection from 2 s to 60 s (doubles, ±25 %). `goodbye`:
  `deploy` reconnects (during world maintenance, `deploy` on every `hello`: the wait grows up to the ceiling and only resets with a
  `welcome`); `banned`, `suspended`, `update` and `other-device` stop until resumed (or reopened); `waiting`, `no_player`
  and `unauthorized` stop until the session changes and notify the account (`service.goodbye`); `deleted` stops and the account deletes the
  session. From the `welcome` it keeps, in memory only and only for the status, the account id (`me.id`, in the subject of the email
  resource) and the "unverified" badge of the building itself (`building.unverified`, which the scene's `area`/`area.patch` also
  updates). `uplink.ack {error:
  'left'}` (the account left the world, here or on another computer) and `left: true` from `/v1/me` store `left` and `paused`
  (`service.leftElsewhere`): no packet until the join (the connection only stays with the scene open). The last shipment
  `{at, bytes, uplink, ack}` is kept in memory and in `<dataDir>/world-last-uplink.json` (mode 600; only for the same session,
  deleted on sign-out). It notifies the snapshot (`markDirty`) on connect, drop, pause, resume and on each ack. Tasks and
  compactions (`signals.ts`) are observed through the same `Office.onChange`, at most once per second, with or without a
  connection; during the office boot (`Office.isBooting`) nothing is observed or sent.
- `ids.ts`: the world ids, in memory only (`f_` + 10 hex per room, `a_` + 8 hex per agent, `crypto.randomBytes`),
  each with a lifetime of 24 h ± 6 h drawn per id; anything that disappears and returns (or a restarted Habblaud) gets a new id.
- `tokens.ts`: the building's tokens (input + output) for today and the last 7 rolling days, from "My day" with the `real` source (the
  demo never enters), rounded to 2 significant digits; past days are stored, today's is re-read every 15 s.
- `theme.ts`: the chosen theme resolved for the packet (the automatic one follows the office calendar, by the server's local
  date: in Docker, UTC). `signals.ts`: tasks completed in the day per agent and new compactions (`/clear`
  does not count).
- `http.ts`: the `/api/world/*` routes (list and shapes in `shared/world/api.ts`). `http/app.ts` only serves them through the
  local port with a local `Host` (the phone port gets 403 `local_only`, even with a login); everything except `status` requires
  the terminal lock (403 `terminal_off`); with `HABBLAUD_WORLD_URL` refused, 409 `not_configured`; `HABBLAUD_WORLD=0`, 404.
  Errors: `{error: {code, message?, retryAfter?}}`, with the world server's status and code when they come from there.
  For the building: `PUT /api/world/theme` `{theme}` (with or without an account), `POST /api/world/pause` (stops sending before
  responding, closing the uplink if the World scene is not open, and notifies `POST /v1/me/building/pause`),
  `POST /api/world/resume` (notifies `/resume` and reconnects, or sends the whole packet over the scene's connection),
  `POST /api/world/leave` ("Leave the world": stores `left` and `paused`, stops sending like the pause and responds after
  `DELETE /v1/me/building`; without a good response, it stays just paused and returns the error), `POST /api/world/join` ("Return to the
  world": `POST /v1/me/building/join` and, only with a good response, clears `left` and `paused` and reopens the uplink; a 404 here
  does not count as done; the `/resume` while out of the world goes through it and, if it had not left, it is the `/resume`) and
  `GET /api/world/last-uplink` (`{at, bytes, uplink, ack?}` or `{}`, without the terminal lock, like the status). The
  `GET /api/world/status` gains `building` (approved account with a character) and `theme`; without `?refresh=1` it responds from
  memory and re-reads `/v1/me` in the background when it has expired. For the account (Phase 6): `POST /api/world/delete-account` (`202
  {}`: the code goes to the email), `POST /api/world/delete-account/confirm` `{code}` (responds with the no-account status after
  closing the building and deleting `world.json`), `GET /api/world/export` (the JSON as the attachment `habblaud-world-dados.json`;
  like the stream, only through the page itself, because it uses up the day's quota; `HEAD` does not call the world server) and the
  optional `notifyInactivity` on `PUT /api/world/visibility`.

The state goes in the snapshot at `meta.world` (`{enabled, configured, state, building?, scene?}`, nothing from the account; `building` =
`{connected, paused, floors, agents, lastUplinkAt?, left?, stopped?}`, with `connected` = lit and sending (the scene-only
connection, while paused, does not count) and `stopped: true` without the reason, which only goes in the status; `scene` = `{available}` with the
approved account and the character, `available` with the terminal lock and without a stop of `banned`, `suspended`, `update`,
`other-device` or `deleted`: the World button in the bar) and in `GET /api/access` (`world`). The build writes
`dist/build.json` (`{commit, dirty, builtAt}`, `scripts/build-info.mjs`; without git, `unknown`;
`HABBLAUD_BUILD_COMMIT`/`HABBLAUD_BUILD_DIRTY` override git), read by `readBuildInfo()` (`build.ts`) on each uplink
connection: the `hello` carries only `{commit, dirty}`.

### World scene: stream and commands

The city (Phase 3) comes down over the same connection as the building and only with the World scene open in the browser. `world/viewer.ts` is
the "viewer"; the state and rules live in `shared/world/scene.ts` (pure, the browser can use the same one), and the geometry
in `shared/world/city.ts` (source of truth; the world server keeps the exact copy).

- `GET /api/world/stream` (SSE, the same locks as the account routes, and only through the page itself: an `Origin` from another host
  or `Sec-Fetch-Site` cross-site/same-site gets 403 `local_only`). At most 4 open (429 `too_many_streams`).
  Events: `world.snapshot` (`WorldSceneSnapshot` from `shared/world/api.ts`: `{stream, connected, viewing, district?,
  me?, pos?, afk, chunks: [{chunk, rev, buildings}], players, minimap}`) on connect and on each restart (connection opened
  or dropped, `view` again): the browser replaces the whole state; then `world` with each city message as it came
  (`area`, `area.patch`, `players`, `player.join`, `player.leave`, `pos`, `minimap`, `afk`, `profile`, `notice`,
  `like.update`, `greeting`, `building`, `building.patch`), in order and already without `rev` gaps; `: ping` every 15 s.
  A client with more than 1 MB accumulated is disconnected (the EventSource reconnects).
- The first stream (with the connection accepted) sends `view`; the last one to close sends `view.off`. On each `welcome` with an
  open stream, `view` again; on each drop, the city here is forgotten and a snapshot goes out with `connected: false`.
  Paused or out of the world, the connection only exists with the scene open: opening the first stream connects (`hello`, `view`) and
  closing the last sends `view.off` and closes; no `uplink` goes out through it.
- State rules: `area` replaces the chunk and the `rev` (even a lower one); `area.patch` only with `rev` = last + 1 (an item
  with `lot` replaces the building, without `lot` merges, `removed` removes); a gap, an unknown chunk or a partial building item
  for a building that is not here ask for `resync {chunk}` (at most one every 5 s per chunk) and the patch does not pass; only the 3×3
  chunks around my position are kept (the last `pos`, my id in a `players` or the last `move`); `players` only touches
  those already present (by id); `player.join` replaces the profile; `afk` holds until walking or turning, `view` or `profile`. All in
  memory only, nothing in the log.
- `POST /api/world/cmd` `{stream, cmds}` → `202 {sent}`: 1 to 20 commands, only `move`, `profile`, `resync`, `view`,
  `view.off`, `enter`, `leave`, `like`, `unlike`, `greet`, `block`, `unblock` and `report`, rebuilt field by field
  (`parseSceneCommand`; `hello`, `uplink` and `ping` never: 400 `invalid`); from each batch only the last `move`. Up to 5 batches
  per second per stream (bucket of 5, refill of 5/s: one batch every 200 ms is never refused; 429 `rate_limited` with
  `Retry-After: 1`). A stream that is not open: 409 `no_stream`; without the connection: 409 `not_connected`. `view` and
  `view.off` say whether that stream wants the city (the viewer decides what goes to the world; `view` with the city open
  restarts everything).
- In the browser, `client/src/net/world-stream.ts`: `createWorldStream({mock})` with `on`, `send` (queue and one batch every
  200 ms) and `close`; in demo mode, `FakeWorldStream` (20 buildings with mine on lot (3,1), 5 people walking
  on the sidewalks and one sitting on a bench in the square, minimap, `afk` after 60 s; `?perf=N` fills N lots).

## Environment variables

| Variable | Default | Use |
| --- | --- | --- |
| `HABBLAUD_PORT` | `4747` | HTTP port |
| `HABBLAUD_HOST` | `127.0.0.1` | interface (Docker uses `0.0.0.0`); outside loopback, the terminal (and permissions and messages) is turned off |
| `HABBLAUD_BIND` | — (Compose: `127.0.0.1`) | Docker only: host interface where the port is published, passed to the container; only loopback turns the terminal on |
| `HABBLAUD_TERMINAL` | — | `0` turns off the terminal, permissions and messages through the office (it does not turn on with the port exposed) |
| `HABBLAUD_CODEX` | on | `0` turns off the Codex source |
| `HABBLAUD_CODEX_DIRS` | — | comma-separated Codex folders; overrides detection (`CODEX_HOME` and `~/.codex*`) |
| `HABBLAUD_CODEX_BIN` | `codex` from the PATH | Codex binary for `codex queue` (Node mode and `npm run codex:bridge`) |
| `HABBLAUD_MENSAGENS` | on (with the terminal) | `0`, `false`, `off` or `no` turn off only messages through the office |
| `HABBLAUD_CLAUDE_DIRS` | — | comma-separated config dirs; overrides detection (`~/.claude*` with `projects/` or `sessions/` + `CLAUDE_CONFIG_DIR`) |
| `HABBLAUD_DATA_DIR` | `~/.habblaud` (Docker: `/data`) | Habblaud state (names and characters of the projects persisted in `names.json`, timeline in `timeline/`, My day statistics in `stats/`, last version check in `updates.json`) |
| `HABBLAUD_TIMELINE` | on | `0` turns off recording of the timelapse timeline |
| `HABBLAUD_UPDATE_CHECK` | on | `0` turns off the new-version check (releases of the `package.json` repository on GitHub, every 6 h) |
| `HABBLAUD_LANG` | system language (`LC_ALL`/`LANG`/Intl), otherwise `en` | language of the texts assembled by the server: `en`, `pt-BR`, `es` or `fr` (shared/i18n.ts) |
| `HABBLAUD_DEMO` | off | `1` turns demo mode on at startup |
| `HABBLAUD_IN_DOCKER` | auto (`/.dockerenv`) | `1` = does not check PIDs (they belong to the host) |
| `HABBLAUD_ACCOUNTS` | — | JSON with account metadata coming from the host (Docker): `[{id, configDir, mountDir, short, name, email, organization, plan, color, cachedUsage}]`, matched by `id`, `mountDir` or `configDir` |
| `HABBLAUD_USAGE_DIR` | `~/.habblaud/usage` (Docker: `/usage`) | folder of the usage captured by the statusline tap or by the Claude Code mod, re-read every 5 s |
| `HABBLAUD_ALLOWED_HOSTS` | — | extra names accepted in `Host`/`Origin` (comma-separated); `localhost`, `*.localhost` and IPs always work |
| `HABBLAUD_WORLD_URL` | `https://server.habblaud.com` | Habblaud World server: only `https://` or `wss://`, with no path; `http://127.0.0.1:*` only in dev mode (refused, World stays off). The building goes up over the WebSocket on the same origin (`/v1/socket`) |
| `HABBLAUD_WORLD` | on | `0` (`false`, `off`, `no`) turns off Habblaud World: routes 404, nothing in the interface and nothing leaves |
| `HABBLAUD_WORLD_DEV` | off (`--dev` turns it on) | `1` accepts the world server at `http://127.0.0.1` or `ws://127.0.0.1` |

In the permission hook (Claude Code environment; the `--port`/`--timeout` arguments stored by the installer take
precedence): `HABBLAUD_PORT` (Habblaud's port, default `4747`), `HABBLAUD_PERMISSION_TIMEOUT` (seconds to wait
for the answer in Habblaud, default `300`, between 5 and 1800) and `HABBLAUD_HOOK_DEBUG=1` (reports on stderr what it did).

## Plan usage (5h and weekly)

Two sources, both local files (no credentials and no network calls); the one with the most recent numbers wins
(`fetchedAt`):

- `statusline` (**recommended**, `accounts/statusline.ts`): Claude Code sends the statusline command a JSON
  with `rate_limits` (`five_hour`/`seven_day`: `used_percentage` and `resets_at` in seconds). The
  `scripts/statusline-tap.mjs`, installed in front of each account's statusline by `npm run usage:install`,
  writes only those numbers to `~/.habblaud/usage/<account>.json` (matched to the account by `configDir`; otherwise by
  `accountId`). On Claude Code 2.1.287+ the Habblaud mod writes the same file (see below);
- `cache`: the `cachedUsageUtilization` that Claude Code itself writes when running `/usage`, re-read every 60 s.

With neither, the account is `disabled` ("no usage data"). Numbers older than 30 min show as
`stale`. A window whose reset has already passed since collection is omitted (the interface shows "—") until new
numbers arrive — never an invented 0%.

## Claude Code mod

The repository is also a Claude Code plugin marketplace (`.claude-plugin/marketplace.json`, details in
[`mod/README.md`](../mod/README.md)). On the server side, the `habblaud` mod uses two things:

- **the usage file:** on each `session.start` and `session.measure` it writes `<HABBLAUD_USAGE_DIR>/<account>.json`
  in the tap's format (`{accountId, configDir, fetchedAt, five_hour, seven_day}`, `resets_at` in seconds, from
  `$.session.usage().rateLimits`) plus `source: "mod"`, which the reader ignores: to the server it is still the
  `statusline` source. The mod writes with `$.fs.write`, which is not atomic; that is why `StatuslineUsageReader` ignores an empty
  or half-written read, keeps the last good record from that file and re-reads it on the next cycle;
- **`GET /api/mod/summary`** (`modSummary` in `http/app.ts`), asked every 5 s by each session that draws (30 s with
  Habblaud down) and by the `/habblaud` command: only counts and who is waiting, assembled from the current snapshot. Left
  out are demo agents (which live only in the snapshot, not in the `Office`), anyone who already ended or handed off, and, with
  `?session=` (and `?account=`, if provided), the asker's own session: the main agent with that `sessionId` and its subagents
  (their `sessionId` is that of the session that launched them; to be safe, also anyone with an ancestor of it).
  `answerable` = there is a permission request to answer through the office (`AgentInfo.permission`). Without parameters,
  nothing is excluded (this is what `/habblaud` uses, so the numbers match the screen). `GET`/`HEAD` only (otherwise 405).

## Structure

- `config.ts`, `log.ts`, `index.ts` — configuration, short logs (never conversation content) and entry point.
- `accounts/` — account detection (`detect.ts`, also used by `docker-up`), usage (`usage.ts`), statusline tap (`statusline.ts`), service (`service.ts`).
- `sources/` — session registry, incremental reading (`tail.ts`), transcript parser (activities in `transcript.ts`; terminal conversation in `terminal.ts`; GitHub events in `github.ts`), subagents, the session history (`history.ts`) and the orchestrator (`watcher.ts`).
- `model/` — office (`office.ts`), rooms/slots (`rooms.ts`), persisted names (`names.ts`).
- `http/` — edge protections (`guard.ts`), routes (`app.ts`), SSE (`sse.ts`), terminal (`terminal.ts`) and its history (`sessions.ts`), timelapse (`timeline.ts`), My day (`stats.ts`), static files (`static.ts`).
- `history/` — the timelapse timeline recorder (`timeline.ts`) and the My day statistics: sampling, persistence and retention (`daystats.ts`; the pure accumulator lives in `shared/daystats.ts`).
- `permissions/` — answering through the office (permissions and questions): request registry (`registry.ts`), routes (`http.ts`) and the transcript call lookup (`transcript.ts`).
- `messages/` — messages through the office: queue, session presence and deadlines (`registry.ts`) and routes (`http.ts`).
- `updates/` — new-version check against GitHub releases (`checker.ts`).
- `world/` — Habblaud World: session in `world.json` (`settings.ts`), world server client (`client.ts`), ALTCHA (`altcha.ts`), the account (`service.ts`), the `/api/world/*` routes (`http.ts`) and the building in the world (`uplink.ts`, with `ids.ts`, `tokens.ts`, `theme.ts` and `signals.ts`).

Tests: `npx vitest run server shared` (synthetic fixtures in `server/test/fixtures.ts`; the host scripts —
statusline tap, permission hook (run as a process against a test server), installers and
`docker-up` — are tested in `server/test/` with a fake HOME and config dirs).
