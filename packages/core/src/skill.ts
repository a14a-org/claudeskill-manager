/**
 * Skill parsing and validation module
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { computeContentHash } from "./crypto.js";
import type { Skill, SkillMetadata, SkillType } from "./types.js";

/** Claude Code directory structure */
const CLAUDE_DIR = ".claude";
const SKILL_DIRS: { path: string; type: SkillType; isDirectory: boolean }[] = [
  { path: "commands", type: "command", isDirectory: false },
  { path: "skills", type: "skill", isDirectory: true },
  { path: "agents", type: "agent", isDirectory: false },
];

/** Default skills directory (legacy) */
const DEFAULT_SKILLS_PATH = ".claude/commands";

/**
 * Parse YAML-like frontmatter from skill content
 * Simple parser that doesn't require external dependencies
 */
export const parseFrontmatter = (
  content: string
): { metadata: SkillMetadata; body: string } => {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  const defaultMetadata: SkillMetadata = {
    description: null,
    triggers: null,
    author: null,
    version: null,
    "allowed-tools": null,
    tools: null,
    model: null,
    permissionMode: null,
    "depends-on": null,
    category: null,
    tags: null,
  };

  if (!match) {
    return {
      metadata: defaultMetadata,
      body: content,
    };
  }

  const [, frontmatter, body] = match;
  const metadata: SkillMetadata = { ...defaultMetadata };

  // Simple YAML-like parsing (key: value or key: [array])
  const lines = frontmatter!.split("\n");

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) return;

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    // Handle arrays like [item1, item2]
    if (value.startsWith("[") && value.endsWith("]")) {
      const items = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      metadata[key] = items;
    }
    // Handle quoted strings
    else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      metadata[key] = value.slice(1, -1);
    }
    // Handle plain values
    else {
      metadata[key] = value;
    }
  });

  return { metadata, body: body ?? "" };
};

/**
 * Serialize metadata to frontmatter
 */
export const serializeFrontmatter = (
  metadata: SkillMetadata,
  body: string
): string => {
  const entries = Object.entries(metadata).filter(
    ([, v]) => v !== undefined && v !== null
  );

  if (entries.length === 0) {
    return body;
  }

  const lines: string[] = ["---"];

  const metadataLines = entries.map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: [${value.map((v) => `"${v}"`).join(", ")}]`;
    }
    if (typeof value === "string") {
      // Quote strings with special characters
      if (value.includes(":") || value.includes("#") || value.includes('"')) {
        return `${key}: "${value.replace(/"/g, '\\"')}"`;
      }
      return `${key}: ${value}`;
    }
    return `${key}: ${String(value)}`;
  });

  lines.push(...metadataLines);

  lines.push("---");
  lines.push(body);

  return lines.join("\n");
};

/**
 * Get the skills directory path
 */
export const getSkillsPath = (customPath?: string): string => {
  if (customPath) {
    return customPath;
  }

  const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
  return join(home, DEFAULT_SKILLS_PATH);
};

/**
 * Read a single skill file
 */
export const readSkill = async (
  filePath: string,
  type: SkillType = "command"
): Promise<Skill> => {
  const content = await readFile(filePath, "utf-8");
  const { metadata } = parseFrontmatter(content);
  const stats = await stat(filePath);
  const name = basename(filePath, extname(filePath));

  return {
    name,
    content,
    metadata,
    path: filePath,
    modifiedAt: stats.mtime,
    type,
  };
};

/**
 * Read a directory-based skill (like ~/.claude/skills/*)
 */
export const readDirectorySkill = async (
  dirPath: string,
  type: SkillType = "skill"
): Promise<Skill | null> => {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const name = basename(dirPath);

    // Find the main skill file (SKILL.md, skill.md, or <name>.md)
    const mainFile = entries.find((e) => {
      if (!e.isFile()) return false;
      const lower = e.name.toLowerCase();
      return (
        lower === "skill.md" ||
        lower === `${name.toLowerCase()}.md` ||
        lower === "index.md"
      );
    });

    if (!mainFile) return null;

    const mainPath = join(dirPath, mainFile.name);
    const content = await readFile(mainPath, "utf-8");
    const { metadata } = parseFrontmatter(content);
    const stats = await stat(mainPath);

    // Read supporting files
    const supportingFiles = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name !== mainFile.name)
        .map(async (e) => {
          const filePath = join(dirPath, e.name);
          const fileContent = await readFile(filePath, "utf-8");
          return { name: e.name, content: fileContent };
        })
    );

    return {
      name,
      content,
      metadata,
      path: dirPath,
      modifiedAt: stats.mtime,
      type,
      files: supportingFiles.length > 0 ? supportingFiles : undefined,
    };
  } catch {
    return null;
  }
};

