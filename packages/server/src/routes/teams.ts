/**
 * Team routes for managing teams, members, invites, and team skills
 */

import { Hono } from "hono";
import { authMiddleware, getUser } from "../middleware.js";
import { hashToken, generateToken } from "../auth.js";
import {
  // Team queries
  createTeam,
  findTeamById,
  updateTeamName,
  deleteTeam,
  listUserTeams,
  // Member queries
  addTeamMember,
  findTeamMember,
  updateTeamMemberRole,
  setTeamMemberKey,
  removeTeamMember,
  rotateTeamKeyAndRemoveMember,
  listTeamMembers,
  listPendingTeamMembers,
  listAllPendingMembersForUser,
  getTeamActiveKeyVersion,
  getActiveTeamKeyEnvelopeForMember,
  // Invite queries
  createTeamInvite,
  findValidTeamInvite,
  markTeamInviteUsed,
  listTeamInvites,
  listPendingInvitesForEmail,
  deleteTeamInvite,
  // User queries
  findUserByEmail,
  getUserPublicKey,
  updateUserPublicKey,
  getUserKeyPair,
  // Team skill queries
  createTeamSkill,
  findTeamSkillByKey,
  listTeamSkills,
  updateTeamSkillCurrentHash,
  deleteTeamSkill,
  createTeamSkillVersion,
  findTeamSkillVersion,
  listTeamSkillVersions,
} from "../db/index.js";

export const teamsRouter = new Hono();

// All team routes require authentication
teamsRouter.use("*", authMiddleware);

// =============================================================================
// Team CRUD
// =============================================================================

/**
 * List all teams the user is a member of
 * GET /teams
 */
teamsRouter.get("/", async (c) => {
  const user = getUser(c);
  const teams = await listUserTeams(user.sub);

  return c.json({
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      role: t.role,
      status: t.status,
      memberCount: t.memberCount,
    skillCount: t.skillCount,
    activeKeyVersion: t.activeKeyVersion,
    createdAt: t.createdAt,
  })),
  });
});

/**
 * Create a new team
 * POST /teams
 */
teamsRouter.post("/", async (c) => {
  const user = getUser(c);
  const body = await c.req.json<{ name: string }>();

  if (!body.name || body.name.trim().length === 0) {
    return c.json({ error: "Team name is required" }, 400);
  }

  // Create team
  const team = await createTeam(body.name.trim(), user.sub);

  // Add creator as owner with active status
  await addTeamMember(team.id, user.sub, "owner", "active");

  return c.json({
    id: team.id,
    name: team.name,
    role: "owner",
    status: "active",
    activeKeyVersion: team.activeKeyVersion,
    createdAt: team.createdAt,
  });
});

/**
 * Get team details
 * GET /teams/:teamId
 */
teamsRouter.get("/:teamId", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");

  // Check membership
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership) {
    return c.json({ error: "Team not found" }, 404);
  }

  const team = await findTeamById(teamId);
  if (!team) {
    return c.json({ error: "Team not found" }, 404);
  }

  const members = await listTeamMembers(teamId);
  const skills = await listTeamSkills(teamId);

  return c.json({
    id: team.id,
    name: team.name,
    role: membership.role,
    status: membership.status,
    members: members.map((m) => ({
      userId: m.userId,
      email: m.email,
      role: m.role,
      status: m.status,
      hasTeamKey: !!m.encryptedTeamKey,
      createdAt: m.createdAt,
    })),
    skills: skills.map((s) => ({
      id: s.id,
      skillKey: s.skillKey,
      currentHash: s.currentHash,
      updatedAt: s.updatedAt,
    })),
    createdAt: team.createdAt,
    activeKeyVersion: team.activeKeyVersion,
  });
});

/**
 * Update team name
 * PUT /teams/:teamId
 */
teamsRouter.put("/:teamId", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");
  const body = await c.req.json<{ name: string }>();

  // Check permission (owner only)
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only the team owner can rename the team" }, 403);
  }

  if (!body.name || body.name.trim().length === 0) {
    return c.json({ error: "Team name is required" }, 400);
  }

  await updateTeamName(teamId, body.name.trim());

  return c.json({ success: true });
});

/**
 * Delete team (owner only)
 * DELETE /teams/:teamId
 */
teamsRouter.delete("/:teamId", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");

  // Check permission (owner only)
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only the team owner can delete the team" }, 403);
  }

  await deleteTeam(teamId);

  return c.json({ success: true });
});

// =============================================================================
// Team Members
// =============================================================================

/**
 * List team members
 * GET /teams/:teamId/members
 */
