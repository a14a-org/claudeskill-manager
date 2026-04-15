# Claude Skill Manager

Monorepo for claudeskill.io — a service for syncing Claude Code skills across devices with zero-knowledge encryption.

## Stack

- **Runtime**: Bun 1.3.9
- **Language**: TypeScript
- **Monorepo**: Bun workspaces + Turborepo
- **Server**: Hono (packages/server) with Drizzle ORM + PostgreSQL
- **CLI**: Node.js CLI published as @claudeskill/cli (packages/cli)
- **Core**: Shared crypto and skill logic (packages/core)
- **Linter/Formatter**: Biome
- **Git hooks**: Lefthook

## Packages

- `packages/server` — Hono API server (port 3001), handles auth (JWT + OTP via Resend), blob storage, skills, teams, admin
- `packages/cli` — Interactive CLI for syncing skills, login, push/pull, team management
- `packages/core` — Zero-knowledge encryption (X25519 + AES-GCM), skill parsing and serialization

## Commands

```bash
bun install          # install dependencies
bun run build        # build all packages (turbo)
bun run dev          # dev mode all packages (turbo)
bun run dev:server   # dev server only
bun run lint         # biome check
bun run lint:fix     # biome check --fix
bun run format       # biome format --write
bun run typecheck    # typecheck all packages (turbo)
bun run test         # run tests (turbo)
```

## Database

PostgreSQL via Drizzle ORM. Migrations in `packages/server/drizzle/`.

```bash
cd packages/server
bun run db:generate  # generate migration
bun run db:migrate   # run migrations
bun run db:push      # push schema directly
bun run db:studio    # open drizzle studio
```

## Environment

Copy `.env.example` to `.env`. Key variables: DATABASE_URL, JWT_SECRET, RESEND_API_KEY, ADMIN_EMAILS.

## Conventions

- Biome for linting and formatting (tabs, double quotes, semicolons)
- Commit format: `type: lowercase present tense description`
- Branch naming: `feat/`, `fix/`, `chore/` + kebab-case
