/**
 * Login command - authenticate with server
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
} from "@claudeskill/core";
import { loadConfig } from "../config.js";
import { saveCredentials, loadCredentials } from "../credentials.js";
import * as api from "../api.js";

/**
 * Run the login command
 */
export const runLogin = async () => {
  const config = await loadConfig();

  if (!config) {
    p.log.error("Not configured. Run 'claude-skill-sync' first to set up.");
    return;
  }

  if (config.mode === "local") {
    p.log.error("Cannot login in local-only mode.");
    return;
  }

  p.intro("Login to Claude Skill Sync");

  // Check server health
  const healthResult = await api.checkHealth();
  if (!healthResult.ok) {
    p.log.error(`Cannot connect to server: ${healthResult.error}`);
    return;
  }

  // Get email
  const email = await p.text({
    message: "Email:",
    placeholder: config.email ?? "you@example.com",
    initialValue: config.email ?? undefined,
    validate: (value) => {
      if (!value) return "Email is required";
      if (!value.includes("@")) return "Invalid email";
    },
  });

  if (p.isCancel(email)) {
    p.cancel("Login cancelled.");
    return;
  }

  // Request OTP
  const spinner = p.spinner();
  spinner.start("Sending verification code...");

  const otpResult = await api.requestOtp(email);
  if (!otpResult.ok) {
    spinner.stop("Failed to send code");
    p.log.error(otpResult.error);
    return;
  }

  spinner.stop("Verification code sent!");

  // Get OTP code
  const code = await p.text({
    message: "Enter the 6-digit code from your email:",
    validate: (value) => {
      if (!value) return "Code is required";
      if (!/^\d{6}$/.test(value)) return "Code must be 6 digits";
    },
  });

  if (p.isCancel(code)) {
    p.cancel("Login cancelled.");
    return;
  }

  // Verify OTP
  spinner.start("Verifying...");

  const verifyResult = await api.verifyOtp(email, code);
  if (!verifyResult.ok) {
    spinner.stop("Verification failed");
    p.log.error(verifyResult.error);
    return;
  }

  spinner.stop("Verified!");

  const { accessToken, refreshToken, user } = verifyResult.data;

  // Check if this is a new user or existing
  if (user.isNewUser) {
    // New user - need to set up encryption
    p.log.info("Setting up encryption for your account...");

    const passphrase = await p.password({
      message: "Create a vault passphrase:",
      mask: "*",
      validate: (value) => {
        if (!value) return "Passphrase is required";
        if (value.length < 8) return "Passphrase must be at least 8 characters";
      },
    });

    if (p.isCancel(passphrase)) {
      p.cancel("Login cancelled.");
      return;
    }

    const confirmPassphrase = await p.password({
      message: "Confirm passphrase:",
      mask: "*",
      validate: (value) => {
        if (value !== passphrase) return "Passphrases do not match";
      },
    });

    if (p.isCancel(confirmPassphrase)) {
      p.cancel("Login cancelled.");
      return;
    }

    // Generate keys
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

    // Save credentials first so API calls work
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
      return;
    }

    // Upload encrypted master key to server (for web dashboard decryption)
    const masterKeyResult = await api.setMasterKey(toBase64(encryptedMasterKeyFull));
    if (!masterKeyResult.ok) {
      // Non-fatal - dashboard decryption won't work but CLI will
      p.log.warn("Could not sync master key for web dashboard");
    }

    spinner.stop("Encryption configured!");

    // Show recovery key
    const formattedRecoveryKey = formatRecoveryKey(recoveryKey);

    p.note(
      `
  ${formattedRecoveryKey}

  This is the ONLY way to recover your skills if you
  forget your passphrase. Store it somewhere safe.
      `.trim(),
      "SAVE YOUR RECOVERY KEY"
    );

    const saved = await p.confirm({
      message: "I have saved my recovery key",
    });

    if (p.isCancel(saved) || !saved) {
      p.note(formattedRecoveryKey, "RECOVERY KEY (showing again)");
      await p.confirm({ message: "I have saved my recovery key" });
    }
  } else {
    // Existing user - need to get salt and decrypt master key
    p.log.info("Welcome back! Enter your passphrase to unlock.");

    // Get salt from server
    const saltResult = await api.getSalt();
    if (!saltResult.ok) {
      p.log.error(`Failed to get encryption settings: ${saltResult.error}`);
      return;
    }

    const passphrase = await p.password({
      message: "Vault passphrase:",
      mask: "*",
    });

    if (p.isCancel(passphrase)) {
      p.cancel("Login cancelled.");
      return;
    }

    // For existing users, we need to verify the passphrase
    // by trying to decrypt something or asking them to re-enter
    // For now, just save the credentials
    const existingCreds = await loadCredentials();

    // Try to get master key from server, fall back to local
    let encryptedMasterKey = existingCreds?.encryptedMasterKey ?? "";
    const masterKeyResult = await api.getMasterKey();
    if (masterKeyResult.ok && masterKeyResult.data.encryptedMasterKey) {
      encryptedMasterKey = masterKeyResult.data.encryptedMasterKey;
    } else if (existingCreds?.encryptedMasterKey) {
      // Sync local master key to server for web dashboard
      await api.setMasterKey(existingCreds.encryptedMasterKey);
    }

    await saveCredentials({
      accessToken,
      refreshToken,
      encryptedMasterKey,
      salt: saltResult.data.salt,
    });
  }

  p.log.success("Logged in successfully!");
  p.outro(`Logged in as ${email}`);
};
