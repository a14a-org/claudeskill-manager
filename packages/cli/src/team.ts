/**
 * Team skill sync module
 *
 * Manages local team skill directories and syncs with the server.
 * Team skills are stored in ~/.config/claude-skill-sync/teams/<slug>/
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  computeSkillHash,
  listDirectorySkills,
  listSkills,
  type Skill,
  type SkillType,
} from "@claudeskill/core";
import { getConfigDir } from "./config.js";
import { decryptSkill, encryptSkill } from "./sync.js";
import * as api from "./api.js";

type TeamSyncIndex = {
  skills: Record<
    string,
    {
      hash: string;
      localHash: string;
      remoteUpdatedAt: string;
    }
  >;
  lastSyncAt: string;
};

const TEAM_INDEX_FILE = ".sync-index.json";

const hashContent = (content: string): string => {
  const hash = Array.from(content).reduce((hashValue, char) => {
    const code = char.charCodeAt(0);
    const newHash = (hashValue << 5) - hashValue + code;
    return newHash | 0;
  }, 0);
  return hash.toString(16);
};

export const getManagedTeamsRoot = (): string => {
  return join(getConfigDir(), "teams");
};

export const getTeamRoot = (teamSlug: string): string => {
  return join(getManagedTeamsRoot(), teamSlug);
};

export const getTeamTypeDir = (teamSlug: string, type: SkillType): string => {
  const typeDirs: Record<SkillType, string> = {
    command: "commands",
    skill: "skills",
    agent: "agents",
  };
  return join(getTeamRoot(teamSlug), typeDirs[type]);
};

const getTeamIndexPath = (teamSlug: string): string => {
  return join(getTeamRoot(teamSlug), TEAM_INDEX_FILE);
};

export const loadTeamSyncIndex = async (teamSlug: string): Promise<TeamSyncIndex> => {
  try {
    const content = await readFile(getTeamIndexPath(teamSlug), "utf8");
    return JSON.parse(content) as TeamSyncIndex;
  } catch {
    return { skills: {}, lastSyncAt: "" };
  }
};

export const saveTeamSyncIndex = async (
  teamSlug: string,
  index: TeamSyncIndex
): Promise<void> => {
  const indexPath = getTeamIndexPath(teamSlug);
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
};

export const listManagedTeamSkills = async (teamSlug: string): Promise<Skill[]> => {
  const skillArrays = await Promise.all([
    listSkills(getTeamTypeDir(teamSlug, "command"), "command"),
    listDirectorySkills(getTeamTypeDir(teamSlug, "skill"), "skill"),
    listSkills(getTeamTypeDir(teamSlug, "agent"), "agent"),
  ]);

  return skillArrays.flat().sort((a, b) => {
    if (a.type !== b.type) {
      const order = { command: 0, skill: 1, agent: 2 };
      return order[a.type] - order[b.type];
    }
    return a.name.localeCompare(b.name);
  });
};

/**
 * Validate that a resolved path stays within the expected base directory.
 * Throws if path traversal is detected.
 */
const assertWithinDir = (filePath: string, baseDir: string): void => {
  const resolved = resolve(filePath);
  const resolvedBase = resolve(baseDir);
  if (!resolved.startsWith(resolvedBase + "/") && resolved !== resolvedBase) {
    throw new Error(`Path traversal detected: ${filePath} escapes ${resolvedBase}`);
  }
};

export const writeTeamSkill = async (
  teamSlug: string,
  decrypted: ReturnType<typeof decryptSkill>
): Promise<void> => {
  const skillType = decrypted.type ?? "command";
  const baseDir = getTeamTypeDir(teamSlug, skillType);
  const teamRoot = getTeamRoot(teamSlug);

  if (skillType === "skill" && decrypted.files) {
    const skillDir = join(baseDir, decrypted.name);
    assertWithinDir(skillDir, teamRoot);
    await mkdir(skillDir, { recursive: true });

    const mainFilePath = join(skillDir, "SKILL.md");
    assertWithinDir(mainFilePath, teamRoot);
    await writeFile(mainFilePath, decrypted.content, "utf8");

    await Promise.all(
      decrypted.files.map((file) => {
        const filePath = join(skillDir, file.name);
        assertWithinDir(filePath, teamRoot);
        return writeFile(filePath, file.content, "utf8");
      })
    );
    return;
  }

  const filePath = join(baseDir, `${decrypted.name}.md`);
  assertWithinDir(filePath, teamRoot);
  await mkdir(baseDir, { recursive: true });
  await writeFile(filePath, decrypted.content, "utf8");
};

