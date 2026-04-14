/**
 * @claudeskill/core
 *
 * Core encryption and skill management for Claude Skill Sync
 */

// Re-export X25519 types
export type { X25519KeyPair } from "./crypto.js";

// Crypto operations
export {
	computeContentHash,
	computeFullHash,
	computeKeyFingerprint,
	decrypt,
	decryptAsRecipient,
	decryptMasterKey,
	decryptString,
	decryptTeamKeyAsMember,
	deriveKeyFromPassphrase,
	deriveKeyFromRecoveryKey,
	encrypt,
	encryptForRecipient,
	encryptMasterKey,
	encryptString,
	encryptTeamKeyForMember,
	formatRecoveryKey,
	fromBase64,
	generateMasterKey,
	generateRandomBytes,
	generateRecoveryKey,
	generateSalt,
	generateTeamKey,
	generateX25519KeyPair,
	parseRecoveryKey,
	toBase64,
} from "./crypto.js";
// Re-export dependency types
export type { DependencyNode } from "./skill.js";

// Skill operations
export {
	buildDependencyGraph,
	computeSkillHash,
	detectImplicitDependencies,
	formatSkillSize,
	getClaudeDir,
	getExplicitDependencies,
	getSkillDependencies,
	getSkillDescription,
	getSkillKey,
	getSkillSize,
	getSkillsPath,
	getSkillTools,
	getSkillTriggers,
	isHiddenSkillKey,
	listAllSkills,
	listDirectorySkills,
	listSkills,
	parseFrontmatter,
	readDirectorySkill,
	readSkill,
	serializeFrontmatter,
	validateSkill,
} from "./skill.js";
// Types
export type {
	Config,
	Credentials,
	DerivedKey,
	EncryptedBlob,
	EncryptedTeamKey,
	RecoveryKey,
	Skill,
	SkillMetadata,
	SkillType,
	SyncedSkill,
	SyncStatus,
	Team,
	TeamCredentials,
	TeamInvite,
	TeamMember,
	TeamMemberStatus,
	TeamRole,
	TeamWithMembership,
	Vault,
} from "./types.js";
