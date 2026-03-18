/**
 * Interactive team menu
 *
 * Nested submenu for team operations within the interactive CLI.
 * Handles team selection, actions, and passphrase/key caching.
 */

import * as p from "@clack/prompts";
import {
  listTeams,
  getTeam,
  type TeamListItem,
} from "./api.js";
import {
  runTeamShow,
  runTeamMembers,
  runTeamPush,
  runTeamPull,
  runTeamAccept,
  runTeamCreate,
  runTeamInvite,
  runTeamLog,
} from "./commands/team.js";
import { getMasterKey } from "./sync.js";

/** Cached key material for the interactive session */
type KeyCache = {
  masterKey: Uint8Array | null;
  lastUsedAt: number;
};

const KEY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Get the cached master key, prompting if needed or expired.
 */
const resolveMasterKey = async (cache: KeyCache): Promise<Uint8Array | null> => {
  // Check if cached and not expired
  if (cache.masterKey && Date.now() - cache.lastUsedAt < KEY_TIMEOUT_MS) {
    cache.lastUsedAt = Date.now();
    return cache.masterKey;
  }

  // Expired — zero old key
  if (cache.masterKey) {
    cache.masterKey.fill(0);
    cache.masterKey = null;
    p.log.info("Session expired. Please re-enter your passphrase.");
  }

  const passphrase = await p.password({
    message: "Vault passphrase:",
    mask: "*",
  });

  if (p.isCancel(passphrase)) return null;

  const spinner = p.spinner();
  spinner.start("Unlocking vault...");

  const masterKey = await getMasterKey(passphrase);
  if (!masterKey) {
    spinner.stop("Failed to unlock vault");
    p.log.error("Invalid passphrase.");
    return null;
  }

  spinner.stop("Vault unlocked");
  cache.masterKey = masterKey;
  cache.lastUsedAt = Date.now();
  return masterKey;
};

/**
 * Team action menu for a specific team.
 * Returns "back" to go to team list, or "menu" to go to main menu.
 */
const runTeamActions = async (
  team: TeamListItem,
  cache: KeyCache
): Promise<"back" | "menu"> => {
  while (true) {
    const canWrite = team.role === "owner" || team.role === "admin" || team.role === "editor";
    const canManage = team.role === "owner" || team.role === "admin";

    const options: { value: string; label: string; hint?: string }[] = [];

    if (canWrite) {
      options.push(
        { value: "push", label: "Push", hint: "push skills to team" },
        { value: "pull", label: "Pull", hint: "pull skills from team" },
      );
    } else {
      options.push(
        { value: "pull", label: "Pull", hint: "pull skills from team" },
      );
    }

    options.push(
      { value: "show", label: "Show details", hint: "view team info + skills" },
      { value: "members", label: "Members", hint: "list team members" },
    );

    if (canManage) {
      options.push(
        { value: "invite", label: "Invite member", hint: "add someone to this team" },
      );
    }

    options.push(
      { value: "log", label: "Skill history", hint: "view version log" },
      { value: "back", label: "Back", hint: "return to team list" },
    );

    const action = await p.select({
      message: `${team.name} — What would you like to do?`,
      options,
    });

    if (p.isCancel(action)) return "menu";

    switch (action) {
      case "show":
        await runTeamShow(team.id);
        break;

      case "members":
        await runTeamMembers(team.id);
        break;

      case "push": {
        const masterKey = await resolveMasterKey(cache);
        if (!masterKey) break;
        await runTeamPush(team.id, masterKey);
        break;
      }

      case "pull": {
        const masterKey = await resolveMasterKey(cache);
        if (!masterKey) break;
        await runTeamPull(team.id, masterKey);
        break;
      }

      case "invite": {
        const email = await p.text({
          message: "Email address:",
          placeholder: "user@example.com",
          validate: (v) => !v || !v.includes("@") ? "Enter a valid email" : undefined,
        });
        if (p.isCancel(email) || !email) break;

        const role = await p.select({
          message: "Role:",
          options: [
            { value: "editor", label: "Editor", hint: "can push and pull skills" },
            { value: "admin", label: "Admin", hint: "can also invite and manage members" },
            { value: "viewer", label: "Viewer", hint: "can only pull skills" },
          ],
        });
        if (p.isCancel(role)) break;

        await runTeamInvite(team.id, email as string, role as string);
        break;
      }

      case "log": {
        // Get team details to show skill list for picking
        const teamResult = await getTeam(team.id);
        if (!teamResult.ok) {
          p.log.error(`Failed to load team: ${teamResult.error}`);
          break;
        }
        if (teamResult.data.skills.length === 0) {
          p.log.info("No skills shared with this team yet.");
          break;
        }
        const skillChoice = await p.select({
          message: "Select a skill:",
          options: teamResult.data.skills.map((s) => ({
            value: s.skillKey,
            label: s.skillKey,
            hint: s.currentHash ?? "no versions",
          })),
        });
        if (p.isCancel(skillChoice)) break;
        await runTeamLog(team.id, skillChoice as string);
        break;
      }

      case "back":
        return "back";
    }
  }
};

