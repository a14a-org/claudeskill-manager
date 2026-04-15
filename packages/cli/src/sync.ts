/**
 * Sync logic for skills
 *
 * Handles encrypting, uploading, downloading, and decrypting skills.
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	computeSkillHash,
	decryptMasterKey,
	decryptString,
	deriveKeyFromPassphrase,
	encryptString,
	fromBase64,
	getClaudeDir,
	getSkillKey,
	isHiddenSkillKey,
	listAllSkills,
	type Skill,
	type SkillType,
} from "@claudeskill/core";
import * as api from "./api.js";
import { getDefaultConfig, loadConfig } from "./config.js";
import { loadCredentials } from "./credentials.js";

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
 * Get the master key from credentials
 */
export const getMasterKey = async (passphrase: string) => {
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
	masterKey: Uint8Array,
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
	masterKey: Uint8Array,
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
	message: string | undefined,
	force: boolean = false,
) => {
	const skills = await listAllSkills();
	const index = await loadSyncIndex();

	// Process skills sequentially to avoid overwhelming the server
	type PushResult =
		| { type: "skipped"; skillKey: string; hash: string }
		| { type: "success"; skillKey: string; hash: string; remoteUpdatedAt: string }
		| { type: "error"; skillKey: string; message: string };
	const results: PushResult[] = [];

	for (const skill of skills) {
		const skillKey = getSkillKey(skill);
		const contentHash = computeSkillHash(skill);
		const existing = index.skills[skillKey];

		if (!force && existing?.hash === contentHash) {
			onProgress?.(`Skipping ${skill.name} (unchanged)`);
			results.push({ type: "skipped", skillKey, hash: contentHash });
			continue;
		}

		onProgress?.(`Pushing ${skill.type}/${skill.name} [${contentHash}]...`);

		const encrypted = encryptSkill(skill, masterKey);

		const result = await api.pushSkillVersion(
			skillKey,
			contentHash,
			encrypted.encryptedData,
			encrypted.iv,
			encrypted.tag,
			message,
		);

		if (result.ok) {
			results.push({
				type: "success",
				skillKey,
				hash: contentHash,
				remoteUpdatedAt: (result.data as { createdAt: string }).createdAt,
			});
		} else {
			results.push({
				type: "error",
				skillKey,
				message: `Failed to push ${skill.type}/${skill.name}: ${result.error}`,
			});
		}
	}

	// Build new index from current local skills only (prunes stale entries)
	const localSkillKeys = new Set(skills.map((s) => getSkillKey(s)));
	const newSkills: typeof index.skills = {};

	// Keep entries for skills that still exist locally
	for (const [key, value] of Object.entries(index.skills)) {
		if (localSkillKeys.has(key)) {
			newSkills[key] = value;
		}
	}

	// Update entries for successfully pushed skills
	for (const result of results) {
		if (result.type === "success") {
			newSkills[result.skillKey] = {
				hash: result.hash,
				blobId: null,
				localHash: result.hash,
				remoteUpdatedAt: result.remoteUpdatedAt,
			};
		}
	}

	index.skills = newSkills;

	const pushed = results.filter((r) => r.type === "success").length;
	const errors = results
		.filter((r) => r.type === "error")
		.map((r) => (r.type === "error" ? r.message : ""));

	// Delete remote skills with hidden-file names (e.g. .DS_Store, .gitignore
	// that were synced before the filter was in place).
	// Only fetch the remote list when local hidden skills exist, to avoid an
	// extra API call on every push.
	const hasLocalHidden = skills.some((s) => isHiddenSkillKey(getSkillKey(s)));
	if (hasLocalHidden) {
		const remoteList = await api.listSkills();
		if (remoteList.ok) {
			const hiddenRemote = (remoteList.data as { skills: { skillKey: string }[] }).skills.filter(
				(s) => isHiddenSkillKey(s.skillKey),
			);
			const deleteResults = await Promise.allSettled(
				hiddenRemote.map(async (s) => {
					onProgress?.(`Removing hidden file ${s.skillKey} from remote...`);
					await api.deleteSkill(s.skillKey);
					delete index.skills[s.skillKey];
				}),
			);
			for (const r of deleteResults) {
				if (r.status === "rejected") {
					onProgress?.(`Warning: failed to delete hidden remote skill: ${r.reason}`);
				}
			}
		}
	}

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
 * Validate that a name doesn't contain path traversal characters.
 * Prevents writing files outside the expected directory.
 */
const isSafeName = (name: string): boolean => {
	return !name.includes("/") && !name.includes("\\") && !name.includes("..") && name.length > 0;
};

/**
 * Check if a skill exists on the local filesystem.
 * Used to detect stale sync-index entries where the index says "synced"
 * but the actual files have been deleted or never existed on this machine.
 */
const localSkillExists = async (skillKey: string): Promise<boolean> => {
	const [type, ...nameParts] = skillKey.split(":");
	const name = nameParts.join(":");
	const skillType = (type as SkillType) ?? "command";
	const baseDir = getSkillTypeDir(skillType);

	try {
		if (skillType === "skill") {
			await access(join(baseDir, name, "SKILL.md"));
		} else {
			await access(join(baseDir, `${name}.md`));
		}
		return true;
	} catch {
		return false;
	}
};

/**
 * Pull remote skills to local
 */
export const pullSkills = async (
	masterKey: Uint8Array,
	onProgress: ((message: string) => void) | undefined,
) => {
	const index = await loadSyncIndex();

	// Get list of remote skills
	const listResult = await api.listSkills();
	if (!listResult.ok) {
		return { pulled: 0, errors: [`Failed to list skills: ${listResult.error}`] };
	}

	// Process skills sequentially to avoid overwhelming the server
	const remoteSkills = listResult.data.skills.filter(
		(remoteSkill) => !isHiddenSkillKey(remoteSkill.skillKey),
	);

	type PullResult =
		| { type: "skipped" }
		| { type: "success"; skillKey: string; hash: string; updatedAt: string }
		| { type: "error"; message: string };
	const results: PullResult[] = [];

	for (const remoteSkill of remoteSkills) {
		const existing = index.skills[remoteSkill.skillKey];

		// Skip if no versions
		if (!remoteSkill.currentHash) {
			onProgress?.(`Skipping ${remoteSkill.skillKey} (no versions)`);
			results.push({ type: "skipped" });
			continue;
		}

		// Skip if unchanged (same hash) AND local file actually exists.
		if (existing?.hash === remoteSkill.currentHash) {
			const exists = await localSkillExists(remoteSkill.skillKey);
			if (exists) {
				onProgress?.(`Skipping ${remoteSkill.skillKey} (unchanged)`);
				results.push({ type: "skipped" });
				continue;
			}
			onProgress?.(`Re-downloading ${remoteSkill.skillKey} (missing locally)...`);
		}

		onProgress?.(`Pulling ${remoteSkill.skillKey} [${remoteSkill.currentHash}]...`);

		// Download current version
		const skillResult = await api.getSkill(remoteSkill.skillKey);
		if (!skillResult.ok) {
			results.push({
				type: "error",
				message: `Failed to get ${remoteSkill.skillKey}: ${skillResult.error}`,
			});
			continue;
		}

		// Decrypt
		let decrypted: DecryptedSkillPayload;
		try {
			decrypted = decryptSkill(
				skillResult.data.encryptedData,
				skillResult.data.iv,
				skillResult.data.tag,
				masterKey,
			);
		} catch (err) {
			results.push({
				type: "error",
				message: `Failed to decrypt ${remoteSkill.skillKey}: ${err}`,
			});
			continue;
		}

		const skillType = decrypted.type ?? "command";
		const skillKey = remoteSkill.skillKey;
		const baseDir = getSkillTypeDir(skillType);

		// Path traversal protection
		if (!isSafeName(decrypted.name)) {
			results.push({
				type: "error",
				message: `Rejected ${remoteSkill.skillKey}: unsafe name "${decrypted.name}"`,
			});
			continue;
		}
		if (decrypted.files?.some((f) => !isSafeName(f.name))) {
			results.push({
				type: "error",
				message: `Rejected ${remoteSkill.skillKey}: unsafe file name in supporting files`,
			});
			continue;
		}

		try {
			if (skillType === "skill" && decrypted.files) {
				const skillDir = join(baseDir, decrypted.name);
				await mkdir(skillDir, { recursive: true });
				await writeFile(join(skillDir, "SKILL.md"), decrypted.content, "utf-8");
				for (const f of decrypted.files) {
					await writeFile(join(skillDir, f.name), f.content, "utf-8");
				}
			} else {
				await mkdir(baseDir, { recursive: true });
				await writeFile(join(baseDir, `${decrypted.name}.md`), decrypted.content, "utf-8");
			}
		} catch (err) {
			results.push({
				type: "error",
				message: `Failed to write ${decrypted.name}: ${err}`,
			});
			continue;
		}

		onProgress?.(`Pulled ${skillType}/${decrypted.name} [${remoteSkill.currentHash}]`);

		results.push({
			type: "success",
			skillKey,
			hash: remoteSkill.currentHash,
			updatedAt: remoteSkill.updatedAt,
		});
	}

	// Update index entries for successfully pulled skills
	for (const result of results) {
		if (result.type === "success") {
			index.skills[result.skillKey] = {
				hash: result.hash,
				blobId: null,
				localHash: result.hash,
				remoteUpdatedAt: result.updatedAt,
			};
		}
	}

	const pulled = results.filter((r) => r.type === "success").length;
	const errors = results
		.filter((r) => r.type === "error")
		.map((r) => (r.type === "error" ? r.message : ""));

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
		return existing?.hash === contentHash ? "synced" : "pending";
	});

	const synced = skillStatuses.filter((s) => s === "synced").length;
	const pendingPush = skillStatuses.filter((s) => s === "pending").length;

	// Check for remote-only skills (pending pull)
	const listResult = await api.listSkills();
	const localSkillKeys = new Set(skills.map((s) => getSkillKey(s)));
	const pendingPull = listResult.ok
		? listResult.data.skills.filter((s) => {
				return s.currentHash && !localSkillKeys.has(s.skillKey) && !isHiddenSkillKey(s.skillKey);
			}).length
		: 0;

	return {
		local: skills.length,
		synced,
		pendingPush,
		pendingPull,
		lastSyncAt: index.lastSyncAt || null,
	};
};
