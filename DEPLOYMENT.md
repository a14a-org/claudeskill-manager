# Coolify Deployment Guide

Deploy Claude Skill Sync server to Coolify.

## Prerequisites

- Coolify instance running
- GitHub repository connected to Coolify
- Domain configured (e.g., `api.claudeskill.io`)

## Step 1: Create New Resource

1. Go to your Coolify dashboard
2. Click **+ Add Resource**
3. Select **Docker Compose**
4. Choose **GitHub** as source
5. Select repository: `a14a-org/claudeskill-manager`
6. Branch: `main`

## Step 2: Configure Build Settings

Set the following in Coolify:

| Setting | Value |
|---------|-------|
| Build Pack | Docker Compose |
| Docker Compose File | `docker-compose.yaml` |
| Base Directory | `/` |

## Step 3: Configure Environment Variables

Add these environment variables in Coolify:

```
# Required
JWT_SECRET=<generate-a-random-64-char-string>

# Email (Resend)
RESEND_API_KEY=<your-resend-api-key>
FROM_EMAIL=noreply@claudeskill.io

# Optional
NODE_ENV=production
PORT=3001
```

### Generate JWT_SECRET

Run this locally to generate a secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Get Resend API Key

1. Go to [resend.com](https://resend.com)
2. Create account / Sign in
3. Go to **API Keys**
4. Create new API key
5. Copy and paste into `RESEND_API_KEY`

## Step 4: Configure Domain

1. In Coolify, go to **Domains**
2. Add your domain: `api.claudeskill.io`
3. Enable **HTTPS** (Let's Encrypt)
4. Set port mapping: `3001`

## Step 5: Configure Persistent Storage

The SQLite database needs persistent storage:

1. Go to **Storages** in Coolify
2. Add a volume:
   - **Name**: `claude-skill-sync-data`
   - **Mount Path**: `/app/data`

## Step 6: Deploy

1. Click **Deploy**
2. Wait for build to complete
3. Check logs for any errors

## Step 7: Verify Deployment

Test the API:

```bash
curl https://api.claudeskill.io/health
```

Expected response:

```json
{"status":"ok"}
```

## Troubleshooting

### Build Fails

Check if Node.js version is correct. The server requires Node 20.6+.

### Database Errors

Ensure the `/app/data` volume is mounted and writable.

### Email Not Sending

1. Verify `RESEND_API_KEY` is set correctly
2. Check that `FROM_EMAIL` domain is verified in Resend
3. Check server logs for email errors

### Connection Refused

1. Check port mapping (should be 3001)
2. Verify domain is pointing to Coolify server
3. Check firewall rules

## Alternative: Dockerfile Only

If you prefer not to use Docker Compose, create a new resource with:

| Setting | Value |
|---------|-------|
| Build Pack | Dockerfile |
| Dockerfile Location | `packages/server/Dockerfile` |
| Base Directory | `/` |

Then configure the same environment variables and storage.

## Updating

To update the deployment:

1. Push changes to `main` branch
2. Coolify will auto-deploy (if enabled) or manually trigger deploy

## Health Checks

Coolify health check configuration:

| Setting | Value |
|---------|-------|
| Health Check Path | `/health` |
| Health Check Port | `3001` |
| Health Check Interval | `30s` |
