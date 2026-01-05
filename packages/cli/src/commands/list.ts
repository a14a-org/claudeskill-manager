/**
 * List command - show all skills with tree visualization
 */

import * as p from "@clack/prompts";
import {
  listAllSkills,
  formatSkillSize,
  getSkillSize,
  getSkillDescription,
  buildDependencyGraph,
  getSkillTools,
  type SkillType,
  type Skill,
  type DependencyNode,
} from "@claudeskill/core";

/** List command options */
type ListOptions = Partial<{
  tree: boolean;
  tools: boolean;
}>;

/** Format skill type for display */
const formatType = (type: SkillType) => {
  const labels: Record<SkillType, string> = {
    command: "command",
    skill: "skill",
    agent: "agent",
  };
  return labels[type];
};

/**
 * Format relative time
 */
const formatRelativeTime = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
};

/**
 * Render dependency tree view
 */
const renderDependencyTree = (
  skills: Skill[],
  graph: Map<string, DependencyNode>
) => {
  console.log("");
  console.log("Dependency Graph");
  console.log("");

  // Find workflows (skills with dependencies or dependents)
  const workflows: DependencyNode[] = [];
  const standalone: DependencyNode[] = [];
  const pipelines: { from: DependencyNode; to: DependencyNode }[] = [];

  graph.forEach((node) => {
    const hasDeps = node.dependencies.length > 0;
    const hasDependents = node.dependents.length > 0;

    if (hasDeps || hasDependents) {
      // Check if it's a pipeline (agent depends on skill)
      node.dependencies.forEach((depName) => {
        const depNode = graph.get(depName);
        if (depNode && node.type === "agent" && depNode.type === "skill") {
          pipelines.push({ from: depNode, to: node });
        }
      });

      if (hasDeps && !hasDependents) {
        // This is a "consumer" - has deps but nothing depends on it
        workflows.push(node);
      }
    } else {
      standalone.push(node);
    }
  });

  // Render workflows (things that orchestrate others)
  if (workflows.length > 0) {
    console.log("├── Workflows");
    workflows.forEach((node, i) => {
      const isLast = i === workflows.length - 1;
      const prefix = isLast ? "│   └── " : "│   ├── ";
      const childPrefix = isLast ? "│       " : "│   │   ";

      console.log(`${prefix}${node.name} (${node.type})`);
      node.dependencies.forEach((dep, j) => {
        const depNode = graph.get(dep);
        const depIsLast = j === node.dependencies.length - 1;
        const depPrefix = depIsLast ? "└── " : "├── ";
        const depType = depNode?.type ?? "?";
        console.log(`${childPrefix}${depPrefix}→ ${dep} (${depType})`);
      });
    });
    console.log("│");
  }

  // Render pipelines (skill → agent flows)
  if (pipelines.length > 0) {
    console.log("├── Pipelines");
    pipelines.forEach((pipeline, i) => {
      const isLast = i === pipelines.length - 1;
      const prefix = isLast ? "│   └── " : "│   ├── ";
      console.log(
        `${prefix}${pipeline.from.name} → ${pipeline.to.name}`
      );
      console.log(
        `${isLast ? "│       " : "│   │   "}└── (${pipeline.from.type} feeds ${pipeline.to.type})`
      );
    });
    console.log("│");
  }

  // Render standalone by type
  const standaloneByType = standalone.reduce(
    (acc, node) => {
      acc[node.type].push(node);
      return acc;
    },
    { command: [], skill: [], agent: [] } as Record<SkillType, DependencyNode[]>
  );

  const types: SkillType[] = ["skill", "agent", "command"];
  const hasStandalone = types.some((t) => standaloneByType[t].length > 0);

  if (hasStandalone) {
    console.log("└── Standalone");
    types.forEach((type, typeIdx) => {
      const items = standaloneByType[type];
      if (items.length === 0) return;

      const remainingTypes = types.slice(typeIdx + 1);
      const isLastType = remainingTypes.every(
        (t) => standaloneByType[t].length === 0
      );
      const typePrefix = isLastType ? "    └── " : "    ├── ";
      const typeChildPrefix = isLastType ? "        " : "    │   ";

      const typeLabels: Record<SkillType, string> = {
        command: "Commands",
        skill: "Skills",
        agent: "Agents",
      };

      console.log(`${typePrefix}${typeLabels[type]} (${items.length})`);
      items.forEach((node, i) => {
        const isLast = i === items.length - 1;
        const prefix = isLast ? "└── " : "├── ";
        const modelInfo = node.model ? ` [${node.model}]` : "";
        console.log(`${typeChildPrefix}${prefix}${node.name}${modelInfo}`);
      });
    });
  }

  console.log("");
};