/**
 * Main team menu entry point.
 * Called from the main interactive menu.
 *
 * @param sharedCache - Key cache shared with the main menu for passphrase reuse
 * @returns "menu" when the user wants to return to the main menu
 */
export const runTeamMenu = async (sharedCache: KeyCache): Promise<void> => {
  while (true) {
    const spinner = p.spinner();
    spinner.start("Loading teams...");

    const result = await listTeams();

    if (!result.ok) {
      spinner.stop("Failed to load teams");
      if (result.status === 404) {
        p.log.warning("Team sharing is not enabled on this server.");
        p.log.info("Ask your server admin to set ENABLE_TEAM_SHARING=true");
      } else {
        p.log.error(result.error);
      }
      return;
    }

    spinner.stop("Teams loaded");

    const teams = result.data.teams;
    const activeTeams = teams.filter((t) => t.status === "active");

    // Build team picker options
    const options: { value: string; label: string; hint?: string }[] = [];

    for (const team of activeTeams) {
      options.push({
        value: team.id,
        label: team.name,
        hint: `${team.role} · ${team.memberCount} member${team.memberCount === 1 ? "" : "s"} · ${team.skillCount} skill${team.skillCount === 1 ? "" : "s"}`,
      });
    }

    const pendingTeams = teams.filter((t) => t.status === "pending");
    for (const team of pendingTeams) {
      options.push({
        value: team.id,
        label: `${team.name} (pending key)`,
        hint: `awaiting team key from admin`,
      });
    }

    // Always show create, accept invite, and back
    options.push(
      { value: "_create", label: "Create team", hint: "start a new team" },
      { value: "_accept", label: "Accept invite", hint: "enter an invite token" },
      { value: "_back", label: "Back", hint: "return to main menu" },
    );

    // Zero-teams hint
    if (activeTeams.length === 0 && pendingTeams.length === 0) {
      p.log.info("You are not a member of any teams yet.");
    }

    const choice = await p.select({
      message: "Select a team:",
      options,
    });

    if (p.isCancel(choice) || choice === "_back") return;

    if (choice === "_create") {
      const name = await p.text({
        message: "Team name:",
        placeholder: "My Team",
        validate: (v) => !v || v.trim().length === 0 ? "Name is required" : undefined,
      });
      if (p.isCancel(name) || !name) continue;

      const masterKey = await resolveMasterKey(sharedCache);
      if (!masterKey) continue;

      await runTeamCreate(name as string, masterKey);
      continue;
    }

    if (choice === "_accept") {
      const token = await p.text({
        message: "Paste the invite token:",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      });
      if (p.isCancel(token) || !token) continue;

      const masterKey = await resolveMasterKey(sharedCache);
      if (!masterKey) continue;

      await runTeamAccept(token as string, masterKey);
      continue;
    }

    // Find the selected team
    const selectedTeam = teams.find((t) => t.id === choice);
    if (!selectedTeam) continue;

    if (selectedTeam.status === "pending") {
      p.log.warning("You're waiting for a team admin to distribute the team key.");
      p.log.info("Try again later, or ask the team admin to run: claudeskill push");
      continue;
    }

    // Enter team actions submenu
    const result2 = await runTeamActions(selectedTeam, sharedCache);
    if (result2 === "menu") return;
    // "back" loops to team picker
  }
};

/** Create a new key cache instance */
export const createKeyCache = (): KeyCache => ({
  masterKey: null,
  lastUsedAt: 0,
});

/** Zero all cached keys */
export const clearKeyCache = (cache: KeyCache): void => {
  if (cache.masterKey) {
    cache.masterKey.fill(0);
    cache.masterKey = null;
  }
};
