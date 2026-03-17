/**
 * Push command - upload local skills to server
 */

import * as p from "@clack/prompts";
import {
  listAllSkills,
  computeSkillHash,
  getSkillKey,
  type SkillType,
} from "@claudeskill/core";
import { loadConfig } from "../config.js";
import { loadCredentials } from "../credentials.js";
import { getMasterKey, pushSkills, loadSyncIndex } from "../sync.js";
import { ensureKeypair, getTeamKeyForTeam, runDistributeKeys } from "./team.js";
import * as api from "../api.js";

export type PushOptions = Partial<{
  message: string;
  interactive: boolean;
}>;

/**
 * Run the push command
 */
export const runPush = async (options: PushOptions = {}) => {
  const config = await loadConfig();

  if (!config) {
    p.log.error("Not configured. Run 'claudeskill' first to set up.");
    return;
  }

  if (config.mode === "local") {
    p.log.error("Cannot push in local-only mode. Change mode with 'claudeskill config'.");
    return;
  }

  const credentials = await loadCredentials();
  if (!credentials?.accessToken) {
    p.log.error("Not logged in. Run 'claudeskill login' first.");
    return;
  }

  // Check server connection
  const healthResult = await api.checkHealth();
  if (!healthResult.ok) {
    p.log.error(`Cannot connect to server: ${healthResult.error}`);
    return;
  }

  // In interactive mode, show preview of what will be pushed
  if (options.interactive) {
    const spinner = p.spinner();
    spinner.start("Checking for changes...");

    const skills = await listAllSkills();
    const index = await loadSyncIndex();

    const changes = skills
      .map((skill) => {
        const skillKey = getSkillKey(skill);
        const contentHash = computeSkillHash(skill);
        const existing = index.skills[skillKey];

        if (!existing) {
          return { name: skill.name, type: skill.type, status: "new" as const };
        }

        if (existing.hash !== contentHash) {
          return { name: skill.name, type: skill.type, status: "modified" as const };
        }

        return null;
      })
      .filter((change): change is { name: string; type: SkillType; status: "new" | "modified" } => change !== null);

    spinner.stop("Changes detected");

    if (changes.length === 0) {
      p.log.info("No changes to push. Everything is up to date.");
      return;
    }

    // Show preview
    console.log("");
    console.log("Changes to push:");
    changes.forEach((change) => {
      const icon = change.status === "new" ? "+" : "~";
      const label = change.status === "new" ? "new" : "modified";
      console.log(`  ${icon} ${change.type}/${change.name} (${label})`);
    });
    console.log("");

    // Confirm
    const confirm = await p.confirm({
      message: `Push ${changes.length} item${changes.length === 1 ? "" : "s"}?`,
    });

    if (p.isCancel(confirm) || !confirm) {
      p.cancel("Push cancelled.");
      return;
    }

    // Ask for commit message
    const commitMessage = await p.text({
      message: "Commit message (optional):",
      placeholder: "Describe your changes...",
    });

    if (p.isCancel(commitMessage)) {
      p.cancel("Push cancelled.");
      return;
    }

    if (commitMessage) {
      options.message = commitMessage;
    }
  }

  // Get passphrase to unlock vault
  const passphrase = await p.password({
    message: "Vault passphrase:",
    mask: "*",
  });

  if (p.isCancel(passphrase)) {
    p.cancel("Push cancelled.");
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

  // Push skills
  spinner.start("Pushing skills...");

  const { pushed, errors } = await pushSkills(masterKey, (msg) => {
    spinner.message(msg);
  }, options.message);

  spinner.stop("Push complete");

  // Report results
  if (pushed > 0) {
    p.log.success(`Pushed ${pushed} skill${pushed === 1 ? "" : "s"}`);
  } else {
    p.log.info("No changes to push");
  }

  if (errors.length > 0) {
    p.log.warning("Some skills failed to push:");
    errors.forEach((error) => {
      p.log.error(`  ${error}`);
    });
  }

  // Auto-distribute team keys to pending members
  try {
    const keypair = await ensureKeypair(masterKey);
    const teamsResult = await api.listTeams();
    if (teamsResult.ok) {
      const managedTeams = teamsResult.data.teams.filter(
        (t) => (t.role === "owner" || t.role === "admin") && t.status === "active"
      );
      if (managedTeams.length > 0) {
        const teamKeys = new Map<string, Uint8Array>();
        for (const team of managedTeams) {
          const key = await getTeamKeyForTeam(team.id, masterKey, keypair);
          if (key) teamKeys.set(team.id, key);
        }
        if (teamKeys.size > 0) {
          await runDistributeKeys(masterKey, teamKeys);
        }
      }
    }
  } catch {
    // Silently skip key distribution if it fails
  }
};
