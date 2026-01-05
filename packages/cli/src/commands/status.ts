/**
 * Status command - show sync status
 */

import * as p from "@clack/prompts";
import { loadConfig, getDefaultConfig } from "../config.js";
import { loadCredentials } from "../credentials.js";
import { getSyncStatus, loadSyncIndex } from "../sync.js";
import * as api from "../api.js";

/**
 * Format relative time
 */
const formatRelativeTime = (isoString: string): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
};

/**
 * Run the status command
 */
export const runStatus = async () => {
  const config = (await loadConfig()) ?? getDefaultConfig();
  const credentials = await loadCredentials();

  const spinner = p.spinner();
  spinner.start("Checking status...");

  // Get local sync index
  const syncIndex = await loadSyncIndex();
  const lastSyncAt = syncIndex.lastSyncAt
    ? formatRelativeTime(syncIndex.lastSyncAt)
    : "never";

  // Try to get full status if authenticated
  let status = {
    local: 0,
    synced: 0,
    pendingPush: 0,
    pendingPull: 0,
  };

  let serverConnected = false;

  if (config.mode !== "local" && credentials?.accessToken) {
    const healthResult = await api.checkHealth();
    serverConnected = healthResult.ok;

    if (serverConnected) {
      try {
        status = await getSyncStatus();
      } catch {
        // Failed to get status, use defaults
      }
    }
  } else {
    // Just count local skills
    const { listAllSkills } = await import("@claudeskill/core");
    const skills = await listAllSkills();
    status.local = skills.length;
    status.pendingPush = skills.length;
  }

  spinner.stop("Status loaded");

  // Build tree output
  console.log("");
  console.log("Sync Status");
  console.log(`├── Local:  ${config.skillsPath}`);

  if (config.mode === "cloud") {
    const connStatus = serverConnected ? "connected" : "not connected";
    console.log(`├── Remote: ${config.serverUrl} (${connStatus})`);
  } else if (config.mode === "selfhosted") {
    const connStatus = serverConnected ? "connected" : "not connected";
    console.log(`├── Remote: ${config.serverUrl} (${connStatus})`);
  } else {
    console.log("├── Remote: (local only mode)");
  }

  console.log(`├── Last sync: ${lastSyncAt}`);
  console.log("│");

  // Skill counts
  console.log(`├── ✓ ${status.synced} synced`);
  console.log(`├── ○ ${status.local} local total`);
  console.log(`├── ⬆ ${status.pendingPush} pending push`);
  console.log(`└── ⬇ ${status.pendingPull} pending pull`);

  console.log("");

  // Helpful hints
  if (!credentials?.accessToken && config.mode !== "local") {
    p.log.info("Run 'claude-skill-sync login' to connect to the server.");
  } else if (status.pendingPush > 0) {
    p.log.info("Run 'claude-skill-sync push' to upload your changes.");
  } else if (status.pendingPull > 0) {
    p.log.info("Run 'claude-skill-sync pull' to download remote changes.");
  }
};