/**
 * List all skills in a directory (file-based)
 */
export const listSkills = async (
  skillsPath?: string,
  type: SkillType = "command"
): Promise<Skill[]> => {
  const dirPath = getSkillsPath(skillsPath);

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    const skillPromises = entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const ext = extname(entry.name).toLowerCase();
        return ext === ".md" || ext === ".txt" || ext === "";
      })
      .map(async (entry) => {
        const filePath = join(dirPath, entry.name);
        try {
          return await readSkill(filePath, type);
        } catch {
          // Skip files that can't be read
          return null;
        }
      });

    const skills = (await Promise.all(skillPromises)).filter(
      (skill): skill is Skill => skill !== null
    );

    return skills.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }
};

/**
 * List directory-based skills (like ~/.claude/skills/*)
 */
export const listDirectorySkills = async (
  basePath: string,
  type: SkillType = "skill"
): Promise<Skill[]> => {
  try {
    const entries = await readdir(basePath, { withFileTypes: true });

    const skillPromises = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry) => {
        const dirPath = join(basePath, entry.name);
        return await readDirectorySkill(dirPath, type);
      });

    const skills = (await Promise.all(skillPromises)).filter(
      (skill): skill is Skill => skill !== null
    );

    return skills.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
};

/**
 * Get the base Claude directory
 */
export const getClaudeDir = (): string => {
  const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
  return join(home, CLAUDE_DIR);
};

/**
 * List ALL skills from all directories (commands, skills, agents)
 */
export const listAllSkills = async (): Promise<Skill[]> => {
  const claudeDir = getClaudeDir();

  const allSkillsPromises = SKILL_DIRS.map(async ({ path, type, isDirectory }) => {
    const fullPath = join(claudeDir, path);
    if (isDirectory) {
      return await listDirectorySkills(fullPath, type);
    }
    return await listSkills(fullPath, type);
  });

  const skillArrays = await Promise.all(allSkillsPromises);
  const allSkills = skillArrays.flat();

  return allSkills.sort((a, b) => {
    // Sort by type first, then by name
    if (a.type !== b.type) {
      const typeOrder = { command: 0, skill: 1, agent: 2 };
      return typeOrder[a.type] - typeOrder[b.type];
    }
    return a.name.localeCompare(b.name);
  });
};

/**
 * Validate a skill structure
 */
export const validateSkill = (
  skill: Skill
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!skill.name || skill.name.trim() === "") {
    errors.push("Skill name is required");
  }

  if (!skill.content || skill.content.trim() === "") {
    errors.push("Skill content is empty");
  }

  // Check for common issues
  if (skill.name.includes(" ")) {
    errors.push("Skill name should not contain spaces");
  }

  if (skill.name.startsWith(".")) {
    errors.push("Skill name should not start with a dot");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Get skill triggers from metadata or content
 */
export const getSkillTriggers = (skill: Skill): string[] => {
  const triggers: string[] = [];

  // From metadata
  if (skill.metadata["triggers"]) {
    const metaTriggers = skill.metadata["triggers"];
    if (Array.isArray(metaTriggers)) {
      triggers.push(...metaTriggers.map(String));
    } else if (typeof metaTriggers === "string") {
      triggers.push(metaTriggers);
    }
  }

  // Skill name as trigger (e.g., /commit)
  if (!triggers.includes(`/${skill.name}`)) {
    triggers.push(`/${skill.name}`);
  }

  return triggers;
};

/**
 * Extract a summary/description from skill content
 */
export const getSkillDescription = (skill: Skill): string => {
  // From metadata first
  if (skill.metadata["description"]) {
    return String(skill.metadata["description"]);
  }

  // Try to extract from first paragraph of content
  const { body } = parseFrontmatter(skill.content);
  const lines = body.split("\n").filter((l) => l.trim() !== "");

  // Skip headings, find first paragraph
  const firstParagraph = lines.find((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("#") && trimmed.length > 10;
  });

  if (firstParagraph) {
    const trimmed = firstParagraph.trim();
    return trimmed.length > 100 ? trimmed.slice(0, 97) + "..." : trimmed;
  }

  return "No description";
};

/**
 * Calculate skill size in bytes
 */
export const getSkillSize = (skill: Skill): number => {
  return new TextEncoder().encode(skill.content).length;
};

/**
 * Format skill size for display
 */
export const formatSkillSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
};

