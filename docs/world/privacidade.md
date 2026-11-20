# Habblaud World: what leaves your computer

Habblaud World is an online city where every Habblaud becomes a building: anyone walking down the street sees, live, how
many projects and agents you are running and what each character is doing. The rule that guides everything here:

> **From the data that leaves, nobody can tell who you are or what you work on.**

**Where things stand today:** the World is live and **on by default**, pointing to `server.habblaud.com` (or the
`HABBLAUD_WORLD_URL` you set; see the README). **Nothing leaves the computer before you create the account and sign
in**; `HABBLAUD_WORLD=0` turns everything off. This page is the complete list of what can leave; any change to it goes
into the code and into this page in the same pull request.

## What leaves: the account and the character

When you use the World, the following leaves the computer, over HTTPS, for the world server:

| What leaves | When | Why |
| --- | --- | --- |
| Email and password | On sign-up, on sign-in and when changing the password | So the account can exist. The password is not stored on the computer; on the server, only a hash (Argon2id) |
| Player name (nickname) | On sign-up | It is your character's name (3 to 20 characters, unique in the world, case- and accent-insensitive): it is reserved for you while the account waits on the list, and the character is born with it |
| 6-digit code | When confirming the email or changing the password | To prove the email is yours |
| Interface language (`pt-BR`, `en`, `es` or `fr`) | On sign-up | So the emails arrive in your language |
| Acceptance of the Terms of Use (only the version, `v1`) and the invite code, if you have one | On sign-up | To record the acceptance; the invite puts the account in the next batch of the waitlist |
| Solution to the anti-bot challenge (ALTCHA) | On sign-up, on email requests and, if the server asks, on sign-in | It is just a number computed by your Habblaud, in place of a captcha |
| Character: appearance (colors and styles), 2 or 3 traits, the introduction phrase and, when changing it, the player name (on creation, the name is the one reserved at sign-up: it is not even in the request) | When saving the character | It is what other players will see |
| Visibility preferences (live or discreet, closed to visitors, hide the country, show tokens, leaderboard, compactions) and the email warning before the building is taken down for inactivity | When saving | So the world respects your choice |
| Device token | On every account call | To prove it is you, without sending the password again |
| Which device to disconnect | When disconnecting one | Only the id the server itself gave the device |
| Pause and resume the building | When clicking Pause or Resume (`POST /v1/me/building/pause` and `/resume`, token only) | So the building goes dark for everyone right away and comes back when you want |
| Leave the world | When confirming "Leave the world" (`DELETE /v1/me/building`, token only) | So the building leaves the world right away and the lot is freed; the account and the character stay |
| Back to the world | When clicking "Back to the world" after leaving (`POST /v1/me/building/join`, token only) | So the server accepts the building again (a new building, on another lot) |
| Delete the account | When requesting deletion and when typing the code that arrived by email (`POST /v1/me/delete` and `/v1/me/delete/confirm`, with the token and the code) | So the server deletes the account: the building and the profile disappear from the world right away; the account, the likes, the blocks, the reports made and the devices leave the database in 7 days and the backups within 30. Here, `world.json` is deleted |
| Download my data | When clicking "Download my data" (`GET /v1/me/export`, token only; once a day) | The server returns, in a JSON file, what it keeps about your account (including the reserved name, the country and the IPs of sign-up and of the last login); nothing new leaves the computer |
| Habblaud version | On every call, in the `User-Agent` header (`Habblaud/1.0.0`) | Compatibility and diagnostics |

While the account is on the waitlist, the open Habblaud asks the world server, every 30 minutes, whether access has
been granted yet (`GET /v1/me`, with only the device token, nothing else). Once granted, or once signed out, it stops.

The world server sees the connection's IP (like any website). From it, it keeps the **country** (which can be hidden)
and, in clear text, **only two addresses**: the sign-up IP and the IP of the last password login, for auditing and fraud
prevention. Only the administration team sees these IPs; they come out in "Download my data" (`signupIp`,
`lastLoginIp` and `lastLoginAt`) and are deleted with the account. The daily per-IP summary that limits attempts
(sign-up, sign-in, codes) remains as it was. No other IP is kept: not the one from the building's connection, nor the
ones from walks around the city.

## What leaves: the building (the closed list)

With the account approved and the character created, your Habblaud opens a connection (WebSocket, over TLS) to the
world server and your building enters the city. Through the connection **only** this leaves:

| What leaves | How | Why |
| --- | --- | --- |
| First message of the connection (`hello`) | The device `token`, the Habblaud `version`, the `build` (the `commit` of the code in use and `dirty`, the "modified copy" flag) and the interface `locale` (`pt-BR`, `en`, `es` or `fr`) | To authenticate, to know whether it is an official version and to send notices in your language. The token goes only here, never in the URL; the language does not go in the building packet. Never the folder path nor anything from the machine |
| The building packet | On connecting and, afterwards, when the office changes: at most one every 5 seconds, and nothing if the packet did not change | It is the live building |
| Heartbeat (`ping`, and the `pong` when the server asks) | Every 30 seconds, with no content | So the building stays lit while Habblaud is open (paused or out of the world, it lights nothing: it only keeps the World scene's connection) |
| World scene opened or closed (`view` and `view.off`) | When opening and closing the city in the browser, with no content | So the server sends the piece of the city around your character only while you are looking; with the scene closed, nothing comes down |
| Your character's steps (`move`) | While you walk in the city (at most 5 per second): the position in the city (`x`, `y`, in tiles), the direction (`dir`: `n`, `s`, `e` or `w`) and whether it is walking (`moving`) | It is your character on the street; the position is in the world's city, never anything from the office. With the tab in the background, one standing step every 30 s |
| Area request again (`resync`) | When a building change arrives out of order: only the id of the piece of the city (`chunk`) or, inside a building you are visiting, the id of that building (`building`) | So your Habblaud shows the right buildings |
| Profile request (`profile`) | When clicking on someone on the street: only the id (`playerId`) the world itself gave that person | To show the card of whoever is nearby |
| Entering and leaving a building (`enter` and `leave`) | When pressing E at the door (or on "See it as others do") and when leaving: only the building id the world gave (`buildingId`). Inside, no step leaves: your character walks only on your screen | To see the inside of someone's building (rooms with fictitious names and the agents in their current status, with no terminal, messages, permission requests or anything that acts) |
| The light social features, when you press them (`like`/`unlike`, `greet`, `block`/`unblock`, `report`, `stamp`, `knock`, `teleport`, `summary.seen`) | Only ids and list items: the building (`buildingId`) or the person (`playerId`) the world gave, the greeting (`greetingId`), the stamp (`stampId`) and the report reason (`reason`) from the fixed lists, and the building code ("HB-XXXX", as you typed it) in "Go to". No free text | Liking, greeting, blocking, reporting, leaving a stamp, knocking on the door, going to a building and saying you saw the "While you were away" |

The building packet has these fields and no others (the exact format is in
[`shared/world/schema.json`](../../shared/world/schema.json); a test checks that every field in it is on this page):

| Field | What it is | Why |
| --- | --- | --- |
| `v` | Version of the packet format (`1`) | Compatibility |
| `version` | Habblaud version (`1.0.0`) | Protocol compatibility |
| `theme` | `none`, `halloween` or `christmas`, already resolved: "Automatic" becomes the calendar's theme (Halloween in October, Christmas from November 1 to December 26), by the computer's date (in Docker, UTC) | The building and the interior with your theme |
| `floors` | One floor per room with someone present, in shuffled order | Height of the building and the rooms of the interior |
| `id` (of the floor) | A random id per room (`f_` and 10 characters), which does not come from the folder path, **changes every 24 h** (with a ±6 h draw) and also changes when the room disappears and comes back or when Habblaud restarts. No time of day at all | Someone who visits today and tomorrow cannot tell whether it is the same project |
| `agents` (of the floor) | One per main agent or subagent working, waiting, idle or watching a shell | The character doing the right thing at the right desk |
| `id` (of the agent) | A random id (`a_` and 8 characters), with the same changes as the floor id | To know who is who in the packet |
| `kind` and `parentId` | Main (`main`) or subagent (`sub`) and, for the subagent, the **world** id of the agent that called it (absent if that agent has already left) | The subagent near whoever called it |
| `provider` | `claude` or `codex` | The tool's look |
| `status` | `working`, `waiting`, `idle` or `shell`. **No** "since when" | What the character is doing |
| `look` | The character's visual hint (`f` or `m`) | So the body and the name match |
| `name` | A name drawn from Habblaud's list of names based on the world's random id (never the office's name, edited or not) | So the character has a name |
| `parts` | The appearance's colors and styles (`skin`, `hair`, `hairStyle`, `eyes`, `top`, `topAccent`, `topStyle`, `bottom`, `bottomStyle`, `shoes`, `accessory`, `accessoryColor`, `facialHair`), drawn from the world's random id, with the pieces you chose in the editor on top | The character with the right look |
| `tasksDone` | Tasks completed today by that agent, only the band: `0` (none), `1` (1 or 2), `2` (3 to 5), `3` (6 or more). Never the title | The "+1" above the character's head |
| `compacted` | Only if you turned on "compactions": `true` when the agent compacted its context since the previous packet (`/clear` does not count) | The room's trash can fills up |
| `tokens` | Only if "show tokens" is on (it comes on; you can turn it off): `day` (today) and `week` (today and the previous 6 days), the building's total (input + output of all agents, from "My day", without demo mode), rounded to 2 digits (e.g. 1,200,000). Others see only the **band** (up to 100 thousand, 1 million, 10 million, 100 million, above) | The facade's meter |

Nothing else. The packet of an office with 3 projects and 5 agents is about 2 KB. The limits are 64 floors, 64 agents
per floor, 256 in total and 64 KB (in practice, about 170 agents); above that, Habblaud cuts the last ones and warns in
the log. The server checks every field (names within the list of names, colors within the palettes, ids in the format)
and rejects the whole packet if any field outside the list appears.

### A real example of a packet

```json
{
  "v": 1,
  "version": "1.0.0",
  "theme": "halloween",
  "floors": [
    {
      "id": "f_8c1e5f7a2b",
      "agents": [
        { "id": "a_3f9d2c7e", "kind": "main", "provider": "claude", "status": "working",
          "look": "f", "name": "Marina",
          "parts": { "skin": "#e8b48c", "hair": "#2b1d14", "hairStyle": "bob", "eyes": "#3b5a7a", "top": "#4a6fa5",
                     "topStyle": "hoodie", "bottom": "#2f3542", "bottomStyle": "pants", "shoes": "#ffffff",
                     "accessory": "glasses", "accessoryColor": "#222222", "facialHair": "none" } },
        { "id": "a_71c0b5a9", "kind": "sub", "parentId": "a_3f9d2c7e", "provider": "claude", "status": "working",
          "look": "m", "name": "Caio", "parts": { "...": "..." } }
      ]
    },
    { "id": "f_02aa91c4de",
      "agents": [ { "id": "a_b2e74d10", "kind": "main", "provider": "codex", "status": "idle",
                    "look": "m", "name": "Rafael", "parts": { "...": "..." } } ] }
  ]
}
```

(`"...": "..."` abbreviates pieces identical to Marina's. A test checks this example against
[`schema.json`](../../shared/world/schema.json).)

## What never leaves

| Never leaves | Examples |
| --- | --- |
| Path and name of the project, name you gave the room | `/Users/you/projects/client-x`, "Secret project" |
| Session title, branch, permission mode, model | "Fix the login", `feat/payments`, `opus` |
| What the agents do | Activities, tasks, commands, shells, permission requests, questions, messages, the terminal |
| Cost and work numbers | Money spent, lines of code, tool calls, tokens per agent (tokens leave only as the building's total, rounded) |
| Your Claude or Codex account | Email, organization, plan, 5-hour and weekly usage |
| The name you gave a character | It could be your real name: in the world, the character gets a different, drawn name |
| The character's seed | The appearance in the world is drawn from a random id; only the pieces chosen in the editor go up unchanged |
| Times of day | When the session started, when the status changed, when the room was born: the packet has no time at all |
| Things about the machine | Computer name, system user, time zone. The device appears only as "Device 1/2/3" |
| Your history | My day statistics, the timelapse timeline, the session history |
| Demo mode agents | They are left out before the packet is built |

## Live, without identifying anyone

What shows up for visitors: **whoever visits the world sees, live, how many projects and agents you are running and
what each character is doing (working, waiting, idle). Nobody sees which projects they are, what the agents do, or who
you are: only the nickname and the avatar you chose.**

- **Nobody is identified:** only the nickname (chosen at sign-up) and the avatar you chose and the IP's country (which
  can be hidden). No email, real name, account name or machine. The IPs of sign-up and of the last login stay with the
  administration only, and never appear in the world.
- **No project is identifiable:** the floor ids are random and change every 24 h (±6 h), with the order of the rooms
  shuffled.
- **No office time of day leaves:** the packet has no "since when" nor anything about time. The visit shows the status,
  never "how long ago".
- **No building history is kept:** for the building, the server keeps only the day of the last signal and the month it
  entered the world. There is no building timeline and no "last seen".
- **No global feed:** each person only receives the piece of the city around their own character; no route lists
  buildings or players.
- **Nothing proves you are at the computer:** the agents work on their own. The card says "lit" or "dark" about the
  building, never "online" about the person.
- **Discreet mode:** only lit or dark and the number of floors, with no counters or statuses. **Closed to visitors:**
  nobody enters.
- **Visits:** whoever enters your building sees the rooms with the fictitious names and the agents in their current
  status; in discreet mode, the rooms empty with the light on; paused, everything dark. You see only "N visitors now",
  never who. And what you see inside other people's buildings stays on your screen: nothing from the interior goes up,
  not even your character's position.
- **Blocking works both ways:** whoever you block disappears for you and you disappear for that person, including the
  building.
- **The light social features don't say who it was:** the owner sees how many visits, likes and stamps were received
  ("While you were away") and how many likes were earned today, never from whom; a knock on the door arrives without a
  name, and only if the owner turned on "Let me know when someone knocks". The city's aggregates (the week's goal, the
  total of tokens in a band) only appear with 10 buildings or more.

To be clear: someone who observes the same building for a long time may notice patterns (more agents on weekdays, for
example). Anyone who doesn't want even that uses discreet mode or pauses.

## On this computer

- The World account is kept in `~/.habblaud/world.json` (in Docker, in the `/data` volume), with permission only for
  your user. The device token leaves from there only to the world server, over HTTPS and in the first message of the
  building's connection, and never goes to the browser, to the logs or to the URL. The same file keeps the theme chosen
  for the building (which stays even after signing out of the account) and whether the building is paused or out of the
  world.
- The last shipment of the building (the exact packet, the time, the size and the server's response) is kept in
  `~/.habblaud/world-last-uplink.json`, also only for your user, and disappears when you sign out of the account.
- The world's random ids live only in Habblaud's memory: restarting Habblaud generates new ids.
- What the world sends to the owner (today's likes, the "While you were away", the knocks on the door and the list of
  who you blocked) stays only in Habblaud's memory; in the snapshot (which also goes to the phone) only today's likes,
  how many knocks there were and whether there is an unseen summary are included. The stamp you left today on a building
  stays in the browser (`localStorage`), so the button knows you already went.
- The World section only works from the computer itself (`http://localhost`), never from the phone, and only with
  Habblaud reachable only from the computer itself. As with the messages through the office, any program on this
  computer that can reach `localhost` can act through the account.
- **Pause** stops sending the building packet before responding and notifies the world server: the building goes dark
  right away for everyone and the lot is kept. **Resume** starts sending again (with no response from the server,
  Habblaud tries to notify it again).
- **Paused: your building is dark, but you can walk around the city.** With the World scene open, the connection
  continues (or opens) carrying only the first message (`hello`), the heartbeat (`ping`/`pong`) and the scene's commands
  (`view`, `view.off`, `move`, `profile`, `resync`, `enter`, `leave`): no building packet leaves, and the heartbeat does
  not light the building. With the scene closed, the connection closes and nothing leaves. Out of the world, the same
  applies.
- **Leave the world** stops sending the packet and only responds after the world server removes the building and frees
  the lot. The account and the character stay (you can walk around the city, as when paused); no building packet leaves
  until you click **Back to the world**, which asks the world server for the return and creates a new building, on
  another lot. If the account leaves the world on another computer, this one also stays out of the world, sending no
  packet, until **Back to the world**.
- **The city** (the World scene) only comes down with it open in the browser: the buildings and the people nearby that
  the world server sends stay in Habblaud's memory and go to the page through `localhost`, never to disk nor to the
  logs, and are forgotten when the scene is closed or the connection drops. The scene only opens through Habblaud's own
  page, never through another site.
- Completed tasks and compactions are also counted in Habblaud's memory while the building is paused or offline; only
  the day's band (and the "compacted since the previous packet") leaves, in the next shipment.
- **Sign out** deletes the token from this computer and disconnects it on the server. The device list shows where the
  account is connected (up to 3) and disconnects them one by one.

## How the guarantee is kept

1. **The protocol is public and closed:** [`shared/world/protocol.ts`](../../shared/world/protocol.ts) and
   [`schema.json`](../../shared/world/schema.json) define every field; the server rejects any other.
2. **A single file builds the building packet:** [`shared/world/projection.ts`](../../shared/world/projection.ts),
   which receives from the rooms only the id and never receives accounts, usage or statistics. The tests check every key
   of the packet against the `schema.json` list, that no office text (paths, room names, titles, activities, commands,
   tasks, branch, model, account, email, edited names) appears in it and that no number looks like a time of day.
3. **You see what was sent:** Habblaud World › See what was sent (the city button in the top bar) shows the exact JSON of
   the last shipment, the time, the size and the server's response (accepted, or the reason for rejection). It is the
   same object that went onto the wire.
4. **Open source:** whoever reviews a pull request that touches `shared/world/` or `server/world/` checks this list
   against what the code sends ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)).
