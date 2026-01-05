/**
 * Log command - show version history for a skill
 */

import * as p from "@clack/prompts";
import { loadConfig } from "../config.js";
import { loadCredentials } from "../credentials.js";
import * as api from "../api.js";

/**
 * Format a date string for display
 */
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleString();
};

/**
 * Run the log command
 */
export const runLog = async (skillKey: string) => {
  const config = await loadConfig();

  if (!config) {
    p.log.error("Not configured. Run 'claude-skill-sync' first to set up.");
    return;
  }

  if (config.mode === "local") {
    p.log.error("Cannot view log in local-only mode.");
    return;
  }

  const credentials = await loadCredentials();
  if (!credentials?.accessToken) {
    p.log.error("Not logged in. Run 'claude-skill-sync login' first.");
    return;
  }

  // Check server connection
  const healthResult = await api.checkHealth();
  if (!healthResult.ok) {
    p.log.error(`Cannot connect to server: ${healthResult.error}`);
    return;
  }

  // Get version history
  const result = await api.getSkillVersions(skillKey);
  if (!result.ok) {
    if (result.status === 404) {
      p.log.error(`Skill not found: ${skillKey}`);
    } else {
      p.log.error(`Failed to get versions: ${result.error}`);
    }
    return;
  }

  const { versions, currentHash } = result.data;

  if (versions.length === 0) {
    p.log.info(`No versions found for ${skillKey}`);
    return;
  }

  console.log(`\nVersion history for ${skillKey}`);
  console.log("═".repeat(50));

  versions.forEach((version, index) => {
    const isCurrent = version.hash === currentHash;
    const marker = isCurrent ? " (HEAD)" : "";

    console.log(`\n${version.hash}${marker}`);
    console.log(`  Date: ${formatDate(version.createdAt)}`);
    if (version.parentHash) {
      console.log(`  Parent: ${version.parentHash}`);
    }
    if (version.message) {
      console.log(`  Message: ${version.message}`);
    }
    if (index < versions.length - 1) {
      console.log("  │");
    }
  });

  console.log("");
};
