/**
 * Zero-knowledge encryption module
 *
 * Key hierarchy:
 * 1. User passphrase (in user's head)
 * 2. Derived key (Argon2id from passphrase + salt)
 * 3. Master key (random 256-bit, encrypted with derived key)
 * 4. Skill data (encrypted with master key)
 *
 * Team key hierarchy:
 * 1. Team master key (random 256-bit, generated when team is created)
 * 2. Team key is encrypted with each member's public key (X25519 + AES-256-GCM)
 * 3. Team skill data is encrypted with team master key
 */

import { argon2id } from "@noble/hashes/argon2.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import type { DerivedKey, RecoveryKey } from "./types.js";

/** AES-256-GCM configuration */
const AES_KEY_LENGTH = 32; // 256 bits
const AES_IV_LENGTH = 12; // 96 bits (recommended for GCM)
const AES_TAG_LENGTH = 16; // 128 bits
const AES_ALGORITHM = "aes-256-gcm";

/** Argon2id configuration (OWASP recommended) */
const ARGON2_MEMORY = 65536; // 64 MiB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 4;
const ARGON2_SALT_LENGTH = 16;

/** BIP39-like wordlist for recovery keys (simplified 256 common words) */
const WORDLIST = [
  "apple", "armor", "arrow", "badge", "baker", "beach", "beast", "berry",
  "blade", "blank", "blaze", "blend", "bless", "block", "bloom", "board",
  "bonus", "boost", "bound", "brain", "brand", "brave", "bread", "break",
  "brick", "brief", "bring", "broad", "brook", "brush", "build", "burst",
  "cabin", "cable", "camel", "candy", "cargo", "carry", "catch", "cause",
  "chain", "chair", "chalk", "charm", "chase", "cheap", "check", "chess",
  "chief", "child", "chill", "claim", "clamp", "clash", "class", "clean",
  "clear", "clerk", "click", "cliff", "climb", "clock", "close", "cloth",
  "cloud", "coach", "coast", "coral", "couch", "cover", "craft", "crane",
  "crash", "crawl", "cream", "creek", "crisp", "cross", "crowd", "crown",
  "crush", "curve", "cycle", "dance", "delta", "depot", "depth", "diary",
  "digit", "dodge", "draft", "drain", "drama", "drank", "dream", "dress",
  "drift", "drill", "drink", "drive", "drown", "drums", "dusty", "dwarf",
  "eagle", "earth", "elbow", "elder", "elite", "ember", "empty", "enemy",
  "enjoy", "enter", "equal", "error", "essay", "event", "exact", "exile",
  "exist", "extra", "fable", "faith", "fancy", "fault", "feast", "fence",
  "fetch", "fever", "fiber", "field", "fifth", "fifty", "fight", "final",
  "flair", "flame", "flash", "fleet", "flesh", "fling", "float", "flock",
  "flood", "floor", "flour", "fluid", "flush", "flute", "focus", "force",
  "forge", "forth", "forum", "found", "frame", "frank", "fresh", "frost",
  "fruit", "fuels", "giant", "glass", "gleam", "glide", "globe", "glory",
  "grace", "grade", "grain", "grand", "grant", "grape", "grasp", "grass",
  "grave", "great", "green", "greet", "grief", "grill", "grind", "group",
  "grove", "guard", "guess", "guest", "guide", "guilt", "habit", "happy",
  "harsh", "haste", "haven", "heart", "heavy", "hedge", "heist", "hello",
  "honor", "horse", "hotel", "house", "human", "humor", "ideal", "image",
  "index", "inner", "input", "intro", "issue", "ivory", "jelly", "jewel",
  "joint", "joker", "jolly", "judge", "juice", "jumbo", "kayak", "khaki",
  "knife", "knock", "label", "labor", "lance", "large", "laser", "latch",
  "later", "laugh", "layer", "learn", "lease", "leave", "legal", "lemon",
  "level", "lever", "light", "limit", "linen", "links", "liver", "llama",
  "local", "lodge", "logic", "lunar", "lunch", "maker", "manor", "maple",
];

/**
 * Generate cryptographically secure random bytes
 */
export const generateRandomBytes = (length: number): Uint8Array => {
  return new Uint8Array(randomBytes(length));
};

/**
 * Generate a salt for key derivation
 */
export const generateSalt = (): Uint8Array => {
  return generateRandomBytes(ARGON2_SALT_LENGTH);
};

/**
 * Generate a random master key
 */
export const generateMasterKey = (): Uint8Array => {
  return generateRandomBytes(AES_KEY_LENGTH);
};

/**
 * Derive a key from a passphrase using Argon2id
 */
export const deriveKeyFromPassphrase = (
  passphrase: string,
  salt: Uint8Array
): DerivedKey => {
  const passphraseBytes = new TextEncoder().encode(passphrase);

  const key = argon2id(passphraseBytes, salt, {
    t: ARGON2_ITERATIONS,
    m: ARGON2_MEMORY,
    p: ARGON2_PARALLELISM,
    dkLen: AES_KEY_LENGTH,
  });

  return { key, salt };
};

