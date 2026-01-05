/**
 * Credentials management
 *
 * Stores encrypted credentials locally.
 * In the future, this could integrate with OS keychain.
 */

import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { join, dirname } from "node:path";
import { getConfigDir } from "./config.js";
import type { Credentials } from "@claudeskill/core";

const CREDENTIALS_FILE = "credentials.json";

/**
 * Get the credentials file path
 */
export const getCredentialsPath = (): string => {
  return join(getConfigDir(), CREDENTIALS_FILE);
};

/**
 * Load credentials from disk
 */
export const loadCredentials = async (): Promise<Credentials | null> => {
  try {
    const content = await readFile(getCredentialsPath(), "utf-8");
    return JSON.parse(content) as Credentials;
  } catch {
    return null;
  }
};

/**
 * Save credentials to disk
 */
export const saveCredentials = async (
  credentials: Credentials
) => {
  const credentialsPath = getCredentialsPath();
  await mkdir(dirname(credentialsPath), { recursive: true });
  await writeFile(credentialsPath, JSON.stringify(credentials, null, 2), {
    encoding: "utf-8",
    mode: 0o600, // Only owner can read/write
  });

  // Ensure permissions are correct (in case file existed)
  await chmod(credentialsPath, 0o600);
};

/**
 * Delete credentials from disk
 */
export const deleteCredentials = async () => {
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(getCredentialsPath());
  } catch {
    // Ignore if file doesn't exist
  }
};
