# Contributing to Web Mock Studio

Thank you for considering a contribution. This guide explains how the project is organized,
how to run it, and what a pull request needs in order to be merged quickly.

## Ground rules

- **Client-side only.** Every feature must work in a browser tab with no backend, no account
  and no network dependency. Proposals that need a server belong in a separate project.
- **No new heavy dependencies.** The runtime dependencies are React, Zustand and Lucide.
  Generators, parsers and validators are implemented in `src/core` on purpose. Discuss a new
  dependency in an issue before adding it.
- **Plain, professional text.** No emoji in code, UI strings, commit messages or documentation.
- **Comments explain why.** Keep comments for algorithms and architectural decisions. Do not
  add comments that restate the code or label steps.

## Development setup

Requirements: Node.js 22.12 or newer and npm.

```bash
git clone https://github.com/zzoraemon043/web-mock-studio.git
cd web-mock-studio
npm install
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server on `http://localhost:5173` |
| `npm test` | Run unit tests once |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run typecheck` | Type-check without building |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |

Service Workers need a secure context. `localhost` qualifies; a LAN IP over plain HTTP does
not, and the app will fall back to in-page `fetch` interception there.

## Project layout

| Path | Contents |
| --- | --- |
| `src/core` | Framework-free logic: router, cURL parser, schema inference and generation, faker, resolver, workspace import and export, code generators. Every module here has unit tests. |
| `src/runtime` | The bridge between the page and the Service Worker, plus the in-page fallback. |
| `src/store` | Zustand stores for workspace data, UI state and the traffic log. |
| `src/features` | One folder per tool: `mocks`, `factory`, `runner`, `workspace`. |
| `src/components` | Shared UI primitives. |
| `public/mock-sw.js` | The Service Worker. Plain JavaScript, no build step, no rule logic. |

## Making a change

1. Open or comment on an issue so the approach can be agreed before you invest time.
2. Fork the repository and create a branch from `main`, for example `fix/query-regex-match`.
3. Keep logic in `src/core` and add tests next to it (`*.test.ts`). UI components should stay
   thin and call into the core.
4. Run `npm test` and `npm run build`. Both must pass with zero errors.
5. Check the change in both light and dark themes, and in both engine modes if it touches
   interception.
6. Open a pull request using the template. Include screenshots for UI changes.

## Coding conventions

- TypeScript strict mode with `noUncheckedIndexedAccess`; avoid `any` and non-null assertions.
- Prefer small pure functions with explicit input and output types in `src/core`.
- Treat imported workspace files as untrusted input. Validate and clamp every field.
- Use Tailwind utility classes and the design tokens defined in `src/index.css` (`bg-panel`,
  `text-muted`, `border-line`, `text-accent` and so on) instead of raw colors.
- Every interactive element needs an accessible name and must be reachable by keyboard.

## Commit messages

Use the imperative mood and a short subject line, optionally prefixed with a scope:

```
router: support optional params before a wildcard
factory: detect ISO week dates as date strings
```

## Reporting bugs and requesting features

Use the issue forms. For security problems, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](../LICENSE).
