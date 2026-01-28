/**
 * Database connection and queries (Drizzle ORM + PostgreSQL)
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, gt, lt, desc, sql, count } from "drizzle-orm";
import postgres from "postgres";
import {
  users,
  otpCodes,
  sessions,
  blobs,
  skills,
  skillVersions,
  publicSkills,
  type User,
  type OtpCode,
  type Session,
  type Blob,
  type Skill,
  type SkillVersion,
  type PublicSkill,
  type PublicSkillStatus,
} from "./schema.js";

// Re-export types with legacy names for backward compatibility
export type UserRecord = User;
export type OtpCodeRecord = OtpCode;
export type SessionRecord = Session;
export type BlobRecord = Blob;
export type SkillRecord = Skill;
export type SkillVersionRecord = SkillVersion;
export type PublicSkillRecord = PublicSkill;
export type { PublicSkillStatus };

// =============================================================================
// Database Connection
// =============================================================================

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString);
const db = drizzle(client);

/**
 * Get database instance (for compatibility)
 */
export const getDb = () => db;

/**
 * Close database connection
 */
export const closeDb = async (): Promise<void> => {
  await client.end();
};

/**
 * Generate a random ID
 */
export const generateId = (): string => {
  return crypto.randomUUID();
};

// =============================================================================
// User queries
// =============================================================================

export const findUserByEmail = async (
  email: string
): Promise<User | undefined> => {
  const result = await db.select().from(users).where(eq(users.email, email));
  return result[0];
};

export const findUserById = async (id: string): Promise<User | undefined> => {
  const result = await db.select().from(users).where(eq(users.id, id));
  return result[0];
};

export const createUser = async (email: string): Promise<User> => {
  const result = await db.insert(users).values({ email }).returning();
  return result[0]!;
};

export const updateUserSalt = async (
  userId: string,
  salt: string
): Promise<void> => {
  await db
    .update(users)
    .set({ salt, updatedAt: new Date() })
    .where(eq(users.id, userId));
};

export const updateUserRecoveryBlob = async (
  userId: string,
  recoveryBlob: string
): Promise<void> => {
  await db
    .update(users)
    .set({ recoveryBlob, updatedAt: new Date() })
    .where(eq(users.id, userId));
};

export const updateUserEncryptedMasterKey = async (
  userId: string,
  encryptedMasterKey: string
): Promise<void> => {
  await db
    .update(users)
    .set({ encryptedMasterKey, updatedAt: new Date() })
    .where(eq(users.id, userId));
};

export const deleteUser = async (userId: string): Promise<void> => {
  await db.delete(users).where(eq(users.id, userId));
};

// =============================================================================
// OTP queries
// =============================================================================

export const createOtpCode = async (
  email: string,
  code: string
): Promise<OtpCode> => {
  // OTP expires in 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const result = await db
    .insert(otpCodes)
    .values({ email, code, expiresAt })
    .returning();
  return result[0]!;
};

export const findValidOtpCode = async (
  email: string,
  code: string
): Promise<OtpCode | undefined> => {
  const result = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.email, email),
        eq(otpCodes.code, code),
        eq(otpCodes.used, false),
        gt(otpCodes.expiresAt, new Date())
      )
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  return result[0];
};

export const markOtpCodeUsed = async (id: string): Promise<void> => {
  await db.update(otpCodes).set({ used: true }).where(eq(otpCodes.id, id));
};

export const cleanupExpiredOtpCodes = async (): Promise<void> => {
  await db.delete(otpCodes).where(lt(otpCodes.expiresAt, new Date()));
};

// =============================================================================
// Session queries
// =============================================================================

export const createSession = async (
  userId: string,
  refreshTokenHash: string
): Promise<Session> => {
  // Session expires in 30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const result = await db
    .insert(sessions)
    .values({ userId, refreshTokenHash, expiresAt })
    .returning();
  return result[0]!;
};