teamsRouter.get("/:teamId/members", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");

  // Check membership
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership) {
    return c.json({ error: "Team not found" }, 404);
  }

  const members = await listTeamMembers(teamId);

  return c.json({
    members: members.map((m) => ({
      userId: m.userId,
      email: m.email,
      role: m.role,
      status: m.status,
      hasTeamKey: !!m.encryptedTeamKey,
      createdAt: m.createdAt,
    })),
  });
});

/**
 * Update member role
 * PUT /teams/:teamId/members/:userId
 */
teamsRouter.put("/:teamId/members/:userId", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");
  const targetUserId = c.req.param("userId");
  const body = await c.req.json<{ role: string }>();

  // Check permission (owner or admin)
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return c.json({ error: "Permission denied" }, 403);
  }

  // Cannot change owner's role
  const targetMembership = await findTeamMember(teamId, targetUserId);
  if (!targetMembership) {
    return c.json({ error: "Member not found" }, 404);
  }

  if (targetMembership.role === "owner") {
    return c.json({ error: "Cannot change owner's role" }, 400);
  }

  // Validate role
  const validRoles = ["admin", "editor", "viewer"];
  if (!validRoles.includes(body.role)) {
    return c.json({ error: "Invalid role" }, 400);
  }

  await updateTeamMemberRole(teamId, targetUserId, body.role);

  return c.json({ success: true });
});

/**
 * Remove member from team
 * DELETE /teams/:teamId/members/:userId
 */
teamsRouter.delete("/:teamId/members/:userId", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");
  const targetUserId = c.req.param("userId");

  const body = await c.req.json<{
    nextTeamKeyVersion?: number;
    envelopes?: Array<{
      recipientUserId: string;
      encryptedTeamKey: string;
      iv: string;
      tag: string;
      ephemeralPublicKey: string;
    }>;
  }>();

  // Check permission (owner only)
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Team not found" }, 404);
  }

  // Cannot remove owner
  const targetMembership = await findTeamMember(teamId, targetUserId);
  if (!targetMembership) {
    return c.json({ error: "Member not found" }, 404);
  }

  if (targetMembership.role === "owner") {
    return c.json({ error: "Cannot remove team owner" }, 400);
  }

  const activeKeyVersion = await getTeamActiveKeyVersion(teamId);
  if (!activeKeyVersion) {
    return c.json({ error: "Team key version not found" }, 500);
  }

  const nextTeamKeyVersion = body.nextTeamKeyVersion ?? activeKeyVersion + 1;
  if (nextTeamKeyVersion <= activeKeyVersion) {
    return c.json({ error: "nextTeamKeyVersion must be greater than the active version" }, 400);
  }

  if (!body.envelopes || body.envelopes.length === 0) {
    return c.json({ error: "Rotation envelopes are required when removing a member" }, 400);
  }

  await rotateTeamKeyAndRemoveMember(
    teamId,
    targetUserId,
    nextTeamKeyVersion,
    user.sub,
    body.envelopes
  );

  return c.json({ success: true, activeKeyVersion: nextTeamKeyVersion });
});

/**
 * Get pending members waiting for key distribution
 * GET /teams/:teamId/members/pending
 */
teamsRouter.get("/:teamId/members/pending", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");

  // Check permission (owner only)
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only the team owner can distribute team keys" }, 403);
  }

  const pendingMembers = await listPendingTeamMembers(teamId);

  // Get public keys for pending members
  const membersWithKeys = await Promise.all(
    pendingMembers.map(async (m) => {
      const keyInfo = await getUserPublicKey(m.userId);
      return {
        userId: m.userId,
        email: m.email,
        role: m.role,
        publicKey: keyInfo?.publicKey ?? null,
        publicKeyFingerprint: keyInfo?.publicKeyFingerprint ?? null,
        createdAt: m.createdAt,
      };
    })
  );

  return c.json({ pendingMembers: membersWithKeys });
});

/**
 * Get all pending members across all teams user can manage
 * GET /teams/pending-members
 */
teamsRouter.get("/pending-members", async (c) => {
  const user = getUser(c);
  const pendingMembers = await listAllPendingMembersForUser(user.sub);

  return c.json({
    pendingMembers: pendingMembers.map((m) => ({
      teamId: m.teamId,
      teamName: m.teamName,
      userId: m.userId,
      email: m.email,
      role: m.role,
      publicKey: m.memberPublicKey,
      publicKeyFingerprint: m.memberPublicKeyFingerprint,
      createdAt: m.createdAt,
    })),
  });
});

/**
 * Distribute team key to a pending member
 * POST /teams/:teamId/members/:userId/key
 */
