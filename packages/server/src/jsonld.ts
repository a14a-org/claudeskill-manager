/**
 * JSON-LD structured data generators for SEO
 *
 * Generates Schema.org structured data for each page on claudeskill.io.
 * These are served as JSON endpoints that the frontend can embed as
 * <script type="application/ld+json"> in page heads.
 */

const SITE_URL = "https://claudeskill.io";
const SITE_NAME = "Claude Skill Manager";
const SITE_DESCRIPTION =
  "Sync Claude Code skills across devices and teams. Install reusable prompts and workflows with one command.";

export type JsonLdSchema = Record<string, unknown>;

/**
 * Organization schema for the homepage/about
 */
export const organizationSchema = (): JsonLdSchema => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  description: SITE_DESCRIPTION,
  sameAs: ["https://github.com/a14a-org/claudeskill-manager"],
});

/**
 * WebSite schema with SearchAction for the homepage
 */
export const webSiteSchema = (): JsonLdSchema => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/skills?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
});

/**
 * ItemList schema for the /skills page
 */
export const skillsItemListSchema = (): JsonLdSchema => ({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Browse Claude Code Skills",
  description:
    "Discover and install reusable prompts and workflows for Claude Code",
  url: `${SITE_URL}/skills`,
  mainEntity: {
    "@type": "ItemList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "setup-eslint",
        description:
          "Set up ESLint with Prettier integration for TypeScript/JavaScript projects",
        url: `${SITE_URL}/skills`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "setup-prettier",
        description:
          "Configure Prettier with sensible defaults and editor integration",
        url: `${SITE_URL}/skills`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "commit",
        description:
          "Create well-formatted git commits with conventional commit messages",
        url: `${SITE_URL}/skills`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: "review-pr",
        description:
          "Review pull requests with detailed feedback and suggestions",
        url: `${SITE_URL}/skills`,
      },
      {
        "@type": "ListItem",
        position: 5,
        name: "setup-dependabot",
        description:
          "Configure GitHub Dependabot for automated dependency updates",
        url: `${SITE_URL}/skills`,
      },
      {
        "@type": "ListItem",
        position: 6,
        name: "setup-lefthook",
        description:
          "Set up Lefthook for fast Git hooks including pre-commit linting",
        url: `${SITE_URL}/skills`,
      },
    ],
  },
});

/**
 * Article schema for /what-are-claude-code-skills
 */
export const articleSchema = (): JsonLdSchema => ({
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "What are Claude Code Skills?",
  description:
    "Claude Code skills are reusable prompts and workflows that extend the capabilities of Claude Code, Anthropic's AI coding assistant.",
  url: `${SITE_URL}/what-are-claude-code-skills`,
  author: {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
  },
  publisher: {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/logo.png`,
    },
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": `${SITE_URL}/what-are-claude-code-skills`,
  },
});

/**
 * FAQPage schema for /what-are-claude-code-skills
 */
export const faqSchema = (): JsonLdSchema => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What are Claude Code Skills?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Claude Code skills are reusable prompts and workflows that extend the capabilities of Claude Code, Anthropic's AI coding assistant. Think of them as templates that teach Claude how to perform specific tasks consistently.",
      },
    },
    {
      "@type": "Question",
      name: "How do Skills work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Skills are markdown files stored in your ~/.claude/skills directory. When you invoke a skill (using slash commands like /commit or /setup-eslint), Claude reads the skill file and follows its instructions.",
      },
    },
    {
      "@type": "Question",
      name: "What does each skill include?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Each skill typically includes: a name and description of what the skill does, tool permissions (read, write, bash), step-by-step instructions for Claude to follow, and examples with sample inputs and expected outputs.",
      },
    },
  ],
});

/**
 * CollectionPage schema for /open-source
 */
export const openSourceCollectionSchema = (): JsonLdSchema => ({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Open Source",
  description:
    "Skill Manager is built on the shoulders of amazing open source projects. Explore the key dependencies and contributors.",
  url: `${SITE_URL}/open-source`,
  mainEntity: {
    "@type": "ItemList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "@noble/hashes",
        description:
          "Audited cryptographic hash functions for secure skill encryption and integrity",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "@clack/prompts",
        description:
          "Beautiful CLI prompts for the skill manager command line interface",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "motion",
        description:
          "Animated icons and smooth transitions throughout the web interface",
      },
    ],
  },
});

/**
 * WebPage schema for /login
 */
export const loginWebPageSchema = (): JsonLdSchema => ({
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Sign In - Claude Skill Manager",
  description:
    "Sign in to your Claude Skill Manager account to sync skills across devices.",
  url: `${SITE_URL}/login`,
  isPartOf: {
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
  },
});

/**
 * Base WebPage schema for any page
 */
export const webPageSchema = (
  name: string,
  description: string,
  path: string
): JsonLdSchema => ({
  "@context": "https://schema.org",
  "@type": "WebPage",
  name,
  description,
  url: `${SITE_URL}${path}`,
  isPartOf: {
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
  },
});

/**
 * BreadcrumbList schema for navigation
 */
export const breadcrumbSchema = (
  items: { name: string; url: string }[]
): JsonLdSchema => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: item.url,
  })),
});

/**
 * SiteNavigationElement schema for key pages
 */
export const siteNavigationSchema = (): JsonLdSchema => ({
  "@context": "https://schema.org",
  "@type": "SiteNavigationElement",
  name: "Main Navigation",
  url: SITE_URL,
  hasPart: [
    {
      "@type": "WebPage",
      name: "Skills Catalog",
      url: `${SITE_URL}/skills`,
      description: "Browse and install reusable Claude Code skills",
    },
    {
      "@type": "WebPage",
      name: "Documentation",
      url: `${SITE_URL}/docs`,
      description: "Get started with Claude Skill Manager",
    },
    {
      "@type": "WebPage",
      name: "What are Claude Code Skills?",
      url: `${SITE_URL}/what-are-claude-code-skills`,
      description:
        "Learn how skills extend Claude Code with reusable prompts",
    },
    {
      "@type": "WebPage",
      name: "Open Source",
      url: `${SITE_URL}/open-source`,
      description: "Open source libraries powering Skill Manager",
    },
  ],
});
