/**
 * Team management commands
 */

import * as p from "@clack/prompts";
import {
	computeKeyFingerprint,
	decrypt,
	decryptTeamKeyAsMember,
	encrypt,
	encryptTeamKeyForMember,
	fromBase64,
	generateTeamKey,
	generateX25519KeyPair,
	toBase64,
} from "@claudeskill/core";
import {
	acceptTeamInvite,
	createTeam,
	createTeamInvite,
	distributeTeamKey,
	getKeypair,
	getMyTeamKey,
	getSharingKey,
	getTeam,
	getTeamSkillVersion,
	getTeamSkillVersions,
	listAllPendingMembers,
	listTeamMembers,
	listTeams,
	removeTeamMember,
	setKeypair,
	setSharingKey,
} from "../api.js";
import { loadCredentials, saveCredentials } from "../credentials.js";
import { decryptSkill } from "../sync.js";
import { pullTeamSkills, pushTeamSkills, writeTeamSkill } from "../team.js";

/**
 * Derive a filesystem-safe slug from a team name.
 */
const deriveTeamSlug = (name: string): string => {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
};

/**
 * Ensure user has a keypair for team operations
 * Generates one if not present
 */
const ensureKeypair = async (
	masterKey: Uint8Array,
): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> => {
	const credentials = await loadCredentials();
	if (!credentials) {
		throw new Error("Not logged in");
	}

	// Check if we have a local keypair
	if (
		credentials.publicKey &&
		credentials.encryptedPrivateKey &&
		credentials.privateKeyIv &&
		credentials.privateKeyTag
	) {
		// Decrypt private key
		const privateKey = decrypt(
			fromBase64(credentials.encryptedPrivateKey),
			masterKey,
			fromBase64(credentials.privateKeyIv),
			fromBase64(credentials.privateKeyTag),
		);
		return {
			publicKey: fromBase64(credentials.publicKey),
			privateKey,
		};
	}

	// Check server for existing keypair
	const serverKeypair = await getSharingKey();
	const legacyServerKeypair =
		!serverKeypair.ok && serverKeypair.status === 404 ? await getKeypair() : null;
	const keypairResponse =
		serverKeypair.ok || serverKeypair.status !== 404 ? serverKeypair : legacyServerKeypair;
	if (keypairResponse?.ok && keypairResponse.data.hasKeypair) {
		// Download and decrypt
		const privateKey = decrypt(
			fromBase64(keypairResponse.data.encryptedPrivateKey!),
			masterKey,
			fromBase64(keypairResponse.data.privateKeyIv!),
			fromBase64(keypairResponse.data.privateKeyTag!),
		);

		// Save locally
		await saveCredentials({
			...credentials,
			publicKey: keypairResponse.data.publicKey,
			publicKeyFingerprint: keypairResponse.data.publicKeyFingerprint ?? undefined,
			encryptedPrivateKey: keypairResponse.data.encryptedPrivateKey,
			privateKeyIv: keypairResponse.data.privateKeyIv,
			privateKeyTag: keypairResponse.data.privateKeyTag,
		});

		return {
			publicKey: fromBase64(keypairResponse.data.publicKey!),
			privateKey,
		};
	}

	// Generate new keypair
	p.log.info("Generating keypair for team operations...");
	const keypair = generateX25519KeyPair();

	// Encrypt private key with master key
	const { ciphertext, iv, tag } = encrypt(keypair.privateKey, masterKey);

	// Upload to server
	const uploadResult = await setSharingKey(
		toBase64(keypair.publicKey),
		toBase64(ciphertext),
		toBase64(iv),
		toBase64(tag),
	);

	if (!uploadResult.ok) {
		const legacyUploadResult = await setKeypair(
			toBase64(keypair.publicKey),
			toBase64(ciphertext),
			toBase64(iv),
			toBase64(tag),
		);

		if (!legacyUploadResult.ok) {
			throw new Error(`Failed to upload keypair: ${uploadResult.error}`);
		}
	}

	// Save locally
	await saveCredentials({
		...credentials,
		publicKey: toBase64(keypair.publicKey),
		publicKeyFingerprint: computeKeyFingerprint(keypair.publicKey),
		encryptedPrivateKey: toBase64(ciphertext),
		privateKeyIv: toBase64(iv),
		privateKeyTag: toBase64(tag),
	});

	p.log.success("Keypair generated and saved");

	return keypair;
};

/**
 * List teams command
 */
