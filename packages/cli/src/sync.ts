/**
 * Sync logic for skills
 *
 * Handles encrypting, uploading, downloading, and decrypting skills.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  listAllSkills,
  encryptString,
  decryptString,
  deriveKeyFromPassphrase,
  decryptMasterKey,
  fromBase64,
  getClaudeDir,
  computeSkillHash,
  getSkillKey,
  type Skill,
  type SkillType,
} from "@claudeskill/core";
import { loadConfig, getDefaultConfig } from "./config.js";
import { loadCredentials } from "./credentials.js";
import * as api from "./api.js";

/** Local index file tracking synced skills */
type SyncIndex = {
  /** Map of skill key to sync info */
  skills: Record<
    string,
    {
      /** Content hash of the skill (version identifier) */
      hash: string;
      /** Legacy blob ID (for migration) */
      blobId: string | null;
      /** Local content hash for change detection */
      localHash: string;
      /** When the remote was last updated */
      remoteUpdatedAt: string;
    }
  >;
  lastSyncAt: string;
};

const SYNC_INDEX_FILE = "sync-index.json";

/**
 * Get path to sync index file
 */
const getSyncIndexPath = async () => {
  const { getConfigDir } = await import("./config.js");
  return join(getConfigDir(), SYNC_INDEX_FILE);
};

/**
 * Load sync index
 */
export const loadSyncIndex = async () => {
  try {
    const content = await readFile(await getSyncIndexPath(), "utf-8");
    return JSON.parse(content) as SyncIndex;
  } catch {
    return { skills: {}, lastSyncAt: "" };
  }
};

/**
 * Save sync index
 */
export const saveSyncIndex = async (index: SyncIndex) => {
  const indexPath = await getSyncIndexPath();
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
};

/**
 * Simple hash for change detection
 */
const hashContent = (content: string) => {
  const hash = Array.from(content).reduce((hash, char) => {
    const code = char.charCodeAt(0);
    const newHash = (hash << 5) - hash + code;
    return newHash & newHash; // Convert to 32-bit integer
  }, 0);
  return hash.toString(16);
};

/**
 * Get the master key from credentials
 */
export const getMasterKey = async (
  passphrase: string
) => {
  const credentials = await loadCredentials();
  if (!credentials?.encryptedMasterKey || !credentials?.salt) {
    return null;
  }

  try {
    const salt = fromBase64(credentials.salt);
    const encryptedMasterKey = fromBase64(credentials.encryptedMasterKey);

    // The encrypted master key includes IV and tag
    // Format: iv (12 bytes) + tag (16 bytes) + ciphertext
    const iv = encryptedMasterKey.slice(0, 12);
    const tag = encryptedMasterKey.slice(12, 28);
    const ciphertext = encryptedMasterKey.slice(28);

    const derivedKey = deriveKeyFromPassphrase(passphrase, salt);
    const masterKey = decryptMasterKey(ciphertext, derivedKey.key, iv, tag);

    return masterKey;
  } catch {
    return null;
  }
};

/**
 * Encrypt a skill for upload
 */
export const encryptSkill = (
  skill: Skill,
  masterKey: Uint8Array
): { encryptedData: string; iv: string; tag: string } => {
  // Create a JSON payload with skill metadata
  const payload = JSON.stringify({
    name: skill.name,
    content: skill.content,
    path: skill.path,
    modifiedAt: skill.modifiedAt.toISOString(),
    type: skill.type,
    files: skill.files,
  });

  const { ciphertext, iv, tag } = encryptString(payload, masterKey);
  return { encryptedData: ciphertext, iv, tag };
};

/** Decrypted skill payload */
type DecryptedSkillPayload = {
  name: string;
  content: string;
  path: string;
  modifiedAt: string;
  type: SkillType | undefined;
  files: { name: string; content: string }[] | undefined;
};

/**
 * Decrypt a skill from download
 */
export const decryptSkill = (
  encryptedData: string,
  iv: string,
  tag: string,
  masterKey: Uint8Array
): DecryptedSkillPayload => {
  const payload = decryptString(encryptedData, masterKey, iv, tag);
  return JSON.parse(payload);
};

/**
 * Push local skills to server
 */
export const pushSkills = async (
  masterKey: Uint8Array,
  onProgress: ((message: string) => void) | undefined,
  message: string | undefined
) => {
  const skills = await listAllSkills();
  const index = await loadSyncIndex();

  const results = await Promise.all(
    skills.map(async (skill) => {
      // Use type:name as key to allow same name across types
      const skillKey = getSkillKey(skill);
      const contentHash = computeSkillHash(skill);
      const localHash = hashContent(skill.content + JSON.stringify(skill.files ?? []));
      const existing = index.skills[skillKey];

      // Skip if unchanged (same content hash)
      if (existing?.hash === contentHash) {
        onProgress?.(`Skipping ${skill.name} (unchanged)`);
        return { type: 'skipped' as const };
      }

      onProgress?.(`Pushing ${skill.type}/${skill.name} [${contentHash}]...`);

      // Encrypt skill
      const encrypted = encryptSkill(skill, masterKey);

      // Push new version
      const result = await api.pushSkillVersion(
        skillKey,
        contentHash,
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.tag,
        message
      );

      if (result.ok) {
        return {
          type: 'success' as const,
          skillKey,
          hash: contentHash,
          localHash,
          remoteUpdatedAt: (result.data as { createdAt: string }).createdAt,
        };
      }

      return {
        type: 'error' as const,
        message: `Failed to push ${skill.type}/${skill.name}: ${result.error}`,
      };
    })
  );

  // Process results
  index.skills = results
    .filter((result) => result.type === 'success')
    .reduce((acc, result) => {
      if (result.type === 'success') {
        acc[result.skillKey] = {
          hash: result.hash,
          blobId: null,
          localHash: result.localHash,
          remoteUpdatedAt: result.remoteUpdatedAt,
        };
      }
      return acc;
    }, index.skills);

  const pushed = results.filter((r) => r.type === 'success').length;
  const errors = results
    .filter((r) => r.type === 'error')
    .map((r) => r.type === 'error' ? r.message : '');

  // Save updated index
  index.lastSyncAt = new Date().toISOString();
  await saveSyncIndex(index);

  return { pushed, errors };
};