export const findValidSession = async (
  refreshTokenHash: string
): Promise<(Session & { email: string }) | undefined> => {
  const result = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      refreshTokenHash: sessions.refreshTokenHash,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
      email: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.refreshTokenHash, refreshTokenHash),
        gt(sessions.expiresAt, new Date())
      )
    );
  return result[0];
};

export const deleteSession = async (id: string): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.id, id));
};

export const deleteUserSessions = async (userId: string): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.userId, userId));
};

export const cleanupExpiredSessions = async (): Promise<void> => {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
};

// =============================================================================
// Blob queries
// =============================================================================

export const listUserBlobs = async (
  userId: string
): Promise<Pick<Blob, "id" | "updatedAt">[]> => {
  return db
    .select({ id: blobs.id, updatedAt: blobs.updatedAt })
    .from(blobs)
    .where(eq(blobs.userId, userId))
    .orderBy(desc(blobs.updatedAt));
};

export const findBlobById = async (
  id: string,
  userId: string
): Promise<Blob | undefined> => {
  const result = await db
    .select()
    .from(blobs)
    .where(and(eq(blobs.id, id), eq(blobs.userId, userId)));
  return result[0];
};

export const upsertBlob = async (
  id: string,
  userId: string,
  encryptedData: string,
  iv: string,
  tag: string
): Promise<Blob> => {
  const result = await db
    .insert(blobs)
    .values({ id, userId, encryptedData, iv, tag })
    .onConflictDoUpdate({
      target: blobs.id,
      set: { encryptedData, iv, tag, updatedAt: new Date() },
    })
    .returning();
  return result[0]!;
};

export const deleteBlob = async (
  id: string,
  userId: string
): Promise<boolean> => {
  const result = await db
    .delete(blobs)
    .where(and(eq(blobs.id, id), eq(blobs.userId, userId)))
    .returning({ id: blobs.id });
  return result.length > 0;
};

export const countUserBlobs = async (userId: string): Promise<number> => {
  const result = await db
    .select({ count: count() })
    .from(blobs)
    .where(eq(blobs.userId, userId));
  return result[0]?.count ?? 0;
};

// =============================================================================
// Public stats queries
// =============================================================================

export type PublicStats = {
  totalUsers: number;
  totalSkills: number;
  serverVersion: string;
};

export const getPublicStats = async (): Promise<PublicStats> => {
  const [usersResult, blobsResult] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(blobs),
  ]);

  return {
    totalUsers: usersResult[0]?.count ?? 0,
    totalSkills: blobsResult[0]?.count ?? 0,
    serverVersion: "0.1.0",
  };
};

// =============================================================================
// Skill queries (versioned)
// =============================================================================

export const findSkillByKey = async (
  userId: string,
  skillKey: string
): Promise<Skill | undefined> => {
  const result = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.skillKey, skillKey)));
  return result[0];
};

export const findSkillById = async (
  id: string,
  userId: string
): Promise<Skill | undefined> => {
  const result = await db
    .select()
    .from(skills)
    .where(and(eq(skills.id, id), eq(skills.userId, userId)));
  return result[0];
};

export const listUserSkills = async (
  userId: string
): Promise<Pick<Skill, "id" | "skillKey" | "currentHash" | "updatedAt">[]> => {
  return db
    .select({
      id: skills.id,
      skillKey: skills.skillKey,
      currentHash: skills.currentHash,
      updatedAt: skills.updatedAt,
    })
    .from(skills)
    .where(eq(skills.userId, userId))
    .orderBy(desc(skills.updatedAt));
};

export const createSkill = async (
  userId: string,
  skillKey: string
): Promise<Skill> => {
  const result = await db
    .insert(skills)
    .values({ userId, skillKey })
    .returning();
  return result[0]!;
};

export const updateSkillCurrentHash = async (
  skillId: string,
  hash: string
): Promise<void> => {
  await db
    .update(skills)
    .set({ currentHash: hash, updatedAt: new Date() })
    .where(eq(skills.id, skillId));
};

