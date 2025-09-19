## Overview

Messaging app built with Next.js (App Router + Turbopack), tRPC, Drizzle ORM (Postgres), React Query, Tailwind, and Pusher for real-time updates. Authentication is powered by Clerk with App Router middleware.

## Prerequisites

- Node 18+ and Bun (pnpm/npm also supported)
- PostgreSQL database
- Pusher app (App ID, Key, Secret, Cluster)
- Clerk instance (publishable & secret keys)

## Setup

1) Copy envs and fill values

```bash
cp .env.example .env
# Edit DATABASE_URL, PUSHER_*, CLERK_* values
```

2) Install deps

```bash
bun install
# or: npm install / pnpm install
```

3) Database schema & seed

```bash
bun run db:push       # create tables from schemas
bun run db:generate   # generate migrations (optional)
bun run db:migrate    # run migrations
bun run db:seed      # provision Clerk and local users
bun run db:seed:clerk # provision Clerk-only users
```

The seed script ensures Clerk accounts exist, syncs the corresponding application users, and works with the default demo users (Alice, Bob, Charlie, Diana, Eve). Need to populate Clerk without touching the database? Run `bun run db:seed:clerk`.

### Seeding Tips

- Seeding requires both `DATABASE_URL` and `CLERK_SECRET_KEY`. The scripts will exit early with a helpful message if either is missing.
- `bun run db:seed` idempotently upserts the demo users into Clerk and the local database.
- `bun run db:seed:clerk` is safe to run before provisioning a database—it only creates the users in Clerk.

4) Configure Clerk webhooks

```bash
# Set CLERK_WEBHOOK_SECRET in .env first
# Then register the endpoint inside Clerk Dashboard → Webhooks
# URL will look like: https://your-domain.com/api/clerk-webhooks
```

Default demo accounts:
- alice@example.com / AlicePass123! (username alice)
- bob@example.com / BobPass123! (username bobby)
- charlie@example.com / CharliePass123! (username charlie)
- diana@example.com / DianaPass123! (username diana)
- eve@example.com / EvePass123! (username evee)

## Development

```bash
bun dev         # start Next.js with Turbopack
bun run lint    # Biome check
bun run format  # Biome format (writes changes)
bun run typecheck
```

App URLs:
- http://localhost:3000/sign-in
- http://localhost:3000/

## Production

```bash
bun run build
bun start
```

## Notes

- Real-time messaging runs through Pusher Channels. Create an app in the Pusher dashboard and copy the App ID, Key, Secret, and Cluster into `.env` as `PUSHER_APP_ID`, `NEXT_PUBLIC_PUSHER_APP_KEY`, `PUSHER_SECRET`, and `NEXT_PUBLIC_PUSHER_CLUSTER` respectively.
- When developing on localhost behind a firewall, expose the dev server in a tool such as `ngrok` and add that URL to your Clerk allowed origins for the web UI and Pusher auth callbacks.
- Auth: Clerk handles sessions; middleware enforces access and tRPC resolves Clerk identities to database rows automatically.
- DB: Drizzle schemas live in `src/server/db/schemas`. Use `db:push`/`db:migrate` after changes.
- Webhooks: Clerk sends user lifecycle events to `/api/clerk-webhooks`; set `CLERK_WEBHOOK_SECRET` and enable the user created/updated/deleted events in the Clerk dashboard.
