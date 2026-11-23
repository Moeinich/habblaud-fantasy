# Changelog

What went into each version of Habblaud. Each version has its own section here, and its text becomes the notes of
the [GitHub release](https://github.com/marmottajr/habblaud/releases) (`npm run release`), which Habblaud opens in
**Settings › About › See what changed**. All entries are written in English.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semantic versioning](https://semver.org/): a fix bumps the last number (0.2.**1**), a new feature bumps the middle
one (0.**3**.0).

## [Unreleased]

### Changed

- **A tighter hub.** The Great Hall, Mess Hall, Bathhouse and Tavern now stand right next to each other, without the
  open square between them. The walkways between the rows run through the halls: in at the Great Hall's back from
  the top row, and out at the Bathhouse's back to the bottom row.

### Fixed

- **Plugin versions.** The Claude Code plugins and their marketplace now carry the app's version (1.1.0) again.

## [1.1.0] - 2026-11-23

### Added

- **Undead.** A fourth race: Forsaken crypts with cold slate floors glowing violet in the seams, grave-cloth runners
  with little skulls, and Halloween dressing all year (pumpkins, a ghost, cobwebs, bats and lanterns). Their people
  are stooped skeletons with dark sockets glowing yellow, bare teeth, an exposed ribcage and lank grey hair, and
  they get gothic names of their own. The undead wing has its own building to the south,
  reached by a covered walkway from the square. Every project room's race is picked anew from its seed, so existing rooms may change
  race once.
- **Races you can tell apart at a glance.** Characters no longer differ only by colour. Orcs are a strong green
  with a broad jaw, big upturned tusks, dark hair in war braids, topknots or mohawks with bone rings, a war belt with
  a bone buckle and spiked iron spaulders. Night elves have deeper violet skin, glowing eyes, face markings, a
  moon-silver circlet, long flowing hair with a leaf pin and leaf-blade shoulders. Humans wear a blue and gold
  Alliance tabard with steel shoulder caps.
- **Room dressing by race.** Elf rooms sit inside a living tree, with a leafy canopy and vines over the north wall
  and bark-trunk corners with roots. Orc rooms get sharpened stakes, horned skull trophies and blood-red war paint.
  Human rooms hang blue and gold bunting. Undead rooms are furnished in bone and violet, on a crypt floor.
- **The elf world tree.** The night-elf wing stands in the hollow heart of one huge tree. A rounded ring of living
  trunk wraps the whole wing, with a gap in front where the walkway comes in. At the back the trunk rises high
  behind the offices as a wall of furrowed bark with glowing runes and roots running down to the floor. Around the
  offices lies a floor of heartwood with growth rings and glowing mushrooms, and jungle leaves crown the rim all the
  way round. Vines hang over the offices but are see-through, so everyone inside stays visible.
- **Lands of the races.** Every hall sits in the middle of its own land: a jungle of giant vine-wrapped trees and
  ferns round the elves, cut-down badlands with stumps, felled logs and dry thorn bushes round the orcs, dead
  purple ground with bare trees and gravestones round the undead, and a green park round the humans. The lands
  meet roughly halfway between the halls in winding, organic borders, frayed at the pixel level so the grounds melt
  into each other.
- **Round, open-plan halls.** Each wing is one hall with a department per project instead of a row of boxes.
  Rooms next to each other in a wing have no wall between them, only tall plants marking where one department
  ends, and the whole hall runs out to a rounded outer wall: the rooms' floor continues out to it, their back
  walls and outer walls are gone, and their whiteboards, clocks, posters and windows hang on the round wall
  instead. The wall itself is in the race's style: a crenellated stone wall round the human wing and the core, a
  palisade of sharpened stakes with the odd skull round the orc camp, and an iron graveyard fence with violet
  lanterns round the undead crypts. Departments still grow and shrink with their team.
- **Rooms grow with their team.** A room has 6 desks per column, and when more agents belong to it than it has
  desks, it widens into the next column (up to four), with another desk island and its own door. Agents who were
  standing or sitting on a stool move to the new desks. When the crowd is gone, the room shrinks back after a minute.
- **Wings.** The office now branches out from a square next to the core instead of being one long building. Human
  rooms fill a wing to the west along the main corridor, and orc rooms fill a wing to the east. Night-elf rooms get
  their own building to the north and undead rooms one to the south, each reached by a covered glass walkway from
  the square. Each wing has a name label
  where it begins. When a new room joins a wing, the rooms further out move over one at a time.
- **White-labeling.** Set `HABBLAUD_BRAND_NAME` (and optionally `HABBLAUD_BRAND_SHORT` for the home-screen label) to
  show your own name instead of "Habblaud" in the page title, the pixel logo (same font and colours), the home-screen
  app and the phone login page. It applies at runtime, so the same Docker image works for any brand.
- **Night-elf rooms.** Project rooms now come in three races: orc (Horde), human (Alliance) and a new night-elf grove
  with moonwood walls, floors, desks, chairs, moon-crystal screens, rugs and banners. Each room only shows its own
  race's decor.
- **Multiple machines in one office.** A Habblaud server (for example a Raspberry Pi that is always on) can now show
  the Claude Code sessions of other computers. On each Mac, the new `habblaud-remote` plugin sends every session event
  in the background (it never slows the session down), and the permission, messages and usage plugins talk to the
  server instead of the Mac itself. Turn it on with `HABBLAUD_INGEST=1` on the server, create a token per machine with
  `npm run ingest:token -- add <name>` and run `npm run remote:install -- --server https://…` on the Mac. It only works
  over the remote port with HTTPS, and only the token's hash is stored. Agents of other machines show the machine's
  name on their card and get their own rooms; you can follow their status, activities, subagents and usage, approve
  or deny their permissions, answer their questions, send them messages, and their merged PRs and red CI throw the
  same party and alarm. The terminal, taking over, New agent and dictation stay off for them. Habblaud World never
  receives agents of other machines. See "Multiple machines" in the README.
- **Codex sessions of other machines too.** `npm run remote:install` now also sets up Codex on the Mac: it installs
  the Habblaud Codex hooks and points them at the central server, so Codex agents of that machine show up in the
  server's office with their activities, subagents and waiting approvals (`--no-codex` leaves Codex alone).

- **Sign in on a screen without a keyboard.** With `HABBLAUD_REMOTE_KIOSK_TOKEN_HASH` (the SHA-256 of a random token)
  in `.env`, opening `https://<address>/login/kiosk?token=<token>` on the remote port signs in without typing the user
  and password, for a TV or a wall display. Only the hash is stored, wrong tokens count against the login throttle and
  removing the hash turns the link off.

### Changed

- **The camp wraps round the hub.** The hub is now just the four core halls (Great Hall, Bathhouse, Mess Hall and
  Tavern), and each race has its own corner round it: night elves top left, orcs top right, undead bottom left and
  humans bottom right. A zone's first two rooms stand beside the hub on its own row (the top zones on the north side
  of its corridor, the bottom zones on the south side); the next ones go right above (or below) them, and the zone
  grows outwards from there. A zone only takes the rows it has rooms in, and the rows sit flush against each other,
  so a quiet camp stays small and the view zooms in on it. Empty cells in a zone are plain ground instead of patios
  of their own: the shared spaces are the hub's halls.
