/**
 * JSON-LD structured data routes
 *
 * Serves Schema.org JSON-LD for each page so the frontend can embed
 * them as <script type="application/ld+json"> in page heads.
 *
 * GET /jsonld/:page returns an array of JSON-LD objects for that page.
 */

import { Hono } from "hono";
import {
  organizationSchema,
  webSiteSchema,
  skillsItemListSchema,
  articleSchema,
  faqSchema,
  openSourceCollectionSchema,
  loginWebPageSchema,
  webPageSchema,
} from "../jsonld.js";

export const jsonldRouter = new Hono();

/**
 * Homepage JSON-LD: Organization + WebSite with SearchAction
 * GET /jsonld/home
 */
jsonldRouter.get("/home", (c) => {
  return c.json([
    organizationSchema(),
    webSiteSchema(),
    webPageSchema(
      "Claude Skill Manager - Sync Claude Code Skills Across Devices & Teams",
      "Keep your prompts and workflows in sync everywhere you work. Install skills with one command, share with your team, and never lose your setup again.",
      "/"
    ),
  ]);
});

/**
 * Skills page JSON-LD: CollectionPage with ItemList
 * GET /jsonld/skills
 */
jsonldRouter.get("/skills", (c) => {
  return c.json([skillsItemListSchema()]);
});

/**
 * What are Claude Code Skills page JSON-LD: Article + FAQPage
 * GET /jsonld/what-are-claude-code-skills
 */
jsonldRouter.get("/what-are-claude-code-skills", (c) => {
  return c.json([articleSchema(), faqSchema()]);
});

/**
 * Open Source page JSON-LD: CollectionPage
 * GET /jsonld/open-source
 */
jsonldRouter.get("/open-source", (c) => {
  return c.json([openSourceCollectionSchema()]);
});

/**
 * Login page JSON-LD: WebPage
 * GET /jsonld/login
 */
jsonldRouter.get("/login", (c) => {
  return c.json([loginWebPageSchema()]);
});
