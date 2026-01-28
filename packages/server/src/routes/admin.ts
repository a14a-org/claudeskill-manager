/**
 * Admin routes for skill review
 *
 * Note: In production, these should be protected by admin role checking.
 * For now, we use a simple environment variable check.
 */

import { Hono } from "hono";
import {
  listPendingPublicSkills,
  findPublicSkillById,
  approvePublicSkill,
  rejectPublicSkill,
  countPendingPublicSkills,
  countApprovedPublicSkills,
} from "../db/index.js";
import { authMiddleware, getUser } from "../middleware.js";

export const adminRouter = new Hono();

// All admin routes require authentication
adminRouter.use("*", authMiddleware);

// Simple admin check - in production use proper role-based access
const isAdmin = (email: string): boolean => {
  const adminEmails = process.env["ADMIN_EMAILS"]?.split(",") ?? [];
  return adminEmails.includes(email);
};

// Middleware to check admin access
adminRouter.use("*", async (c, next) => {
  const user = getUser(c);
  if (!isAdmin(user.email)) {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
});

/**
 * Get admin dashboard stats
 * GET /admin/stats
 */
adminRouter.get("/stats", async (c) => {
  const [pending, approved] = await Promise.all([
    countPendingPublicSkills(),
    countApprovedPublicSkills(),
  ]);

  return c.json({
    pendingReviews: pending,
    approvedSkills: approved,
  });
});

/**
 * List pending skills for review
 * GET /admin/pending
 */
adminRouter.get("/pending", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10);

  const skills = await listPendingPublicSkills(limit);

  return c.json({
    skills: skills.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      category: s.category,
      tags: s.tags,
      content: s.content,
      files: s.files,
      authorEmail: s.authorEmail,
      submittedAt: s.submittedAt,
    })),
  });
});

/**
 * Get a single pending skill for review
 * GET /admin/pending/:id
 */
adminRouter.get("/pending/:id", async (c) => {
  const id = c.req.param("id");

  const skill = await findPublicSkillById(id);
  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  return c.json({
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    tags: skill.tags,
    content: skill.content,
    files: skill.files,
    status: skill.status,
    submittedAt: skill.submittedAt,
  });
});

/**
 * Approve a skill
 * POST /admin/skills/:id/approve
 */
adminRouter.post("/skills/:id/approve", async (c) => {
  const user = getUser(c);
  const id = c.req.param("id");

  const skill = await findPublicSkillById(id);
  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  if (skill.status !== "pending") {
    return c.json({ error: "Skill is not pending review" }, 400);
  }

  const approved = await approvePublicSkill(id, user.sub);
  if (!approved) {
    return c.json({ error: "Failed to approve skill" }, 500);
  }

  return c.json({
    success: true,
    skill: {
      id: approved.id,
      slug: approved.slug,
      name: approved.name,
      status: approved.status,
      publishedAt: approved.publishedAt,
    },
  });
});

/**
 * Reject a skill
 * POST /admin/skills/:id/reject
 */
adminRouter.post("/skills/:id/reject", async (c) => {
  const user = getUser(c);
  const id = c.req.param("id");

  const body = await c.req.json<{ reason: string }>();
  if (!body.reason) {
    return c.json({ error: "Rejection reason is required" }, 400);
  }

  const skill = await findPublicSkillById(id);
  if (!skill) {
    return c.json({ error: "Skill not found" }, 404);
  }

  if (skill.status !== "pending") {
    return c.json({ error: "Skill is not pending review" }, 400);
  }

  const rejected = await rejectPublicSkill(id, user.sub, body.reason);
  if (!rejected) {
    return c.json({ error: "Failed to reject skill" }, 500);
  }

  return c.json({
    success: true,
    skill: {
      id: rejected.id,
      slug: rejected.slug,
      name: rejected.name,
      status: rejected.status,
      rejectionReason: rejected.rejectionReason,
    },
  });
});
