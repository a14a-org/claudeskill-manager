/**
 * Configuration management
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { Config } from "@claudeskill/core";

const CONFIG_DIR = ".config/claude-skill-sync";
const CONFIG_FILE = "config.json";

/**
 * Get the config directory path
 */
export const getConfigDir = (): string => {
  return join(homedir(), CONFIG_DIR);
};

/**
 * Get the config file path
 */
export const getConfigPath = (): string => {
  return join(getConfigDir(), CONFIG_FILE);
};

/**
 * Load configuration from disk
 */
export const loadConfig = async (): Promise<Config | null> => {
  try {
    const content = await readFile(getConfigPath(), "utf-8");
    return JSON.parse(content) as Config;
  } catch {
    return null;
  }
};

/**
 * Save configuration to disk
 */
export const saveConfig = async (config: Config) => {
  const configPath = getConfigPath();
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
};

/**
 * Get default configuration
 */
export const getDefaultConfig = (): Config => {
  return {
    mode: "cloud",
    serverUrl: "https://api.claudeskill.io",
    email: null,
    skillsPath: join(homedir(), ".claude", "commands"),
    autoSync: true,
    syncInterval: 300,
  };
};
