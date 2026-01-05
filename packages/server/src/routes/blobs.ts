/**
 * Blob (encrypted skill) routes
 */

import { Hono } from "hono";
import {
  listUserBlobs,
  findBlobById,
  upsertBlob,
  deleteBlob,
  generateId,
} from "../db/index.js";
import { authMiddleware, getUser } from "../middleware.js";

export const blobRoutes = new Hono();

// All blob routes require authentication
blobRoutes.use("*", authMiddleware);

/**
 * List all blobs for user
 * GET /blobs
 */
blobRoutes.get("/", async (c) => {
  const user = getUser(c);
  const blobs = await listUserBlobs(user.sub);

  return c.json({
    blobs: blobs.map((b) => ({
      id: b.id,
      updatedAt: b.updatedAt,
    })),
  });
});

/**
 * Get a specific blob
 * GET /blobs/:id
 */
blobRoutes.get("/:id", async (c) => {
  const user = getUser(c);
  const id = c.req.param("id");

  const blob = await findBlobById(id, user.sub);
  if (!blob) {
    return c.json({ error: "Blob not found" }, 404);
  }

  return c.json({
    id: blob.id,
    encryptedData: blob.encryptedData,
    iv: blob.iv,
    tag: blob.tag,
    updatedAt: blob.updatedAt,
  });
});

/**
 * Create or update a blob
 * PUT /blobs/:id
 */
blobRoutes.put("/:id", async (c) => {
  const user = getUser(c);
  const id = c.req.param("id");

  const body = await c.req.json<{
    encryptedData?: string;
    iv?: string;
    tag?: string;
  }>();

  if (!body.encryptedData || !body.iv || !body.tag) {
    return c.json(
      { error: "encryptedData, iv, and tag are required" },
      400
    );
  }

  const blob = await upsertBlob(id, user.sub, body.encryptedData, body.iv, body.tag);

  return c.json({
    id: blob.id,
    updatedAt: blob.updatedAt,
  });
});

/**
 * Create a new blob (auto-generate ID)
 * POST /blobs
 */
blobRoutes.post("/", async (c) => {
  const user = getUser(c);

  const body = await c.req.json<{
    encryptedData?: string;
    iv?: string;
    tag?: string;
  }>();

  if (!body.encryptedData || !body.iv || !body.tag) {
    return c.json(
      { error: "encryptedData, iv, and tag are required" },
      400
    );
  }

  const id = generateId();
  const blob = await upsertBlob(id, user.sub, body.encryptedData, body.iv, body.tag);

  return c.json(
    {
      id: blob.id,
      updatedAt: blob.updatedAt,
    },
    201
  );
});

/**
 * Delete a blob
 * DELETE /blobs/:id
 */
blobRoutes.delete("/:id", async (c) => {
  const user = getUser(c);
  const id = c.req.param("id");

  const deleted = await deleteBlob(id, user.sub);
  if (!deleted) {
    return c.json({ error: "Blob not found" }, 404);
  }

  return c.json({ success: true });
});
