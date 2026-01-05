/**
 * Account routes
 */

import { Hono } from "hono";
import {
  findUserById,
  updateUserSalt,
  updateUserRecoveryBlob,
  updateUserEncryptedMasterKey,
  deleteUser,
  deleteUserSessions,
  countUserBlobs,
} from "../db/index.js";
import { authMiddleware, getUser } from "../middleware.js";

export const accountRoutes = new Hono();

// All account routes require authentication
accountRoutes.use("*", authMiddleware);

/**
 * Get account info
 * GET /account
 */
accountRoutes.get("/", async (c) => {
  const jwtUser = getUser(c);
  const user = await findUserById(jwtUser.sub);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const blobCount = await countUserBlobs(user.id);

  return c.json({
    id: user.id,
    email: user.email,
    hasSalt: !!user.salt,
    hasEncryptedMasterKey: !!user.encryptedMasterKey,
    hasRecoveryBlob: !!user.recoveryBlob,
    blobCount,
    createdAt: user.createdAt,
  });
});

/**
 * Get salt for key derivation
 * GET /account/salt
 */
accountRoutes.get("/salt", async (c) => {
  const jwtUser = getUser(c);
  const user = await findUserById(jwtUser.sub);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (!user.salt) {
    return c.json({ error: "Salt not set" }, 404);
  }

  return c.json({ salt: user.salt });
});

/**
 * Set salt for key derivation (first time setup)
 * PUT /account/salt
 */
accountRoutes.put("/salt", async (c) => {
  const jwtUser = getUser(c);
  const user = await findUserById(jwtUser.sub);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Only allow setting salt once (or if not set)
  if (user.salt) {
    return c.json({ error: "Salt already set" }, 409);
  }

  const body = await c.req.json<{ salt?: string }>();

  if (!body.salt) {
    return c.json({ error: "Salt is required" }, 400);
  }

  await updateUserSalt(user.id, body.salt);

  return c.json({ success: true });
});

/**
 * Get recovery blob
 * GET /account/recovery
 */
accountRoutes.get("/recovery", async (c) => {
  const jwtUser = getUser(c);
  const user = await findUserById(jwtUser.sub);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (!user.recoveryBlob) {
    return c.json({ error: "Recovery blob not set" }, 404);
  }

  return c.json({ recoveryBlob: user.recoveryBlob });
});

/**
 * Set or update recovery blob
 * PUT /account/recovery
 */
accountRoutes.put("/recovery", async (c) => {
  const jwtUser = getUser(c);
  const user = await findUserById(jwtUser.sub);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const body = await c.req.json<{ recoveryBlob?: string }>();

  if (!body.recoveryBlob) {
    return c.json({ error: "Recovery blob is required" }, 400);
  }

  await updateUserRecoveryBlob(user.id, body.recoveryBlob);

  return c.json({ success: true });
});

/**
 * Get encrypted master key (for web dashboard decryption)
 * GET /account/master-key
 */
accountRoutes.get("/master-key", async (c) => {
  const jwtUser = getUser(c);
  const user = await findUserById(jwtUser.sub);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (!user.encryptedMasterKey) {
    return c.json({ error: "Encrypted master key not set" }, 404);
  }

  // Also return salt since it's needed for decryption
  return c.json({
    encryptedMasterKey: user.encryptedMasterKey,
    salt: user.salt,
  });
});

/**
 * Set or update encrypted master key
 * PUT /account/master-key
 */
accountRoutes.put("/master-key", async (c) => {
  const jwtUser = getUser(c);
  const user = await findUserById(jwtUser.sub);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const body = await c.req.json<{ encryptedMasterKey?: string }>();

  if (!body.encryptedMasterKey) {
    return c.json({ error: "Encrypted master key is required" }, 400);
  }

  await updateUserEncryptedMasterKey(user.id, body.encryptedMasterKey);

  return c.json({ success: true });
});

/**
 * Delete account and all data
 * DELETE /account
 */
accountRoutes.delete("/", async (c) => {
  const jwtUser = getUser(c);

  // Delete user (cascades to blobs due to FK)
  await deleteUser(jwtUser.sub);

  // Also delete sessions
  await deleteUserSessions(jwtUser.sub);

  return c.json({ success: true });
});
