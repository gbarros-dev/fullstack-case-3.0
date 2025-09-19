# Repository Guidelines

## Project Structure & Module Organization
- Keep feature routes and layouts inside `src/app`; group related logic per route to maintain Next.js co-location.
- Share UI primitives from `src/components/ui`, exporting PascalCase components from lowercase filenames (`button.tsx` → `Button`).
- Store reusable utilities in `src/lib`, and manage Drizzle resources under `src/server/db` (`schemas/`, `client.ts`, `seed.ts`).
- Co-locate tests as `*.test.ts` or `*.test.tsx` beside their targets, or use `src/__tests__` for broader suites. Place static assets in `public/`.

## Build, Test, and Development Commands
- `bun dev` — start Next.js with Turbopack for local development.
- `bun run build` then `bun start` — produce and verify the production bundle.
- `bun run lint`, `bun run format`, `bun run typecheck` — enforce Biome rules, apply formatting, and keep types clean.
- `bun run db:generate`, `bun run db:migrate`, `bun run db:push`, `bun run db:seed`, `bun run db:seed:clerk`, `bun run db:studio` — manage Drizzle schema changes, synced Clerk/demo data, and the explorer UI.

## Coding Style & Naming Conventions
- Write TypeScript with 2-space indentation and explicit types at module boundaries; prefer descriptive names and avoid implicit `any`.
- Keep files kebab-case (Next.js route conventions excepted) and export React components in PascalCase.
- Rely on Biome via `bun run lint` and `bun run format` to maintain consistent style; do not mix manual formatting with Prettier or ESLint configs.

## Testing Guidelines
- Adopt Vitest with React Testing Library for new coverage; install the dependencies alongside features that need them.
- Name specs `*.test.ts(x)` and focus on critical paths such as DB schemas, server utilities, and form flows.
- Run suites with `bunx vitest` (watch) or `bunx vitest run` (CI), and note manual checks in your PR when automation is thin.

## Commit & Pull Request Guidelines
- Use Conventional Commits (`feat: db schema updates`, `fix: auth redirect`) and keep diffs focused on a single concern.
- Flag schema or seed changes in the summary, link to relevant issues, and describe validation steps; attach screenshots for UI updates.
- Ensure linting, formatting, and typechecking pass before opening the PR.

## Security & Configuration Tips
- Keep secrets in `.env` and configure Postgres with `sslmode=verify-full`; never commit credentials.
- Provide Clerk keys (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) and disable them before sharing logs or demos.
- Configure `CLERK_WEBHOOK_SECRET` and point Clerk's user webhooks at `/api/clerk-webhooks`; the route verifies Svix signatures before syncing users.
- After adjusting schemas, regenerate types, apply migrations, and confirm the state in `db:studio`.

## Agent-Specific Notes
- Respect existing uncommitted work, prefer project scripts over ad-hoc tooling, and stay within the workspace sandbox unless approval is granted.
