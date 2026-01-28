# Claude Skill Sync

Sync your Claude Code skills across devices with zero-knowledge encryption.

## Features

- **Zero-knowledge encryption** - Your skills are encrypted client-side. The server never sees your content.
- **Cross-device sync** - Access your skills from any device
- **Self-host option** - Run your own server for complete control
- **Simple CLI** - Easy to use command-line interface

## Quick Start

### Using the CLI

```bash
# Install globally
npm install -g @claudeskill/cli

# Run setup
claudeskill

# Or try without installing
npx @claudeskill/cli
```

### CLI Commands

```bash
claudeskill                    # Interactive menu (recommended)
claudeskill status             # Show sync status
claudeskill list               # List all skills
claudeskill list --tree        # Show dependency graph
claudeskill push               # Push local skills to cloud
claudeskill pull               # Pull skills from cloud
claudeskill login              # Login to existing account
claudeskill logout             # Logout and clear credentials
claudeskill --help             # Show all commands
```

## Development Setup

### Prerequisites

- Node.js 20.6+ (for server, uses --env-file flag)
- Node.js 18+ (for CLI only)
- Yarn

### Install Dependencies

```bash
yarn install
```

### Build All Packages

```bash
yarn build
```

### Run in Development

```bash
# Terminal 1: Start the server
cp .env.example .env
# Edit .env with your settings
yarn dev:server

# Terminal 2: Run the CLI
yarn dev:cli
```

## Project Structure

```
claude-skill-sync/
├── packages/
│   ├── core/           # Shared encryption & skill parsing
│   ├── cli/            # Command-line interface
│   └── server/         # API server
├── .env.example        # Environment variables template
├── docker-compose.yml  # Self-hosting setup
└── PLAN.md            # Architecture documentation
```

## Self-Hosting

### With Docker

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env - set JWT_SECRET and optionally RESEND_API_KEY

# Start the server
docker-compose up -d
```

### Manual Setup

```bash
# Build
yarn install
yarn build

# Configure
cp .env.example .env
# Edit .env with your settings

# Run
node packages/server/dist/index.js
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3001) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `RESEND_API_KEY` | No | Resend API key for OTP emails. Leave empty in dev (codes logged to console) |
| `FROM_EMAIL` | No | From address for emails (default: noreply@claudeskill.io) |
| `ADMIN_EMAILS` | No | Comma-separated list of admin emails for reviewing public skills |

## How It Works

### Encryption

1. You create a **passphrase** (never sent to server)
2. A **master key** is generated and encrypted with your passphrase
3. Your skills are encrypted with the master key using AES-256-GCM
4. Only encrypted blobs are stored on the server

### Authentication

1. Enter your email
2. Receive a 6-digit OTP code
3. Verify the code to get access tokens
4. No passwords stored - just email + encryption passphrase

### Recovery

- A **recovery key** (8 words) is generated during setup
- Store it safely - it's the only way to recover if you forget your passphrase
- We cannot recover your data without it

## API Endpoints

### Authentication

```
POST /auth/otp/request    Request OTP code
POST /auth/otp/verify     Verify OTP and get tokens
POST /auth/refresh        Refresh access token
POST /auth/logout         Invalidate refresh token
```

### Blobs (Encrypted Skills)

```
GET    /blobs             List all blobs
GET    /blobs/:id         Get a blob
POST   /blobs             Create a blob
PUT    /blobs/:id         Update a blob
DELETE /blobs/:id         Delete a blob
```

### Skills (Versioned)

```
GET    /skills                       List all skills
GET    /skills/:skillKey             Get current version of a skill
POST   /skills/:skillKey/versions    Push a new version
GET    /skills/:skillKey/versions    Get version history
DELETE /skills/:skillKey             Delete skill and all versions
```

### Public Skills

Share skills publicly with the community (content is stored unencrypted).

```
# Public endpoints (no auth required)
GET    /public/skills             List approved public skills
GET    /public/skills/:slug       Get a public skill by slug

# Authenticated endpoints
POST   /skills/:key/publish       Submit skill for review
GET    /skills/public             List your public skills (all statuses)
DELETE /skills/public/:id         Unpublish a skill
```

### Admin (Review Workflow)

Admin users (configured via `ADMIN_EMAILS` env var) can approve/reject submissions.

```
GET    /admin/stats               Get pending/approved counts
GET    /admin/pending             List skills pending review
GET    /admin/pending/:id         Get single pending skill
POST   /admin/skills/:id/approve  Approve a skill
POST   /admin/skills/:id/reject   Reject with reason
```

### Account

```
GET    /account           Get account info
GET    /account/salt      Get salt for key derivation
PUT    /account/salt      Set salt (first time)
GET    /account/recovery  Get recovery blob
PUT    /account/recovery  Set recovery blob
DELETE /account           Delete account and all data
```

## Public Skills

Share your skills with the community through our public skills directory.

### How It Works

1. **Publish**: Users submit skills for review via the dashboard or API
2. **Review**: Admins review submissions for quality and security
3. **Approve/Reject**: Approved skills appear in the public directory
4. **Install**: Anyone can install public skills via the CLI

### Publishing Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  User clicks    │     │  Passphrase     │     │  Decrypt skill  │
│  "Publish"      │ ──▶ │  Modal opens    │ ──▶ │  locally in     │
│                 │     │                 │     │  browser        │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Shows in       │     │  Admin reviews  │     │  Send PLAIN     │
│  public dir     │ ◀── │  & approves     │ ◀── │  content to API │
│  (if approved)  │     │                 │     │  (status=pending)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Important Notes

- **Public skills are NOT encrypted** - content is stored in plaintext
- Users must explicitly choose to publish (requires passphrase entry)
- All submissions go through manual review before becoming visible
- Authors can unpublish their skills at any time

## Security

- All encryption happens client-side using AES-256-GCM
- Key derivation uses Argon2id (memory-hard, resistant to GPU attacks)
- Server only stores encrypted blobs - zero knowledge of content
- OTP codes expire after 10 minutes
- Access tokens expire after 1 hour
- Refresh tokens expire after 30 days

## License

MIT
