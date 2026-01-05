/**
 * Pull command - download remote skills to local
 */

import * as p from "@clack/prompts";
import {
  listAllSkills,
  getSkillKey,
} from "@claudeskill/core";
import { loadConfig } from "../config.js";
import { loadCredentials } from "../credentials.js";
import { getMasterKey, pullSkills, loadSyncIndex } from "../sync.js";
import * as api from "../api.js";

export type PullOptions = Partial<{
  interactive: boolean;
}>;

/**
 * Run the pull command
 */
export const runPull = async (options: PullOptions = {}) => {
  const config = await loadConfig();

  if (!config) {
    p.log.error("Not configured. Run 'claude-skill-sync' first to set up.");
    return;
  }

  if (config.mode === "local") {
    p.log.error("Cannot pull in local-only mode. Change mode with 'claude-skill-sync config'.");
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

  // In interactive mode, show preview of what will be pulled
  if (options.interactive) {
    const spinner = p.spinner();
    spinner.start("Checking for updates...");

    const skills = await listAllSkills();
    const index = await loadSyncIndex();
    const localSkillKeys = new Set(skills.map((s) => getSkillKey(s)));

    // Get remote skills list
    const listResult = await api.listSkills();
    if (!listResult.ok) {
      spinner.stop("Failed to check updates");
      p.log.error(`Cannot list remote skills: ${listResult.error}`);
      return;
    }

    const changes = listResult.data.skills
      .filter((remoteSkill) => remoteSkill.currentHash)
      .map((remoteSkill) => {
        const existing = index.skills[remoteSkill.skillKey];

        if (!localSkillKeys.has(remoteSkill.skillKey)) {
          return { skillKey: remoteSkill.skillKey, status: "new" as const };
        }

        if (existing?.hash !== remoteSkill.currentHash) {
          return { skillKey: remoteSkill.skillKey, status: "updated" as const };
        }

        return null;
      })
      .filter((change): change is { skillKey: string; status: "new" | "updated" } => change !== null);

    spinner.stop("Updates checked");

    if (changes.length === 0) {
      p.log.info("No updates to pull. Everything is up to date.");
      return;
    }

    // Show preview
    console.log("");
    console.log("Updates to pull:");
    changes.forEach((change) => {
      const icon = change.status === "new" ? "+" : "~";
      const label = change.status === "new" ? "new" : "updated";
      console.log(`  ${icon} ${change.skillKey} (${label})`);
    });
    console.log("");

    // Confirm
    const confirm = await p.confirm({
      message: `Pull ${changes.length} item${changes.length === 1 ? "" : "s"}?`,
    });

    if (p.isCancel(confirm) || !confirm) {
      p.cancel("Pull cancelled.");
      return;
    }
  }

  // Get passphrase to unlock vault
  const passphrase = await p.password({
    message: "Vault passphrase:",
    mask: "*",
  });

  if (p.isCancel(passphrase)) {
    p.cancel("Pull cancelled.");
    return;
  }

  // Get master key
  const spinner = p.spinner();
  spinner.start("Unlocking vault...");

  const masterKey = await getMasterKey(passphrase);
  if (!masterKey) {
    spinner.stop("Failed to unlock vault");
    p.log.error("Invalid passphrase or corrupted credentials.");
    return;
  }

  spinner.stop("Vault unlocked");

  // Pull skills
  spinner.start("Pulling skills...");

  const { pulled, errors } = await pullSkills(masterKey, (msg) => {
    spinner.message(msg);
  });

  spinner.stop("Pull complete");

  // Report results
  if (pulled > 0) {
    p.log.success(`Pulled ${pulled} skill${pulled === 1 ? "" : "s"}`);
  } else {
    p.log.info("No new skills to pull");
  }

  if (errors.length > 0) {
    p.log.warning("Some skills failed to pull:");
    errors.forEach((error) => {
      p.log.error(`  ${error}`);
    });
  }
};
