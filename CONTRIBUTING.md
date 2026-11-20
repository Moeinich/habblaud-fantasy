# Contributing

Thanks for wanting to contribute to Habblaud! Bug reports, ideas and improvements are welcome.

## Before you start

- For bugs and ideas, search the [issues](https://github.com/marmottajr/habblaud/issues) to see if it's already been reported.
- For bigger changes, or changes to how Habblaud behaves, open an issue to discuss the proposal before implementing it.
- Prefer small, focused changes. If a change affects what appears or happens in the office, describe that behavior in the pull request.

## Language

Write everything in **English**: code comments, docs, `CHANGELOG.md` entries, commit messages, pull requests, issues
and test descriptions. The one exception for now is user-facing UI text, which is still written in Portuguese inside
`tr()` because the Portuguese text is the translation key (see below).

## Setting up

Habblaud needs Node.js 22.12 or newer and npm. After cloning the repository:

```sh
npm install
npm run dev
```

The development office runs at <http://localhost:4747>.

## Text and translations

Habblaud's interface is in Portuguese, English, Spanish and French. Portuguese is the source language:

- Every user-facing string (interface, errors, logs, install scripts) is written in Portuguese inside `tr()`
  (`shared/i18n.ts`). Values go in through numbered placeholders: `tr('Lendo {0}', [arquivo])`, never a template
  string inside `tr()`.
- The translation key is the Portuguese text itself: changing the text changes the key. Update its translations in
  `shared/locales/` (`en.ts`, `es.ts`, `fr.ts`), or leave them out: an untranslated string shows in Portuguese.
- `npm run i18n:check` lists strings without translations and translations that are no longer used.

## Checking a change

Before opening the pull request, run:

```sh
npm run typecheck
npm test
npm run build
```

If the change touches a Claude Code plugin, also validate the affected plugin:

```sh
claude plugin validate mod/habblaud
claude plugin test mod/habblaud
```

Use the path of the plugin you changed (`mod/habblaud-permissoes` or `mod/habblaud-mensagens`) where relevant.

## Opening a pull request

- Use a clear title and explain the problem, the change and how you verified it.
- Reference the related issue, if there is one.
- For visual changes, include a screenshot or GIF if it helps show the result. Take screenshots in demo mode
  (`?mock=1` in the URL or `npm run demo`), which shows only fictional agents.
- Update the **Unreleased** section of `CHANGELOG.md` when the change brings something visible to Habblaud users.
- Don't include personal data, credentials or private session content in screenshots, examples or logs.

If something isn't clear, ask on the related issue before heading in a direction that could change how the project behaves.
