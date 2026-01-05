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
import { loadConfig } from "./config.js";

const VERSION = "0.1.0";

const showHelp = (): void => {
  console.log(`
claude-skill-sync v${VERSION}
Sync your Claude Code skills across devices

Usage:
  claude-skill-sync [command] [options]

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

List Options:
  --tree           Show dependency tree
  --tools          Show tool usage matrix

Push Options:
  -m <message>     Commit message for this version

Options:
  --version, -v    Show version
  --help, -h       Show help

Examples:
  $ claude-skill-sync              # First run: setup, otherwise: status
  $ claude-skill-sync list         # List all skills
  $ claude-skill-sync list --tree  # Show dependency graph
  $ claude-skill-sync push         # Push local changes

Learn more: https://claudeskill.io
`);
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
      await runPush({ message });
      break;
    }

    case "pull":
      await runPull();
      break;

    case "log": {
      const skillKey = args[1];
      if (!skillKey) {
        p.log.error("Usage: claude-skill-sync log <skill-key>");
        p.log.info("Example: claude-skill-sync log skill:setup-eslint");
        return;
      }
      await runLog(skillKey);
      break;
    }

    case "checkout": {
      const skillKey = args[1];
      const hash = args[2];
      if (!skillKey || !hash) {
        p.log.error("Usage: claude-skill-sync checkout <skill-key> <hash>");
        p.log.info("Example: claude-skill-sync checkout skill:setup-eslint abc123");
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
        p.log.error("Usage: claude-skill-sync diff <skill-key> <hash1> <hash2>");
        p.log.info("Example: claude-skill-sync diff skill:setup-eslint abc123 def456");
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
        p.log.warning("Not configured. Run 'claude-skill-sync' to set up.");
      }
      break;

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
