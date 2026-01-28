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
  createPublicSkill,
  listUserPublicSkills,
  deletePublicSkill,
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

/**
 * Publish a skill to the public directory
 * POST /skills/:skillKey/publish
 *
 * Note: The client must decrypt the skill content before sending,
 * as public skills are stored unencrypted.
 */
skillsRouter.post("/:skillKey/publish", async (c) => {
  const user = getUser(c);
  const skillKey = c.req.param("skillKey");

  const body = await c.req.json<{
    name: string;
    content: string;
    description?: string;
    category?: string;
    tags?: string[];
    files?: Record<string, string>;
  }>();

  if (!body.name || !body.content) {
    return c.json({ error: "Name and content are required" }, 400);
  }

  // Find the original skill (optional - we just need the ID for reference)
  const skill = await findSkillByKey(user.sub, skillKey);

  // Generate a slug from the name
  const slug = body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Check for slug uniqueness by trying different suffixes
  let finalSlug = slug;
  let suffix = 0;
  while (true) {
    try {
      const publicSkill = await createPublicSkill(
        user.sub,
        skill?.id ?? null,
        finalSlug,
        body.name,
        body.content,
        body.description,
        body.category,
        body.tags,
        body.files
      );

      return c.json({
        id: publicSkill.id,
        slug: publicSkill.slug,
        status: publicSkill.status,
        message: "Skill submitted for review",
      });
    } catch (err) {
      // If slug conflict, try with a suffix
      if (
        err instanceof Error &&
        err.message.includes("unique constraint") &&
        suffix < 10
      ) {
        suffix++;
        finalSlug = `${slug}-${suffix}`;
        continue;
      }
      throw err;
    }
  }
});

/**
 * List user's public skills (including pending/rejected)
 * GET /skills/public
 */
skillsRouter.get("/public", async (c) => {
  const user = getUser(c);
  const publicSkillsList = await listUserPublicSkills(user.sub);

  return c.json({
    skills: publicSkillsList.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      status: s.status,
      downloadCount: s.downloadCount,
      submittedAt: s.submittedAt,
      publishedAt: s.publishedAt,
      rejectionReason: s.rejectionReason,
    })),
  });
});

/**
 * Unpublish (delete) a public skill
 * DELETE /skills/public/:id
 */
skillsRouter.delete("/public/:id", async (c) => {
  const user = getUser(c);
  const id = c.req.param("id");

  const deleted = await deletePublicSkill(id, user.sub);
  if (!deleted) {
    return c.json({ error: "Public skill not found" }, 404);
  }

  return c.json({ success: true });
});
