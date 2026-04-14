/**
 * Interactive menu for the CLI
 */

import * as p from "@clack/prompts";
import { runList } from "./commands/list.js";
import { runLogin } from "./commands/login.js";
import { runLogout } from "./commands/logout.js";
import { runPull } from "./commands/pull.js";
import { runPush } from "./commands/push.js";
import { runStatus } from "./commands/status.js";
import { loadConfig } from "./config.js";
import { clearKeyCache, createKeyCache, runTeamMenu } from "./teamMenu.js";

type MenuAction =
	| "status"
	| "list"
	| "push"
	| "pull"
	| "teams"
	| "login"
	| "logout"
	| "help"
	| "exit";

/**
 * Show the main interactive menu
 */
export const runInteractiveMenu = async () => {
	p.intro("Claude Skill Sync");

	const keyCache = createKeyCache();
	let shouldContinue = true;

	while (shouldContinue) {
		const config = await loadConfig();
		const isCloudMode = config?.mode === "cloud" || config?.mode === "selfhosted";

		const options: { value: MenuAction; label: string; hint: string | undefined }[] = [
			{ value: "status", label: "Status", hint: "check sync status" },
			{ value: "list", label: "List", hint: "view all skills" },
		];

		if (isCloudMode) {
			options.push(
				{ value: "push", label: "Push", hint: "upload local changes" },
				{ value: "pull", label: "Pull", hint: "download from cloud" },
				{ value: "teams", label: "Teams", hint: "manage team skills" },
			);
		}

		options.push(
			{ value: "login", label: "Login", hint: "switch account" },
			{ value: "logout", label: "Logout", hint: "sign out" },
			{ value: "help", label: "Help", hint: "show commands" },
			{ value: "exit", label: "Exit", hint: "quit" },
		);

		const action = await p.select({
			message: "What would you like to do?",
			options,
		});

		if (p.isCancel(action)) {
			clearKeyCache(keyCache);
			p.outro("Goodbye!");
			return;
		}

		const selectedAction = action as MenuAction;

		switch (selectedAction) {
			case "status":
				await runStatus();
				break;

			case "list":
				await runListInteractive();
				break;

			case "push":
				await runPush({ interactive: true });
				break;

			case "pull":
				await runPull({ interactive: true });
				break;

			case "teams":
				await runTeamMenu(keyCache);
				// Teams has its own navigation — skip the "What's next?" prompt
				continue;

			case "login":
				await runLogin();
				break;

			case "logout":
				clearKeyCache(keyCache);
				await runLogout();
				shouldContinue = false;
				break;

			case "help":
				showHelp();
				break;

			case "exit":
				shouldContinue = false;
				break;
		}

		// After action, ask what's next (unless exiting)
		if (shouldContinue && selectedAction !== "exit" && selectedAction !== "logout") {
			const next = await p.select({
				message: "What's next?",
				options: [
					{ value: "menu", label: "Back to menu" },
					{ value: "exit", label: "Exit" },
				],
			});

			if (p.isCancel(next) || next === "exit") {
				shouldContinue = false;
			}
		}
	}

	clearKeyCache(keyCache);
	p.outro("Goodbye!");
};

/**
 * Interactive list with follow-up actions
 */
const runListInteractive = async () => {
	await runList({});

	const action = await p.select({
		message: "View options:",
		options: [
			{ value: "tree", label: "Show dependency tree" },
			{ value: "tools", label: "Show tool matrix" },
			{ value: "done", label: "Done" },
		],
	});

	if (p.isCancel(action) || action === "done") {
		return;
	}

	if (action === "tree") {
		await runList({ tree: true });
	} else if (action === "tools") {
		await runList({ tools: true });
	}
};

/**
 * Show help text
 */
const showHelp = () => {
	console.log(`
Commands (can also be run directly):

  claudeskill              Interactive menu (this)
  claudeskill list         List all skills
  claudeskill list --tree  Show dependency graph
  claudeskill list --tools Show tool usage matrix
  claudeskill status       Show sync status
  claudeskill push         Push local changes
  claudeskill pull         Pull remote changes
  claudeskill login        Login to account
  claudeskill logout       Logout

Team Commands:

  claudeskill team list                        List your teams
  claudeskill team create <name>               Create a new team
  claudeskill team show <team-id>              Show team details
  claudeskill team invite <team-id> <email>    Invite a member
  claudeskill team push <team-id>              Push team skills
  claudeskill team pull <team-id>              Pull team skills

Learn more: https://claudeskill.io
`);
};