- **Roads in each race's colours.** From the edge of the hub every road carries the look of the race it leads to: a
  forest path to the elves and each other race's carpet to theirs. Where two zones share the hub's row, its
  corridor is split into a lane for each.
- **Ground to the edge of the screen.** Each race's land (jungle, badlands, blight and green park) now runs all the
  way to the edge of a widescreen view instead of stopping at a plain backdrop. Inside the elves' world tree the
  jungle floor runs on, with roots along the foot of the trunk instead of a carved wooden floor.
- **No automatic lite mode.** Lite mode no longer switches itself on for TV browsers; add `?lite=1` to the address
  to use it.
- **The Office panel starts closed.** Open it from the button at the top left; your choice is remembered.
- **A fuller demo.** The demo keeps about twelve sessions open across fourteen projects, and new rooms go to the
  race with the fewest, so every corner of the camp fills up.
- **The Activity panel starts closed.** Open it from its bar at the bottom. Every screen starts closed once and then
  remembers its own choice.
- **Halls that grow out of their yards.** Inside each ring the yard now has the race's own ground: a grassy bailey
  round the human halls, sand in the orc war camp, blighted earth round the crypts. The rooms' stone floor no longer
  stops in a straight line. On every side that faces open ground (the yard, an empty plot or the square) it ends
  in a rounded, uneven edge, with loose slabs scattered beyond it, and the straight side wall there is gone.
- **Dressed ring walls.** Every ring is decorated for its race. Humans get round towers on the corners, torches
  on the battlements, blue and gold banners on the outer wall, and barrels, crates, hay and weapon racks in the
  yard. Orcs get mammoth tusks on the corners, war banners and braziers on the palisade, spiked hide shields
  outside, and totems, drums, logs and bone piles. The undead get gargoyles, ghost-fire braziers, violet skull
  banners and chains, and graves, coffins and candles along the fence. The elves' world tree gets moon lanterns
  in its leaves, glowing mushrooms at its foot and owls in its crown.
- **Gates.** Every way through a ring has gateposts in the race's style. The walkway down to the undead wing
  now passes under an iron arch instead of running into the wall.
- **The elf road.** The walkway up to the elves is now a forest road: worn earth with roots, fallen leaves and
  mossy stepping stones, lined with ferns and broad leaves instead of glass.

- **No more road.** The dirt road with its carts, the cobbled verges, the street lamps and the hedge along the
  south of the office are gone. The office now sits in open country, with trees, bushes and stones growing densely
  all around it.
- **Carpeted corridors.** The walkway between rooms is no longer a dirt road. Each wing's corridor is a wall-to-wall
  office carpet in its race's colours (royal blue and gold, oxblood and bronze, violet and teal), with a runner in
  the race's style. The square is paved in stone, and where floors meet they melt into each other with a ragged,
  worn pixel edge (tufts of carpet over the paving, stones showing through) instead of a hard line. The elf carpet
  spills out of the walkway onto the square.
- **Habblaud World removed.** The online city, the account and building sync, the World and Visit scenes, the
  `/api/world/*` routes and the `HABBLAUD_WORLD`, `HABBLAUD_WORLD_URL` and `HABBLAUD_WORLD_DEV` settings are gone;
  Habblaud no longer contacts server.habblaud.com.
- **Agents look like the race of their room.** Humans in Alliance rooms, night elves (violet skin, long ears, glowing
  eyes) in elf groves and orcs in Horde rooms, in the camp, the avatars and the character editor preview.
- **Fantasy names.** Characters get original names in the style of their room's race (guttural orc names, medieval
  human names, flowing night-elf names) instead of Brazilian first names. Existing installs switch on the next start;
  characters picked in the editor are kept.
- **One room per project.** A room is keyed by the project's folder name, so the same project checked out in
  different places or on different machines shares one room, and agent worktrees (`.claude/worktrees/…`) join their
  repository's room. The room shows the folder of its most recent agent (this computer's first), while the terminal
  still opens each agent in its own folder. Room ids change once, so existing rooms get a new theme on the next start.

- **Warcraft III-style rooms, Horde and Alliance.** Every remaining office object was redrawn: desks are war and scribe
  tables with rune tablets or scrying mirrors, chairs are tusked hide stumps (Horde) or carved high-back chairs
  (Alliance), and project rooms alternate between the two factions in floors, walls, rugs and furniture. The
  reception is the Great Hall, the kitchen is the Mess Hall, the restrooms are the Bathhouse and the lounge is the
  Tavern, with ice chests, potion cabinets, fur thrones, a war-game table, a goblin fortune machine and latrine
  booths. Walls carry quest boards, banners, tapestries, torch sconces and arched windows; the corridor and the road
  are dirt paths. Christmas became the Winter Feast: lantern pines, supply crates and no Santa hats.

- **The office is now a fantasy camp.** The whole look was redrawn in an original fantasy-RTS style. Desks are
  workbenches, monitors are stone slabs with glowing runes, chairs are stumps and hide-covered seats, and the printer
  is a small forge. The water cooler is a water barrel and the coffee machine is a cauldron. Floors are straw,
  rough planks, flagstones and cobbles, and walls are logs, rough stone and wattle-and-daub. The window shows
  mountains and a pine forest, the kanban board is a war map with wax seals, and posters are clan banners. Outside,
  street lamps are braziers and cars are carts.
- **Agents are now workers of an orc clan.** They have green skin, tusks, pointed ears, work clothes and tools in
  hand. Only the drawing changes: character data stays the same.
- **The city is now a fantasy town.** Buildings are huts, longhouses, watchtowers and keeps, and streets are dirt
  roads.
- **The interface uses dark wood, parchment and gold trim**, and the sounds are axe chops, anvil strikes and a low
  horn when an agent needs you.
- **English is the fallback language.** On a computer or browser in a language Habblaud does not speak (Danish,
  German, a Raspberry Pi with `C.UTF-8`...), activities, notices and the interface now show in English instead of
  Portuguese. An English system language is no longer ignored. `HABBLAUD_LANG` and **Settings › Language** still pin
  a language. The last log and script messages that were still in Portuguese are now in English, and
  `npm run i18n:check` fails on Portuguese text outside `tr()`.
- **Quiet sessions leave the office.** A session that has written nothing for 10 minutes (30 while it says it is
  busy) is treated as gone, even when its registry file stays behind, as it does in Docker or after a crash. Its
  room empties and closes like any other. It comes back the moment it writes again. `HABBLAUD_STALE_MINUTES` sets
  the limit (`0` = never).
- **Unused accounts drop out of the top bar and the filters.** An account with no open session and no sign of use
  for a day is hidden until it is used again. `HABBLAUD_ACCOUNT_IDLE_HOURS` sets the limit (`0` = always show).
- **Lighter on small devices.** The trees, stumps and stones outside are painted once into the ground layer instead
  of on every frame, which cuts the world's draw calls by more than half. The world draws at 30 fps while nobody
  touches it and at full rate only right after input. The server sends the office twice a second at most, not five
  times. `?lite=1` turns on lite mode: 30 fps at most. `?fps=` sets the frame rate.