export const runTeamList = async (): Promise<void> => {
	const spinner = p.spinner();
	spinner.start("Loading teams...");

	const result = await listTeams();

	if (!result.ok) {
		spinner.stop("Failed to load teams");
		p.log.error(result.error);
		return;
	}

	spinner.stop("Teams loaded");

	if (result.data.teams.length === 0) {
		p.log.info("You are not a member of any teams.");
		p.log.info("Create a team with: claudeskill team create <name>");
		return;
	}

	console.log("\nYour teams:\n");
	for (const team of result.data.teams) {
		const status = team.status === "pending" ? " (pending key)" : "";
		console.log(
			`  ${team.name} [${team.role}]${status}\n` +
				`    ID: ${team.id}\n` +
				`    Members: ${team.memberCount} | Skills: ${team.skillCount}\n`,
		);
	}
};

export const runTeamCreate = async (name: string, masterKey: Uint8Array): Promise<void> => {
	const spinner = p.spinner();
	spinner.start("Creating team and generating team key...");

	const created = await createTeamWithKey(name, masterKey);
	if (!created) {
		spinner.stop("Failed to create team");
		return;
	}

	spinner.stop("Team created");
	p.log.success(`Team "${name}" created successfully!`);
	p.log.info(`Team ID: ${created.teamId}`);
	p.log.info("You can now invite members with: claudeskill team invite <team-id> <email>");
};

/**
 * Show team details command
 */
export const runTeamShow = async (teamId: string): Promise<void> => {
	const spinner = p.spinner();
	spinner.start("Loading team...");

	const result = await getTeam(teamId);

	if (!result.ok) {
		spinner.stop("Failed to load team");
		p.log.error(result.error);
		return;
	}

	spinner.stop("Team loaded");

	const team = result.data;
	console.log(`\nTeam: ${team.name}`);
	console.log(`Role: ${team.role} | Status: ${team.status}`);
	console.log(`ID: ${team.id}\n`);

	console.log("Members:");
	for (const member of team.members) {
		const status = member.status === "pending" ? " (pending)" : "";
		const keyStatus = member.hasTeamKey ? "" : " [no key]";
		console.log(`  ${member.email} [${member.role}]${status}${keyStatus}`);
	}

	if (team.skills.length > 0) {
		console.log("\nSkills:");
		for (const skill of team.skills) {
			console.log(`  ${skill.skillKey} (${skill.currentHash ?? "no versions"})`);
		}
	} else {
		console.log("\nNo skills shared with this team yet.");
	}
};

/**
 * Invite member to team
 */
export const runTeamInvite = async (
	teamId: string,
	email: string,
	role: string = "editor",
): Promise<void> => {
	const validRoles = ["admin", "editor", "viewer"];
	if (!validRoles.includes(role)) {
		p.log.error(`Invalid role: ${role}. Must be one of: ${validRoles.join(", ")}`);
		return;
	}

	const spinner = p.spinner();
	spinner.start("Creating invite...");

	const result = await createTeamInvite(teamId, email, role);

	if (!result.ok) {
		spinner.stop("Failed to create invite");
		p.log.error(result.error);
		return;
	}

	spinner.stop("Invite created");
	p.log.success(`Invite sent to ${email} as ${role}`);
	console.log("\nShare this invite token with the user:");
	console.log(`\n  ${result.data.token}\n`);
	p.log.info(`Expires: ${new Date(result.data.expiresAt).toLocaleString()}`);
	p.log.info("They can accept with: claudeskill team accept <token>");
};

/**
 * Accept team invite
 */
export const runTeamAccept = async (token: string, masterKey: Uint8Array): Promise<void> => {
	// Ensure we have a keypair first
	await ensureKeypair(masterKey);

	const spinner = p.spinner();
	spinner.start("Accepting invite...");

	const result = await acceptTeamInvite(token);

	if (!result.ok) {
		spinner.stop("Failed to accept invite");
		p.log.error(result.error);
		return;
	}

	spinner.stop("Invite accepted");
	p.log.success(`Joined team "${result.data.teamName}" as ${result.data.role}`);
	p.log.info(result.data.message);
	p.log.info("A team admin will distribute the team key to you. Run 'sync' again later to check.");
};

/**
 * Distribute team keys to pending members
 * This is called automatically during sync for owners/admins
 */