/**
 * Generate a recovery key (8 random words)
 */
export const generateRecoveryKey = (): RecoveryKey => {
  // Generate 11 bytes (88 bits) of randomness
  // 8 words * 8 bits each = 64 bits minimum, but we use indices into 256-word list
  // so each word is 8 bits (log2(256) = 8)
  const bytes = generateRandomBytes(8);
  const words = Array.from(bytes).map((byte) => {
    const index = byte % WORDLIST.length;
    return WORDLIST[index]!;
  });

  return { words, bytes };
};

/**
 * Parse a recovery key from words
 */
export const parseRecoveryKey = (wordsInput: string): RecoveryKey | null => {
  const words = wordsInput
    .toLowerCase()
    .split(/[-\s]+/)
    .filter(Boolean);

  if (words.length !== 8) {
    return null;
  }

  const indices = words.map((word) => WORDLIST.indexOf(word));

  if (indices.some((index) => index === -1)) {
    return null;
  }

  const bytes = new Uint8Array(indices);

  return { words, bytes };
};

/**
 * Derive a key from a recovery key
 */
export const deriveKeyFromRecoveryKey = (
  recoveryKey: RecoveryKey,
  salt: Uint8Array
): DerivedKey => {
  // Use the recovery key bytes as input to Argon2id
  const key = argon2id(recoveryKey.bytes, salt, {
    t: ARGON2_ITERATIONS,
    m: ARGON2_MEMORY,
    p: ARGON2_PARALLELISM,
    dkLen: AES_KEY_LENGTH,
  });

  return { key, salt };
};

/**
 * Encrypt data using AES-256-GCM
 */
export const encrypt = (
  plaintext: Uint8Array,
  key: Uint8Array
): { ciphertext: Uint8Array; iv: Uint8Array; tag: Uint8Array } => {
  const iv = generateRandomBytes(AES_IV_LENGTH);

  const cipher = createCipheriv(AES_ALGORITHM, key, iv, {
    authTagLength: AES_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: new Uint8Array(encrypted),
    iv,
    tag: new Uint8Array(tag),
  };
};

/**
 * Decrypt data using AES-256-GCM
 */
export const decrypt = (
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  tag: Uint8Array
): Uint8Array => {
  const decipher = createDecipheriv(AES_ALGORITHM, key, iv, {
    authTagLength: AES_TAG_LENGTH,
  });

  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return new Uint8Array(decrypted);
};

/**
 * Encrypt a string and return base64-encoded components
 */
export const encryptString = (
  plaintext: string,
  key: Uint8Array
): { ciphertext: string; iv: string; tag: string } => {
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const { ciphertext, iv, tag } = encrypt(plaintextBytes, key);

  return {
    ciphertext: Buffer.from(ciphertext).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    tag: Buffer.from(tag).toString("base64"),
  };
};

/**
 * Decrypt base64-encoded components to a string
 */
export const decryptString = (
  ciphertext: string,
  key: Uint8Array,
  iv: string,
  tag: string
): string => {
  const ciphertextBytes = new Uint8Array(Buffer.from(ciphertext, "base64"));
  const ivBytes = new Uint8Array(Buffer.from(iv, "base64"));
  const tagBytes = new Uint8Array(Buffer.from(tag, "base64"));

  const decrypted = decrypt(ciphertextBytes, key, ivBytes, tagBytes);
  return new TextDecoder().decode(decrypted);
};

/**
 * Encrypt the master key with a derived key (for storage)
 */
export const encryptMasterKey = (
  masterKey: Uint8Array,
  derivedKey: Uint8Array
): { encrypted: Uint8Array; iv: Uint8Array; tag: Uint8Array } => {
  const { ciphertext, iv, tag } = encrypt(masterKey, derivedKey);
  return { encrypted: ciphertext, iv, tag };
};

/**
 * Decrypt the master key with a derived key
 */
export const decryptMasterKey = (
  encryptedMasterKey: Uint8Array,
  derivedKey: Uint8Array,
  iv: Uint8Array,
  tag: Uint8Array
): Uint8Array => {
  return decrypt(encryptedMasterKey, derivedKey, iv, tag);
};

/**
 * Format recovery key for display
 */
export const formatRecoveryKey = (recoveryKey: RecoveryKey): string => {
  return recoveryKey.words.map((w) => w.toUpperCase()).join("-");
};

/**
 * Convert Uint8Array to base64 string
 */
export const toBase64 = (bytes: Uint8Array): string => {
  return Buffer.from(bytes).toString("base64");
};

/**
 * Convert base64 string to Uint8Array
 */
export const fromBase64 = (base64: string): Uint8Array => {
  return new Uint8Array(Buffer.from(base64, "base64"));
};

/**
 * Compute a stable, human-readable fingerprint for a public key.
 */
export const computeKeyFingerprint = (publicKey: Uint8Array): string => {
  const digest = createHash("sha256").update(publicKey).digest("hex").slice(0, 32);
  return digest.match(/.{1,4}/g)?.join("-") ?? digest;
};

/**
 * Compute SHA-256 hash of content, return short hash (8 chars like git)
 */
export const computeContentHash = (content: string): string => {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 8);
};