/**
 * Get tools used by a skill/agent
 */
export const getSkillTools = (skill: Skill): string[] => {
  const toolsStr =
    skill.metadata["allowed-tools"] ?? skill.metadata["tools"] ?? "";
  if (!toolsStr || typeof toolsStr !== "string") return [];

  return toolsStr
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
};

/**
 * Extract explicit dependencies from metadata
 */
export const getExplicitDependencies = (skill: Skill): string[] => {
  const deps = skill.metadata["depends-on"];
  if (!deps) return [];
  if (Array.isArray(deps)) return deps.map(String);
  if (typeof deps === "string") return [deps];
  return [];
};

/**
 * Detect implicit dependencies by scanning content for references
 */
export const detectImplicitDependencies = (
  skill: Skill,
  allSkillNames: string[]
): string[] => {
  const deps: Set<string> = new Set();
  const content = skill.content;

  // Pattern 1: Markdown links to other skills (../skill-name/SKILL.md)
  const linkPattern = /\.\.\/([\w-]+)\/(?:SKILL|skill)\.md/gi;
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    const ref = match[1];
    if (ref && allSkillNames.includes(ref) && ref !== skill.name) {
      deps.add(ref);
    }
  }

  // Pattern 2: Slash command references (/skill-name)
  const slashPattern = /(?:^|[^/\w])\/([a-z][\w-]*)/gi;
  while ((match = slashPattern.exec(content)) !== null) {
    const ref = match[1];
    if (ref && allSkillNames.includes(ref) && ref !== skill.name) {
      deps.add(ref);
    }
  }

  // Pattern 3: "after /skill-name" or "from skill-name" patterns
  const afterPattern = /(?:after|from|using|run|invoke)\s+\/?([a-z][\w-]*)/gi;
  while ((match = afterPattern.exec(content)) !== null) {
    const ref = match[1];
    if (ref && allSkillNames.includes(ref) && ref !== skill.name) {
      deps.add(ref);
    }
  }

  return [...deps];
};

/**
 * Get all dependencies for a skill (explicit + implicit)
 */
export const getSkillDependencies = (
  skill: Skill,
  allSkillNames: string[]
): { explicit: string[]; implicit: string[] } => {
  const explicit = getExplicitDependencies(skill);
  const implicit = detectImplicitDependencies(skill, allSkillNames).filter(
    (d) => !explicit.includes(d)
  );
  return { explicit, implicit };
};

/** Dependency graph node */
export type DependencyNode = {
  name: string;
  type: SkillType;
  dependencies: string[];
  dependents: string[];
  tools: string[];
  model: string | null;
};

/**
 * Build a dependency graph from all skills
 */
export const buildDependencyGraph = (
  skills: Skill[]
): Map<string, DependencyNode> => {
  const graph = new Map<string, DependencyNode>();
  const allNames = skills.map((s) => s.name);

  // First pass: create nodes with dependencies
  skills.forEach((skill) => {
    const { explicit, implicit } = getSkillDependencies(skill, allNames);
    graph.set(skill.name, {
      name: skill.name,
      type: skill.type,
      dependencies: [...explicit, ...implicit],
      dependents: [],
      tools: getSkillTools(skill),
      model:
        typeof skill.metadata["model"] === "string"
          ? skill.metadata["model"]
          : null,
    });
  });

  // Second pass: populate dependents (reverse links)
  graph.forEach((node) => {
    node.dependencies.forEach((depName) => {
      const depNode = graph.get(depName);
      if (depNode && !depNode.dependents.includes(node.name)) {
        depNode.dependents.push(node.name);
      }
    });
  });

  return graph;
};

/**
 * Compute a deterministic hash for a skill's content
 * This hash is computed BEFORE encryption so same content = same hash
 */
export const computeSkillHash = (skill: Skill): string => {
  // Create a canonical JSON representation
  const canonical = JSON.stringify({
    name: skill.name,
    type: skill.type,
    content: skill.content,
    files: skill.files?.map((f) => ({ name: f.name, content: f.content })) ?? [],
  });
  return computeContentHash(canonical);
};

/**
 * Get the skill key (type:name format used for indexing)
 */
export const getSkillKey = (skill: Skill): string => {
  return `${skill.type}:${skill.name}`;
};