/** Get the target directory for a skill type */
const getSkillTypeDir = (type: SkillType) => {
  const claudeDir = getClaudeDir();
  const typeDirs: Record<SkillType, string> = {
    command: "commands",
    skill: "skills",
    agent: "agents",
  };
  return join(claudeDir, typeDirs[type]);
};

/**
 * Pull remote skills to local
 */
export const pullSkills = async (
  masterKey: Uint8Array,
  onProgress: ((message: string) => void) | undefined
) => {
  const index = await loadSyncIndex();

  // Get list of remote skills
  const listResult = await api.listSkills();
  if (!listResult.ok) {
    return { pulled: 0, errors: [`Failed to list skills: ${listResult.error}`] };
  }

  const results = await Promise.all(
    listResult.data.skills.map(async (remoteSkill) => {
      const existing = index.skills[remoteSkill.skillKey];

      // Skip if unchanged (same hash)
      if (existing?.hash === remoteSkill.currentHash) {
        onProgress?.(`Skipping ${remoteSkill.skillKey} (unchanged)`);
        return { type: 'skipped' as const };
      }

      // Skip if no versions
      if (!remoteSkill.currentHash) {
        onProgress?.(`Skipping ${remoteSkill.skillKey} (no versions)`);
        return { type: 'skipped' as const };
      }

      onProgress?.(`Pulling ${remoteSkill.skillKey} [${remoteSkill.currentHash}]...`);

      // Download current version
      const skillResult = await api.getSkill(remoteSkill.skillKey);
      if (!skillResult.ok) {
        return {
          type: 'error' as const,
          message: `Failed to get ${remoteSkill.skillKey}: ${skillResult.error}`,
        };
      }

      // Decrypt
      let decrypted: DecryptedSkillPayload;
      try {
        decrypted = decryptSkill(
          skillResult.data.encryptedData,
          skillResult.data.iv,
          skillResult.data.tag,
          masterKey
        );
      } catch (err) {
        return {
          type: 'error' as const,
          message: `Failed to decrypt ${remoteSkill.skillKey}: ${err}`,
        };
      }

      const skillType = decrypted.type ?? "command";
      const skillKey = remoteSkill.skillKey;
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
        return {
          type: 'error' as const,
          message: `Failed to write ${decrypted.name}: ${err}`,
        };
      }

      onProgress?.(`Pulled ${skillType}/${decrypted.name} [${remoteSkill.currentHash}]`);

      return {
        type: 'success' as const,
        skillKey,
        hash: remoteSkill.currentHash,
        content: decrypted.content,
        files: decrypted.files,
        updatedAt: remoteSkill.updatedAt,
      };
    })
  );

  // Process results
  index.skills = results
    .filter((result) => result.type === 'success')
    .reduce((acc, result) => {
      if (result.type === 'success') {
        acc[result.skillKey] = {
          hash: result.hash,
          blobId: null,
          localHash: hashContent(result.content + JSON.stringify(result.files ?? [])),
          remoteUpdatedAt: result.updatedAt,
        };
      }
      return acc;
    }, index.skills);

  const pulled = results.filter((r) => r.type === 'success').length;
  const errors = results
    .filter((r) => r.type === 'error')
    .map((r) => r.type === 'error' ? r.message : '');

  // Save updated index
  index.lastSyncAt = new Date().toISOString();
  await saveSyncIndex(index);

  return { pulled, errors };
};

/**
 * Get sync status for all skills
 */
export const getSyncStatus = async () => {
  const skills = await listAllSkills();
  const index = await loadSyncIndex();

  const skillStatuses = skills.map((skill) => {
    const skillKey = getSkillKey(skill);
    const contentHash = computeSkillHash(skill);
    const existing = index.skills[skillKey];
    return existing?.hash === contentHash ? 'synced' : 'pending';
  });

  const synced = skillStatuses.filter((s) => s === 'synced').length;
  const pendingPush = skillStatuses.filter((s) => s === 'pending').length;

  // Check for remote-only skills (pending pull)
  const listResult = await api.listSkills();
  const localSkillKeys = new Set(skills.map((s) => getSkillKey(s)));
  const pendingPull = listResult.ok
    ? listResult.data.skills.filter(
        (s) => s.currentHash && !localSkillKeys.has(s.skillKey)
      ).length
    : 0;

  return {
    local: skills.length,
    synced,
    pendingPush,
    pendingPull,
    lastSyncAt: index.lastSyncAt || null,
  };
};