export const runDistributeKeys = async (
	masterKey: Uint8Array,
	teamKeys: Map<string, Uint8Array>,
): Promise<void> => {
	const credentials = await loadCredentials();
	if (!credentials) {
		p.log.warning("Not logged in. Skipping team key distribution.");
		return;
	}
	let knownPublicKeyFingerprints = credentials.knownPublicKeyFingerprints ?? {};

	// Get all pending members across teams we manage
	const pendingResult = await listAllPendingMembers();

	if (!pendingResult.ok) {
		p.log.warning(`Could not check for pending members: ${pendingResult.error}`);
		return;
	}

	const pending = pendingResult.data.pendingMembers;
	if (pending.length === 0) {
		return;
	}

	p.log.info(`Found ${pending.length} pending team member(s) waiting for keys`);

	for (const member of pending) {
		// Check if member has a public key
		if (!member.publicKey) {
			p.log.warning(`${member.email} hasn't set up their keypair yet. Skipping.`);
			continue;
		}

		// Get the team key (we need to have it)
		const teamKey = teamKeys.get(member.teamId);
		if (!teamKey) {
			p.log.warning(`You don't have the key for team "${member.teamName}". Skipping.`);
			continue;
		}

		const fingerprint =
			member.publicKeyFingerprint ?? computeKeyFingerprint(fromBase64(member.publicKey));
		const cacheKey = member.userId;
		const cachedFingerprint = knownPublicKeyFingerprints[cacheKey];

		if (cachedFingerprint && cachedFingerprint !== fingerprint) {
			const confirm = await p.confirm({
				message: `Public key fingerprint changed for ${member.email} (${fingerprint}). Encrypt anyway?`,
			});

			if (p.isCancel(confirm) || !confirm) {
				p.log.warning(`Skipped ${member.email} because their public key fingerprint changed.`);
				continue;
			}
		} else if (!cachedFingerprint) {
			const confirm = await p.confirm({
				message: `Trust public key for ${member.email}? Fingerprint: ${fingerprint}`,
			});

			if (p.isCancel(confirm) || !confirm) {
				p.log.warning(`Skipped ${member.email} because their public key is not trusted yet.`);
				continue;
			}
		}

		// Encrypt team key for this member
		const memberPublicKey = fromBase64(member.publicKey);
		const encrypted = encryptTeamKeyForMember(teamKey, memberPublicKey);

		// Upload encrypted key
		const result = await distributeTeamKey(
			member.teamId,
			member.userId,
			encrypted.encryptedKey,
			encrypted.iv,
			encrypted.tag,
			encrypted.ephemeralPublicKey,
		);

		if (result.ok) {
			await saveCredentials({
				...credentials,
				knownPublicKeyFingerprints: {
					...knownPublicKeyFingerprints,
					[cacheKey]: fingerprint,
				},
			});
			knownPublicKeyFingerprints = {
				...knownPublicKeyFingerprints,
				[cacheKey]: fingerprint,
			};
			p.log.success(`Distributed team key to ${member.email} for "${member.teamName}"`);
		} else {
			p.log.error(`Failed to distribute key to ${member.email}: ${result.error}`);
		}
	}
};

/**
 * Get team key for a team (download and decrypt if needed)
 */
export const getTeamKeyForTeam = async (
	teamId: string,
	masterKey: Uint8Array,
	keypair: { publicKey: Uint8Array; privateKey: Uint8Array },
): Promise<Uint8Array | null> => {
	const result = await getMyTeamKey(teamId);

	if (!result.ok) {
		return null;
	}

	// Decrypt team key using our private key
	const teamKey = decryptTeamKeyAsMember(
		result.data.ephemeralPublicKey,
		result.data.encryptedTeamKey,
		result.data.iv,
		result.data.tag,
		keypair.privateKey,
	);

	return teamKey;
};

/**
 * Create a new team with initial team key
 * Returns the team key for immediate use
 */
export const createTeamWithKey = async (
	name: string,
	masterKey: Uint8Array,
): Promise<{ teamId: string; teamKey: Uint8Array } | null> => {
	// Ensure we have a keypair
	const keypair = await ensureKeypair(masterKey);

	// Create team
	const createResult = await createTeam(name);
	if (!createResult.ok) {
		p.log.error(`Failed to create team: ${createResult.error}`);
		return null;
	}

	// Generate team key
	const teamKey = generateTeamKey();

	// Encrypt team key for ourselves (as owner)
	const encrypted = encryptTeamKeyForMember(teamKey, keypair.publicKey);

	// Get our own user ID from team details
	const teamDetailsResult = await getTeam(createResult.data.id);
	if (!teamDetailsResult.ok) {
		p.log.warning(`Team created but failed to get team details: ${teamDetailsResult.error}`);
		return { teamId: createResult.data.id, teamKey };
	}

	const ownerMember = teamDetailsResult.data.members.find((m) => m.role === "owner");
	if (!ownerMember) {
		p.log.warning("Could not find owner in team members");
		return { teamId: createResult.data.id, teamKey };
	}

	// Store our own team key
	const keyResult = await distributeTeamKey(
		createResult.data.id,
		ownerMember.userId,
		encrypted.encryptedKey,
		encrypted.iv,
		encrypted.tag,
		encrypted.ephemeralPublicKey,
		createResult.data.activeKeyVersion ?? 1,
	);

	if (!keyResult.ok) {
		p.log.warning(`Team created but failed to store team key: ${keyResult.error}`);
	}

	return { teamId: createResult.data.id, teamKey };
};

