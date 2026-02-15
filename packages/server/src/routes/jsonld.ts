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
  breadcrumbSchema,
  siteNavigationSchema,
} from "../jsonld.js";

const SITE_URL = "https://claudeskill.io";

export const jsonldRouter = new Hono();

/**
 * Homepage JSON-LD: Organization + WebSite + SiteNavigation + breadcrumbs
 * GET /jsonld/home
 */
jsonldRouter.get("/home", (c) => {
  return c.json([
    organizationSchema(),
    webSiteSchema(),
    siteNavigationSchema(),
    webPageSchema(
      "Claude Skill Manager - Sync Claude Code Skills Across Devices & Teams",
      "Keep your prompts and workflows in sync everywhere you work. Install skills with one command, share with your team, and never lose your setup again.",
      "/"
    ),
    breadcrumbSchema([{ name: "Home", url: SITE_URL }]),
  ]);
});

/**
 * Skills page JSON-LD: CollectionPage with ItemList + breadcrumbs
 * GET /jsonld/skills
 */
jsonldRouter.get("/skills", (c) => {
  return c.json([
    skillsItemListSchema(),
    breadcrumbSchema([
      { name: "Home", url: SITE_URL },
      { name: "Skills", url: `${SITE_URL}/skills` },
    ]),
  ]);
});

/**
 * What are Claude Code Skills page JSON-LD: Article + FAQPage + breadcrumbs
 * GET /jsonld/what-are-claude-code-skills
 */
jsonldRouter.get("/what-are-claude-code-skills", (c) => {
  return c.json([
    articleSchema(),
    faqSchema(),
    breadcrumbSchema([
      { name: "Home", url: SITE_URL },
      {
        name: "What are Claude Code Skills?",
        url: `${SITE_URL}/what-are-claude-code-skills`,
      },
    ]),
  ]);
});

/**
 * Open Source page JSON-LD: CollectionPage + breadcrumbs
 * GET /jsonld/open-source
 */
jsonldRouter.get("/open-source", (c) => {
  return c.json([
    openSourceCollectionSchema(),
    breadcrumbSchema([
      { name: "Home", url: SITE_URL },
      { name: "Open Source", url: `${SITE_URL}/open-source` },
    ]),
  ]);
});

/**
 * Login page JSON-LD: WebPage + breadcrumbs
 * GET /jsonld/login
 */
jsonldRouter.get("/login", (c) => {
  return c.json([
    loginWebPageSchema(),
    breadcrumbSchema([
      { name: "Home", url: SITE_URL },
      { name: "Sign In", url: `${SITE_URL}/login` },
    ]),
  ]);
});
