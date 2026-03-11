# Production Rollout

Use this sequence when shipping the team-sharing server changes and the CLI update.

## 1. Back up production

Take a verified PostgreSQL backup before applying the migration.

## 2. Apply the incremental migration

```bash
psql "$DATABASE_URL" -f packages/server/drizzle/prod/20260311_team_share_incremental.sql
```

This script is intended for the existing live schema. Do not use the generated Drizzle baseline as your first production migration.

## 3. Deploy the server dark

Set:

```env
ENABLE_TEAM_SHARING=false
```

Then deploy the server.

## 4. Verify existing behavior

Check:
- `GET /health` returns `200`
- login still works
- personal push works
- personal pull works

## 5. Enable team routes

Set:

```env
ENABLE_TEAM_SHARING=true
```

Redeploy the server.

## 6. Smoke test team sharing

Use two internal accounts and verify:
- team create
- invite existing user
- accept invite
- owner distributes team key
- invitee can fetch and decrypt the team key
- owner can remove a member with key rotation payload
- removed member cannot decrypt future writes

## 7. Publish the CLI update

Only publish the CLI after the server migration and smoke test succeed.