export const pushTeamSkills = async (params: {
  teamId: string;
  teamSlug: string;
  teamKey: Uint8Array;
  teamKeyVersion: number;
  skillFilter?: string;
  message?: string;
  onProgress?: (message: string) => void;
}): Promise<{ pushed: number; errors: string[] }> => {
  const allSkills = await listManagedTeamSkills(params.teamSlug);
  const filtered = params.skillFilter
    ? allSkills.filter(
        (skill) =>
          skill.name === params.skillFilter ||
          `${skill.type}:${skill.name}` === params.skillFilter
      )
    : allSkills;
  const index = await loadTeamSyncIndex(params.teamSlug);

  const results = await Promise.all(
    filtered.map(async (skill) => {
      const skillKey = `${skill.type}:${skill.name}`;
      const localHash = hashContent(skill.content + JSON.stringify(skill.files ?? []));
      const hash = computeSkillHash(skill);

      if (index.skills[skillKey]?.hash === hash) {
        params.onProgress?.(`Skipping ${skillKey} (unchanged)`);
        return { type: "skipped" as const };
      }

      params.onProgress?.(`Pushing ${skillKey}...`);
      const encrypted = encryptSkill(skill, params.teamKey);
      const result = await api.pushTeamSkillVersion(
        params.teamId,
        skillKey,
        hash,
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.tag,
        params.teamKeyVersion,
        params.message
      );

      if (!result.ok) {
        return {
          type: "error" as const,
          message: `Failed to push ${skillKey}: ${result.error}`,
        };
      }

      return {
        type: "success" as const,
        skillKey,
        hash,
        localHash,
        remoteUpdatedAt: result.data.createdAt,
      };
    })
  );

  for (const result of results) {
    if (result.type === "success") {
      index.skills[result.skillKey] = {
        hash: result.hash,
        localHash: result.localHash,
        remoteUpdatedAt: result.remoteUpdatedAt,
      };
    }
  }

  index.lastSyncAt = new Date().toISOString();
  await saveTeamSyncIndex(params.teamSlug, index);

  return {
    pushed: results.filter((result) => result.type === "success").length,
    errors: results
      .filter((result) => result.type === "error")
      .map((result) => (result.type === "error" ? result.message : "")),
  };
};

/**
 * Read the current local content for a team skill to detect local modifications.
 */
const readLocalTeamSkillContent = async (
  teamSlug: string,
  skillKey: string
): Promise<string | null> => {
  // skillKey format is "type:name"
  const [type, ...nameParts] = skillKey.split(":");
  const name = nameParts.join(":");
  const skillType = (type as SkillType) ?? "command";
  const baseDir = getTeamTypeDir(teamSlug, skillType);

  try {
    if (skillType === "skill") {
      const content = await readFile(join(baseDir, name, "SKILL.md"), "utf8");
      return content;
    }
    const content = await readFile(join(baseDir, `${name}.md`), "utf8");
    return content;
  } catch {
    return null;
  }
};

export type TeamPullConflict = {
  skillKey: string;
  reason: string;
};

export const pullTeamSkills = async (params: {
  teamId: string;
  teamSlug: string;
  teamKey: Uint8Array;
  onProgress?: (message: string) => void;
}): Promise<{ pulled: number; errors: string[]; conflicts: TeamPullConflict[] }> => {
  const index = await loadTeamSyncIndex(params.teamSlug);
  const listResult = await api.listTeamSkills(params.teamId);
  if (!listResult.ok) {
    return { pulled: 0, errors: [`Failed to list team skills: ${listResult.error}`], conflicts: [] };
  }

  const conflicts: TeamPullConflict[] = [];

  const results = await Promise.all(
    listResult.data.skills.map(async (remoteSkill) => {
      if (!remoteSkill.currentHash) {
        return { type: "skipped" as const };
      }

      const existing = index.skills[remoteSkill.skillKey];
      if (existing?.hash === remoteSkill.currentHash) {
        params.onProgress?.(`Skipping ${remoteSkill.skillKey} (unchanged)`);
        return { type: "skipped" as const };
      }

      // Check for local modifications that would be overwritten
      if (existing?.localHash) {
        const localContent = await readLocalTeamSkillContent(params.teamSlug, remoteSkill.skillKey);
        if (localContent !== null) {
          const currentLocalHash = hashContent(localContent);
          if (currentLocalHash !== existing.localHash) {
            conflicts.push({
              skillKey: remoteSkill.skillKey,
              reason: "Local file has been modified since last sync",
            });
            return { type: "skipped" as const };
          }
        }
      }

      const skillResult = await api.getTeamSkill(params.teamId, remoteSkill.skillKey);
      if (!skillResult.ok) {
        return {
          type: "error" as const,
          message: `Failed to fetch ${remoteSkill.skillKey}: ${skillResult.error}`,
        };
      }

      try {
        const decrypted = decryptSkill(
          skillResult.data.encryptedData,
          skillResult.data.iv,
          skillResult.data.tag,
          params.teamKey
        );
        await writeTeamSkill(params.teamSlug, decrypted);

        return {
          type: "success" as const,
          skillKey: remoteSkill.skillKey,
          hash: remoteSkill.currentHash,
          localHash: hashContent(
            decrypted.content + JSON.stringify(decrypted.files ?? [])
          ),
          remoteUpdatedAt: remoteSkill.updatedAt,
        };
      } catch (error) {
        return {
          type: "error" as const,
          message: `Failed to decrypt/write ${remoteSkill.skillKey}: ${error}`,
        };
      }
    })
  );

  for (const result of results) {
    if (result.type === "success") {
      index.skills[result.skillKey] = {
        hash: result.hash,
        localHash: result.localHash,
        remoteUpdatedAt: result.remoteUpdatedAt,
      };
    }
  }

  index.lastSyncAt = new Date().toISOString();
  await saveTeamSyncIndex(params.teamSlug, index);

  return {
    pulled: results.filter((result) => result.type === "success").length,
    errors: results
      .filter((result) => result.type === "error")
      .map((result) => (result.type === "error" ? result.message : "")),
    conflicts,
  };
};