/**
 * Push team skills to server
 */
export const runTeamPush = async (
	teamId: string,
	masterKey: Uint8Array,
	skillFilter?: string,
	message?: string,
): Promise<void> => {
	const keypair = await ensureKeypair(masterKey);
	const teamKey = await getTeamKeyForTeam(teamId, masterKey, keypair);
	if (!teamKey) {
		p.log.error("Could not decrypt team key. You may not have access to this team.");
		return;
	}

	// Get team key version from API
	const teamResult = await getTeam(teamId);
	if (!teamResult.ok) {
		p.log.error(`Failed to get team info: ${teamResult.error}`);
		return;
	}

	const teamSlug = deriveTeamSlug(teamResult.data.name);
	const spinner = p.spinner();
	spinner.start("Pushing team skills...");

	const result = await pushTeamSkills({
		teamId,
		teamSlug,
		teamKey,
		teamKeyVersion: teamResult.data.activeKeyVersion ?? 1,
		skillFilter,
		message,
		onProgress: (msg) => spinner.message(msg),
	});

	spinner.stop("Push complete");

	if (result.pushed > 0) {
		p.log.success(`Pushed ${result.pushed} team skill(s)`);
	} else {
		p.log.info("No changes to push");
	}
	for (const error of result.errors) {
		p.log.error(error);
	}
};

/**
 * Pull team skills from server
 */
export const runTeamPull = async (teamId: string, masterKey: Uint8Array): Promise<void> => {
	const keypair = await ensureKeypair(masterKey);
	const teamKey = await getTeamKeyForTeam(teamId, masterKey, keypair);
	if (!teamKey) {
		p.log.error("Could not decrypt team key. You may not have access to this team.");
		return;
	}

	const teamResult = await getTeam(teamId);
	if (!teamResult.ok) {
		p.log.error(`Failed to get team info: ${teamResult.error}`);
		return;
	}

	const teamSlug = deriveTeamSlug(teamResult.data.name);
	const spinner = p.spinner();
	spinner.start("Pulling team skills...");

	const result = await pullTeamSkills({
		teamId,
		teamSlug,
		teamKey,
		onProgress: (msg) => spinner.message(msg),
	});

	spinner.stop("Pull complete");

	if (result.pulled > 0) {
		p.log.success(`Pulled ${result.pulled} team skill(s)`);
	} else {
		p.log.info("No new team skills to pull");
	}
	for (const error of result.errors) {
		p.log.error(error);
	}
	if (result.conflicts.length > 0) {
		p.log.warning(`${result.conflicts.length} skill(s) skipped due to local modifications:`);
		for (const conflict of result.conflicts) {
			p.log.warning(`  ${conflict.skillKey}: ${conflict.reason}`);
		}
	}
};

/**
 * Show team skill version history
 */
export const runTeamLog = async (teamId: string, skillKey: string): Promise<void> => {
	const spinner = p.spinner();
	spinner.start("Loading history...");

	const result = await getTeamSkillVersions(teamId, skillKey);
	if (!result.ok) {
		spinner.stop("Failed");
		p.log.error(result.error);
		return;
	}

	spinner.stop("Loaded");

	console.log(`\nVersion history for ${skillKey}`);
	console.log("═".repeat(50));
	for (const version of result.data.versions) {
		const head = version.hash === result.data.currentHash ? " (HEAD)" : "";
		console.log(`${version.hash}${head}`);
		console.log(`  Key version: ${version.teamKeyVersion}`);
		console.log(`  Date: ${new Date(version.createdAt).toLocaleString()}`);
		if (version.message) {
			console.log(`  Message: ${version.message}`);
		}
		if (version.parentHash) {
			console.log(`  Parent: ${version.parentHash}`);
		}
		console.log("");
	}
};

