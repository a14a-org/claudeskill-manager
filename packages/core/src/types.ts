/**
 * Core types for Claude Skill Sync
 */

/** Encrypted blob stored on the server */
export type EncryptedBlob = {
	/** Unique identifier */
	id: string;
	/** Base64 encoded encrypted data */
	ciphertext: string;
	/** Base64 encoded initialization vector */
	iv: string;
	/** Base64 encoded authentication tag (for AES-GCM) */
	tag: string;
	/** ISO timestamp of last update */
	updatedAt: string;
};

/** Type of skill/command/agent */
export type SkillType = "command" | "skill" | "agent";

/** Decrypted skill data */
export type Skill = {
	/** Skill name (derived from filename) */
	name: string;
	/** Raw skill content (markdown) */
	content: string;
	/** Parsed metadata from frontmatter */
	metadata: SkillMetadata;
	/** Local file path */
	path: string;
	/** Last modified timestamp */
	modifiedAt: Date;
	/** Type of skill */
	type: SkillType;
	/** Supporting files (for directory-based skills) */
	files?: { name: string; content: string }[];
};

/** Skill metadata from frontmatter */
export type SkillMetadata = {
	/** Skill description */
	description: string | null;
	/** Trigger commands (e.g., /deploy) */
	triggers: string[] | null;
	/** Skill author */
	author: string | null;
	/** Skill version */
	version: string | null;
	/** Allowed tools (for skills/agents) */
	"allowed-tools": string | null;
	tools: string | null;
	/** Model preference (for agents) */
	model: string | null;
	/** Permission mode (for agents) */
	permissionMode: string | null;
	/** Explicit dependencies */
	"depends-on": string[] | null;
	/** Category for grouping */
	category: string | null;
	/** Tags for filtering */
	tags: string[] | null;
	/** Custom fields */
	[key: string]: unknown;
};

/** Sync status for a skill */
export type SyncStatus =
	| "synced"
	| "local_only"
	| "remote_only"
	| "local_modified"
	| "remote_modified"
	| "conflict";

/** Skill with sync information */
export type SyncedSkill = Skill & {
	/** Current sync status */
	syncStatus: SyncStatus;
	/** Remote blob ID if synced */
	remoteId: string | null;
	/** Remote last modified */
	remoteModifiedAt: Date | null;
};

/** User vault containing encryption keys */
export type Vault = {
	/** Salt for key derivation (stored on server) */
	salt: Uint8Array;
	/** Encrypted master key (encrypted with derived key) */
	encryptedMasterKey: Uint8Array;
	/** Master key IV */
	masterKeyIv: Uint8Array;
	/** Master key auth tag */
	masterKeyTag: Uint8Array;
};

/** Derived key material from passphrase */
export type DerivedKey = {
	/** The derived key bytes */
	key: Uint8Array;
	/** Salt used for derivation */
	salt: Uint8Array;
};

/** Recovery key (8 words from BIP39-like wordlist) */
export type RecoveryKey = {
	/** The 8 words */
	words: string[];
	/** Raw bytes the words encode */
	bytes: Uint8Array;
};

/** Configuration stored locally */
export type Config = {
	/** Sync mode */
	mode: "cloud" | "selfhosted" | "local";
	/** Server URL for cloud/selfhosted modes */
	serverUrl: string | null;
	/** User email */
	email: string | null;
	/** Path to skills directory */
	skillsPath: string;
	/** Enable auto sync */
	autoSync: boolean;
	/** Sync interval in seconds */
	syncInterval: number;
};

/** Credentials stored locally (encrypted) */
export type Credentials = {
	/** JWT access token */
	accessToken: string;
	/** JWT refresh token */
	refreshToken: string;
	/** Encrypted master key (base64) */
	encryptedMasterKey: string;
	/** Salt for key derivation (base64) */
	salt: string;
	/** User's X25519 public key (base64) - for team key exchange */
	publicKey?: string;
	/** User's X25519 private key encrypted with master key (base64) */
	encryptedPrivateKey?: string;
	/** IV for encrypted private key */
	privateKeyIv?: string;
	/** Auth tag for encrypted private key */
	privateKeyTag?: string;
	/** Stable fingerprint for the user's current X25519 public key */
	publicKeyFingerprint?: string;
	/** Trust-on-first-use cache for other members' public key fingerprints */
	knownPublicKeyFingerprints?: Record<string, string>;
};

// =============================================================================
// Team Types
// =============================================================================

/** Team role levels */
export type TeamRole = "owner" | "admin" | "editor" | "viewer";

/** Team member status */
export type TeamMemberStatus = "pending" | "active";

/** Team information */
export type Team = {
	/** Team ID */
	id: string;
	/** Team name */
	name: string;
	/** Team owner user ID */
	ownerId: string;
	/** Created timestamp */
	createdAt: string;
};

/** Team member information */
export type TeamMember = {
	/** Team ID */
	teamId: string;
	/** User ID */
	userId: string;
	/** User email */
	email: string;
	/** Member role */
	role: TeamRole;
	/** Member status */
	status: TeamMemberStatus;
	/** Whether this member has received the team key */
	hasTeamKey: boolean;
	/** Stable fingerprint for this member's public key, when available */
	publicKeyFingerprint?: string | null;
	/** Joined timestamp */
	createdAt: string;
};

/** Team invite information */
export type TeamInvite = {
	/** Invite ID */
	id: string;
	/** Team ID */
	teamId: string;
	/** Team name */
	teamName: string;
	/** Invited email */
	email: string;
	/** Role to be assigned */
	role: TeamRole;
	/** Expiration timestamp */
	expiresAt: string;
	/** Created by user ID */
	createdBy: string;
	/** Created timestamp */
	createdAt: string;
};

/** Team with membership info for current user */
export type TeamWithMembership = Team & {
	/** Current user's role in the team */
	role: TeamRole;
	/** Current user's status */
	status: TeamMemberStatus;
	/** Number of members */
	memberCount: number;
	/** Number of skills */
	skillCount: number;
};

/** Encrypted team key for a member */
export type EncryptedTeamKey = {
	/** Team ID */
	teamId: string;
	/** Team key version this envelope belongs to */
	teamKeyVersion: number;
	/** Encrypted team key (encrypted with member's public key) */
	encryptedKey: string;
	/** IV for encryption */
	iv: string;
	/** Auth tag */
	tag: string;
	/** Sender ephemeral public key */
	ephemeralPublicKey: string;
};

/** Local team credentials (stored in credentials file) */
export type TeamCredentials = {
	/** Team ID */
	teamId: string;
	/** Decrypted team master key (base64) - stored encrypted with user's master key */
	encryptedTeamKey: string;
	/** IV for team key encryption */
	teamKeyIv: string;
	/** Auth tag for team key encryption */
	teamKeyTag: string;
};
