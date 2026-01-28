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
  jsonb,
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
// Public Skills Table (unencrypted, for sharing)
// =============================================================================

export type PublicSkillStatus = "pending" | "approved" | "rejected";

export const publicSkills = pgTable(
  "public_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Reference to the original encrypted skill (nullable - skill can be deleted)
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    // Owner of the skill
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Public metadata (searchable)
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    tags: text("tags").array(),

    // UNENCRYPTED content (this is what makes it public)
    content: text("content").notNull(),
    files: jsonb("files").$type<Record<string, string>>(),

    // Review workflow
    status: text("status").$type<PublicSkillStatus>().notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    rejectionReason: text("rejection_reason"),

    // Stats
    downloadCount: integer("download_count").notNull().default(0),

    // Timestamps
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    publishedAt: timestamp("published_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_public_skills_user_id").on(table.userId),
    index("idx_public_skills_status").on(table.status),
    index("idx_public_skills_category").on(table.category),
  ]
);

export type PublicSkill = typeof publicSkills.$inferSelect;
export type NewPublicSkill = typeof publicSkills.$inferInsert;

// =============================================================================
// Legacy Type Aliases (for backward compatibility with existing code)
// =============================================================================

export type UserRecord = User;
export type OtpCodeRecord = OtpCode;
export type SessionRecord = Session;
export type BlobRecord = Blob;
export type SkillRecord = Skill;
export type SkillVersionRecord = SkillVersion;
export type PublicSkillRecord = PublicSkill;
