# @claudeskill/cli

Sync your Claude Code skills across devices with zero-knowledge encryption.

## Quick Start

```bash
# Try without installing
npx @claudeskill/cli

# Or install globally
npm install -g @claudeskill/cli
claudeskill
```

## Features

- **Interactive TUI** - Navigate with arrow keys, no commands to memorize
- **Zero-knowledge encryption** - Your skills are encrypted client-side. The server never sees your content.
- **Cross-device sync** - Access your skills from any device
- **Version history** - Track changes and restore previous versions
- **Self-host option** - Run your own server for complete control

## Interactive Mode

Simply run `claudeskill` to access the interactive menu:

```bash
claudeskill
```

Navigate through options using arrow keys:
- **Status** - Check sync status
- **List** - View all skills with dependency trees
- **Push** - Upload local changes (with preview and confirmation)
- **Pull** - Download from cloud (with preview and confirmation)
- **Login** - Switch account or add device
- **Logout** - Sign out

## Commands

All features are also available as direct commands:

```bash
claudeskill                    # Interactive menu (recommended)
claudeskill status             # Show sync status
claudeskill list               # List all skills
claudeskill list --tree        # Show dependency graph
claudeskill list --tools       # Show tool usage matrix
claudeskill push               # Push local changes to cloud
claudeskill push -m "message"  # Push with commit message
claudeskill pull               # Pull remote changes to local
claudeskill login              # Login to existing account
claudeskill logout             # Logout and clear credentials
```

### Version History

```bash
claudeskill log <skill>                      # Show version history
claudeskill checkout <skill> <hash>          # Restore a specific version
claudeskill diff <skill> <hash1> <hash2>     # Compare two versions
```

## First Run

On first run, you'll be guided through setup:

1. **Choose sync mode** - Cloud (free), self-hosted, or local-only
2. **Enter your email** - Used for authentication (OTP-based, no passwords)
3. **Create a passphrase** - Encrypts your skills locally (never sent to server)
4. **Save your recovery key** - 8-word backup phrase for account recovery

## Adding a Second Device

On additional devices, use the login command:

```bash
claudeskill login
```

Enter your email, verify the OTP code, and use your **existing passphrase** to unlock your vault.

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

## Security

- All encryption happens client-side using AES-256-GCM
- Key derivation uses Argon2id (memory-hard, resistant to GPU attacks)
- Server only stores encrypted blobs - zero knowledge of content
- OTP codes expire after 10 minutes
- Access tokens expire after 1 hour
- Refresh tokens expire after 30 days

## Self-Hosting

Point the CLI to your own server:

```bash
claudeskill
# Choose "Self-hosted" mode
# Enter your server URL: https://skills.example.com
```

See the [main repository](https://github.com/user/claude-skill-sync) for server setup instructions.

## Requirements

- Node.js 18+

## License

MIT

## Learn More

- Documentation: https://claudeskill.io
- GitHub: https://github.com/user/claude-skill-sync
- Report issues: https://github.com/user/claude-skill-sync/issues