- **Lighter still.** Each finished room's furniture is now one baked image, and only what stands in front of a
  person is drawn again over them. Screens, window views, kanban boards and clocks repaint a few times a second from
  a small cache instead of pixel by pixel every frame. New character poses no longer read their pixels back from the
  graphics card. The hall walls stay on the graphics card instead of being uploaded again each frame. In the demo, a
  frame now takes well under half the work it did. Lite mode also drops the blur behind the panels.

## [1.0.3] - 2026-10-16

### Fixed

- **City: "Reply" and "Show in the office" on notices go back to the office and open the agent's request.** With the
  city open, clicking the notice for a request or question (and the browser notification, the requests chip in the
  bar and Deliveries) did nothing visible: the agent was selected behind the city. Now the city closes, the drawer
  opens on the agent and the request card gets focus.

## [1.0.2] - 2026-10-16

### Fixed

- **City: entering and liking work again after leaving the tab in the background.** After half a minute with
  Habblaud in another tab or window, the character stopped sending its position to Habblaud World: it walked on
  screen, but "Enter" and liking said to get closer to the door.

## [1.0.1] - 2026-10-16

### Fixed

- **City: the keys move you again.** In 1.0.0, with the launch popups and the Habblaud World window on the page,
  WASD, the arrows and the office shortcuts stopped responding even with everything closed: a closed `<dialog>` stays
  on the page and was taken for an open modal. Only open dialogs count now.

## [1.0.0] - 2026-10-16

Why 1.0: the office (rooms, characters, subagents, per-account usage, terminal, timelapse, phone with login) has been
stable for several versions, and Habblaud World arrives complete: account, character, building, city, visits and the
light social layer. To update: `git pull` and `npm run docker:up`.

### Habblaud World

Habblaud's online city is live: each Habblaud becomes a building, lit up live while the agents work, and each person
walks around the city with a character. **It is on by default**, pointing at `server.habblaud.com`; **nothing leaves
your computer until you create the account** and sign in, and `HABBLAUD_WORLD=0` turns everything off (it even hides
the routes). Access is granted through a waitlist. What may leave and what never leaves is in
[`docs/world/privacidade.md`](docs/world/privacidade.md); the README has the full **Habblaud World** section, in all
four languages.

- **Configure and test:** without `HABBLAUD_WORLD_URL`, the official server (`https://server.habblaud.com`; `npm run
  docker:up` and the server log say "(default)"); when set, the set one applies (only `https://` or `wss://`; if
  rejected, World stays off, with the reason in the log). `HABBLAUD_WORLD=0` turns everything off, and
  `HABBLAUD_WORLD_DEV=1` accepts a local world server without TLS at `http://127.0.0.1:<port>` (`npm run dev` already
  accepts it) or, from inside Docker, at `http://host.docker.internal:<port>`. `docker-compose.yml` passes the three
  variables through and maps `host.docker.internal` to the host (`extra_hosts` with `host-gateway`, harmless on
  macOS), and `npm run docker:up` ends by saying whether World is on and for which server. The build writes
  `dist/build.json` with the commit and whether the copy was modified (it goes in the first message of the building
  connection).
- **Its own window:** Habblaud World has its own button in the top bar (the city icon, next to Settings; it only
  appears with the world server configured) and opens in its own modal, outside Settings: the building in pixels, the
  account state in the header and everything else in a scrollable body. The "in the world" chip next to the version,
  the launch popups and the "While you were away" notice open the same window, on the right screen.
- **Account:** in the Habblaud World window. **Create account** (email and a password of 12 characters or more, the
  summary of what leaves and what never leaves your computer, the line about real data and the required acceptance of
  the Terms of Use and the Privacy Policy; the anti-bot challenge is solved by Habblaud itself) or **I already have an
  account**; 6-digit code with resend; **Forgot password**; **Devices** (up to 3, with revoke) and sign out. On the
  waitlist, only the notice, with no position or estimate, and an open Habblaud checks on its own every 30 minutes
  whether access was granted. All of it only from your own computer: never through the phone port, and anything that
  acts on the account only with local access (the terminal lock). The device token lives in `~/.habblaud/world.json`
  (permission 600; in Docker, in the `/data` volume) and never goes to the browser, the snapshot, the logs or the URL.
- **Player name chosen at sign-up (reserved while on the waitlist):** sign-up asks for the player name (3 to 20
  characters, unique in the world) along with the email and password, checked right away and, if already taken, with
  the notice in the field itself. It stays reserved for the account while it waits on the list (the waiting screen
  shows "Your player name: X (reserved)") and becomes the character's name, which is born with it without asking for
  the name again (it can be changed later, once every 30 days); old accounts, with no reservation, still choose the
  name when creating the character. `docs/world/privacidade.md` now says that the world server stores, besides the
  country, the sign-up IP and the IP of the last password login, for auditing (only the administration sees them;
  deleted with the account; included in "Download my data"), and nothing else.
- **Launch popups:** three notices in a modal window, over the office (and Settings). **New: Habblaud World**, for
  those who don't have an account yet, with the **Create account** button: "Not now" brings it back in 3 days (at most
  3 times), "Don't show again" ends it and, once the account is created, it doesn't come back. **You're on the
  waitlist**, right after sign-up (or when opening the page already waiting), once per browser. **Access granted!**,
  when your turn comes and the character doesn't exist yet, with **Create character** going straight to its screen.
  None of them appears through the phone port, in the timelapse or in demo mode.
