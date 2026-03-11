/**
 * Database schema for Claude Skill Sync (Drizzle ORM + PostgreSQL)
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
  integer,
} from "drizzle-orm/pg-core";

// =============================================================================
// Users Table
// =============================================================================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  salt: text("salt"),
  encryptedMasterKey: text("encrypted_master_key"),
  recoveryBlob: text("recovery_blob"),
  // X25519 keypair for team key exchange
  publicKey: text("public_key"),
  publicKeyFingerprint: text("public_key_fingerprint"),
  encryptedPrivateKey: text("encrypted_private_key"),
  privateKeyIv: text("private_key_iv"),
  privateKeyTag: text("private_key_tag"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// =============================================================================
// OTP Codes Table
// =============================================================================

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    code: text("code").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    used: boolean("used").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_otp_codes_email").on(table.email)]
);

export type OtpCode = typeof otpCodes.$inferSelect;
export type NewOtpCode = typeof otpCodes.$inferInsert;

// =============================================================================
// Sessions Table
// =============================================================================

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_sessions_user_id").on(table.userId)]
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// =============================================================================
// Blobs Table (Legacy - kept for backward compatibility)
// =============================================================================

export const blobs = pgTable(
  "blobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    encryptedData: text("encrypted_data").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_blobs_user_id").on(table.userId)]
);

export type Blob = typeof blobs.$inferSelect;
export type NewBlob = typeof blobs.$inferInsert;

// =============================================================================
// Skills Table
// =============================================================================

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillKey: text("skill_key").notNull(),
    currentHash: text("current_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_skills_user_skill").on(table.userId, table.skillKey),
    index("idx_skills_user_id").on(table.userId),
  ]
);

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;

// =============================================================================
// Skill Versions Table
// =============================================================================

export const skillVersions = pgTable(
  "skill_versions",
  {
    hash: text("hash").notNull(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    encryptedData: text("encrypted_data").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    parentHash: text("parent_hash"),
    message: text("message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.skillId, table.hash] }),
    index("idx_skill_versions_skill_id").on(table.skillId),
  ]
);

export type SkillVersion = typeof skillVersions.$inferSelect;
export type NewSkillVersion = typeof skillVersions.$inferInsert;

// =============================================================================
// Teams Table
// =============================================================================

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  activeKeyVersion: integer("active_key_version").notNull().default(1),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

// =============================================================================
// Team Members Table
// =============================================================================

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'owner', 'admin', 'editor', 'viewer'
    status: text("status").notNull().default("pending"), // 'pending', 'active'
    // Encrypted team key for this member (encrypted with their public key)
    encryptedTeamKey: text("encrypted_team_key"),
    teamKeyIv: text("team_key_iv"),
    teamKeyTag: text("team_key_tag"),
    ephemeralPublicKey: text("ephemeral_public_key"), // Sender's ephemeral key for decryption
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    index("idx_team_members_user_id").on(table.userId),
  ]
);

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

// =============================================================================
// Team Key Envelopes Table
// =============================================================================

export const teamKeyEnvelopes = pgTable(
  "team_key_envelopes",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    teamKeyVersion: integer("team_key_version").notNull(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wrappedByUserId: uuid("wrapped_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    encryptedTeamKey: text("encrypted_team_key").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    ephemeralPublicKey: text("ephemeral_public_key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.teamId, table.teamKeyVersion, table.recipientUserId],
    }),
    index("idx_team_key_envelopes_recipient").on(table.recipientUserId),
    index("idx_team_key_envelopes_team_version").on(
      table.teamId,
      table.teamKeyVersion
    ),
  ]
);

export type TeamKeyEnvelope = typeof teamKeyEnvelopes.$inferSelect;
export type NewTeamKeyEnvelope = typeof teamKeyEnvelopes.$inferInsert;

// =============================================================================
// Team Invites Table
// =============================================================================

export const teamInvites = pgTable(
  "team_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(), // 'admin', 'editor', 'viewer'
    tokenHash: text("token_hash").notNull(), // SHA-256 hash of invite token
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_team_invites_team_id").on(table.teamId),
    index("idx_team_invites_email").on(table.email),
    index("idx_team_invites_token_hash").on(table.tokenHash),
  ]
);

export type TeamInvite = typeof teamInvites.$inferSelect;
export type NewTeamInvite = typeof teamInvites.$inferInsert;

// =============================================================================
// Team Skills Table (skills shared with a team)
// =============================================================================

export const teamSkills = pgTable(
  "team_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    skillKey: text("skill_key").notNull(),
    currentHash: text("current_hash"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_team_skills_team_skill").on(table.teamId, table.skillKey),
    index("idx_team_skills_team_id").on(table.teamId),
  ]
);

export type TeamSkill = typeof teamSkills.$inferSelect;
export type NewTeamSkill = typeof teamSkills.$inferInsert;

// =============================================================================
// Team Skill Versions Table
// =============================================================================

export const teamSkillVersions = pgTable(
  "team_skill_versions",
  {
    hash: text("hash").notNull(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => teamSkills.id, { onDelete: "cascade" }),
    encryptedData: text("encrypted_data").notNull(), // Encrypted with team key
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    teamKeyVersion: integer("team_key_version").notNull().default(1),
    parentHash: text("parent_hash"),
    message: text("message"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.skillId, table.hash] }),
    index("idx_team_skill_versions_skill_id").on(table.skillId),
  ]
);

export type TeamSkillVersion = typeof teamSkillVersions.$inferSelect;
export type NewTeamSkillVersion = typeof teamSkillVersions.$inferInsert;

// =============================================================================
// Legacy Type Aliases (for backward compatibility with existing code)
// =============================================================================

export type UserRecord = User;
export type OtpCodeRecord = OtpCode;
export type SessionRecord = Session;
export type BlobRecord = Blob;
export type SkillRecord = Skill;
export type SkillVersionRecord = SkillVersion;
export type TeamRecord = Team;
export type TeamMemberRecord = TeamMember;
export type TeamInviteRecord = TeamInvite;
export type TeamSkillRecord = TeamSkill;
export type TeamSkillVersionRecord = TeamSkillVersion;
