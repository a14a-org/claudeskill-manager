/**
 * Team skill sync module
 *
 * Manages local team skill directories and syncs with the server.
 * Team skills are stored in ~/.config/claude-skill-sync/teams/<slug>/
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

/**
 * Validate that a name doesn't contain path traversal characters.
 */
const isSafeName = (name: string): boolean => {
  return !name.includes("/") && !name.includes("\\") && !name.includes("..") && name.length > 0;
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

export const writeTeamSkill = async (
  teamSlug: string,
  decrypted: ReturnType<typeof decryptSkill>
): Promise<void> => {
  const skillType = decrypted.type ?? "command";
  const baseDir = getTeamTypeDir(teamSlug, skillType);

  if (skillType === "skill" && decrypted.files) {
    const skillDir = join(baseDir, decrypted.name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), decrypted.content, "utf8");
    await Promise.all(
      decrypted.files.map((file) =>
        writeFile(join(skillDir, file.name), file.content, "utf8")
      )
    );
    return;
  }

  await mkdir(baseDir, { recursive: true });
  await writeFile(join(baseDir, `${decrypted.name}.md`), decrypted.content, "utf8");
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
        remoteUpdatedAt: result.data.createdAt,
      };
    })
  );

  for (const result of results) {
    if (result.type === "success") {
      index.skills[result.skillKey] = {
        hash: result.hash,
        localHash: result.hash,
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

export const pullTeamSkills = async (params: {
  teamId: string;
  teamSlug: string;
  teamKey: Uint8Array;
  onProgress?: (message: string) => void;
}): Promise<{ pulled: number; errors: string[] }> => {
  const index = await loadTeamSyncIndex(params.teamSlug);
  const listResult = await api.listTeamSkills(params.teamId);
  if (!listResult.ok) {
    return { pulled: 0, errors: [`Failed to list team skills: ${listResult.error}`] };
  }

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

        // Path traversal protection
        if (!isSafeName(decrypted.name)) {
          return {
            type: "error" as const,
            message: `Rejected ${remoteSkill.skillKey}: unsafe name "${decrypted.name}"`,
          };
        }
        if (decrypted.files?.some((f) => !isSafeName(f.name))) {
          return {
            type: "error" as const,
            message: `Rejected ${remoteSkill.skillKey}: unsafe file name in supporting files`,
          };
        }

        await writeTeamSkill(params.teamSlug, decrypted);

        return {
          type: "success" as const,
          skillKey: remoteSkill.skillKey,
          hash: remoteSkill.currentHash,
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
        localHash: result.hash,
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
  };
};
