#!/usr/bin/env node

/**
 * Claude Skill Sync CLI
 *
 * Sync your Claude Code skills across devices with zero-knowledge encryption.
 */

import * as p from "@clack/prompts";
import { runOnboarding } from "./onboarding.js";
import { runInteractiveMenu } from "./menu.js";
import { runList } from "./commands/list.js";
import { runStatus } from "./commands/status.js";
import { runLogin } from "./commands/login.js";
import { runLogout } from "./commands/logout.js";
import { runPush } from "./commands/push.js";
import { runPull } from "./commands/pull.js";
import { runLog } from "./commands/log.js";
import { runCheckout } from "./commands/checkout.js";
import { runDiff } from "./commands/diff.js";
import {
  runTeamList,
  runTeamCreate,
  runTeamShow,
  runTeamInvite,
  runTeamAccept,
  runTeamPush,
  runTeamPull,
  runTeamLog,
  runTeamCheckout,
  runTeamMembers,
  runTeamRemoveMember,
} from "./commands/team.js";
import { loadConfig } from "./config.js";
import { loadCredentials } from "./credentials.js";
import { getMasterKey } from "./sync.js";

const VERSION = "0.3.0";

const showHelp = (): void => {
  console.log(`
claudeskill v${VERSION}
Sync your Claude Code skills across devices

Usage:
  claudeskill [command] [options]

Commands:
  (no command)     Interactive setup or status
  list             List all skills
  status           Show sync status
  push             Push local changes to cloud
  pull             Pull remote changes to local
  log <skill>      Show version history for a skill
  checkout <skill> <hash>  Restore a specific version
  diff <skill> <hash1> <hash2>  Compare two versions
  login            Login to existing account
  logout           Logout and clear credentials
  config           Show or modify configuration
  help             Show this help message

Team Commands:
  team list                        List your teams
  team create <name>               Create a new team
  team show <team-id>              Show team details
  team members <team-id>           List team members
  team invite <team-id> <email> [role]  Invite member (role: admin|editor|viewer)
  team accept <token>              Accept team invite
  team push <team-id> [skill]      Push team skills to server
  team pull <team-id>              Pull team skills from server
  team log <team-id> <skill>       Show team skill version history
  team checkout <team-id> <skill> <hash>  Restore team skill version
  team remove-member <team-id> <email>    Remove member and rotate key

List Options:
  --tree           Show dependency tree
  --tools          Show tool usage matrix

Push Options:
  -m <message>     Commit message for this version
  --force          Push all skills regardless of sync state

Options:
  --version, -v    Show version
  --help, -h       Show help

Examples:
  $ claudeskill              # First run: setup, otherwise: status
  $ claudeskill list         # List all skills
  $ claudeskill list --tree  # Show dependency graph
  $ claudeskill push         # Push local changes
  $ claudeskill team create "My Team"  # Create a team
  $ claudeskill team invite abc123 bob@example.com editor

Learn more: https://claudeskill.io
`);
};

