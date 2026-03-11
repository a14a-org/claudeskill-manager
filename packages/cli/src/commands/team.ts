/**
 * Team management commands
 */

import * as p from "@clack/prompts";
import {
  listTeams,
  createTeam,
  getTeam,
  createTeamInvite,
  acceptTeamInvite,
  listAllPendingMembers,
  distributeTeamKey,
  getSharingKey,
  setSharingKey,
  getKeypair,
  setKeypair,
  getMyTeamKey,
} from "../api.js";
import { loadCredentials, saveCredentials } from "../credentials.js";
import {
  computeKeyFingerprint,
  generateX25519KeyPair,
  encryptTeamKeyForMember,
  decryptTeamKeyAsMember,
  generateTeamKey,
  encrypt,
  decrypt,
  toBase64,
  fromBase64,
} from "@claudeskill/core";

/**
 * Ensure user has a keypair for team operations
 * Generates one if not present
 */
const ensureKeypair = async (
  masterKey: Uint8Array
): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> => {
  const credentials = await loadCredentials();
  if (!credentials) {
    throw new Error("Not logged in");
  }

  // Check if we have a local keypair
  if (
    credentials.publicKey &&
    credentials.encryptedPrivateKey &&
    credentials.privateKeyIv &&
    credentials.privateKeyTag
  ) {
    // Decrypt private key
    const privateKey = decrypt(
      fromBase64(credentials.encryptedPrivateKey),
      masterKey,
      fromBase64(credentials.privateKeyIv),
      fromBase64(credentials.privateKeyTag)
    );
    return {
      publicKey: fromBase64(credentials.publicKey),
      privateKey,
    };
  }

  // Check server for existing keypair
  const serverKeypair = await getSharingKey();
  const legacyServerKeypair =
    !serverKeypair.ok && serverKeypair.status === 404 ? await getKeypair() : null;
  const keypairResponse =
    serverKeypair.ok || serverKeypair.status !== 404
      ? serverKeypair
      : legacyServerKeypair;
  if (keypairResponse?.ok && keypairResponse.data.hasKeypair) {
    // Download and decrypt
    const privateKey = decrypt(
      fromBase64(keypairResponse.data.encryptedPrivateKey!),
      masterKey,
      fromBase64(keypairResponse.data.privateKeyIv!),
      fromBase64(keypairResponse.data.privateKeyTag!)
    );

    // Save locally
    await saveCredentials({
      ...credentials,
      publicKey: keypairResponse.data.publicKey,
      publicKeyFingerprint: keypairResponse.data.publicKeyFingerprint ?? undefined,
      encryptedPrivateKey: keypairResponse.data.encryptedPrivateKey,
      privateKeyIv: keypairResponse.data.privateKeyIv,
      privateKeyTag: keypairResponse.data.privateKeyTag,
    });

    return {
      publicKey: fromBase64(keypairResponse.data.publicKey!),
      privateKey,
    };
  }

  // Generate new keypair
  p.log.info("Generating keypair for team operations...");
  const keypair = generateX25519KeyPair();

  // Encrypt private key with master key
  const { ciphertext, iv, tag } = encrypt(keypair.privateKey, masterKey);

  // Upload to server
  const uploadResult = await setSharingKey(
    toBase64(keypair.publicKey),
    toBase64(ciphertext),
    toBase64(iv),
    toBase64(tag)
  );

  if (!uploadResult.ok) {
    const legacyUploadResult = await setKeypair(
      toBase64(keypair.publicKey),
      toBase64(ciphertext),
      toBase64(iv),
      toBase64(tag)
    );

    if (!legacyUploadResult.ok) {
      throw new Error(`Failed to upload keypair: ${uploadResult.error}`);
    }
  }

  // Save locally
  await saveCredentials({
    ...credentials,
    publicKey: toBase64(keypair.publicKey),
    publicKeyFingerprint: computeKeyFingerprint(keypair.publicKey),
    encryptedPrivateKey: toBase64(ciphertext),
    privateKeyIv: toBase64(iv),
    privateKeyTag: toBase64(tag),
  });

  p.log.success("Keypair generated and saved");

  return keypair;
};

/**
 * List teams command
 */
export const runTeamList = async (): Promise<void> => {
  const spinner = p.spinner();
  spinner.start("Loading teams...");

  const result = await listTeams();

  if (!result.ok) {
    spinner.stop("Failed to load teams");
    p.log.error(result.error);
    return;
  }

  spinner.stop("Teams loaded");

  if (result.data.teams.length === 0) {
    p.log.info("You are not a member of any teams.");
    p.log.info("Create a team with: claude-skill-sync team create <name>");
    return;
  }

  console.log("\nYour teams:\n");
  for (const team of result.data.teams) {
    const status = team.status === "pending" ? " (pending key)" : "";
    console.log(
      `  ${team.name} [${team.role}]${status}\n` +
        `    ID: ${team.id}\n` +
        `    Members: ${team.memberCount} | Skills: ${team.skillCount}\n`
    );
  }
};

