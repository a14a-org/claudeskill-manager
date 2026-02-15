/**
 * Page content data for engagement improvements
 *
 * Serves structured CTA, internal linking, and navigation data
 * that the frontend uses to render engagement elements.
 */

const SITE_URL = "https://claudeskill.io";

export type Cta = {
  text: string;
  href: string;
  variant: "primary" | "secondary";
};

export type InternalLink = {
  text: string;
  href: string;
  context: string;
};

export type Breadcrumb = {
  label: string;
  href: string;
};

export type PageEngagement = {
  ctas: Cta[];
  internalLinks: InternalLink[];
  breadcrumbs: Breadcrumb[];
  nextSteps: Cta[];
};

/**
 * Homepage engagement data — above-the-fold CTAs directing to /skills and /docs
 */
export const homePageEngagement = (): PageEngagement => ({
  ctas: [
    {
      text: "Browse Skills",
      href: "/skills",
      variant: "primary",
    },
    {
      text: "Read the Docs",
      href: "/docs",
      variant: "secondary",
    },
  ],
  internalLinks: [
    {
      text: "What are Claude Code Skills?",
      href: "/what-are-claude-code-skills",
      context:
        "New to skills? Learn how reusable prompts and workflows supercharge your Claude Code setup.",
    },
    {
      text: "Browse the skill catalog",
      href: "/skills",
      context:
        "Discover ready-to-install skills for linting, formatting, git workflows, and more.",
    },
    {
      text: "Get started with the docs",
      href: "/docs",
      context:
        "Step-by-step guide to installing your first skill and syncing across devices.",
    },
    {
      text: "View open source dependencies",
      href: "/open-source",
      context:
        "See the open source libraries that power Claude Skill Manager.",
    },
  ],
  breadcrumbs: [{ label: "Home", href: "/" }],
  nextSteps: [
    {
      text: "Install your first skill",
      href: "/docs",
      variant: "primary",
    },
    {
      text: "Explore the catalog",
      href: "/skills",
      variant: "secondary",
    },
  ],
});

/**
 * Skills page engagement data — CTA to docs for getting started
 */
export const skillsPageEngagement = (): PageEngagement => ({
  ctas: [
    {
      text: "Get Started — Install a Skill",
      href: "/docs",
      variant: "primary",
    },
    {
      text: "What are Skills?",
      href: "/what-are-claude-code-skills",
      variant: "secondary",
    },
  ],
  internalLinks: [
    {
      text: "Learn what skills are and how they work",
      href: "/what-are-claude-code-skills",
      context:
        "Understand how skills extend Claude Code with reusable prompts and workflows.",
    },
    {
      text: "Follow the getting started guide",
      href: "/docs",
      context:
        "Install and configure your first skill in under two minutes.",
    },
    {
      text: "Sign in to sync skills across devices",
      href: "/login",
      context:
        "Create an account to keep your skills in sync everywhere you work.",
    },
  ],
  breadcrumbs: [
    { label: "Home", href: "/" },
    { label: "Skills", href: "/skills" },
  ],
  nextSteps: [
    {
      text: "Read the installation guide",
      href: "/docs",
      variant: "primary",
    },
    {
      text: "Learn about skills",
      href: "/what-are-claude-code-skills",
      variant: "secondary",
    },
  ],
});

/**
 * What are Claude Code Skills page engagement data — CTA to /skills catalog
 */
export const whatAreSkillsPageEngagement = (): PageEngagement => ({
  ctas: [
    {
      text: "Browse the Skill Catalog",
      href: "/skills",
      variant: "primary",
    },
    {
      text: "Read the Docs",
      href: "/docs",
      variant: "secondary",
    },
  ],
  internalLinks: [
    {
      text: "Browse available skills",
      href: "/skills",
      context:
        "See all ready-to-install skills including linting, git workflows, and code review.",
    },
    {
      text: "Get started with installation",
      href: "/docs",
      context:
        "Follow the step-by-step guide to install your first skill.",
    },
    {
      text: "View open source foundations",
      href: "/open-source",
      context:
        "Explore the open source libraries that make Skill Manager possible.",
    },
  ],
  breadcrumbs: [
    { label: "Home", href: "/" },
    { label: "What are Skills?", href: "/what-are-claude-code-skills" },
  ],
  nextSteps: [
    {
      text: "Explore the skill catalog",
      href: "/skills",
      variant: "primary",
    },
    {
      text: "Start installing skills",
      href: "/docs",
      variant: "secondary",
    },
  ],
});