export const deleteSkill = async (
  id: string,
  userId: string
): Promise<boolean> => {
  const result = await db
    .delete(skills)
    .where(and(eq(skills.id, id), eq(skills.userId, userId)))
    .returning({ id: skills.id });
  return result.length > 0;
};

// =============================================================================
// Skill version queries
// =============================================================================

export const createSkillVersion = async (
  skillId: string,
  hash: string,
  encryptedData: string,
  iv: string,
  tag: string,
  parentHash: string | null,
  message: string | null
): Promise<SkillVersion> => {
  const result = await db
    .insert(skillVersions)
    .values({ skillId, hash, encryptedData, iv, tag, parentHash, message })
    .onConflictDoUpdate({
      target: [skillVersions.skillId, skillVersions.hash],
      set: { encryptedData, iv, tag },
    })
    .returning();
  return result[0]!;
};

export const findSkillVersion = async (
  skillId: string,
  hash: string
): Promise<SkillVersion | undefined> => {
  const result = await db
    .select()
    .from(skillVersions)
    .where(
      and(eq(skillVersions.skillId, skillId), eq(skillVersions.hash, hash))
    );
  return result[0];
};

export const listSkillVersions = async (
  skillId: string,
  limit = 50
): Promise<SkillVersion[]> => {
  return db
    .select()
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skillId))
    .orderBy(desc(skillVersions.createdAt))
    .limit(limit);
};

export const countSkillVersions = async (skillId: string): Promise<number> => {
  const result = await db
    .select({ count: count() })
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skillId));
  return result[0]?.count ?? 0;
};

// =============================================================================
// Public skill queries
// =============================================================================

export const createPublicSkill = async (
  userId: string,
  skillId: string | null,
  slug: string,
  name: string,
  content: string,
  description?: string,
  category?: string,
  tags?: string[],
  files?: Record<string, string>
): Promise<PublicSkill> => {
  const result = await db
    .insert(publicSkills)
    .values({
      userId,
      skillId,
      slug,
      name,
      content,
      description: description ?? null,
      category: category ?? null,
      tags: tags ?? null,
      files: files ?? null,
    })
    .returning();
  return result[0]!;
};

export const findPublicSkillBySlug = async (
  slug: string
): Promise<(PublicSkill & { authorEmail: string }) | undefined> => {
  const result = await db
    .select({
      id: publicSkills.id,
      skillId: publicSkills.skillId,
      userId: publicSkills.userId,
      slug: publicSkills.slug,
      name: publicSkills.name,
      description: publicSkills.description,
      category: publicSkills.category,
      tags: publicSkills.tags,
      content: publicSkills.content,
      files: publicSkills.files,
      status: publicSkills.status,
      reviewedBy: publicSkills.reviewedBy,
      reviewedAt: publicSkills.reviewedAt,
      rejectionReason: publicSkills.rejectionReason,
      downloadCount: publicSkills.downloadCount,
      submittedAt: publicSkills.submittedAt,
      publishedAt: publicSkills.publishedAt,
      updatedAt: publicSkills.updatedAt,
      authorEmail: users.email,
    })
    .from(publicSkills)
    .innerJoin(users, eq(publicSkills.userId, users.id))
    .where(eq(publicSkills.slug, slug));
  return result[0];
};

export const findPublicSkillById = async (
  id: string
): Promise<PublicSkill | undefined> => {
  const result = await db
    .select()
    .from(publicSkills)
    .where(eq(publicSkills.id, id));
  return result[0];
};

export const listApprovedPublicSkills = async (
  limit = 50,
  offset = 0,
  category?: string
): Promise<
  (Pick<
    PublicSkill,
    | "id"
    | "slug"
    | "name"
    | "description"
    | "category"
    | "tags"
    | "downloadCount"
    | "publishedAt"
  > & { authorEmail: string })[]