export const runTeamCreate = async (
  name: string,
  masterKey: Uint8Array
): Promise<void> => {
  const spinner = p.spinner();
  spinner.start("Creating team and generating team key...");

  const created = await createTeamWithKey(name, masterKey);
  if (!created) {
    spinner.stop("Failed to create team");
    return;
  }

  spinner.stop("Team created");
  p.log.success(`Team "${name}" created successfully!`);
  p.log.info(`Team ID: ${created.teamId}`);
  p.log.info("You can now invite members with: claude-skill-sync team invite <team-id> <email>");
};

/**
 * Show team details command
 */
export const runTeamShow = async (teamId: string): Promise<void> => {
  const spinner = p.spinner();
  spinner.start("Loading team...");

  const result = await getTeam(teamId);

  if (!result.ok) {
    spinner.stop("Failed to load team");
    p.log.error(result.error);
    return;
  }

  spinner.stop("Team loaded");

  const team = result.data;
  console.log(`\nTeam: ${team.name}`);
  console.log(`Role: ${team.role} | Status: ${team.status}`);
  console.log(`ID: ${team.id}\n`);

  console.log("Members:");
  for (const member of team.members) {
    const status = member.status === "pending" ? " (pending)" : "";
    const keyStatus = member.hasTeamKey ? "" : " [no key]";
    console.log(`  ${member.email} [${member.role}]${status}${keyStatus}`);
  }

  if (team.skills.length > 0) {
    console.log("\nSkills:");
    for (const skill of team.skills) {
      console.log(`  ${skill.skillKey} (${skill.currentHash ?? "no versions"})`);
    }
  } else {
    console.log("\nNo skills shared with this team yet.");
  }
};

/**
 * Invite member to team
 */
export const runTeamInvite = async (
  teamId: string,
  email: string,
  role: string = "editor"
): Promise<void> => {
  const validRoles = ["admin", "editor", "viewer"];
  if (!validRoles.includes(role)) {
    p.log.error(`Invalid role: ${role}. Must be one of: ${validRoles.join(", ")}`);
    return;
  }

  const spinner = p.spinner();
  spinner.start("Creating invite...");

  const result = await createTeamInvite(teamId, email, role);

  if (!result.ok) {
    spinner.stop("Failed to create invite");
    p.log.error(result.error);
    return;
  }

  spinner.stop("Invite created");
  p.log.success(`Invite sent to ${email} as ${role}`);
  console.log("\nShare this invite token with the user:");
  console.log(`\n  ${result.data.token}\n`);
  p.log.info(`Expires: ${new Date(result.data.expiresAt).toLocaleString()}`);
  p.log.info(
    "They can accept with: claude-skill-sync team accept <token>"
  );
};

/**
 * Accept team invite
 */
export const runTeamAccept = async (
  token: string,
  masterKey: Uint8Array
): Promise<void> => {
  // Ensure we have a keypair first
  await ensureKeypair(masterKey);

  const spinner = p.spinner();
  spinner.start("Accepting invite...");

  const result = await acceptTeamInvite(token);

  if (!result.ok) {
    spinner.stop("Failed to accept invite");
    p.log.error(result.error);
    return;
  }

  spinner.stop("Invite accepted");
  p.log.success(`Joined team "${result.data.teamName}" as ${result.data.role}`);
  p.log.info(result.data.message);
  p.log.info(
    "A team admin will distribute the team key to you. Run 'sync' again later to check."
  );
};

/**
 * Distribute team keys to pending members
 * This is called automatically during sync for owners/admins
 */
