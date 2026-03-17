# Coolify Release Checklist

1. Confirm `DATABASE_URL` is set for the API resource.
2. Set `ENABLE_TEAM_SHARING=false`.
3. Back up production Postgres.
4. Run:

```bash
psql "$DATABASE_URL" -f packages/server/drizzle/prod/20260311_team_share_incremental.sql
```

5. Deploy from `docker-compose.yaml`.
6. Verify `/health` and normal personal sync.
7. Set `ENABLE_TEAM_SHARING=true`.
8. Redeploy.
9. Run the two-account smoke test for team create, invite, accept, key distribution, and removal.
10. Publish the CLI update only after the server smoke test passes.
