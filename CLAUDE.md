# Habblaud Fantasy — for AI agents

Habblaud Fantasy is a high-fantasy pixel-art camp that shows, in real time, what Claude Code and Codex agents are
doing (a fork of Habblaud): a Node server with no runtime dependencies (`server/`), a browser page (`client/`) and
shared code (`shared/`). Every visible string goes through `tr('English text')`, with Spanish and French translations
in `shared/locales/` (`npm run i18n:check`), and every visible change gets an entry under "Unreleased" in
`CHANGELOG.md`. Everything else is in `CONTRIBUTING.md`.

## Language: English only

Everything in this repository is in **English**: code comments, docs, READMEs, agent instructions, user-facing text,
`CHANGELOG.md` entries, commit messages, pull requests, issues and test descriptions. Don't add Portuguese text:
`npm run i18n:check` fails on it.

UI strings are written in English inside `tr()`; the English text is the translation key into `shared/locales/es.ts`
and `fr.ts`, so changing a string means updating (or dropping) its translations there.