/**
 * Restore a specific team skill version
 */
export const runTeamCheckout = async (
	teamId: string,
	skillKey: string,
	hash: string,
	masterKey: Uint8Array,
): Promise<void> => {
	const keypair = await ensureKeypair(masterKey);
	const teamKey = await getTeamKeyForTeam(teamId, masterKey, keypair);
	if (!teamKey) {
		p.log.error("Could not decrypt team key. You may not have access to this team.");
		return;
	}

	const teamResult = await getTeam(teamId);
	if (!teamResult.ok) {
		p.log.error(`Failed to get team info: ${teamResult.error}`);
		return;
	}

	const teamSlug = deriveTeamSlug(teamResult.data.name);
	const spinner = p.spinner();
	spinner.start("Fetching version...");

	const result = await getTeamSkillVersion(teamId, skillKey, hash);
	if (!result.ok) {
		spinner.stop("Failed");
		p.log.error(result.error);
		return;
	}

	const decrypted = decryptSkill(
		result.data.encryptedData,
		result.data.iv,
		result.data.tag,
		teamKey,
	);
	await writeTeamSkill(teamSlug, decrypted);

	spinner.stop("Checked out");
	p.log.success(`Restored ${skillKey} @ ${hash}`);
};

/**
 * List team members with roles
 */
export const runTeamMembers = async (teamId: string): Promise<void> => {
	const spinner = p.spinner();
	spinner.start("Loading members...");

	const result = await listTeamMembers(teamId);
	if (!result.ok) {
		spinner.stop("Failed");
		p.log.error(result.error);
		return;
	}

	spinner.stop("Members loaded");

	console.log("\nTeam members:\n");
	for (const member of result.data.members) {
		const status = member.status === "pending" ? " (pending)" : "";
		const keyStatus = member.hasTeamKey ? "" : " [no key]";
		const fingerprint = member.publicKeyFingerprint
			? `  fingerprint: ${member.publicKeyFingerprint}`
			: "";
		console.log(`  ${member.email} [${member.role}]${status}${keyStatus}${fingerprint}`);
	}
	console.log("");
};

/**
 * Remove a team member and rotate the team key
 */
export const runTeamRemoveMember = async (
	teamId: string,
	email: string,
	masterKey: Uint8Array,
): Promise<void> => {
	const spinner = p.spinner();
	spinner.start("Loading team members...");

	const membersResult = await listTeamMembers(teamId);
	if (!membersResult.ok) {
		spinner.stop("Failed");
		p.log.error(membersResult.error);
		return;
	}

	const target = membersResult.data.members.find(
		(m) => m.email.toLowerCase() === email.toLowerCase() && m.status === "active",
	);
	if (!target) {
		spinner.stop("Not found");
		p.log.error(`Active member not found: ${email}`);
		return;
	}

	spinner.stop("Member found");

	const confirmRemoval = await p.confirm({
		message: `Remove ${email} from team? This will rotate the team key.`,
	});

	if (p.isCancel(confirmRemoval) || !confirmRemoval) {
		p.cancel("Removal cancelled.");
		return;
	}

	spinner.start("Rotating team key...");

	// Get current team key version
	const teamResult = await getTeam(teamId);
	if (!teamResult.ok) {
		spinner.stop("Failed");
		p.log.error(teamResult.error);
		return;
	}

	const nextKeyVersion = (teamResult.data.activeKeyVersion ?? 1) + 1;

	// Generate new team key
	const newTeamKey = generateTeamKey();

	// Encrypt new key for all remaining active members (except the removed one)
	const envelopes = membersResult.data.members
		.filter((m) => m.status === "active" && m.userId !== target.userId && m.publicKey)
		.map((m) => {
			const encrypted = encryptTeamKeyForMember(newTeamKey, fromBase64(m.publicKey!));
			return {
				recipientUserId: m.userId,
				encryptedTeamKey: encrypted.encryptedKey,
				iv: encrypted.iv,
				tag: encrypted.tag,
				ephemeralPublicKey: encrypted.ephemeralPublicKey,
			};
		});

	const result = await removeTeamMember(teamId, target.userId, nextKeyVersion, envelopes);
	if (!result.ok) {
		spinner.stop("Failed");
		p.log.error(result.error);
		return;
	}

	spinner.stop("Removed");
	p.log.success(`Removed ${email} and rotated team key to version ${nextKeyVersion}`);
};

export { ensureKeypair };
