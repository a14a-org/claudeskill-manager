/**
 * Interactive onboarding flow for new users
 */

import * as p from "@clack/prompts";
import {
  generateSalt,
  generateMasterKey,
  generateRecoveryKey,
  deriveKeyFromPassphrase,
  encryptMasterKey,
  formatRecoveryKey,
  toBase64,
  listAllSkills,
} from "@claudeskill/core";
import { saveConfig, getDefaultConfig, getConfigDir } from "./config.js";
import { saveCredentials, loadCredentials } from "./credentials.js";
import * as api from "./api.js";
import { getMasterKey, pushSkills } from "./sync.js";

type SyncMode = "cloud" | "selfhosted" | "local";

/**
 * Run the interactive onboarding flow
 */
export const runOnboarding = async () => {
  p.intro("Claude Skill Sync");

  // Step 1: Choose sync mode
  const mode = await p.select({
    message: "How would you like to sync your skills?",
    options: [
      {
        value: "cloud" as const,
        label: "Cloud",
        hint: "claudeskill.io - free, encrypted, zero-knowledge",
      },
      {
        value: "selfhosted" as const,
        label: "Self-hosted",
        hint: "bring your own server",
      },
      {
        value: "local" as const,
        label: "Local only",
        hint: "no sync, just organize",
      },
    ],
  });

  if (p.isCancel(mode)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const config = getDefaultConfig();
  config.mode = mode as SyncMode;

  // Step 2: Self-hosted server URL
  if (mode === "selfhosted") {
    const serverUrl = await p.text({
      message: "Enter your server URL:",
      placeholder: "https://skills.example.com",
      validate: (value) => {
        if (!value) return "Server URL is required";
        try {
          new URL(value);
        } catch {
          return "Invalid URL";
        }
      },
    });

    if (p.isCancel(serverUrl)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    config.serverUrl = serverUrl;
  }

  // Save config early so API client can use it
  await saveConfig(config);

  // For cloud/selfhosted: authentication
  if (mode === "cloud" || mode === "selfhosted") {
    // Check server connectivity
    const spinner = p.spinner();
    spinner.start("Connecting to server...");

    const healthResult = await api.checkHealth();
    if (!healthResult.ok) {
      spinner.stop("Connection failed");
      p.log.error(`Cannot connect to server: ${healthResult.error}`);
      p.log.info("Make sure the server is running and accessible.");
      process.exit(1);
    }

    spinner.stop(`Connected to ${healthResult.data.name} v${healthResult.data.version}`);

    // Step 3: Email
    const email = await p.text({
      message: "Email for your account:",
      placeholder: "you@example.com",
      validate: (value) => {
        if (!value) return "Email is required";
        if (!value.includes("@")) return "Invalid email";
      },
    });

    if (p.isCancel(email)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    config.email = email;
    await saveConfig(config);

    // Step 4: Request OTP
    spinner.start("Sending verification code...");

    const otpResult = await api.requestOtp(email);
    if (!otpResult.ok) {
      spinner.stop("Failed to send code");
      p.log.error(otpResult.error);
      process.exit(1);
    }

    spinner.stop("Verification code sent!");

    // Step 5: Verify OTP
    const code = await p.text({
      message: "Enter the 6-digit code from your email:",
      validate: (value) => {
        if (!value) return "Code is required";
        if (!/^\d{6}$/.test(value)) return "Code must be 6 digits";
      },
    });

    if (p.isCancel(code)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    spinner.start("Verifying...");

    const verifyResult = await api.verifyOtp(email, code);
    if (!verifyResult.ok) {
      spinner.stop("Verification failed");
      p.log.error(verifyResult.error);
      process.exit(1);
    }

    spinner.stop("Verified!");

    const { accessToken, refreshToken, user } = verifyResult.data;

    // Check if this is an existing user (already has encryption set up)
    if (!user.isNewUser) {
      // Existing user - redirect to login flow
      p.log.info("Welcome back! Enter your passphrase to unlock.");

      // Get salt from server
      // First save tokens temporarily so API calls work
      await saveCredentials({
        accessToken,
        refreshToken,
        encryptedMasterKey: "",
        salt: "",
      });

      const saltResult = await api.getSalt();
      if (!saltResult.ok) {
        p.log.error(`Failed to get encryption settings: ${saltResult.error}`);
        process.exit(1);
      }

      const passphrase = await p.password({
        message: "Vault passphrase:",
        mask: "*",
      });

      if (p.isCancel(passphrase)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      // Get master key from server
      const existingCreds = await loadCredentials();
      let encryptedMasterKey = existingCreds?.encryptedMasterKey ?? "";
      const masterKeyResult = await api.getMasterKey();
      if (masterKeyResult.ok && masterKeyResult.data.encryptedMasterKey) {
        encryptedMasterKey = masterKeyResult.data.encryptedMasterKey;
      }

      // Save credentials
      await saveCredentials({
        accessToken,
        refreshToken,
        encryptedMasterKey,
        salt: saltResult.data.salt,
      });

      p.log.success("Logged in successfully!");
    } else {
      // New user - create passphrase and encryption keys
      const passphrase = await p.password({
        message: "Create a vault passphrase:",
        mask: "*",
        validate: (value) => {
          if (!value) return "Passphrase is required";
          if (value.length < 8) return "Passphrase must be at least 8 characters";
        },
      });

      if (p.isCancel(passphrase)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      const confirmPassphrase = await p.password({
        message: "Confirm passphrase:",
        mask: "*",
        validate: (value) => {
          if (value !== passphrase) return "Passphrases do not match";
        },
      });

      if (p.isCancel(confirmPassphrase)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      // Generate encryption keys
      spinner.start("Generating encryption keys...");

      const salt = generateSalt();
      const masterKey = generateMasterKey();
      const recoveryKey = generateRecoveryKey();
      const derivedKey = deriveKeyFromPassphrase(passphrase, salt);
      const encryptedMaster = encryptMasterKey(masterKey, derivedKey.key);

      // Combine IV + tag + ciphertext for storage
      const encryptedMasterKeyFull = new Uint8Array(
        encryptedMaster.iv.length +
          encryptedMaster.tag.length +
          encryptedMaster.encrypted.length
      );
      encryptedMasterKeyFull.set(encryptedMaster.iv, 0);
      encryptedMasterKeyFull.set(encryptedMaster.tag, encryptedMaster.iv.length);
      encryptedMasterKeyFull.set(
        encryptedMaster.encrypted,
        encryptedMaster.iv.length + encryptedMaster.tag.length
      );

      // Save credentials first so API calls have the access token
      await saveCredentials({
        accessToken,
        refreshToken,
        encryptedMasterKey: toBase64(encryptedMasterKeyFull),
        salt: toBase64(salt),
      });

      // Upload salt to server
      const saltResult = await api.setSalt(toBase64(salt));
      if (!saltResult.ok) {
        spinner.stop("Failed to save encryption settings");
        p.log.error(saltResult.error);
        process.exit(1);
      }

      // Upload encrypted master key to server (for web dashboard decryption)
      const masterKeyUploadResult = await api.setMasterKey(toBase64(encryptedMasterKeyFull));
      if (!masterKeyUploadResult.ok) {
        // Non-fatal - dashboard decryption won't work but CLI will
        p.log.warn("Could not sync master key for web dashboard");
      }

      spinner.stop("Encryption keys generated");

      // Show recovery key
      const formattedRecoveryKey = formatRecoveryKey(recoveryKey);

      p.note(
        `
  ${formattedRecoveryKey}

  This is the ONLY way to recover your skills if you
  forget your passphrase. Store it somewhere safe
  (password manager, printed paper, etc).

  We cannot recover your data.
        `.trim(),
        "SAVE YOUR RECOVERY KEY"
      );

      const savedRecoveryKey = await p.confirm({
        message: "I have saved my recovery key",
      });

      if (p.isCancel(savedRecoveryKey) || !savedRecoveryKey) {
        const showAgain = await p.confirm({
          message: "Show recovery key again?",
        });

        if (showAgain) {
          p.note(formattedRecoveryKey, "RECOVERY KEY");
        }

        const reallySaved = await p.confirm({
          message: "I have saved my recovery key",
        });

        if (p.isCancel(reallySaved) || !reallySaved) {
          p.cancel("You must save your recovery key to continue.");
          process.exit(0);
        }
      }

      p.log.success("Encryption configured");

      // Check for existing skills and offer to sync
      const skills = await listAllSkills();

      if (skills.length > 0) {
        const syncNow = await p.confirm({
          message: `Found ${skills.length} item${skills.length === 1 ? "" : "s"} (skills, commands, agents). Push them now?`,
        });

        if (!p.isCancel(syncNow) && syncNow) {
          spinner.start("Pushing skills...");

          const { pushed, errors } = await pushSkills(masterKey, (msg) => {
            spinner.message(msg);
          }, undefined);

          spinner.stop("Push complete");

          if (pushed > 0) {
            p.log.success(`Pushed ${pushed} skill${pushed === 1 ? "" : "s"}`);
          }

          if (errors.length > 0) {
            p.log.warning("Some skills failed:");
            errors.forEach((error) => {
              p.log.error(`  ${error}`);
            });
          }
        }
      }
    }
  } else {
    // Local mode - just save config
    await saveConfig(config);
  }

  // Done!
  p.note(
    `
claude-skill-sync list        List all skills
claude-skill-sync pull        Pull from cloud
claude-skill-sync push        Push to cloud
claude-skill-sync status      Check sync status
    `.trim(),
    "Quick commands"
  );

  p.log.info(`Config saved to ${getConfigDir()}`);
  p.outro("You're all set!");
};
