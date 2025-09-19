# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` / `bun dev` - Start the development server with Turbopack
- `npm run build` / `bun run build` - Build the production application
- `npm run start` / `bun start` - Start the production server
- `npm run lint` / `bun run lint` - Run Biome linter checks
- `npm run format` / `bun run format` - Format code using Biome
- `npm run typecheck` / `bun run typecheck` - Run TypeScript type checking

### Database Commands

- `npm run db:push` / `bun run db:push` - Push schema changes to database (development)
- `npm run db:generate` / `bun run db:generate` - Generate migrations from schema changes
- `npm run db:migrate` / `bun run db:migrate` - Run pending migrations
- `npm run db:studio` / `bun run db:studio` - Open Drizzle Studio for database inspection
- `npm run db:seed` / `bun run db:seed` - Seed database with demo users (creates Clerk accounts + DB records)
- `npm run db:seed:clerk` / `bun run db:seed:clerk` - Create Clerk demo accounts only

## Application Architecture

This is a real-time messaging application built with Next.js 15, featuring threaded conversations with live updates. The stack includes:

### Frontend Architecture
- **Framework**: Next.js 15.5.2 with App Router and Turbopack
- **Authentication**: Clerk with middleware protection on `/` route
- **Styling**: TailwindCSS v4 + shadcn/ui components (New York style)
- **Real-time**: Pusher Channels for live messages and typing indicators
- **State Management**: TanStack Query with tRPC for server state
- **UI Components**: Radix UI primitives with custom styling

### Backend Architecture
- **API Layer**: tRPC v11 with three main routers (`users`, `threads`, `messages`)
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: Pusher server-side integration for broadcasting events
- **Webhooks**: Clerk webhooks for user lifecycle management (`/api/clerk-webhooks`)
- **Authentication**: Session-based access control via Clerk middleware

### Database Schema
Core entities with relations:
- **Users**: Clerk integration with `clerkId`, `username`, `email`
- **Threads**: Conversation containers with `title`, timestamps
- **Messages**: Content with `text`, `authorId`, `threadId`, timestamps
- **ThreadParticipants**: Many-to-many relationship between users and threads

Schema files located in `src/server/db/schemas/` with centralized exports.

## Key Integrations

### Clerk Authentication
- Middleware protects `/` route and sub-routes
- Webhook endpoint syncs user lifecycle events to local database
- Session context available in tRPC procedures for user identification

### Pusher Real-time Features
- Live message delivery to thread participants
- Server-side auth for channel access guards

### shadcn/ui Components
- Configured for New York style with neutral base color
- CSS variables enabled for theming
- Components use Lucide React icons

## Environment Setup

Required environment variables:
```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/database"

# Pusher Configuration
PUSHER_APP_ID=your_pusher_app_id
PUSHER_SECRET=your_pusher_secret
NEXT_PUBLIC_PUSHER_APP_KEY=your_pusher_key
NEXT_PUBLIC_PUSHER_CLUSTER=your_pusher_cluster

# Clerk Configuration
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_WEBHOOK_SECRET=whsec_your_webhook_secret
```

## Development Workflow

1. **Initial Setup**: Copy `.env.example` to `.env` and configure all services
2. **Database**: Run `db:push` to create tables, then `db:seed` for demo data
3. **Webhooks**: Configure Clerk webhook endpoint in dashboard pointing to `/api/clerk-webhooks`
4. **Demo Users**: Five pre-configured accounts (alice, bob, charlie, diana, eve) with credentials in README

## Code Conventions

- **TypeScript**: Strict mode with path aliases (`@/*` → `./src/*`)
- **Linting**: Biome with custom rules (no explicit any, unused imports/variables as errors)
- **Components**: Functional components with hooks, following shadcn/ui patterns
- **Database**: Drizzle schema-first approach with typed relations
- **API**: tRPC procedures with Zod validation and session context
