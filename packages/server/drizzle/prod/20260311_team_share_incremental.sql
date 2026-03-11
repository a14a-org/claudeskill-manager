ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key_fingerprint text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_private_key text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS private_key_iv text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS private_key_tag text;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS active_key_version integer NOT NULL DEFAULT 1;

ALTER TABLE team_skill_versions ADD COLUMN IF NOT EXISTS team_key_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS team_key_envelopes (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team_key_version integer NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrapped_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_team_key text NOT NULL,
  iv text NOT NULL,
  tag text NOT NULL,
  ephemeral_public_key text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, team_key_version, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_key_envelopes_recipient
  ON team_key_envelopes (recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_team_key_envelopes_team_version
  ON team_key_envelopes (team_id, team_key_version);

INSERT INTO team_key_envelopes (
  team_id,
  team_key_version,
  recipient_user_id,
  wrapped_by_user_id,
  encrypted_team_key,
  iv,
  tag,
  ephemeral_public_key,
  created_at
)
SELECT
  tm.team_id,
  COALESCE(t.active_key_version, 1),
  tm.user_id,
  t.owner_id,
  tm.encrypted_team_key,
  tm.team_key_iv,
  tm.team_key_tag,
  tm.ephemeral_public_key,
  tm.updated_at
FROM team_members tm
JOIN teams t ON t.id = tm.team_id
WHERE
  tm.encrypted_team_key IS NOT NULL
  AND tm.team_key_iv IS NOT NULL
  AND tm.team_key_tag IS NOT NULL
  AND tm.ephemeral_public_key IS NOT NULL
ON CONFLICT (team_id, team_key_version, recipient_user_id) DO NOTHING;