/**
 * Render tool usage matrix
 */
const renderToolMatrix = (
  skills: Skill[],
  graph: Map<string, DependencyNode>
) => {
  console.log("");
  console.log("Tool Usage Matrix");
  console.log("");

  // Collect all unique tools
  const allTools = new Set<string>();
  graph.forEach((node) => {
    node.tools.forEach((t) => allTools.add(t));
  });

  const tools = [...allTools].sort();
  if (tools.length === 0) {
    console.log("No tool declarations found in skills/agents.");
    console.log("");
    return;
  }

  // Calculate column widths
  const nameWidth = Math.max(
    20,
    ...skills.map((s) => s.name.length + s.type.length + 3)
  );
  const toolWidth = 6;

  // Header
  const header =
    "Name".padEnd(nameWidth) + tools.map((t) => t.padStart(toolWidth)).join("");
  console.log(header);
  console.log("─".repeat(header.length));

  // Sort skills: skills first, then agents, then commands
  const sorted = [...skills].sort((a, b) => {
    const typeOrder = { skill: 0, agent: 1, command: 2 };
    if (a.type !== b.type) return typeOrder[a.type] - typeOrder[b.type];
    return a.name.localeCompare(b.name);
  });

  // Rows
  sorted.forEach((skill) => {
    const node = graph.get(skill.name);
    const skillTools = new Set(node?.tools ?? []);
    const name = `${skill.name} (${skill.type.charAt(0)})`.padEnd(nameWidth);
    const cells = tools
      .map((t) => (skillTools.has(t) ? "✓" : "·").padStart(toolWidth))
      .join("");
    console.log(name + cells);
  });

  console.log("");

  // Legend
  console.log("Legend: (s) = skill, (a) = agent, (c) = command");
  console.log("");
};

/**
 * Render default list view
 */
const renderDefaultList = (skills: Skill[]) => {
  // Group by type
  const byType = skills.reduce(
    (acc, skill) => {
      acc[skill.type].push(skill);
      return acc;
    },
    { command: [], skill: [], agent: [] } as Record<SkillType, Skill[]>
  );

  // Build tree output
  console.log("");
  console.log(`Claude Skills & Agents (${skills.length} total)`);

  const types: SkillType[] = ["command", "skill", "agent"];
  const typeLabels: Record<SkillType, string> = {
    command: "Commands",
    skill: "Skills",
    agent: "Agents",
  };

  types.forEach((type, typeIndex) => {
    const items = byType[type];
    if (items.length === 0) return;

    const isLastType = types
      .slice(typeIndex + 1)
      .every((t) => byType[t].length === 0);
    const typePrefix = isLastType ? "└── " : "├── ";
    const typeChildPrefix = isLastType ? "    " : "│   ";

    console.log(`${typePrefix}${typeLabels[type]} (${items.length})`);

    items.forEach((skill, index) => {
      const isLast = index === items.length - 1;
      const prefix = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";

      const size = getSkillSize(skill);
      const formattedSize = formatSkillSize(size);
      const relativeTime = formatRelativeTime(skill.modifiedAt);
      const description = getSkillDescription(skill);
      const hasFiles = skill.files && skill.files.length > 0;

      // Skill name
      console.log(`${typeChildPrefix}${prefix}${skill.name}`);

      // Description
      console.log(`${typeChildPrefix}${childPrefix}├── ${description}`);

      // Supporting files count (for directory skills)
      if (hasFiles) {
        console.log(
          `${typeChildPrefix}${childPrefix}├── Files: ${skill.files!.length + 1}`
        );
      }

      // Last modified
      console.log(
        `${typeChildPrefix}${childPrefix}├── Modified: ${relativeTime}`
      );

      // Size
      console.log(`${typeChildPrefix}${childPrefix}└── Size: ${formattedSize}`);
    });
  });

  console.log("");
};

/**
 * Run the list command
 */
export const runList = async (options: ListOptions = {}) => {
  const spinner = p.spinner();
  spinner.start("Loading skills...");

  const skills = await listAllSkills();
  const graph = buildDependencyGraph(skills);

  spinner.stop(`Found ${skills.length} item${skills.length === 1 ? "" : "s"}`);

  if (skills.length === 0) {
    p.log.info("No skills, commands, or agents found in ~/.claude/");
    p.log.info("Create a skill file to get started.");
    return;
  }

  if (options.tree) {
    renderDependencyTree(skills, graph);
  } else if (options.tools) {
    renderToolMatrix(skills, graph);
  } else {
    renderDefaultList(skills);
  }
};