teamsRouter.post("/:teamId/members/:userId/key", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");
  const targetUserId = c.req.param("userId");

  const body = await c.req.json<{
    encryptedTeamKey: string;
    iv: string;
    tag: string;
    ephemeralPublicKey: string;
    teamKeyVersion?: number;
  }>();

  // Check permission (owner with active status)
  const membership = await findTeamMember(teamId, user.sub);
  if (
    !membership ||
    membership.role !== "owner" ||
    membership.status !== "active"
  ) {
    return c.json({ error: "Permission denied" }, 403);
  }

  // Check target is pending
  const targetMembership = await findTeamMember(teamId, targetUserId);
  if (!targetMembership || targetMembership.status !== "pending") {
    return c.json({ error: "Member not found or not pending" }, 404);
  }

  // Validate required fields
  if (
    !body.encryptedTeamKey ||
    !body.iv ||
    !body.tag ||
    !body.ephemeralPublicKey
  ) {
    return c.json({ error: "Missing required key fields" }, 400);
  }

  const activeKeyVersion = await getTeamActiveKeyVersion(teamId);
  if (!activeKeyVersion) {
    return c.json({ error: "Team not found" }, 404);
  }

  const teamKeyVersion = body.teamKeyVersion ?? activeKeyVersion;
  if (teamKeyVersion !== activeKeyVersion) {
    return c.json({ error: "Team key version must match the active team key version" }, 409);
  }

  // Set the team key for the member
  await setTeamMemberKey(
    teamId,
    targetUserId,
    body.encryptedTeamKey,
    body.iv,
    body.tag,
    body.ephemeralPublicKey,
    teamKeyVersion,
    user.sub
  );

  return c.json({ success: true, teamKeyVersion });
});

/**
 * Get my team key (for active members)
 * GET /teams/:teamId/my-key
 */
teamsRouter.get("/:teamId/my-key", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");

  const membership = await findTeamMember(teamId, user.sub);
  if (!membership) {
    return c.json({ error: "Team not found" }, 404);
  }

  const activeEnvelope = await getActiveTeamKeyEnvelopeForMember(teamId, user.sub);
  if (!activeEnvelope) {
    return c.json({ error: "Team key not available", status: membership.status }, 404);
  }

  return c.json({
    encryptedTeamKey: activeEnvelope.encryptedTeamKey,
    iv: activeEnvelope.iv,
    tag: activeEnvelope.tag,
    ephemeralPublicKey: activeEnvelope.ephemeralPublicKey,
    teamKeyVersion: activeEnvelope.teamKeyVersion,
    status: membership.status,
  });
});

// =============================================================================
// Team Invites
// =============================================================================

/**
 * List team invites
 * GET /teams/:teamId/invites
 */
teamsRouter.get("/:teamId/invites", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");

  // Check permission (owner only)
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only the team owner can list invites" }, 403);
  }

  const invites = await listTeamInvites(teamId);

  return c.json({
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      usedAt: i.usedAt,
      createdAt: i.createdAt,
    })),
  });
});

/**
 * Create team invite
 * POST /teams/:teamId/invites
 */
teamsRouter.post("/:teamId/invites", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");

  const body = await c.req.json<{
    email: string;
    role: string;
  }>();

  // Check permission (owner only)
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only the team owner can create invites" }, 403);
  }

  // Validate email
  if (!body.email || !body.email.includes("@")) {
    return c.json({ error: "Invalid email" }, 400);
  }

  // Validate role
  const validRoles = ["admin", "editor", "viewer"];
  if (!validRoles.includes(body.role)) {
    return c.json({ error: "Invalid role" }, 400);
  }

  // Check if user is already a member
  const existingUser = await findUserByEmail(body.email);
  if (existingUser) {
    const existingMembership = await findTeamMember(teamId, existingUser.id);
    if (existingMembership) {
      return c.json({ error: "User is already a team member" }, 400);
    }
  }

  // Generate secure invite token
  const token = generateToken();
  const tokenHash = hashToken(token);

  // Create invite (72 hour expiry)
  const invite = await createTeamInvite(
    teamId,
    body.email.toLowerCase(),
    body.role,
    tokenHash,
    user.sub,
    72
  );

  return c.json({
    id: invite.id,
    token, // Return plaintext token to be sent to invitee
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  });
});

/**
 * Delete/revoke team invite
 * DELETE /teams/:teamId/invites/:inviteId
 */
