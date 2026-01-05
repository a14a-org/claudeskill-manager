/**
 * Skills routes with versioning support
 */

import { Hono } from "hono";
import {
  findSkillByKey,
  listUserSkills,
  createSkill,
  updateSkillCurrentHash,
  deleteSkill,
  createSkillVersion,
  findSkillVersion,
  listSkillVersions,
} from "../db/index.js";
import { authMiddleware, getUser } from "../middleware.js";

export const skillsRouter = new Hono();

// All skill routes require authentication
skillsRouter.use("*", authMiddleware);

/**
 * List all skills for the user
 * GET /skills
 */
skillsRouter.get("/", async (c) => {
  const user = getUser(c);
  const skills = await listUserSkills(user.sub);

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
 * Push a new version of a skill
 * POST /skills/:skillKey/versions
 */
skillsRouter.post("/:skillKey/versions", async (c) => {
  const user = getUser(c);
  const userId = user.sub;
  const skillKey = c.req.param("skillKey");

  const body = await c.req.json<{
    hash: string;
    encryptedData: string;
    iv: string;
    tag: string;
    message?: string;
  }>();

  if (!body.hash || !body.encryptedData || !body.iv || !body.tag) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  // Find or create skill
  let skill = await findSkillByKey(userId, skillKey);
  if (!skill) {
    skill = await createSkill(userId, skillKey);
  }

  // Get parent hash (current version before this push)
  const parentHash = skill.currentHash;

  // Create the version
  const version = await createSkillVersion(
    skill.id,
    body.hash,
    body.encryptedData,
    body.iv,
    body.tag,
    parentHash,
    body.message ?? null
  );

  // Update current hash
  await updateSkillCurrentHash(skill.id, body.hash);

  return c.json({
    skillId: skill.id,
    hash: version.hash,
    parentHash: version.parentHash,
    createdAt: version.createdAt,
  });
});

/**
 * Get version history for a skill
 * GET /skills/:skillKey/versions
 */
skillsRouter.get("/:skillKey/versions", async (c) => {
  const user = getUser(c);
  const skillKey = c.req.param("skillKey");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  const skill = await findSkillByKey(user.sub, skillKey);
  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  const versions = await listSkillVersions(skill.id, limit);

  return c.json({
    skillKey,
    currentHash: skill.currentHash,
    versions: versions.map((v) => ({
      hash: v.hash,
      parentHash: v.parentHash,
      message: v.message,
      createdAt: v.createdAt,
    })),
  });
});

/**
 * Get a specific version of a skill
 * GET /skills/:skillKey/versions/:hash
 */
skillsRouter.get("/:skillKey/versions/:hash", async (c) => {
  const user = getUser(c);
  const skillKey = c.req.param("skillKey");
  const hash = c.req.param("hash");

  const skill = await findSkillByKey(user.sub, skillKey);
  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  const version = await findSkillVersion(skill.id, hash);
  if (!version) {
    return c.json({ error: "Version not found" }, 404);
  }

  return c.json({
    skillKey,
    hash: version.hash,
    encryptedData: version.encryptedData,
    iv: version.iv,
    tag: version.tag,
    parentHash: version.parentHash,
    message: version.message,
    createdAt: version.createdAt,
  });
});

/**
 * Get the current (latest) version of a skill
 * GET /skills/:skillKey
 */
skillsRouter.get("/:skillKey", async (c) => {
  const user = getUser(c);
  const skillKey = c.req.param("skillKey");

  const skill = await findSkillByKey(user.sub, skillKey);
  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  if (!skill.currentHash) {
    return c.json({ error: "Skill has no versions" }, 404);
  }

  const version = await findSkillVersion(skill.id, skill.currentHash);
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
    parentHash: version.parentHash,
    message: version.message,
    createdAt: version.createdAt,
  });
});

/**
 * Delete a skill and all its versions
 * DELETE /skills/:skillKey
 */
skillsRouter.delete("/:skillKey", async (c) => {
  const user = getUser(c);
  const skillKey = c.req.param("skillKey");

  const skill = await findSkillByKey(user.sub, skillKey);
  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  const deleted = await deleteSkill(skill.id, user.sub);
  if (!deleted) {
    return c.json({ error: "Failed to delete skill" }, 500);
  }

  return c.json({ success: true });
});
