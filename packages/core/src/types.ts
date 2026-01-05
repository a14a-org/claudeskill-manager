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
};