- **Character:** player name, visual hint, the same appearance editor as the agent drawer, 2 or 3 personality traits
  (the ones that don't fit are disabled) and an introduction phrase from the list; it can be created while still on
  the waitlist. If moderation changes the name, the section asks for a new name, which takes effect without waiting
  the 30 days.
- **Building visibility:** live or discreet, closed to visits, hide the country, tokens (only in ranges), scoreboard,
  compactions and **Notify me when someone knocks on the door** (off by default).
- **Account and data** (a new screen in the Habblaud World window): the **Email me before removing my building for
  inactivity** switch; **Download my data**, which saves `habblaud-world-dados.json` with what the world stores about
  the account (once a day); and **Delete account** in three steps: what goes and when (the building and the profile
  right away; the account, likes, blocks, reports made and devices in the database within 7 days; from backups,
  within 30), the confirmation, which sends a code to the email, and the code. With the account deleted (from here or
  from another computer), the building connection closes and `world.json` is removed from this computer; the section
  says the account was deleted.
- **Your building in the world:** with access granted and the character created, the **Your building** card shows
  whether the building is connected, reconnecting, paused or out of the world (or whether the character is still
  missing), how many floors and agents it has, when the last upload went out and, if the world rejects an upload, the
  reason. When the world server stops the building, the card says why: **Update Habblaud** (old version), **Connected
  on another computer** (with **Bring to this computer**), account suspended or banned (with **Appeal by email**,
  which opens an email to privacidade@habblaud.com with the account id in the subject) or account deleted. A building
  marked as **unverified** shows the badge and **Dispute by email**, and the world under maintenance shows as **Under
  maintenance** (Habblaud retries on its own, with backoff). **Pause** stops sending right away and turns the
  building off, keeping the lot; **Resume** lights it up again. **Leave the world** (in two clicks, with the
  difference from pausing next to it) removes the building right away and frees the lot; the account and character
  remain, and **Back to the world** creates a new building, on another lot (leaving on another computer also counts
  here). **See what was sent** opens the exact JSON of the last upload, with the time, the size in bytes, the world's
  response (with the bytes it counted) and a copy button: it is everything that left the computer. The theme chosen
  in **Appearance › Office theme** also applies to the building (and the theme saved for the building applies to the
  office), and the top bar gets the "🏙️ in the world" / "⏸ paused" / "⚠️ stopped" badge, which opens the section
  (hidden in a cramped bar and on the phone).
- **The building goes up to the world:** with the account approved and the character created, Habblaud opens a
  connection (WebSocket) to the world server and sends the building live: one floor per room with someone present
  and, per agent, only a random id, main or subagent, the tool, the status, a randomly drawn name and the appearance;
  plus the theme, the tasks completed that day as a range, the building's tokens rounded (can be turned off) and, if
  you turn it on, the compactions. Floor and agent ids are random and change every 24 h (±6 h); paths, room names,
  titles, activities, model, branch, account and edited names never leave. It sends on change (at most once every
  5 s), reconnects on its own with growing backoff (2 s to 60 s, also during world maintenance) and stops when the
  server asks (account suspended, banned or deleted, old version, connected elsewhere). Demo mode agents never go up.
  Tasks and compactions are counted even with the building paused or offline, and go in the next upload.
- **The city (World button):** with the scene available (`meta.world.scene.available`), the **World** button next to
  Timelapse swaps the office for the Habblaud World city, in 3/4 pixel art in the same style: blocks of 6 lots with
  sidewalk, curb, street lamps, trees, crosswalks and the central square with the fountain, the benches and the
  totem; empty lots become gardens (park, pond, orchard, café). Each building is as tall as its open projects (up to
  12 floors drawn, with a "+N" sign above that), windows lit in proportion to the agents working and those waiting
  blinking amber, the owner's theme (pumpkins, cobwebs and bats at Halloween; snow, lights, garland and a tree at
  Christmas), everything dark with a "Closed" sign when the building is out, color and finish from the lot seed and
  the sign with the flag, the owner's name and the ❤️ likes. The bottom row of each block shows the facade with the
  shop window and the door; the top row, with the door facing north, shows the roof with the entrance canopy and the
  back. At night the street lamps and windows light up. Move with arrows/WASD (Shift runs) or by clicking (the
  office's A*); the camera follows, with the usual zoom and zooming out until about 200 buildings are visible; near a
  door, **Enter (E)** appears (see "Visiting a building", below). Hovering over a building opens the card (owner,
  country, state, floors up to "24+", agents working, waiting and idle or "discreet mode", likes, "in the world
  since"); clicking a player opens the profile (character, country, traits, phrase, building and likes received).
  Other players move smoothly, a little behind, at the rate positions arrive (5 per second for the 20 closest, 2.5
  for the others), with their name above; whoever stops on a bench appears seated (you too), and when you're away
  your character stays where it is. The minimap in the corner shows the surrounding blocks, brighter the more
  buildings are on, and takes the camera to wherever you click. Esc or **Office** go back, and reopening the city
  returns exactly where you were (the character, the camera and the zoom, without flicker); Settings stays open in
  the city, and the office stops drawing meanwhile. The scene is loaded only when it opens. **Paused or out of the
  world, your building stays dark, but you can walk around the city**: with the scene open, the connection carries
  only the first message, the heartbeat and the scene commands, never the building package, and closes with the
  scene. Account banned, suspended or deleted (or the building stopped for an old version or by another computer):
  the World button disappears; it also only appears on your own computer's page (never through the phone port nor
  without local-only access).
- **The city through the local server:** with the scene open, Habblaud asks the world server for the piece of the
  city around your character (`view`) over the same building connection and relays it to the browser through
  `GET /api/world/stream` (SSE: the whole state on open, then each change in order); once the scene closes, it says
  so (`view.off`) and nothing else comes down. Buildings per chunk with a revision (a gap asks for the area again),
  nearby players, the minimap and your position are kept only in memory. Character commands (`POST /api/world/cmd`:
  walk, profile, enter and leave a building and those of the light social layer) are checked field by field, at most
  5 batches per second and only the last step of each batch; at most 4 tabs with the city. Only from your own
  computer and only from its own page (never from another site). The city geometry (lots, blocks, doors, chunks and
  what is walkable) lives in `shared/world/city.ts`, the same as the world server's. Your character enters the street
  at the position the world server validated (on the sidewalk by your door or in the square).
- **Visiting a building:** within 2 tiles of a building's door, **Enter (E)** takes you inside: the owner's office as
  they see theirs, with their theme, the rooms with the day's fictional names ("Projeto Ipê", "Projeto Jade"...) and
  the agents in their current status (typing, hand raised, watching the terminal or idle, with the social life
  simulated in your browser), changing right away with each package from the owner. You enter through the elevator
  with your character and the **visitor** badge and move with the keyboard or by clicking (without sitting at the
  desks). The top strip says whose building it is, how many floors and agents and whether it is in discreet mode
  (empty rooms, with the lights on) or dark (paused: everything dark); the side panel lists the rooms and the agents
  (name, role, tool and status; clicking opens a card with that and nothing more). Nothing that comes from the world
  has a timestamp, so inside there is no popcorn, cobweb, stopwatch or "waiting for X". **Leave** with the button,
  with Esc or through the reception elevator takes you back to the sidewalk in front of the door. In the panel,
  **Like** (with the total; from inside, without the distance from the door) and **Leave a stamp** (one of the 8
  front-desk stamps, one per building per day); the corkboard at reception shows the stamp you left today and, in your
  own building, those from "While you were away". A building closed to visits, full (20 visitors), blocked or too far
  gives an on-screen notice. Nothing that acts on the office exists in a visit (no terminal, drawer, feed, notices,
  permission requests, messages, My day, timelapse, editor or room renaming): it runs in a separate world that only
  talks to `/api/world/*`, and none of your steps inside leaves the computer. The coins from the visited agents'
  social life are kept under a separate key and vanish on leaving. **See it as others see it** (on the **Your
  building** card and at the door of your building) enters your own building. **For the owner:** the top badge gets
  "👀 N" and the **Your building** card, "N visitors now" (only the count, never who); the first visitor of each
  connection triggers the notice "Someone entered your building", which can be turned off in **Habblaud World ›
  Notify me when someone visits**. Through the local server, the scene stream relays the interior (`building`,
  `building.patch` with the checked revision and `resync {building}` on a gap) and the visitors (`visitors`, also in
  `meta.world.building.visitors`).
- **The light social layer, with no free text at all:** in the city, **L** (or the ❤️ button that appears near the
  door, up to 4 steps) likes a building, and the heart flies to the sign, whose counter jumps; **G** opens the wheel
  with the 10 greetings (keys 1–9 and 0, arrows or tap), for whoever just greeted you, whoever is on the card or
  whoever is closest, with 5 s bubbles over the heads (one doesn't cover another) and "G to reply" when someone greets
  you; **K** knocks on the door of those who accept it (up to 2 steps). The player card gets **Greet**, **Block** (in
  two clicks: you stop seeing each other) and **Report** (fixed reasons, "Report sent"); the building card gets
  **Like**, **Knock**, the building code and the "unverified" badge. On the minimap, **Go to HB-XXXX** and **Visit a
  random building**, with a fade while the character goes to the sidewalk by the door. In the square, the thermometer
  of the week's collective goal ("10 thousand hours of agents working") and the city hall sign (the lit buildings and
  "the city consumed ≈ X this week", only with 10 buildings or more); once the goal is reached, 20 s of fireworks
  (sometimes heart-shaped) and, for everyone, bunting with little lights and the season's decoration. On the facades,
  the day's token meter next to the door, the sign with 5 intensities by the week's range (from dark to neon with
  sparks) and confetti when a building finishes its shift. On the phone, the buttons sit in the corner, icons only.
  **In the office:** the bar chip gets "❤️ N today"; on connecting, the **While you were away** card (visits, likes and
  the stamps left at the front desk, without who) appears in the corner and also in **Your building**, with the
  building code to send to a friend; **Notify me when someone knocks on the door** (Visibility, off by default) shows
  "Someone knocked on your building's door"; **Habblaud World › Blocked** lists whoever you blocked, with **Unblock**.
  **Through the local server:** `POST /api/world/summary/seen` and `/api/world/unblock`, and the commands `like`,
  `unlike`, `greet`, `block`, `unblock`, `report`, `stamp`, `teleport`, `knock` and `summary.seen` in the scene,
  checked field by field.
- **Local routes** (`/api/world/*`, only from your own computer): the account (sign-up, code, sign in, sign out,
  resend, change password, character, visibility with the optional inactivity notice, devices); the building
  (`POST /api/world/pause` and `/resume`, which stop sending before responding; `/leave`, which only responds after the
  world server removes the building; `/join`, which asks to come back before reconnecting; `PUT /api/world/theme`,
  with automatic becoming the theme of the day; `GET /api/world/last-uplink`, the last upload saved in
  `~/.habblaud/world-last-uplink.json`, permission 600); and the account and data (`POST /api/world/delete-account`
  and `/delete-account/confirm`, which only responds after closing the building and deleting `world.json`;
  `GET /api/world/export`, the account JSON as an attachment, only from its own page). A resume the world server
  didn't confirm is retried with the reconnection backoff. The World status and the snapshot (`meta.world.building`)
  carry the building summary: connected, paused, out of the world, stopped, floors, agents and the last upload.
- **Open protocol and transparency:** `shared/world/protocol.ts` and `schema.json` define everything Habblaud
  exchanges with World (Phase 4 adds the door notices, the owner's visitors and the building `resync`; Phase 5, the
  names of the light social layer: stamps, city goals, today's likes, the "while you were away" summary, knocking on
  the door and the building code; Phase 6, the `goodbye` `deleted`, the `maintenance` error, the package's
  `implausible` rejection, the visibility's `notifyInactivity`, the building's `unverified` badge and the deletion and
  export formats); the player name rules, the 14 traits, the 20 introduction phrases, the 10 greetings and the 60
  fictional floor names ("Projeto Ipê", "Projeto Jade"...) live in `shared/world/`. `docs/world/privacidade.md` lists
  every field of the package and the connection, with a test that checks the page against `schema.json`; the
  projection tests check every key and that no office text appears in the package. The notice about real data, for
  people and AI agents, is in `CLAUDE.md`, `AGENTS.md`, `shared/world/README.md` and the World files, and
  `CONTRIBUTING.md` has the review rule for PRs that touch it.
- **Demo mode:** `?mock=1&world=logged_out` (or `waiting`, `approved`) simulates the server (the code is 123456), with
  the example building and upload from `docs/world/privacidade.md`; `?mock=1&world=approved&scene=city` opens a fake
  city (20 buildings, yours on lot (3,1), 5 people walking and one sitting on a bench in the square; `&perf=N` fills N
  lots), with buildings to visit (live, discreet and dark) and the light social layer (bots that greet each other and
  reply, the goal at 80 % and, with `&fireworks=1`, a fireworks test button). `npm run shots:world` regenerates the
  screenshots `docs/screenshots/world-predio.png`, `world-enviado.png`, `world-cidade.png`, `world-cartao.png`,
  `world-visita.png`, `world-visita-painel.png`, `world-social.png` and `world-praca.png`.

## [0.11.0] - 2026-10-13

To update: `git pull` and `npm run docker:up` (it also updates the Habblaud mod in the accounts). Phone access is
optional and stays off until you run `npm run remote:setup`; the step-by-step is in the README, under "Phone with
login and HTTPS". New agent needs `HABBLAUD_PTY=1` in `.env`.

### Added

- **Phone with login and HTTPS (optional, off until configured):** `npm run remote:setup` asks for a username, a
  password (stored only as a scrypt hash in `.env`), a name for the address (`https://<name>.local`) and, if you want,
  a custom address (e.g. `myclaude.home`). It creates a local CA and the server certificate and leaves the
  `<name>.local` announcement running as a service. The phone connects to a **second port** (443 if free, otherwise
  4748), which is only published after setup: every request on it requires login, and by default the phone **approves
  and denies permission requests**; messages, terminal (with **Deliveries**: what each agent finished, with summary
  and attachments) and New agent only with `HABBLAUD_REMOTE_ALLOW`. Port 4747 stays on the computer only and without
  login. **Settings › Phone access › Sign out** ends that device's login (a copy of the cookie also stops working).
  Contribution by @jasminaladdn (#96).
- **New agent (+ button in the top bar, opt-in with `HABBLAUD_PTY=1`):** starts a Claude Code session in the
  background on the computer (`claude --bg`), in the chosen folder (recent projects are suggested), with the written
  request and attachments; it appears in the office and receives messages and permissions through Habblaud. In a
  folder Claude Code doesn't know yet, it opens the Claude app's new session screen, prefilled. In Docker, the host
  helper starts it (`npm run codex:bridge`, which now also runs without Codex). From the phone, it also needs `spawn`
  in `HABBLAUD_REMOTE_ALLOW`.
- **Dictation** in New agent and in the message box: the browser records and **local Whisper** transcribes
  (`whisper-cli` + `ffmpeg` + a multilingual model); your voice doesn't leave the computer. Without them, the button
  doesn't appear.
- **Waiting up to 24 h for the office:** `HABBLAUD_PERMISSION_TIMEOUT` accepts up to 86400 s (previously 1800, and the
  plugin cut off at 330 s). The default is still 5 min. In a long wait, with no page that responds for 5 min (and no
  phone with login configured to respond), the request goes back to the terminal.
- **Messages to Claude desktop app sessions:** the `habblaud-mensagens` plugin also asks Habblaud in sessions with
  `CLAUDE_CODE_ENTRYPOINT=claude-desktop` (previously only in those with a terminal on screen).
- A request waiting without buttons in the office (the hook already handed it back to the terminal, or the session
  opened without the plugin): the terminal footer says to reply in Claude Code (or in Codex).

### Security

- On the remote port, what separates "from this computer" from "from the network" is the port the connection arrived
  on, never the Host header. The hook, plugin and host helper routes, the interactive terminal, the character editor
  and room renaming never work through it, not even with login.
- The local CA only signs `localhost`, `.local` names, the custom address and private network IPs (critical
  `nameConstraints`): even with a leaked key, a certificate for another site is rejected. The key never goes into the
  container.
- Session in an `HttpOnly`, `SameSite=Strict` and `Secure` cookie, signed with HMAC (changing the password logs out
  all of them). One password check at a time, counted before scrypt; after 5 wrong passwords in a row, each attempt
  waits from 1 s to 5 min.
- In Docker, the host helper only reads delivery files from known project folders (the ones Claude Code has in
  `<account>/projects`), the temp folder and attachments, and nothing that looks like a secret. Files and dictation
  use long-polling rounds (the server only responds when work arrives), instead of asking every half second.

### Fixed

- Phone: tapping a text field no longer zooms in (iPhone Safari enlarges fields with text smaller than 16 px).
- In the timelapse, the corner notices sit above the playback bar, instead of covering the timeline and the buttons.
- With many accounts or a narrow window, the usage cards move to a second row of the top bar, instead of covering the
  buttons on the right (zoom, My day, Settings, Help).
- On the phone (up to 480 px), the top bar no longer cuts off the logo and the side panel button: the counters move
  down to the usage cards row.
- "My day" on the phone: the Demo | Real data selector no longer goes off screen (not even in French, at 390 px).
- Two permission requests from the same agent at the same instant: the newer one's detail no longer says there is
  another request waiting behind it.
- "My day": the limit of 1,000 waits per day also applies when they are all open (previously the list and the day's
  file grew without a cap).
- A conversation file rewritten in place (instead of only growing) is read from the start again; previously the new
  content was ignored or read from the middle.

## [0.10.0] - 2026-10-13

To update: `git pull` and `npm run docker:up`. The interface follows the browser language (or Settings › Language).
The texts the server builds are still in Portuguese; for another language, set `HABBLAUD_LANG` (`en`, `es` or `fr`)
in `.env` before `docker:up`. In October, the automatic theme already puts the office in a Halloween mood; for the
usual look, choose **None** in Settings › Appearance.

### Added

- **Office themes** in Settings › Appearance: pixel-art decoration (trees with presents, wreaths and snow on the
  windows at Christmas; pumpkins, ghosts, cobwebs and bats at Halloween), lights, rugs and accessories on the
  characters. **Automatic**, the default, follows the calendar: Halloween from October 1 to 31 and Christmas from
  November 1 to December 26 (the rest of the year, the usual look). **None** keeps the usual look all year, and
  **Christmas** and **Halloween** pin a theme. The choice is saved in the browser.
- **Interface in English, Spanish and French.** Texts go through `tr()` (`shared/i18n.ts`), with Portuguese as the
  source language: a text without a translation stays in PT. The interface follows the browser and can be pinned in
  **Settings › Language**. Texts built by the server (activities, notices, terminal, logs and install scripts) follow
  `HABBLAUD_LANG` (`pt-BR`, `en`, `es` or `fr`) and, without it, the system language, except English (many machines
  and every container come in English by default): for the server in English, `HABBLAUD_LANG=en`.
  `npm run i18n:check` lists the texts still without a translation. French came from the community (#67).
- **README in English**, with versions in Portuguese (`README.pt-BR.md`), Spanish and French, and the language line
  at the top of each one.

## [0.9.0] - 2026-10-13

To update: `git pull` and `npm run docker:up`. The interactive terminal comes off and only works outside Docker:
`npm install`, `npm run build` and `HABBLAUD_PTY=1 npm start` (read the notice in "Privacy and security" in the
README first).

### Added

- **Interactive terminal (opt-in, `HABBLAUD_PTY=1`):** the real Claude Code in an office window, with tabs for the
  agents of the same project. **New session** opens a Claude Code in the room's folder; **Take over here** ends the
  session open in another terminal and continues the same conversation here (`claude --resume`); **End** and the
  tabs' X close the session, here or in another terminal. Only for Claude Code sessions (neither Codex nor demo).
  Before ending an outside process, Habblaud checks that the PID is still that Claude Code. It uses `node-pty` and
  `@xterm/headless` (optional dependencies); the whole screen comes back when reconnecting or switching tabs, with the
  modes Claude turned on. On startup, it opens a test terminal: if `node-pty` or `claude` don't work, the feature
  stays off, with the reason in the log (on macOS, it first fixes the missing execute permission on `node-pty`
  1.1.0's `spawn-helper`).
- **Terminal tabs and shortcut:** the terminal window got tabs with the main agents of the same project (with the
  start of what each one is doing), and the side list, a shortcut next to each agent that opens its terminal. With a
  terminal open, clicking another agent in the list switches the window to theirs. They also apply to the live
  terminal, with the interactive one off.

### Fixed

- A message sent from the office no longer goes to the wrong conversation: if the agent switches conversations
  (`/clear`, `/resume` or another thread in Codex) before fetching it, it fails with the reason instead of entering
  the new conversation.
- Old tasks and their states are preserved when recovering sessions with long history that gained new tasks.
- The activity detail no longer shows the secret of webhooks (Slack, Discord and Telegram) or of `npm_` and `hf_`
  tokens pasted into a command.
- Messages to Codex in Docker are now delivered one at a time per session and confirmed individually, reducing
  premature failures and duplicate resends.
- Malformed Claude Code task lists don't interrupt reading; the office keeps the other activities of the same batch,
  including in subagents.
- A Codex image saved on Windows (drive `C:` or network folder `\\server\...`) showed up with the wrong path in the
  activity and in the terminal (`/C:/...`, or the folder without the server). Now the path is the source file's.
- Saving a character or going back to random no longer closes another open edit while the response arrives, nor shows
  an error from the previous edit in it.
- A huge line in a conversation, or a line that never ended, stayed entirely in memory and reading got slower and
  slower. A line over 8 MB is now skipped, and Habblaud continues on the next line.
- Reverted Codex sessions now show the current turn in the office and in the terminal, even when the previous
  conversation's file is still on disk.
- In the timelapse, the agent's timeline no longer shows what happened after the replayed moment when going back in
  time. A history response that was still on its way also doesn't come in during the replay.
- In the timelapse, the panel times follow the playback and stay still when paused, along with the office and the
  replay badge.
- The paused feed keeps only the 50 most recent events and frees the data of old sessions, keeping the count of new
  items.
- In the timelapse, the arrows on the speed control now change the speed, instead of moving the office camera.
- The office avoids duplicate live connections and frees network resources and fonts when closed.
- `usage:install`, `hooks:install`, `mod:install` and `codex:install` stop when the config file changes in the middle
  of the installation, instead of wiping that edit (it also disappeared from the backup). Run the command again; the
  backup is now the file that was replaced.

## [0.8.0] - 2026-10-09

To update: `git pull` and `npm run docker:up`. Renaming rooms and editing the character only work from your own
computer (the same lock as the terminal). Room names live in `rooms.json` and characters in `names.json`, in the
Habblaud data folder; going back to 0.7 makes the chosen characters disappear on the first save.

### Added

- The side list and the character tooltip show the session title (for subagents, the task) below the name. In the
  list, a main agent idle for 1 minute or more shows **idle 12 min** instead of "Main"; in the tooltip, the state
  comes with how long it has been like that (**12 min ago**).
- **Movable windows:** the terminal and the agent drawer come loose by dragging the bar, resize from any edge or
  corner and snap back with a double click on the bar. The terminal gets the **Expand to full screen** button.
  Position and size are saved in the browser; on a narrow screen everything stays fixed. When loose, the drawer no
  longer reserves the side of the office.
- **Reorder the side list:** dragging a main agent's row changes the order of the room's agents, and dragging a room's
  header changes the order of the rooms (in the building they stay where they are). The order is saved in the
  browser; the agents' order goes with the Claude Code session and survives resuming the session.
- **Rename room:** right-clicking a room (in the side list or in the office) opens a field to give it another name;
  empty goes back to the folder name. The name is kept on the server (`rooms.json`, in the Habblaud data folder), per
  folder: it applies in any browser and survives restarts. In the room drawer, a pencil next to the name opens the
  same field. Only from your own computer; demo rooms don't change.
- **Edit a project's character.** In the main agent's details, the pencil next to the name opens an editor with the
  name, **Randomize** and the pieces (skin, hair, beard, eyes, clothes, shoes and accessory), with a preview. The
  choice applies to the project: the next session in the same room arrives with the same character, and **Back to
  random** undoes it. Only works from your own computer, like the terminal.

### Changed

- The agent's timeline shows the 15 most recent items, with **Show more** (15 more per click, up to the 200 stored)
  and **Show less** (back to 15). Previously it was 80 at once.

### Fixed

- On Windows, messages to Codex looked for `codex` in the PATH and found the script npm installs next to the
  executable: Habblaud said messages were on, but every delivery failed, because the script doesn't run without a
  shell. Now the search is for `codex.exe`. With Codex installed only through npm, point `HABBLAUD_CODEX_BIN` to a
  `codex.exe`.
- On Windows, the statusline command that already existed before `npm run usage:install` (Habblaud keeps it and keeps
  running it) was executed by `cmd.exe`, and what worked in Claude Code (single quotes, variables, pipes) broke. Now
  it runs in Git Bash, like in Claude Code: the one in `CLAUDE_CODE_GIT_BASH_PATH` or the one from the Git install.
  Without Git Bash, it stays in `cmd.exe`.
- On Windows, the installers (`usage:install`, `hooks:install`, `codex:install` and `mod:install`) showed user folder
  paths in full (`C:\Users\...`) instead of `~/...`.
- The test suite (`npm test`) passes on Windows: tests that assumed Linux and macOS paths, shell or permissions now
  hold on all three systems, and the few that depend on something Windows doesn't have are skipped there.

## [0.7.0] - 2026-10-09

To update: `git pull` and `npm run docker:up` (Codex appears on its own, if there is a `~/.codex` folder). To see
Codex live and approve from the office: `npm run codex:install` and approve the Habblaud hooks in `/hooks` in Codex
(restart Codex first, if it was open). With Habblaud in Docker, to send messages to Codex leave
`npm run codex:bridge` running on the Mac.

### Added

- **Codex in the office.** Sessions from OpenAI's Codex (the `codex` CLI and the app) enter the office like Claude
  Code's: each project is a room (the same as Claude Code's, when both are in the same project), each session a
  character with the **CODEX** badge, with activity, subagents, terminal, history, 5-hour and weekly usage (with the
  age of the numbers and "no quota" when credits run out) and My day (tokens only: Codex doesn't report cost).
  Without installing anything, Habblaud reads Codex's files (`~/.codex`, `CODEX_HOME` or `~/.codex*`;
  `HABBLAUD_CODEX_DIRS` chooses the folders and `HABBLAUD_CODEX=0` turns it off). A session enters with its first
  message, which is when Codex says the project folder (a CLI that is open but has no conversation yet doesn't
  appear). In Docker, only `sessions/`, `archived_sessions/` and `thread-writer-locks/` are mounted, read-only.
- **Codex live and approving from the office:** `npm run codex:install` adds the Habblaud hooks to
  `~/.codex/hooks.json` (with a backup; other apps' hooks stay where they are) and, after approving them in `/hooks`
  in Codex, the activity is the current one (and not only when each step finishes) and approval requests wait for
  your answer in the office for up to 25 s (`-- --espera <s>`) before going to the terminal. `codex:status` checks and
  `codex:uninstall` removes them.
- **Messages to Codex** through the same **Send message** box, via `codex queue` (they come in when the session
  finishes what it is doing). In Docker, leave `npm run codex:bridge` running on the Mac.

### Changed

- A Codex folder never becomes a Claude Code account, not even when listed in `HABBLAUD_CLAUDE_DIRS` or
  `CLAUDE_CONFIG_DIR`; the server and `docker:up` warn about it.
- With four accounts or more, the usage cards at the top get narrower and the zoom buttons disappear up to 1700 px
  wide, so as not to crowd the buttons on the right.

## [0.6.0] - 2026-10-09

To update: `git pull`, `npm run docker:up` and `npm run mod:install` (it brings the new permissions plugin and the
messages one); in sessions that are already open, `/reload-plugins`.

### Added

- **Answer the agent's questions from the office.** When the agent asks a question (`AskUserQuestion`), the questions
  card shows each one with the options and descriptions: pick one (or several, when the question allows), write your
  own in "Other" or decline. As with permissions, the dialog stays in the terminal and whatever you answer first wins;
  the `P` key and the "need you" counter also lead to the questions. Needs the `habblaud-permissoes` plugin from this
  version.
- **Send messages to agents from the office.** Each main agent's details get the "Send message" section: the text
  enters the session as if you had typed it in its terminal (with the agent busy, it comes in when it finishes its
  turn), and the box shows whether the message is queued, was delivered or not. It comes from a new plugin,
  `habblaud-mensagens` (Claude Code 2.1.287+), installed by `npm run mod:install` (`-- --sem-mensagens` leaves it
  out); `npm run docker:up` doesn't install it on its own, it only warns. It follows the terminal lock (local access
  only) and `HABBLAUD_MENSAGENS=0` turns it off. Read the notice in "Privacy and security" in the README: any program
  on this machine can send a message to the sessions that have the plugin.

### Changed

- **The terminal (`T` key) accepts typing.** It is no longer "read-only": for main agents, the footer became the
  message box (`Enter` sends, `Shift+Enter` breaks the line). Subagents and history sessions remain read-only.
- `npm run mod:install`, `mod:status` and `mod:uninstall` also handle the `habblaud-mensagens` plugin, and
  `mod:status` says whether Habblaud has messages turned on.

## [0.5.0] - 2026-10-09

### Added

- The "Needs you" card shows the `AskUserQuestion` questions in full, with the options and descriptions (up to 4
  questions, with 6 options each). It is read-only: the answer is still given in Claude Code.
- Automatic checks on GitHub (Actions): on every push to `main` and every pull request, the project runs `typecheck`,
  tests and build on Node 22.12, the minimum version `package.json` declares.

### Fixed

- When a transcript file was deleted and another, larger one was created in its place, Habblaud could miss the swap:
  some file systems reuse the number (inode) of the deleted file, and only the inode was compared. Now the file's
  creation time (when the system reports it) and its beginning also count, and reading restarts from the beginning of
  the new file.
- On Windows, with Node 23 through 24.19, the `habblaud-permissoes` plugin hook crashed on exit (code 0xC0000409, a
  Node bug: nodejs/node#56645) right after receiving the office's answer. The decision arrived before the crash, but
  without a decision (as in "Reply in the terminal") the session could log a hook error. Now the hook exits without
  crashing.
- `npm install` modified `package-lock.json` (the repository's was out of date relative to `package.json`), and so
  the next version's `git pull` stopped with "Your local changes … would be overwritten". Now the file stays the same.
  Those who already have the change run `git checkout -- package-lock.json` once before `git pull`.
- On Windows, the mod didn't record 5-hour and weekly usage when `HOME` wasn't set (the norm outside Git Bash): now it
  uses `USERPROFILE`. And a `CLAUDE_CONFIG_DIR` with `\` (e.g. `C:\Users\you\.claude-conta2`) became an invalid file
  name; now it maps to the same account, including with Habblaud in Docker.

## [0.4.0] - 2026-10-08

### Changed

- **CodeTown is now called Habblaud.** The name changes everywhere: interface, logo, reception sign, entrance totem,
  link preview, repository (`github.com/marmottajr/habblaud`), Claude Code marketplace and plugins (`habblaud` and
  `habblaud-permissoes`, with the `/habblaud` command), environment variables (`HABBLAUD_*`), state folder
  (`~/.habblaud`) and Docker (container and image `habblaud`, volume `habblaud-data`).
- For those coming from CodeTown: run `npm run mod:install` once (it swaps the old marketplace and plugins for the new
  ones in each account) and `npm run docker:up` (it removes the old container and copies the names, the timeline and
  the stats from the `codetown_codetown-data` volume to the new one, without deleting the old one). The `~/.codetown`
  folder and the preferences and coins saved in the browser move to the new names on their own. The `CODETOWN_*`
  variables no longer apply: rename them to `HABBLAUD_*` in `.env` (the server and `docker:up` warn about it). Details
  in the README, under "Coming from CodeTown".

## [0.3.2] - 2026-10-08

### Fixed

- When a terminal closed and its room was taken down, a garden was left in the middle of the building, between rooms.
  Now the farthest room moves into the gap: it is set up there, still dark; the first to arrive turns on the light and
  each one goes back to the same desk. The old address goes dark and is taken down, and the building shrinks. A room
  that opens takes the first free gap, and the initial load already comes without holes.
- Whoever was on their way to something that no longer existed, like the water cooler in a hallway column that
  vanished when the building shrank, was teleported. Now they change plans and keep walking.

## [0.3.1] - 2026-10-08

### Fixed

- Whoever was napping at the desk (idle for more than 10 minutes) and got up for a group, a party or a walk went off
  with the "zzz" over their head. Now the "zzz" only appears while the character sleeps.

## [0.3.0] - 2026-10-08

### Added

- **Habblaud mod for Claude Code** (2.1.287 or newer): `npm run mod:install` installs, in each account, this folder's
  marketplace with the `habblaud` mod (live 5-hour and weekly usage, a line in the terminal when another session
  needs you and the `/habblaud` command) and the `habblaud-permissoes` plugin (answer permissions from the office;
  `-- --sem-permissoes` leaves it out). `npm run mod:status` shows what each account has and `npm run mod:uninstall`
  removes everything. `npm run docker:up` updates the mod for those who already installed it.

### Changed

- The statusline tap (`npm run usage:install`) and the permission hook (`npm run hooks:install`) become the old way,
  for Claude Code before 2.1.287. `npm run mod:install` removes both from the account (with a backup), because the mod
  does the same. The interface and the README now teach `npm run mod:install`.
- The permission hook script moved to `mod/habblaud-permissoes/hooks/permission-hook.mjs`. The old path
  (`scripts/permission-hook.mjs`) became a shim, so whoever installed the hook before keeps working.
- In Accounts and usage, the source of the numbers says when they come from the mod ("live (Habblaud mod)").
- The live usage reader ignores a half-read file and keeps the last good number, instead of hiding the account for a
  cycle.

## [0.2.0] - 2026-10-08

First published version.

### Added

- **Version and updates:** the version in use appears in the top bar and in Settings › About. Every 6 hours Habblaud
  checks the releases on GitHub; when a new version comes out, the **New version** badge appears, with a notice and
  the link to what changed. `HABBLAUD_UPDATE_CHECK=0` turns the check off.
- **My day** (M key): where the agents' time went, how long they waited for you, tokens and cost, with 30 days of
  history.
- **GitHub in the office:** a PR opened or merged and a release published become a party in the room; a red CI sets
  off the alarm, until a green CI.
- **Reply from the office** (P key): with the hook installed (`npm run hooks:install`), approve, deny or "always
  allow" permission requests without going to the terminal. Local access only.
- **Timelapse of the day** (L key): the office replays the day at high speed.
- **Read-only terminal** (T key): each agent's conversation, live, in Claude Code style, with search, filter, a copy
  button and history of the sessions from the last 7 days. Local access only.
- **Day and night** by local time and **sounds** synthesized in the browser (off by default).
- **Social life:** those who are idle gather in groups (TV, video games, ping-pong, chatting in the kitchen,
  rock-paper-scissors for coins), with personalities, friendships and rivalries.
- **Waiting for the shell:** an agent waiting for a long command stays at the desk with the hourglass, and the wait
  becomes a gag.
- Session forks appear in the office.
- The open page reloads on its own when the server starts serving another version.
- The container uses the computer's time zone.
- **The office:** each project open in Claude Code becomes a room and each session, a character with its own name.
  Subagents arrive, work and deliver to the main one. It shows both accounts, with the 5-hour and weekly usage of each
  (statusline tap), plus an activity feed, notices and demo mode. Runs on Node or on local Docker.

[Unreleased]: https://github.com/marmottajr/habblaud/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/marmottajr/habblaud/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/marmottajr/habblaud/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/marmottajr/habblaud/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/marmottajr/habblaud/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/marmottajr/habblaud/compare/v0.11.0...v1.0.0
[0.11.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.11.0
[0.10.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.10.0
[0.9.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.9.0
[0.8.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.8.0
[0.7.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.7.0
[0.6.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.6.0
[0.5.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.5.0
[0.4.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.4.0
[0.3.2]: https://github.com/marmottajr/habblaud/releases/tag/v0.3.2
[0.3.1]: https://github.com/marmottajr/habblaud/releases/tag/v0.3.1
[0.3.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.3.0
[0.2.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.2.0