/**
 * Compute full SHA-256 hash of content
 */
export const computeFullHash = (content: string): string => {
  return createHash("sha256").update(content, "utf8").digest("hex");
};

// =============================================================================
// X25519 Key Exchange (for team key sharing)
// =============================================================================

/** X25519 key pair */
export type X25519KeyPair = {
  /** Public key (32 bytes) */
  publicKey: Uint8Array;
  /** Private key (32 bytes) */
  privateKey: Uint8Array;
};

/**
 * Generate an X25519 key pair for asymmetric encryption
 * Used for encrypting team keys for individual members
 */
export const generateX25519KeyPair = (): X25519KeyPair => {
  const privateKey = generateRandomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
};

/**
 * Derive a shared secret using X25519 ECDH
 * The shared secret is then used to derive an AES key via HKDF
 */
const deriveSharedKey = (
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  context: string = "team-key-exchange"
): Uint8Array => {
  // X25519 ECDH to get shared secret
  const sharedSecret = x25519.getSharedSecret(privateKey, publicKey);

  // Use HKDF to derive a proper AES key from the shared secret
  const derivedKey = hkdf(sha256, sharedSecret, undefined, new TextEncoder().encode(context), AES_KEY_LENGTH);

  return derivedKey;
};

/**
 * Encrypt data for a specific recipient using their public key
 * Uses X25519 ECDH + HKDF + AES-256-GCM (ECIES-like construction)
 *
 * @param plaintext - Data to encrypt
 * @param recipientPublicKey - Recipient's X25519 public key
 * @returns Encrypted data with ephemeral public key, IV, and auth tag
 */
export const encryptForRecipient = (
  plaintext: Uint8Array,
  recipientPublicKey: Uint8Array
): {
  ephemeralPublicKey: Uint8Array;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
} => {
  // Generate ephemeral keypair for this encryption
  const ephemeral = generateX25519KeyPair();

  // Derive shared AES key
  const sharedKey = deriveSharedKey(ephemeral.privateKey, recipientPublicKey);

  // Encrypt with AES-256-GCM
  const { ciphertext, iv, tag } = encrypt(plaintext, sharedKey);

  return {
    ephemeralPublicKey: ephemeral.publicKey,
    ciphertext,
    iv,
    tag,
  };
};

/**
 * Decrypt data that was encrypted for us using our private key
 *
 * @param ephemeralPublicKey - Sender's ephemeral public key
 * @param ciphertext - Encrypted data
 * @param iv - Initialization vector
 * @param tag - Authentication tag
 * @param recipientPrivateKey - Our X25519 private key
 * @returns Decrypted plaintext
 */
export const decryptAsRecipient = (
  ephemeralPublicKey: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  tag: Uint8Array,
  recipientPrivateKey: Uint8Array
): Uint8Array => {
  // Derive shared AES key (same as sender derived)
  const sharedKey = deriveSharedKey(recipientPrivateKey, ephemeralPublicKey);

  // Decrypt with AES-256-GCM
  return decrypt(ciphertext, sharedKey, iv, tag);
};

/**
 * Encrypt a team key for a specific member
 * Returns base64-encoded components for storage/transmission
 */
export const encryptTeamKeyForMember = (
  teamKey: Uint8Array,
  memberPublicKey: Uint8Array
): {
  ephemeralPublicKey: string;
  encryptedKey: string;
  iv: string;
  tag: string;
} => {
  const { ephemeralPublicKey, ciphertext, iv, tag } = encryptForRecipient(
    teamKey,
    memberPublicKey
  );

  return {
    ephemeralPublicKey: toBase64(ephemeralPublicKey),
    encryptedKey: toBase64(ciphertext),
    iv: toBase64(iv),
    tag: toBase64(tag),
  };
};

/**
 * Decrypt a team key that was encrypted for us
 */
export const decryptTeamKeyAsMember = (
  ephemeralPublicKey: string,
  encryptedKey: string,
  iv: string,
  tag: string,
  memberPrivateKey: Uint8Array
): Uint8Array => {
  return decryptAsRecipient(
    fromBase64(ephemeralPublicKey),
    fromBase64(encryptedKey),
    fromBase64(iv),
    fromBase64(tag),
    memberPrivateKey
  );
};

/**
 * Generate a new team master key
 */
export const generateTeamKey = (): Uint8Array => {
  return generateRandomBytes(AES_KEY_LENGTH);
};