teamsRouter.delete("/:teamId/invites/:inviteId", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");
  const inviteId = c.req.param("inviteId");

  // Check permission (owner only)
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.role !== "owner") {
    return c.json({ error: "Only the team owner can revoke invites" }, 403);
  }

  await deleteTeamInvite(inviteId);

  return c.json({ success: true });
});

/**
 * Accept team invite (validates token and adds user as member)
 * POST /teams/invites/accept
 */
teamsRouter.post("/invites/accept", async (c) => {
  const user = getUser(c);
  const body = await c.req.json<{ token: string }>();

  if (!body.token) {
    return c.json({ error: "Invite token is required" }, 400);
  }

  const tokenHash = hashToken(body.token);
  const invite = await findValidTeamInvite(tokenHash);

  if (!invite) {
    return c.json({ error: "Invalid or expired invite" }, 404);
  }

  // Check email matches (security: prevent token theft)
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return c.json({ error: "This invite was sent to a different email address" }, 403);
  }

  // Check not already a member
  const existingMembership = await findTeamMember(invite.teamId, user.sub);
  if (existingMembership) {
    return c.json({ error: "You are already a member of this team" }, 400);
  }

  // Mark invite as used
  await markTeamInviteUsed(invite.id);

  // Add user as pending member (will become active once they receive team key)
  await addTeamMember(invite.teamId, user.sub, invite.role, "pending");

  return c.json({
    teamId: invite.teamId,
    teamName: invite.teamName,
    role: invite.role,
    status: "pending",
    message: "Invite accepted. Waiting for team key from team admin.",
  });
});

/**
 * Get pending invites for current user
 * GET /teams/invites/pending
 */
teamsRouter.get("/invites/pending", async (c) => {
  const user = getUser(c);
  const invites = await listPendingInvitesForEmail(user.email);

  return c.json({
    invites: invites.map((i) => ({
      id: i.id,
      teamId: i.teamId,
      teamName: i.teamName,
      role: i.role,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })),
  });
});

// =============================================================================
// User Keypair (for team key exchange)
// =============================================================================

/**
 * Get current user's public key
 * GET /teams/keypair
 */
teamsRouter.get("/keypair", async (c) => {
  const user = getUser(c);
  const keyPair = await getUserKeyPair(user.sub);

  if (!keyPair) {
    return c.json({ hasKeypair: false });
  }

  return c.json({
    hasKeypair: true,
    publicKey: keyPair.publicKey,
    publicKeyFingerprint: keyPair.publicKeyFingerprint,
    encryptedPrivateKey: keyPair.encryptedPrivateKey,
    privateKeyIv: keyPair.privateKeyIv,
    privateKeyTag: keyPair.privateKeyTag,
  });
});

/**
 * Set user's keypair (encrypted private key stored)
 * PUT /teams/keypair
 */
teamsRouter.put("/keypair", async (c) => {
  const user = getUser(c);
  const body = await c.req.json<{
    publicKey: string;
    encryptedPrivateKey: string;
    privateKeyIv: string;
    privateKeyTag: string;
  }>();

  if (
    !body.publicKey ||
    !body.encryptedPrivateKey ||
    !body.privateKeyIv ||
    !body.privateKeyTag
  ) {
    return c.json({ error: "Missing required keypair fields" }, 400);
  }

  await updateUserPublicKey(
    user.sub,
    body.publicKey,
    body.encryptedPrivateKey,
    body.privateKeyIv,
    body.privateKeyTag
  );

  return c.json({ success: true });
});

// =============================================================================
// Team Skills
// =============================================================================

/**
 * List team skills
 * GET /teams/:teamId/skills
 */
teamsRouter.get("/:teamId/skills", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");

  // Check membership and active status
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.status !== "active") {
    return c.json({ error: "Team not found or access denied" }, 404);
  }

  const skills = await listTeamSkills(teamId);

  return c.json({
    skills: skills.map((s) => ({
      id: s.id,
      skillKey: s.skillKey,
      currentHash: s.currentHash,
      updatedAt: s.updatedAt,
    })),
  });
});

/**
 * Push a new version of a team skill
 * POST /teams/:teamId/skills/:skillKey/versions
 */
