/**
 * Checkout command - restore a specific version of a skill
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { getClaudeDir, type SkillType } from "@claudeskill/core";
import { loadConfig } from "../config.js";
import { loadCredentials } from "../credentials.js";
import { getMasterKey, decryptSkill, loadSyncIndex, saveSyncIndex } from "../sync.js";
import * as api from "../api.js";

/** Get the target directory for a skill type */
const getSkillTypeDir = (type: SkillType): string => {
  const claudeDir = getClaudeDir();
  const typeDirs: Record<SkillType, string> = {
    command: "commands",
    skill: "skills",
    agent: "agents",
  };
  return join(claudeDir, typeDirs[type]);
};

/**
 * Run the checkout command
 */
export const runCheckout = async (skillKey: string, hash: string) => {
  const config = await loadConfig();

  if (!config) {
    p.log.error("Not configured. Run 'claude-skill-sync' first to set up.");
    return;
  }

  if (config.mode === "local") {
    p.log.error("Cannot checkout in local-only mode.");
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

  // Get passphrase to unlock vault
  const passphrase = await p.password({
    message: "Vault passphrase:",
    mask: "*",
  });

  if (p.isCancel(passphrase)) {
    p.cancel("Checkout cancelled.");
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

  // Get the specific version
  spinner.start(`Fetching version ${hash}...`);

  const result = await api.getSkillVersion(skillKey, hash);
  if (!result.ok) {
    spinner.stop("Failed");
    if (result.status === 404) {
      p.log.error(`Version ${hash} not found for ${skillKey}`);
    } else {
      p.log.error(`Failed to get version: ${result.error}`);
    }
    return;
  }

  // Decrypt the skill
  spinner.message("Decrypting...");

  let decrypted;
  try {
    decrypted = decryptSkill(
      result.data.encryptedData,
      result.data.iv,
      result.data.tag,
      masterKey
    );
  } catch (err) {
    spinner.stop("Failed");
    p.log.error(`Failed to decrypt: ${err}`);
    return;
  }

  // Write to local filesystem
  spinner.message("Writing files...");

  const skillType = decrypted.type ?? "command";
  const baseDir = getSkillTypeDir(skillType);

  try {
    if (skillType === "skill" && decrypted.files) {
      // Directory-based skill
      const skillDir = join(baseDir, decrypted.name);
      await mkdir(skillDir, { recursive: true });

      // Write main skill file
      await writeFile(join(skillDir, "SKILL.md"), decrypted.content, "utf-8");

      // Write supporting files
      await Promise.all(
        decrypted.files.map((f) =>
          writeFile(join(skillDir, f.name), f.content, "utf-8")
        )
      );
    } else {
      // File-based skill (command or agent)
      await mkdir(baseDir, { recursive: true });
      await writeFile(join(baseDir, `${decrypted.name}.md`), decrypted.content, "utf-8");
    }
  } catch (err) {
    spinner.stop("Failed");
    p.log.error(`Failed to write files: ${err}`);
    return;
  }

  // Update sync index
  const index = await loadSyncIndex();
  const hashContent = (content: string): string => {
    const hash = Array.from(content).reduce((hash, char) => {
      const code = char.charCodeAt(0);
      const newHash = (hash << 5) - hash + code;
      return newHash & newHash;
    }, 0);
    return hash.toString(16);
  };

  index.skills[skillKey] = {
    hash,
    blobId: null,
    localHash: hashContent(decrypted.content + JSON.stringify(decrypted.files ?? [])),
    remoteUpdatedAt: result.data.createdAt,
  };
  await saveSyncIndex(index);

  spinner.stop(`Checked out ${skillKey} @ ${hash}`);
  p.log.success(`Restored ${skillType}/${decrypted.name} to version ${hash}`);
};
