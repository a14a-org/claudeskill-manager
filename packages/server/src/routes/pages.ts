/**
 * Page engagement routes
 *
 * Serves CTA, internal linking, breadcrumb, and navigation data
 * for each page so the frontend can render engagement elements.
 *
 * GET /pages/:page returns engagement data for that page.
 * GET /pages/navigation returns the site navigation structure.
 */

import { Hono } from "hono";
import {
  homePageEngagement,
  skillsPageEngagement,
  whatAreSkillsPageEngagement,
  docsPageEngagement,
  openSourcePageEngagement,
  loginPageEngagement,
  siteNavigation,
} from "../pages.js";

export const pagesRouter = new Hono();

/**
 * Homepage engagement data
 * GET /pages/home
 */
pagesRouter.get("/home", (c) => {
  return c.json(homePageEngagement());
});

/**
 * Skills page engagement data
 * GET /pages/skills
 */
pagesRouter.get("/skills", (c) => {
  return c.json(skillsPageEngagement());
});

/**
 * What are Claude Code Skills page engagement data
 * GET /pages/what-are-claude-code-skills
 */
pagesRouter.get("/what-are-claude-code-skills", (c) => {
  return c.json(whatAreSkillsPageEngagement());
});

/**
 * Docs page engagement data
 * GET /pages/docs
 */
pagesRouter.get("/docs", (c) => {
  return c.json(docsPageEngagement());
});

/**
 * Open source page engagement data
 * GET /pages/open-source
 */
pagesRouter.get("/open-source", (c) => {
  return c.json(openSourcePageEngagement());
});

/**
 * Login page engagement data
 * GET /pages/login
 */
pagesRouter.get("/login", (c) => {
  return c.json(loginPageEngagement());
});

/**
 * Site navigation structure
 * GET /pages/navigation
 */
pagesRouter.get("/navigation", (c) => {
  return c.json(siteNavigation());
});