teamsRouter.post("/:teamId/skills/:skillKey/versions", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");
  const skillKey = c.req.param("skillKey");

  // Check membership, active status, and write permission
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.status !== "active") {
    return c.json({ error: "Team not found or access denied" }, 404);
  }

  if (!["owner", "admin", "editor"].includes(membership.role)) {
    return c.json({ error: "Permission denied" }, 403);
  }

  const body = await c.req.json<{
    hash: string;
    encryptedData: string;
    iv: string;
    tag: string;
    teamKeyVersion: number;
    message?: string;
  }>();

  if (!body.hash || !body.encryptedData || !body.iv || !body.tag) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const activeKeyVersion = await getTeamActiveKeyVersion(teamId);
  if (!activeKeyVersion) {
    return c.json({ error: "Team not found" }, 404);
  }

  if (body.teamKeyVersion !== activeKeyVersion) {
    return c.json({ error: "Writes must use the active team key version" }, 409);
  }

  // Find or create skill
  let skill = await findTeamSkillByKey(teamId, skillKey);
  if (!skill) {
    skill = await createTeamSkill(teamId, skillKey, user.sub);
  }

  // Get parent hash (current version before this push)
  const parentHash = skill.currentHash;

  // Create the version
  const version = await createTeamSkillVersion(
    skill.id,
    body.hash,
    body.encryptedData,
    body.iv,
    body.tag,
    body.teamKeyVersion,
    parentHash,
    body.message ?? null,
    user.sub
  );

  // Update current hash
  await updateTeamSkillCurrentHash(skill.id, body.hash);

  return c.json({
    skillId: skill.id,
    hash: version.hash,
    teamKeyVersion: version.teamKeyVersion,
    parentHash: version.parentHash,
    createdAt: version.createdAt,
  });
});

/**
 * Get the current (latest) version of a team skill
 * GET /teams/:teamId/skills/:skillKey
 */
teamsRouter.get("/:teamId/skills/:skillKey", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");
  const skillKey = c.req.param("skillKey");

  // Check membership and active status
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.status !== "active") {
    return c.json({ error: "Team not found or access denied" }, 404);
  }

  const skill = await findTeamSkillByKey(teamId, skillKey);
  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  if (!skill.currentHash) {
    return c.json({ error: "Skill has no versions" }, 404);
  }

  const version = await findTeamSkillVersion(skill.id, skill.currentHash);
  if (!version) {
    return c.json({ error: "Current version not found" }, 404);
  }

  return c.json({
    skillKey,
    skillId: skill.id,
    hash: version.hash,
    encryptedData: version.encryptedData,
    iv: version.iv,
    tag: version.tag,
    teamKeyVersion: version.teamKeyVersion,
    parentHash: version.parentHash,
    message: version.message,
    createdAt: version.createdAt,
  });
});

/**
 * Get version history for a team skill
 * GET /teams/:teamId/skills/:skillKey/versions
 */
teamsRouter.get("/:teamId/skills/:skillKey/versions", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");
  const skillKey = c.req.param("skillKey");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  // Check membership and active status
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.status !== "active") {
    return c.json({ error: "Team not found or access denied" }, 404);
  }

  const skill = await findTeamSkillByKey(teamId, skillKey);
  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  const versions = await listTeamSkillVersions(skill.id, limit);

  return c.json({
    skillKey,
    currentHash: skill.currentHash,
    versions: versions.map((v) => ({
      hash: v.hash,
      teamKeyVersion: v.teamKeyVersion,
      parentHash: v.parentHash,
      message: v.message,
      createdAt: v.createdAt,
    })),
  });
});

/**
 * Get a specific version of a team skill
 * GET /teams/:teamId/skills/:skillKey/versions/:hash
 */
teamsRouter.get("/:teamId/skills/:skillKey/versions/:hash", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");
  const skillKey = c.req.param("skillKey");
  const hash = c.req.param("hash");

  // Check membership and active status
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || membership.status !== "active") {
    return c.json({ error: "Team not found or access denied" }, 404);
  }

  const skill = await findTeamSkillByKey(teamId, skillKey);
  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  const version = await findTeamSkillVersion(skill.id, hash);
  if (!version) {
    return c.json({ error: "Version not found" }, 404);
  }

  return c.json({
    skillKey,
    hash: version.hash,
    encryptedData: version.encryptedData,
    iv: version.iv,
    tag: version.tag,
    teamKeyVersion: version.teamKeyVersion,
    parentHash: version.parentHash,
    message: version.message,
    createdAt: version.createdAt,
  });
});

/**
 * Delete a team skill (owner/admin only)
 * DELETE /teams/:teamId/skills/:skillKey
 */
teamsRouter.delete("/:teamId/skills/:skillKey", async (c) => {
  const user = getUser(c);
  const teamId = c.req.param("teamId");
  const skillKey = c.req.param("skillKey");

  // Check membership and permission
  const membership = await findTeamMember(teamId, user.sub);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return c.json({ error: "Permission denied" }, 403);
  }

  const skill = await findTeamSkillByKey(teamId, skillKey);
  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  await deleteTeamSkill(skill.id);

  return c.json({ success: true });
});
