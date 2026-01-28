/**
 * Public skills routes (no authentication required)
 */

import { Hono } from "hono";
import {
  listApprovedPublicSkills,
  findPublicSkillBySlug,
  incrementPublicSkillDownloads,
  countApprovedPublicSkills,
} from "../db/index.js";

export const publicSkillsRouter = new Hono();

/**
 * List all approved public skills
 * GET /public/skills
 */
publicSkillsRouter.get("/", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const category = c.req.query("category");

  const [skills, total] = await Promise.all([
    listApprovedPublicSkills(limit, offset, category ?? undefined),
    countApprovedPublicSkills(),
  ]);

  return c.json({
    skills: skills.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      category: s.category,
      tags: s.tags,
      downloadCount: s.downloadCount,
      publishedAt: s.publishedAt,
      author: s.authorEmail.split("@")[0], // Only show username part
    })),
    total,
    limit,
    offset,
  });
});

/**
 * Get a single public skill by slug
 * GET /public/skills/:slug
 */
publicSkillsRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  const skill = await findPublicSkillBySlug(slug);

  if (!skill || skill.status !== "approved") {
    return c.json({ error: "Skill not found" }, 404);
  }

  // Increment download count
  await incrementPublicSkillDownloads(skill.id);

  return c.json({
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    tags: skill.tags,
    content: skill.content,
    files: skill.files,
    downloadCount: skill.downloadCount + 1, // Include the current download
    publishedAt: skill.publishedAt,
    author: skill.authorEmail.split("@")[0], // Only show username part
  });
});