/**
 * Docs page engagement data
 */
export const docsPageEngagement = (): PageEngagement => ({
  ctas: [
    {
      text: "Browse the Skill Catalog",
      href: "/skills",
      variant: "primary",
    },
    {
      text: "Sign In to Sync",
      href: "/login",
      variant: "secondary",
    },
  ],
  internalLinks: [
    {
      text: "Browse the skill catalog",
      href: "/skills",
      context:
        "Find the right skill for your workflow — linting, formatting, git, and more.",
    },
    {
      text: "Learn what skills are",
      href: "/what-are-claude-code-skills",
      context:
        "Understand how skills work under the hood.",
    },
    {
      text: "Sign in to sync across devices",
      href: "/login",
      context:
        "Keep your skills in sync everywhere you work.",
    },
  ],
  breadcrumbs: [
    { label: "Home", href: "/" },
    { label: "Docs", href: "/docs" },
  ],
  nextSteps: [
    {
      text: "Find a skill to install",
      href: "/skills",
      variant: "primary",
    },
    {
      text: "Create an account",
      href: "/login",
      variant: "secondary",
    },
  ],
});

/**
 * Open source page engagement data
 */
export const openSourcePageEngagement = (): PageEngagement => ({
  ctas: [
    {
      text: "Browse Skills Built with These Libraries",
      href: "/skills",
      variant: "primary",
    },
    {
      text: "View on GitHub",
      href: "https://github.com/a14a-org/claudeskill-manager",
      variant: "secondary",
    },
  ],
  internalLinks: [
    {
      text: "Browse the skill catalog",
      href: "/skills",
      context:
        "See the skills built on top of these open source foundations.",
    },
    {
      text: "Get started with the docs",
      href: "/docs",
      context:
        "Learn how to install and use skills in your workflow.",
    },
  ],
  breadcrumbs: [
    { label: "Home", href: "/" },
    { label: "Open Source", href: "/open-source" },
  ],
  nextSteps: [
    {
      text: "Explore the skill catalog",
      href: "/skills",
      variant: "primary",
    },
    {
      text: "Read the docs",
      href: "/docs",
      variant: "secondary",
    },
  ],
});

/**
 * Login page engagement data
 */
export const loginPageEngagement = (): PageEngagement => ({
  ctas: [
    {
      text: "Browse Skills First",
      href: "/skills",
      variant: "secondary",
    },
  ],
  internalLinks: [
    {
      text: "Learn what skills are",
      href: "/what-are-claude-code-skills",
      context:
        "Not sure what this is about? Learn how skills work first.",
    },
    {
      text: "Browse available skills",
      href: "/skills",
      context:
        "See the catalog of ready-to-install skills before signing in.",
    },
  ],
  breadcrumbs: [
    { label: "Home", href: "/" },
    { label: "Sign In", href: "/login" },
  ],
  nextSteps: [
    {
      text: "Browse the skill catalog",
      href: "/skills",
      variant: "primary",
    },
    {
      text: "Read the docs",
      href: "/docs",
      variant: "secondary",
    },
  ],
});

/**
 * Navigation structure for the site — used by the frontend to render
 * consistent nav with current-page highlighting and key conversion paths.
 */
export const siteNavigation = (): {
  primary: { label: string; href: string }[];
  quickStart: { label: string; href: string; description: string }[];
} => ({
  primary: [
    { label: "Home", href: "/" },
    { label: "Skills", href: "/skills" },
    { label: "Docs", href: "/docs" },
    { label: "What are Skills?", href: "/what-are-claude-code-skills" },
    { label: "Open Source", href: "/open-source" },
  ],
  quickStart: [
    {
      label: "Browse Skills",
      href: "/skills",
      description: "Discover reusable prompts and workflows",
    },
    {
      label: "Get Started",
      href: "/docs",
      description: "Install your first skill in under 2 minutes",
    },
    {
      label: "Sign In",
      href: "/login",
      description: "Sync skills across all your devices",
    },
  ],
});
