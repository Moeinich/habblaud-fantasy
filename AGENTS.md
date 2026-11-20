# Habblaud — for AI agents

Habblaud is a pixel-art virtual office that shows, in real time, what Claude Code and Codex agents are doing: a Node
server with no runtime dependencies (`server/`), a browser page (`client/`) and shared code (`shared/`). Every visible
string goes through `tr('texto em PT')`, with translations in `shared/locales/` (`npm run i18n:check`), and every
visible change gets an entry under "Unreleased" in `CHANGELOG.md`. Everything else is in `CONTRIBUTING.md`.

## Language: English only

Everything written in this repository from now on is in **English**: code comments, docs, READMEs, agent instructions,
`CHANGELOG.md` entries, commit messages, pull requests, issues and test descriptions. Don't add new Portuguese text,
and when you substantially rewrite a Portuguese comment or doc, translate it to English while you are there.

One exception, until it is migrated: user-facing UI strings. The i18n system uses the Portuguese source text as the
key (`tr('texto em PT')`), so new UI strings are still written in Portuguese inside `tr()`, with the English
translation in `shared/locales/en.ts`. The translated `README.*.md` files (`README.pt-BR.md`, `README.es.md`,
`README.fr.md`) also stay in their languages.
