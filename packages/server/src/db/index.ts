/**
 * Database connection and queries (Drizzle ORM + PostgreSQL)
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, gt, lt, desc, sql, count } from "drizzle-orm";
import postgres from "postgres";
import { createHash } from "node:crypto";
import {
  users,
  otpCodes,
  sessions,
  blobs,
  skills,
  skillVersions,
  publicSkills,
  teams,
  teamMembers,
  teamKeyEnvelopes,
  teamInvites,
  teamSkills,
  teamSkillVersions,
  type User,
  type OtpCode,
  type Session,
  type Blob,
  type Skill,
  type SkillVersion,
  type PublicSkill,
  type PublicSkillStatus,
  type Team,
  type TeamMember,
  type TeamKeyEnvelope,
  type TeamInvite,
  type TeamSkill,
  type TeamSkillVersion,
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
export type TeamRecord = Team;
export type TeamMemberRecord = TeamMember;
export type TeamKeyEnvelopeRecord = TeamKeyEnvelope;
export type TeamInviteRecord = TeamInvite;
export type TeamSkillRecord = TeamSkill;
export type TeamSkillVersionRecord = TeamSkillVersion;

// =============================================================================
// Database Connection
// =============================================================================

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString);
const db = drizzle(client);

const computePublicKeyFingerprint = (publicKey: string): string => {
  const digest = createHash("sha256")
    .update(Buffer.from(publicKey, "base64"))
    .digest("hex")
    .slice(0, 32);
  return digest.match(/.{1,4}/g)?.join("-") ?? digest;
};

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

// =============================================================================
// User keypair queries
// =============================================================================

export const updateUserPublicKey = async (
  userId: string,
  publicKey: string,
  encryptedPrivateKey: string,
  privateKeyIv: string,
  privateKeyTag: string
): Promise<void> => {
  const publicKeyFingerprint = computePublicKeyFingerprint(publicKey);

  await db
    .update(users)
    .set({
      publicKey,
      publicKeyFingerprint,
      encryptedPrivateKey,
      privateKeyIv,
      privateKeyTag,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
};

export const getUserPublicKey = async (
  userId: string
): Promise<{ publicKey: string; publicKeyFingerprint: string | null } | undefined> => {
  const result = await db
    .select({
      publicKey: users.publicKey,
      publicKeyFingerprint: users.publicKeyFingerprint,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!result[0]?.publicKey) return undefined;
  return {
    publicKey: result[0].publicKey,
    publicKeyFingerprint: result[0].publicKeyFingerprint,
  };
};

export const getUserKeyPair = async (
  userId: string
): Promise<{
  publicKey: string;
  publicKeyFingerprint: string | null;
  encryptedPrivateKey: string;
  privateKeyIv: string;
  privateKeyTag: string;
} | null> => {
  const result = await db
    .select({
      publicKey: users.publicKey,
      publicKeyFingerprint: users.publicKeyFingerprint,
      encryptedPrivateKey: users.encryptedPrivateKey,
      privateKeyIv: users.privateKeyIv,
      privateKeyTag: users.privateKeyTag,
    })
    .from(users)
    .where(eq(users.id, userId));

  const row = result[0];
  if (
    !row?.publicKey ||
    !row?.encryptedPrivateKey ||
    !row?.privateKeyIv ||
    !row?.privateKeyTag
  ) {
    return null;
  }

  return {
    publicKey: row.publicKey,
    publicKeyFingerprint: row.publicKeyFingerprint,
    encryptedPrivateKey: row.encryptedPrivateKey,
    privateKeyIv: row.privateKeyIv,
    privateKeyTag: row.privateKeyTag,
  };
};

// =============================================================================
// Team queries
// =============================================================================

export const createTeam = async (
  name: string,
  ownerId: string
): Promise<Team> => {
  const result = await db
    .insert(teams)
    .values({ name, ownerId })
    .returning();
  return result[0]!;
};

export const findTeamById = async (id: string): Promise<Team | undefined> => {
  const result = await db.select().from(teams).where(eq(teams.id, id));
  return result[0];
};

export const updateTeamName = async (
  teamId: string,
  name: string
): Promise<void> => {
  await db
    .update(teams)
    .set({ name, updatedAt: new Date() })
    .where(eq(teams.id, teamId));
};

export const deleteTeam = async (teamId: string): Promise<boolean> => {
  const result = await db
    .delete(teams)
    .where(eq(teams.id, teamId))
    .returning({ id: teams.id });
  return result.length > 0;
};

export type TeamWithMemberInfo = Team & {
  role: string;
  status: string;
  memberCount: number;
  skillCount: number;
  activeKeyVersion: number;
};

export const listUserTeams = async (
  userId: string
): Promise<TeamWithMemberInfo[]> => {
  // Get teams the user is a member of
  const memberTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
      activeKeyVersion: teams.activeKeyVersion,
      ownerId: teams.ownerId,
      createdAt: teams.createdAt,
      updatedAt: teams.updatedAt,
      role: teamMembers.role,
      status: teamMembers.status,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, userId));

  // Get member counts and skill counts for each team
  const result: TeamWithMemberInfo[] = [];
  for (const team of memberTeams) {
    const [memberCountResult, skillCountResult] = await Promise.all([
      db
        .select({ count: count() })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, team.id)),
      db
        .select({ count: count() })
        .from(teamSkills)
        .where(eq(teamSkills.teamId, team.id)),
    ]);

    result.push({
      ...team,
      memberCount: memberCountResult[0]?.count ?? 0,
      skillCount: skillCountResult[0]?.count ?? 0,
    });
  }

  return result;
};

// =============================================================================
// Team member queries
// =============================================================================

export const addTeamMember = async (
  teamId: string,
  userId: string,
  role: string,
  status: string = "pending"
): Promise<TeamMember> => {
  const result = await db
    .insert(teamMembers)
    .values({ teamId, userId, role, status })
    .returning();
  return result[0]!;
};

export const findTeamMember = async (
  teamId: string,
  userId: string
): Promise<TeamMember | undefined> => {
  const result = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return result[0];
};

export const updateTeamMemberStatus = async (
  teamId: string,
  userId: string,
  status: string
): Promise<void> => {
  await db
    .update(teamMembers)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
};

export const updateTeamMemberRole = async (
  teamId: string,
  userId: string,
  role: string
): Promise<void> => {
  await db
    .update(teamMembers)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
};

export const setTeamMemberKey = async (
  teamId: string,
  userId: string,
  encryptedTeamKey: string,
  teamKeyIv: string,
  teamKeyTag: string,
  ephemeralPublicKey: string,
  teamKeyVersion: number,
  wrappedByUserId: string
): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx
      .insert(teamKeyEnvelopes)
      .values({
        teamId,
        teamKeyVersion,
        recipientUserId: userId,
        wrappedByUserId,
        encryptedTeamKey,
        iv: teamKeyIv,
        tag: teamKeyTag,
        ephemeralPublicKey,
      })
      .onConflictDoUpdate({
        target: [
          teamKeyEnvelopes.teamId,
          teamKeyEnvelopes.teamKeyVersion,
          teamKeyEnvelopes.recipientUserId,
        ],
        set: {
          wrappedByUserId,
          encryptedTeamKey,
          iv: teamKeyIv,
          tag: teamKeyTag,
          ephemeralPublicKey,
          createdAt: new Date(),
        },
      });

    await tx
      .update(teamMembers)
      .set({
        encryptedTeamKey,
        teamKeyIv,
        teamKeyTag,
        ephemeralPublicKey,
        status: "active",
        updatedAt: new Date(),
      })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  });
};

export const removeTeamMember = async (
  teamId: string,
  userId: string
): Promise<boolean> => {
  const result = await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .returning({ teamId: teamMembers.teamId });
  return result.length > 0;
};

export const getTeamActiveKeyVersion = async (
  teamId: string
): Promise<number | null> => {
  const result = await db
    .select({ activeKeyVersion: teams.activeKeyVersion })
    .from(teams)
    .where(eq(teams.id, teamId));
  return result[0]?.activeKeyVersion ?? null;
};

export type TeamEnvelopeInput = {
  recipientUserId: string;
  encryptedTeamKey: string;
  iv: string;
  tag: string;
  ephemeralPublicKey: string;
};

export const rotateTeamKeyAndRemoveMember = async (
  teamId: string,
  removedUserId: string,
  nextTeamKeyVersion: number,
  wrappedByUserId: string,
  envelopes: TeamEnvelopeInput[]
): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx
      .delete(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, removedUserId))
      );

    await tx
      .update(teams)
      .set({ activeKeyVersion: nextTeamKeyVersion, updatedAt: new Date() })
      .where(eq(teams.id, teamId));

    for (const envelope of envelopes) {
      await tx
        .insert(teamKeyEnvelopes)
        .values({
          teamId,
          teamKeyVersion: nextTeamKeyVersion,
          recipientUserId: envelope.recipientUserId,
          wrappedByUserId,
          encryptedTeamKey: envelope.encryptedTeamKey,
          iv: envelope.iv,
          tag: envelope.tag,
          ephemeralPublicKey: envelope.ephemeralPublicKey,
        })
        .onConflictDoUpdate({
          target: [
            teamKeyEnvelopes.teamId,
            teamKeyEnvelopes.teamKeyVersion,
            teamKeyEnvelopes.recipientUserId,
          ],
          set: {
            wrappedByUserId,
            encryptedTeamKey: envelope.encryptedTeamKey,
            iv: envelope.iv,
            tag: envelope.tag,
            ephemeralPublicKey: envelope.ephemeralPublicKey,
            createdAt: new Date(),
          },
        });

      await tx
        .update(teamMembers)
        .set({
          encryptedTeamKey: envelope.encryptedTeamKey,
          teamKeyIv: envelope.iv,
          teamKeyTag: envelope.tag,
          ephemeralPublicKey: envelope.ephemeralPublicKey,
          status: "active",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.userId, envelope.recipientUserId)
          )
        );
    }
  });
};

export type TeamMemberWithEmail = TeamMember & { email: string };

export const listTeamMembers = async (
  teamId: string
): Promise<TeamMemberWithEmail[]> => {
  const result = await db
    .select({
      teamId: teamMembers.teamId,
      userId: teamMembers.userId,
      role: teamMembers.role,
      status: teamMembers.status,
      encryptedTeamKey: teamMembers.encryptedTeamKey,
      teamKeyIv: teamMembers.teamKeyIv,
      teamKeyTag: teamMembers.teamKeyTag,
      ephemeralPublicKey: teamMembers.ephemeralPublicKey,
      createdAt: teamMembers.createdAt,
      updatedAt: teamMembers.updatedAt,
      email: users.email,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));
  return result;
};

export const getActiveTeamKeyEnvelopeForMember = async (
  teamId: string,
  userId: string
): Promise<
  | {
      encryptedTeamKey: string;
      iv: string;
      tag: string;
      ephemeralPublicKey: string;
      teamKeyVersion: number;
    }
  | null
> => {
  const activeKeyVersion = await getTeamActiveKeyVersion(teamId);
  if (!activeKeyVersion) {
    return null;
  }

  const result = await db
    .select({
      encryptedTeamKey: teamKeyEnvelopes.encryptedTeamKey,
      iv: teamKeyEnvelopes.iv,
      tag: teamKeyEnvelopes.tag,
      ephemeralPublicKey: teamKeyEnvelopes.ephemeralPublicKey,
      teamKeyVersion: teamKeyEnvelopes.teamKeyVersion,
    })
    .from(teamKeyEnvelopes)
    .where(
      and(
        eq(teamKeyEnvelopes.teamId, teamId),
        eq(teamKeyEnvelopes.teamKeyVersion, activeKeyVersion),
        eq(teamKeyEnvelopes.recipientUserId, userId)
      )
    );

  return result[0] ?? null;
};

export const listPendingTeamMembers = async (
  teamId: string
): Promise<TeamMemberWithEmail[]> => {
  const result = await db
    .select({
      teamId: teamMembers.teamId,
      userId: teamMembers.userId,
      role: teamMembers.role,
      status: teamMembers.status,
      encryptedTeamKey: teamMembers.encryptedTeamKey,
      teamKeyIv: teamMembers.teamKeyIv,
      teamKeyTag: teamMembers.teamKeyTag,
      ephemeralPublicKey: teamMembers.ephemeralPublicKey,
      createdAt: teamMembers.createdAt,
      updatedAt: teamMembers.updatedAt,
      email: users.email,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(
      and(eq(teamMembers.teamId, teamId), eq(teamMembers.status, "pending"))
    );
  return result;
};

// Get pending members across all teams where user is owner/admin
export const listAllPendingMembersForUser = async (
  userId: string
): Promise<
  (TeamMemberWithEmail & {
    teamName: string;
    memberPublicKey: string | null;
    memberPublicKeyFingerprint: string | null;
  })[]
> => {
  // First get teams where user is an active owner.
  const userTeams = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.status, "active"),
        eq(teamMembers.role, "owner")
      )
    );

  const result: (TeamMemberWithEmail & {
    teamName: string;
    memberPublicKey: string | null;
    memberPublicKeyFingerprint: string | null;
  })[] = [];

  for (const { teamId } of userTeams) {
    // Check if user still has permission (owner only).
    const membership = await findTeamMember(teamId, userId);
    if (!membership || membership.role !== "owner") {
      continue;
    }

    const team = await findTeamById(teamId);
    if (!team) continue;

    const pendingMembers = await db
      .select({
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        role: teamMembers.role,
        status: teamMembers.status,
        encryptedTeamKey: teamMembers.encryptedTeamKey,
        teamKeyIv: teamMembers.teamKeyIv,
        teamKeyTag: teamMembers.teamKeyTag,
        ephemeralPublicKey: teamMembers.ephemeralPublicKey,
        createdAt: teamMembers.createdAt,
        updatedAt: teamMembers.updatedAt,
        email: users.email,
        memberPublicKey: users.publicKey,
        memberPublicKeyFingerprint: users.publicKeyFingerprint,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.status, "pending"))
      );

    for (const member of pendingMembers) {
      result.push({
        ...member,
        teamName: team.name,
      });
    }
  }

  return result;
};

// =============================================================================
// Team invite queries
// =============================================================================

export const createTeamInvite = async (
  teamId: string,
  email: string,
  role: string,
  tokenHash: string,
  createdBy: string,
  expiresInHours: number = 72
): Promise<TeamInvite> => {
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  const result = await db
    .insert(teamInvites)
    .values({ teamId, email, role, tokenHash, createdBy, expiresAt })
    .returning();
  return result[0]!;
};

export const findTeamInviteByTokenHash = async (
  tokenHash: string
): Promise<(TeamInvite & { teamName: string }) | undefined> => {
  const result = await db
    .select({
      id: teamInvites.id,
      teamId: teamInvites.teamId,
      email: teamInvites.email,
      role: teamInvites.role,
      tokenHash: teamInvites.tokenHash,
      expiresAt: teamInvites.expiresAt,
      usedAt: teamInvites.usedAt,
      createdBy: teamInvites.createdBy,
      createdAt: teamInvites.createdAt,
      teamName: teams.name,
    })
    .from(teamInvites)
    .innerJoin(teams, eq(teamInvites.teamId, teams.id))
    .where(eq(teamInvites.tokenHash, tokenHash));
  return result[0];
};

export const findValidTeamInvite = async (
  tokenHash: string
): Promise<(TeamInvite & { teamName: string }) | undefined> => {
  const result = await db
    .select({
      id: teamInvites.id,
      teamId: teamInvites.teamId,
      email: teamInvites.email,
      role: teamInvites.role,
      tokenHash: teamInvites.tokenHash,
      expiresAt: teamInvites.expiresAt,
      usedAt: teamInvites.usedAt,
      createdBy: teamInvites.createdBy,
      createdAt: teamInvites.createdAt,
      teamName: teams.name,
    })
    .from(teamInvites)
    .innerJoin(teams, eq(teamInvites.teamId, teams.id))
    .where(
      and(
        eq(teamInvites.tokenHash, tokenHash),
        gt(teamInvites.expiresAt, new Date()),
        sql`${teamInvites.usedAt} IS NULL`
      )
    );
  return result[0];
};

export const markTeamInviteUsed = async (inviteId: string): Promise<void> => {
  await db
    .update(teamInvites)
    .set({ usedAt: new Date() })
    .where(eq(teamInvites.id, inviteId));
};

export const listTeamInvites = async (
  teamId: string
): Promise<TeamInvite[]> => {
  return db
    .select()
    .from(teamInvites)
    .where(eq(teamInvites.teamId, teamId))
    .orderBy(desc(teamInvites.createdAt));
};

export const listPendingInvitesForEmail = async (
  email: string
): Promise<(TeamInvite & { teamName: string })[]> => {
  return db
    .select({
      id: teamInvites.id,
      teamId: teamInvites.teamId,
      email: teamInvites.email,
      role: teamInvites.role,
      tokenHash: teamInvites.tokenHash,
      expiresAt: teamInvites.expiresAt,
      usedAt: teamInvites.usedAt,
      createdBy: teamInvites.createdBy,
      createdAt: teamInvites.createdAt,
      teamName: teams.name,
    })
    .from(teamInvites)
    .innerJoin(teams, eq(teamInvites.teamId, teams.id))
    .where(
      and(
        eq(teamInvites.email, email),
        gt(teamInvites.expiresAt, new Date()),
        sql`${teamInvites.usedAt} IS NULL`
      )
    )
    .orderBy(desc(teamInvites.createdAt));
};

export const deleteTeamInvite = async (inviteId: string): Promise<boolean> => {
  const result = await db
    .delete(teamInvites)
    .where(eq(teamInvites.id, inviteId))
    .returning({ id: teamInvites.id });
  return result.length > 0;
};

export const cleanupExpiredTeamInvites = async (): Promise<void> => {
  await db.delete(teamInvites).where(lt(teamInvites.expiresAt, new Date()));
};

// =============================================================================
// Team skill queries
// =============================================================================

export const createTeamSkill = async (
  teamId: string,
  skillKey: string,
  createdBy: string
): Promise<TeamSkill> => {
  const result = await db
    .insert(teamSkills)
    .values({ teamId, skillKey, createdBy })
    .returning();
  return result[0]!;
};

export const findTeamSkillByKey = async (
  teamId: string,
  skillKey: string
): Promise<TeamSkill | undefined> => {
  const result = await db
    .select()
    .from(teamSkills)
    .where(
      and(eq(teamSkills.teamId, teamId), eq(teamSkills.skillKey, skillKey))
    );
  return result[0];
};

export const listTeamSkills = async (
  teamId: string
): Promise<Pick<TeamSkill, "id" | "skillKey" | "currentHash" | "updatedAt">[]> => {
  return db
    .select({
      id: teamSkills.id,
      skillKey: teamSkills.skillKey,
      currentHash: teamSkills.currentHash,
      updatedAt: teamSkills.updatedAt,
    })
    .from(teamSkills)
    .where(eq(teamSkills.teamId, teamId))
    .orderBy(desc(teamSkills.updatedAt));
};

export const updateTeamSkillCurrentHash = async (
  skillId: string,
  hash: string
): Promise<void> => {
  await db
    .update(teamSkills)
    .set({ currentHash: hash, updatedAt: new Date() })
    .where(eq(teamSkills.id, skillId));
};

export const deleteTeamSkill = async (skillId: string): Promise<boolean> => {
  const result = await db
    .delete(teamSkills)
    .where(eq(teamSkills.id, skillId))
    .returning({ id: teamSkills.id });
  return result.length > 0;
};

// =============================================================================
// Team skill version queries
// =============================================================================

export const createTeamSkillVersion = async (
  skillId: string,
  hash: string,
  encryptedData: string,
  iv: string,
  tag: string,
  teamKeyVersion: number,
  parentHash: string | null,
  message: string | null,
  createdBy: string
): Promise<TeamSkillVersion> => {
  const result = await db
    .insert(teamSkillVersions)
    .values({
      skillId,
      hash,
      encryptedData,
      iv,
      tag,
      teamKeyVersion,
      parentHash,
      message,
      createdBy,
    })
    .onConflictDoUpdate({
      target: [teamSkillVersions.skillId, teamSkillVersions.hash],
      set: { encryptedData, iv, tag },
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

export const countUserPendingPublicSkills = async (
  userId: string
): Promise<number> => {
  const result = await db
    .select({ count: count() })
    .from(publicSkills)
    .where(
      and(eq(publicSkills.userId, userId), eq(publicSkills.status, "pending"))
    );
  return result[0]?.count ?? 0;
};

export const countPendingPublicSkills = async (): Promise<number> => {
  const result = await db
    .select({ count: count() })
    .from(publicSkills)
    .where(eq(publicSkills.status, "pending"));
  return result[0]?.count ?? 0;
};

export const findTeamSkillVersion = async (
  skillId: string,
  hash: string
): Promise<TeamSkillVersion | undefined> => {
  const result = await db
    .select()
    .from(teamSkillVersions)
    .where(
      and(
        eq(teamSkillVersions.skillId, skillId),
        eq(teamSkillVersions.hash, hash)
      )
    );
  return result[0];
};

export const listTeamSkillVersions = async (
  skillId: string,
  limit = 50
): Promise<TeamSkillVersion[]> => {
  return db
    .select()
    .from(teamSkillVersions)
    .where(eq(teamSkillVersions.skillId, skillId))
    .orderBy(desc(teamSkillVersions.createdAt))
    .limit(limit);
};
