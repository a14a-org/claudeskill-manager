/**
 * @claude-skill-sync/core
 *
 * Core encryption and skill management for Claude Skill Sync
 */

// Types
export type {
  Config,
  Credentials,
  DerivedKey,
  EncryptedBlob,
  RecoveryKey,
  Skill,
  SkillMetadata,
  SkillType,
  SyncedSkill,
  SyncStatus,
  Vault,
} from "./types.js";

// Crypto operations
export {
  computeContentHash,
  computeFullHash,
  decrypt,
  decryptMasterKey,
  decryptString,
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryKey,
  encrypt,
  encryptMasterKey,
  encryptString,
  formatRecoveryKey,
  fromBase64,
  generateMasterKey,
  generateRandomBytes,
  generateRecoveryKey,
  generateSalt,
  parseRecoveryKey,
  toBase64,
} from "./crypto.js";

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
  listAllSkills,
  listDirectorySkills,
  listSkills,
  parseFrontmatter,
  readDirectorySkill,
  readSkill,
  serializeFrontmatter,
  validateSkill,
} from "./skill.js";

// Re-export dependency types
export type { DependencyNode } from "./skill.js";