> => {
  const baseQuery = db
    .select({
      id: publicSkills.id,
      slug: publicSkills.slug,
      name: publicSkills.name,
      description: publicSkills.description,
      category: publicSkills.category,
      tags: publicSkills.tags,
      downloadCount: publicSkills.downloadCount,
      publishedAt: publicSkills.publishedAt,
      authorEmail: users.email,
    })
    .from(publicSkills)
    .innerJoin(users, eq(publicSkills.userId, users.id))
    .where(
      category
        ? and(
            eq(publicSkills.status, "approved"),
            eq(publicSkills.category, category)
          )
        : eq(publicSkills.status, "approved")
    )
    .orderBy(desc(publicSkills.downloadCount))
    .limit(limit)
    .offset(offset);

  return baseQuery;
};

export const listPendingPublicSkills = async (
  limit = 50
): Promise<(PublicSkill & { authorEmail: string })[]> => {
  return db
    .select({
      id: publicSkills.id,
      skillId: publicSkills.skillId,
      userId: publicSkills.userId,
      slug: publicSkills.slug,
      name: publicSkills.name,
      description: publicSkills.description,
      category: publicSkills.category,
      tags: publicSkills.tags,
      content: publicSkills.content,
      files: publicSkills.files,
      status: publicSkills.status,
      reviewedBy: publicSkills.reviewedBy,
      reviewedAt: publicSkills.reviewedAt,
      rejectionReason: publicSkills.rejectionReason,
      downloadCount: publicSkills.downloadCount,
      submittedAt: publicSkills.submittedAt,
      publishedAt: publicSkills.publishedAt,
      updatedAt: publicSkills.updatedAt,
      authorEmail: users.email,
    })
    .from(publicSkills)
    .innerJoin(users, eq(publicSkills.userId, users.id))
    .where(eq(publicSkills.status, "pending"))
    .orderBy(desc(publicSkills.submittedAt))
    .limit(limit);
};

export const listUserPublicSkills = async (
  userId: string
): Promise<PublicSkill[]> => {
  return db
    .select()
    .from(publicSkills)
    .where(eq(publicSkills.userId, userId))
    .orderBy(desc(publicSkills.submittedAt));
};

export const approvePublicSkill = async (
  id: string,
  reviewerId: string
): Promise<PublicSkill | undefined> => {
  const result = await db
    .update(publicSkills)
    .set({
      status: "approved",
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(publicSkills.id, id))
    .returning();
  return result[0];
};

export const rejectPublicSkill = async (
  id: string,
  reviewerId: string,
  reason: string
): Promise<PublicSkill | undefined> => {
  const result = await db
    .update(publicSkills)
    .set({
      status: "rejected",
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      rejectionReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(publicSkills.id, id))
    .returning();
  return result[0];
};

export const incrementPublicSkillDownloads = async (
  id: string
): Promise<void> => {
  await db
    .update(publicSkills)
    .set({
      downloadCount: sql`${publicSkills.downloadCount} + 1`,
    })
    .where(eq(publicSkills.id, id));
};

export const deletePublicSkill = async (
  id: string,
  userId: string
): Promise<boolean> => {
  const result = await db
    .delete(publicSkills)
    .where(and(eq(publicSkills.id, id), eq(publicSkills.userId, userId)))
    .returning({ id: publicSkills.id });
  return result.length > 0;
};

export const countApprovedPublicSkills = async (): Promise<number> => {
  const result = await db
    .select({ count: count() })
    .from(publicSkills)
    .where(eq(publicSkills.status, "approved"));
  return result[0]?.count ?? 0;
};

export const countPendingPublicSkills = async (): Promise<number> => {
  const result = await db
    .select({ count: count() })
    .from(publicSkills)
    .where(eq(publicSkills.status, "pending"));
  return result[0]?.count ?? 0;
};
