/**
 * Diff command - compare two versions of a skill
 */

import * as p from "@clack/prompts";
import { loadConfig } from "../config.js";
import { loadCredentials } from "../credentials.js";
import { getMasterKey, decryptSkill } from "../sync.js";
import * as api from "../api.js";

/**
 * Simple line-by-line diff
 */
const simpleDiff = (oldLines: string[], newLines: string[]): string[] => {
  const output: string[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    const oldLine = oldLines[i];
    const newLine = newLines[j];

    if (oldLine === newLine) {
      output.push(`  ${oldLine ?? ""}`);
      i++;
      j++;
    } else if (oldLine && !newLines.slice(j).includes(oldLine)) {
      // Line was removed
      output.push(`- ${oldLine}`);
      i++;
    } else if (newLine && !oldLines.slice(i).includes(newLine)) {
      // Line was added
      output.push(`+ ${newLine}`);
      j++;
    } else {
      // Line was changed
      if (oldLine) {
        output.push(`- ${oldLine}`);
        i++;
      }
      if (newLine) {
        output.push(`+ ${newLine}`);
        j++;
      }
    }
  }

  return output;
};

/**
 * Run the diff command
 */
export const runDiff = async (skillKey: string, hash1: string, hash2: string) => {
  const config = await loadConfig();

  if (!config) {
    p.log.error("Not configured. Run 'claude-skill-sync' first to set up.");
    return;
  }

  if (config.mode === "local") {
    p.log.error("Cannot diff in local-only mode.");
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
    p.cancel("Diff cancelled.");
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

  // Fetch both versions
  spinner.start("Fetching versions...");

  const [result1, result2] = await Promise.all([
    api.getSkillVersion(skillKey, hash1),
    api.getSkillVersion(skillKey, hash2),
  ]);

  if (!result1.ok) {
    spinner.stop("Failed");
    p.log.error(`Version ${hash1} not found`);
    return;
  }

  if (!result2.ok) {
    spinner.stop("Failed");
    p.log.error(`Version ${hash2} not found`);
    return;
  }

  // Decrypt both versions
  spinner.message("Decrypting...");

  let decrypted1, decrypted2;
  try {
    decrypted1 = decryptSkill(
      result1.data.encryptedData,
      result1.data.iv,
      result1.data.tag,
      masterKey
    );
    decrypted2 = decryptSkill(
      result2.data.encryptedData,
      result2.data.iv,
      result2.data.tag,
      masterKey
    );
  } catch (err) {
    spinner.stop("Failed");
    p.log.error(`Failed to decrypt: ${err}`);
    return;
  }

  spinner.stop("Versions loaded");

  // Show diff
  console.log(`\nDiff: ${hash1} → ${hash2}`);
  console.log("═".repeat(50));

  const oldLines = decrypted1.content.split("\n");
  const newLines = decrypted2.content.split("\n");
  const diffLines = simpleDiff(oldLines, newLines);

  // Show with colors
  diffLines.forEach((line) => {
    if (line.startsWith("+")) {
      console.log(`\x1b[32m${line}\x1b[0m`); // Green
    } else if (line.startsWith("-")) {
      console.log(`\x1b[31m${line}\x1b[0m`); // Red
    } else {
      console.log(line);
    }
  });

  console.log("");

  // Show file changes if any
  const oldFiles = new Set(decrypted1.files?.map((f) => f.name) ?? []);
  const newFiles = new Set(decrypted2.files?.map((f) => f.name) ?? []);

  const addedFiles = [...newFiles].filter((f) => !oldFiles.has(f));
  const removedFiles = [...oldFiles].filter((f) => !newFiles.has(f));

  if (addedFiles.length > 0 || removedFiles.length > 0) {
    console.log("File changes:");
    addedFiles.forEach((f) => {
      console.log(`\x1b[32m  + ${f}\x1b[0m`);
    });
    removedFiles.forEach((f) => {
      console.log(`\x1b[31m  - ${f}\x1b[0m`);
    });
    console.log("");
  }
};
