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
| `POST /api/permissions` | (hook) registers a permission request: `201 {id, expiresAt}` or `200 {skip}`; only with a local bind (see below) |
| `GET /api/permissions/:id/wait` | (hook) long-poll of up to 25 s (`?timeout=` in seconds): `{status: 'pending' \| 'decided' \| 'released', ...}` |
| `GET /api/permissions/:id` | (page) request detail with the arguments (`PermissionRequestInfo` with `input`) |
| `POST /api/permissions/:id/decision` | (page) `PermissionDecision`: `{behavior: 'allow' \| 'deny' \| 'terminal' \| 'answer', message?, interrupt?, suggestion?, answers?}` |
| `POST /api/messages` | (page) `{agentId, text}`: sends a message to a main agent; `201 OutboxMessage`; only with a local bind (see below) |
| `GET /api/messages/:id` | (page) message status (`OutboxMessage`: `queued` \| `sent` \| `delivered` \| `failed`) |
| `POST /api/mod/inbox` | (plugin `habblaud-mensagens`) `{session, account?}`: marks the session's presence and delivers `{messages: InboxMessage[]}` |
| `POST /api/mod/inbox/ack` | (plugin) `{session, results: [{id, ok, error?}]}`: acknowledges each delivered message (or the failure) |
| `/api/ingest/*` | other machines (`HABBLAUD_INGEST=1`): only on the remote port, with a machine token; see [Other machines](#other-machines-ingest) |

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

## Other machines (ingest)

`HABBLAUD_INGEST=1` lets other computers send their Claude Code sessions to this server (setup: "Multiple machines" in
the main README). It only turns on with the remote port over HTTPS (`ingestOffReason` in `config.ts`; otherwise a
warning at startup and nothing changes). The routes (`ingest/http.ts`) are answered on the remote port **before** its
cookie login, with `Authorization: Bearer <machine token>`; on port 4747 they do not exist (404).

- **Tokens** (`ingest/machines.ts`): `hbl1.<machineId>.<43 base64url chars>` (32 random bytes). `npm run
  ingest:token -- add|remove|list` (`scripts/ingest-token.ts`; in Docker `node dist/server/ingest-token.js`) keeps only
  the SHA-256 in `<dataDir>/ingest-machines.json` (mode 600), re-read when it changes. SHA-256 instead of scrypt: the
  token has 256 bits of entropy and is checked on every hook event. The agents of a removed machine leave within 5 s.
- **Limits:** 256 KB per body; a token bucket of 60 requests refilled at 30/s per machine (429 + `Retry-After: 1`);
  wrong tokens slow down the next wrong ones (`LoginThrottle`), never a valid one.
- **Validation** (`ingest/protocol.ts`): every field by type and shape, ids as tokens (`[A-Za-z0-9_.:@-]`), texts
  without control characters and cut; `tool_input`/`tool_response` rebuilt (plain JSON only, depth 6, 60 keys, 100
  items, 8,000 characters per text, 48 KB in all; prototype keys dropped). Unknown fields are dropped.
- **Ids:** everything a machine sends is prefixed with `r:<machineId>:` (sessions, agents, accounts; subagents
  `r:<m>:<session>:<agentId>`), so the same `sessionId` on two machines never collides and a machine only reaches its
  own sessions. Agents, rooms and accounts carry `machine: {id, name}`; the room is `<machineId>:<cwd>`.
- **Agents** (`ingest/source.ts`, `IngestSource`): from the hook events of the `habblaud-remote` plugin
  (`shared/ingest.ts`). SessionStart/any event of an unknown session = arrives; SessionEnd = leaves (with reason
  `clear`, the next SessionStart `clear` in the same folder within 10 s continues the same character); no event for
  12 h = leaves. Prompt/tool events = working, `Notification` (permission or question) = waiting, Stop = idle;
  subagents from SubagentStart/SubagentStop (title from the `Agent` call). The hooks run asynchronously, so a status only
  changes with an event at least as new (the sender's `at`) as the one that set it; event ids are deduplicated.
  Activities from `describeTool`, tasks from `TodoWrite`, the first prompt as the title. GitHub events from
  PostToolUse/PostToolUseFailure with the transcript detection (`sources/github.ts`), live: the same party and alarm.
  No token counts, background shells or transcript (terminal, history and deliveries do not apply).
- **Permissions, messages, usage, mod summary:** `/api/ingest/permissions` (+ `/:id/wait`, only for the machine's own
  requests), `/api/ingest/inbox` (+ `/ack`), `/api/ingest/usage` (the statusline-tap JSON with `account`) and
  `/api/ingest/summary` reuse the same registries as the local routes, with the ids prefixed. The registry cannot read
  a remote transcript, so `PermissionRegistry.answeredElsewhere` releases a request as `answered` when that agent's
  tool ran (PostToolUse) or its turn ended (Stop), and only after 1.5 s (a late event of an earlier call must not
  release a fresh request). Codex requests from other machines are skipped (`unsupported-tool`).
- **Off for remote agents:** the terminal, take over and end (`PtyManager` answers 409), New agent and dictation.

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
| `HABBLAUD_BRAND_NAME` | `Habblaud` | white-labeling (shared/brand.ts): trimmed, 1-24 characters, no control characters, otherwise the default. Injected at runtime into index.html (static handler, or a Vite plugin in dev), `/manifest.webmanifest` and the remote login page (http/brand.ts); the client reads it from `<meta name="habblaud-brand">` and draws the pixel wordmark from it (client/src/ui/wordmark.ts) |
| `HABBLAUD_BRAND_SHORT` | the brand name | manifest `short_name` and `apple-mobile-web-app-title` |
| `HABBLAUD_IN_DOCKER` | auto (`/.dockerenv`) | `1` = does not check PIDs (they belong to the host) |
| `HABBLAUD_ACCOUNTS` | — | JSON with account metadata coming from the host (Docker): `[{id, configDir, mountDir, short, name, email, organization, plan, color, cachedUsage}]`, matched by `id`, `mountDir` or `configDir` |
| `HABBLAUD_USAGE_DIR` | `~/.habblaud/usage` (Docker: `/usage`) | folder of the usage captured by the statusline tap or by the Claude Code mod, re-read every 5 s |
| `HABBLAUD_ALLOWED_HOSTS` | — | extra names accepted in `Host`/`Origin` (comma-separated); `localhost`, `*.localhost` and IPs always work |
| `HABBLAUD_INGEST` | off | `1` turns on `/api/ingest/*` for other machines, only with the remote port over HTTPS (see [Other machines](#other-machines-ingest)) |

On a machine that sends its sessions to another Habblaud (Claude Code environment, the settings `env` written by
`npm run remote:install`): `HABBLAUD_SERVER_URL` (`https://…`, no path) and `HABBLAUD_SERVER_TOKEN` (`hbl1.…`). The
`habblaud-remote` hooks, the permission hook, `habblaud-mensagens` and the `habblaud` mod then use `/api/ingest/*` on
that server instead of `127.0.0.1`.

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
- `ingest/` — other machines (`HABBLAUD_INGEST`): machine tokens (`machines.ts`), validation (`protocol.ts`), the agents rebuilt from hook events (`source.ts`), their accounts and usage (`accounts.ts`), and the routes (`http.ts`).
- `updates/` — new-version check against GitHub releases (`checker.ts`).

Tests: `npx vitest run server shared` (synthetic fixtures in `server/test/fixtures.ts`; the host scripts —
statusline tap, permission hook (run as a process against a test server), installers and
`docker-up` — are tested in `server/test/` with a fake HOME and config dirs).
