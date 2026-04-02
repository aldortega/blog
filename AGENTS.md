# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router routes and API endpoints. Key route groups include `app/post/[id]`, `app/nuevo-post`, `app/seccion/[slug]`, and server routes under `app/api/*`.
- `components/`: Reusable UI and interaction blocks (editor, ratings, auth button, markdown renderer).
- `lib/`: Domain and integration code (`lib/supabase`, `lib/tmdb`, and post permission helpers).
- `public/`: Static assets.
- `supabase/migrations/`: SQL migrations for schema changes.
- Root config: `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `tsconfig.json`.

## Build, Test, and Development Commands
- Use `bun` as the package manager in this repository (do not use `npm`).
- `bun run dev`: Start local dev server (App Router + API routes) at `http://localhost:3000`.
- `bun run build`: Build production bundle and validate server/client boundaries.
- `bun run start`: Run the built app in production mode.
- `bun run lint`: Run ESLint (`next/core-web-vitals` + TypeScript rules).

## Coding Style & Naming Conventions
- Language: TypeScript (`.ts`/`.tsx`) with 2-space indentation and double quotes, matching existing files.
- Components: PascalCase exports in kebab-case files (for example `AuthButton` in `components/auth-button.tsx`).
- App routes: Follow Next App Router naming (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`).
- Keep UI copy in Spanish unless a feature explicitly needs English.
- Prefer `@/` imports from project root where configured.

## Testing Guidelines
- No automated test suite is currently configured. Minimum quality gate is `bun run lint` + manual smoke testing.
- For route changes, verify: home feed, post detail, create/edit flow, comments/ratings, and auth callback.
- If you add tests, colocate them near the feature as `*.test.ts(x)` and document the run command in `package.json`.

## Commit & Pull Request Guidelines
- Current history follows Conventional Commit style (`feat(scope): description`). Keep subject lines imperative and concise.
- PRs should include: purpose summary, linked issue (if any), screenshots/GIFs for UI changes, and manual test notes.
- Call out env/config changes explicitly (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `TMDB_API_KEY`).

## Agent-Specific Note
- This repository uses Next.js `16.2.2` with breaking changes. Before coding framework-specific behavior, read the relevant guide in `node_modules/next/dist/docs/` and honor deprecation warnings.