export const runDistributeKeys = async (
  masterKey: Uint8Array,
  teamKeys: Map<string, Uint8Array>
): Promise<void> => {
  const credentials = await loadCredentials();
  if (!credentials) {
    p.log.warning("Not logged in. Skipping team key distribution.");
    return;
  }
  let knownPublicKeyFingerprints = credentials.knownPublicKeyFingerprints ?? {};

  // Get all pending members across teams we manage
  const pendingResult = await listAllPendingMembers();

  if (!pendingResult.ok) {
    p.log.warning(`Could not check for pending members: ${pendingResult.error}`);
    return;
  }

  const pending = pendingResult.data.pendingMembers;
  if (pending.length === 0) {
    return;
  }

  p.log.info(`Found ${pending.length} pending team member(s) waiting for keys`);

  for (const member of pending) {
    // Check if member has a public key
    if (!member.publicKey) {
      p.log.warning(
        `${member.email} hasn't set up their keypair yet. Skipping.`
      );
      continue;
    }

    // Get the team key (we need to have it)
    const teamKey = teamKeys.get(member.teamId);
    if (!teamKey) {
      p.log.warning(
        `You don't have the key for team "${member.teamName}". Skipping.`
      );
      continue;
    }

    const fingerprint =
      member.publicKeyFingerprint ??
      computeKeyFingerprint(fromBase64(member.publicKey));
    const cacheKey = member.userId;
    const cachedFingerprint = knownPublicKeyFingerprints[cacheKey];

    if (cachedFingerprint && cachedFingerprint !== fingerprint) {
      const confirm = await p.confirm({
        message:
          `Public key fingerprint changed for ${member.email} (${fingerprint}). Encrypt anyway?`,
      });

      if (p.isCancel(confirm) || !confirm) {
        p.log.warning(`Skipped ${member.email} because their public key fingerprint changed.`);
        continue;
      }
    } else if (!cachedFingerprint) {
      const confirm = await p.confirm({
        message:
          `Trust public key for ${member.email}? Fingerprint: ${fingerprint}`,
      });

      if (p.isCancel(confirm) || !confirm) {
        p.log.warning(`Skipped ${member.email} because their public key is not trusted yet.`);
        continue;
      }
    }

    // Encrypt team key for this member
    const memberPublicKey = fromBase64(member.publicKey);
    const encrypted = encryptTeamKeyForMember(teamKey, memberPublicKey);

    // Upload encrypted key
    const result = await distributeTeamKey(
      member.teamId,
      member.userId,
      encrypted.encryptedKey,
      encrypted.iv,
      encrypted.tag,
      encrypted.ephemeralPublicKey
    );

    if (result.ok) {
      await saveCredentials({
        ...credentials,
        knownPublicKeyFingerprints: {
          ...knownPublicKeyFingerprints,
          [cacheKey]: fingerprint,
        },
      });
      knownPublicKeyFingerprints = {
        ...knownPublicKeyFingerprints,
        [cacheKey]: fingerprint,
      };
      p.log.success(`Distributed team key to ${member.email} for "${member.teamName}"`);
    } else {
      p.log.error(`Failed to distribute key to ${member.email}: ${result.error}`);
    }
  }
};

/**
 * Get team key for a team (download and decrypt if needed)
 */
export const getTeamKeyForTeam = async (
  teamId: string,
  masterKey: Uint8Array,
  keypair: { publicKey: Uint8Array; privateKey: Uint8Array }
): Promise<Uint8Array | null> => {
  const result = await getMyTeamKey(teamId);

  if (!result.ok) {
    return null;
  }

  // Decrypt team key using our private key
  const teamKey = decryptTeamKeyAsMember(
    result.data.ephemeralPublicKey,
    result.data.encryptedTeamKey,
    result.data.iv,
    result.data.tag,
    keypair.privateKey
  );

  return teamKey;
};

/**
 * Create a new team with initial team key
 * Returns the team key for immediate use
 */
export const createTeamWithKey = async (
  name: string,
  masterKey: Uint8Array
): Promise<{ teamId: string; teamKey: Uint8Array } | null> => {
  // Ensure we have a keypair
  const keypair = await ensureKeypair(masterKey);

  // Create team
  const createResult = await createTeam(name);
  if (!createResult.ok) {
    p.log.error(`Failed to create team: ${createResult.error}`);
    return null;
  }

  // Generate team key
  const teamKey = generateTeamKey();

  // Encrypt team key for ourselves (as owner)
  const encrypted = encryptTeamKeyForMember(teamKey, keypair.publicKey);

  // Get our own user ID from team details
  const teamDetailsResult = await getTeam(createResult.data.id);
  if (!teamDetailsResult.ok) {
    p.log.warning(`Team created but failed to get team details: ${teamDetailsResult.error}`);
    return { teamId: createResult.data.id, teamKey };
  }

  const ownerMember = teamDetailsResult.data.members.find(
    (m) => m.role === "owner"
  );
  if (!ownerMember) {
    p.log.warning("Could not find owner in team members");
    return { teamId: createResult.data.id, teamKey };
  }

  // Store our own team key
  const keyResult = await distributeTeamKey(
    createResult.data.id,
    ownerMember.userId,
    encrypted.encryptedKey,
    encrypted.iv,
    encrypted.tag,
    encrypted.ephemeralPublicKey,
    createResult.data.activeKeyVersion ?? 1
  );

  if (!keyResult.ok) {
    p.log.warning(`Team created but failed to store team key: ${keyResult.error}`);
  }

  return { teamId: createResult.data.id, teamKey };
};

export { ensureKeypair };