const promptForMasterKey = async (): Promise<Uint8Array | null> => {
  const credentials = await loadCredentials();
  if (!credentials?.salt || !credentials.encryptedMasterKey) {
    p.log.error("Not logged in. Run 'claudeskill login' first.");
    return null;
  }

  const passphrase = await p.password({
    message: "Enter your passphrase:",
  });

  if (p.isCancel(passphrase)) {
    p.log.warning("Cancelled");
    return null;
  }

  const masterKey = await getMasterKey(passphrase as string);
  if (!masterKey) {
    p.log.error("Invalid passphrase.");
    return null;
  }

  return masterKey;
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle flags
  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    showHelp();
    return;
  }

  // Check if configured
  const config = await loadConfig();
  const isConfigured = config !== null;

  // Route to command
  switch (command) {
    case undefined:
      // No command: run onboarding if not configured, otherwise interactive menu
      if (!isConfigured) {
        await runOnboarding();
      } else {
        await runInteractiveMenu();
      }
      break;

    case "list": {
      const flags = args.slice(1);
      const showTree = flags.includes("--tree");
      const showTools = flags.includes("--tools");
      await runList({ tree: showTree, tools: showTools });
      break;
    }

    case "status":
      await runStatus();
      break;

    case "push": {
      const flags = args.slice(1);
      const messageIndex = flags.indexOf("-m");
      const message = messageIndex >= 0 ? flags[messageIndex + 1] : undefined;
      const force = flags.includes("--force");
      await runPush({ message, force });
      break;
    }

    case "pull":
      await runPull();
      break;

    case "log": {
      const skillKey = args[1];
      if (!skillKey) {
        p.log.error("Usage: claudeskill log <skill-key>");
        p.log.info("Example: claudeskill log skill:setup-eslint");
        return;
      }
      await runLog(skillKey);
      break;
    }

    case "checkout": {
      const skillKey = args[1];
      const hash = args[2];
      if (!skillKey || !hash) {
        p.log.error("Usage: claudeskill checkout <skill-key> <hash>");
        p.log.info("Example: claudeskill checkout skill:setup-eslint abc123");
        return;
      }
      await runCheckout(skillKey, hash);
      break;
    }

    case "diff": {
      const skillKey = args[1];
      const hash1 = args[2];
      const hash2 = args[3];
      if (!skillKey || !hash1 || !hash2) {
        p.log.error("Usage: claudeskill diff <skill-key> <hash1> <hash2>");
        p.log.info("Example: claudeskill diff skill:setup-eslint abc123 def456");
        return;
      }
      await runDiff(skillKey, hash1, hash2);
      break;
    }

    case "login":
      await runLogin();
      break;

    case "logout":
      await runLogout();
      break;

    case "config":
      if (config) {
        console.log(JSON.stringify(config, null, 2));
      } else {
        p.log.warning("Not configured. Run 'claudeskill' to set up.");
      }
      break;

    case "team": {
      const subCommand = args[1];

      switch (subCommand) {
        case "list":
          await runTeamList();
          break;

        case "create": {
          const name = args[2];
          if (!name) {
            p.log.error("Usage: claudeskill team create <name>");
            return;
          }
          const masterKey = await promptForMasterKey();
          if (!masterKey) {
            return;
          }
          await runTeamCreate(name, masterKey);
          break;
        }

        case "show": {
          const teamId = args[2];
          if (!teamId) {
            p.log.error("Usage: claudeskill team show <team-id>");
            return;
          }
          await runTeamShow(teamId);
          break;
        }

        case "invite": {
          const teamId = args[2];
          const email = args[3];
          const role = args[4] ?? "editor";
          if (!teamId || !email) {
            p.log.error("Usage: claudeskill team invite <team-id> <email> [role]");
            return;
          }
          await runTeamInvite(teamId, email, role);
          break;
        }

        case "accept": {
          const token = args[2];
          if (!token) {
            p.log.error("Usage: claudeskill team accept <token>");
            return;
          }
          const masterKey = await promptForMasterKey();
          if (!masterKey) {
            return;
          }
          await runTeamAccept(token, masterKey);
          break;
        }

        case "push": {
          const teamId = args[2];
          if (!teamId) {
            p.log.error("Usage: claudeskill team push <team-id> [skill]");
            return;
          }
          const masterKey = await promptForMasterKey();
          if (!masterKey) return;
          const flags = args.slice(3);
          const messageIdx = flags.indexOf("-m");
          const message = messageIdx >= 0 ? flags[messageIdx + 1] : undefined;
          const skillFilter = flags[0] && flags[0] !== "-m" ? flags[0] : undefined;
          await runTeamPush(teamId, masterKey, skillFilter, message);
          break;
        }

        case "pull": {
          const teamId = args[2];
          if (!teamId) {
            p.log.error("Usage: claudeskill team pull <team-id>");
            return;
          }
          const masterKey = await promptForMasterKey();
          if (!masterKey) return;
          await runTeamPull(teamId, masterKey);
          break;
        }

        case "log": {
          const teamId = args[2];
          const skillKey = args[3];
          if (!teamId || !skillKey) {
            p.log.error("Usage: claudeskill team log <team-id> <skill-key>");
            return;
          }
          await runTeamLog(teamId, skillKey);
          break;
        }

        case "checkout": {
          const teamId = args[2];
          const skillKey = args[3];
          const hash = args[4];
          if (!teamId || !skillKey || !hash) {
            p.log.error("Usage: claudeskill team checkout <team-id> <skill-key> <hash>");
            return;
          }
          const masterKey = await promptForMasterKey();
          if (!masterKey) return;
          await runTeamCheckout(teamId, skillKey, hash, masterKey);
          break;
        }

        case "members": {
          const teamId = args[2];
          if (!teamId) {
            p.log.error("Usage: claudeskill team members <team-id>");
            return;
          }
          await runTeamMembers(teamId);
          break;
        }

        case "remove-member": {
          const teamId = args[2];
          const email = args[3];
          if (!teamId || !email) {
            p.log.error("Usage: claudeskill team remove-member <team-id> <email>");
            return;
          }
          const masterKey = await promptForMasterKey();
          if (!masterKey) return;
          await runTeamRemoveMember(teamId, email, masterKey);
          break;
        }

        default:
          p.log.error(`Unknown team command: ${subCommand}`);
          console.log("\nTeam Commands:");
          console.log("  team list                          List your teams");
          console.log("  team create <name>                 Create a new team");
          console.log("  team show <team-id>                Show team details");
          console.log("  team members <team-id>             List team members");
          console.log("  team invite <team-id> <email> [role]  Invite member");
          console.log("  team accept <token>                Accept team invite");
          console.log("  team push <team-id> [skill]        Push team skills");
          console.log("  team pull <team-id>                Pull team skills");
          console.log("  team log <team-id> <skill>         Show version history");
          console.log("  team checkout <team-id> <skill> <hash>  Restore version");
          console.log("  team remove-member <team-id> <email>    Remove member");
          break;
      }
      break;
    }

    default:
      p.log.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
