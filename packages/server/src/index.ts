/**
 * Claude Skill Sync API Server
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { closeDb, getPublicStats } from "./db/index.js";
import { authRoutes } from "./routes/auth.js";
import { blobRoutes } from "./routes/blobs.js";
import { accountRoutes } from "./routes/account.js";
import { skillsRouter } from "./routes/skills.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3005",
      "http://localhost:5173",
      "https://claudeskill.io",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Health check
app.get("/", (c) => {
  return c.json({
    name: "Claude Skill Sync API",
    version: "0.1.0",
    status: "ok",
  });
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Public stats (no auth required)
app.get("/stats", async (c) => {
  const stats = await getPublicStats();
  return c.json(stats);
});

// Routes
app.route("/auth", authRoutes);
app.route("/blobs", blobRoutes);
app.route("/account", accountRoutes);
app.route("/skills", skillsRouter);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Start server
const port = parseInt(process.env["PORT"] ?? "3001", 10);

console.log(`Starting server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);

// Graceful shutdown
const shutdown = async (): Promise<void> => {
  console.log("\nShutting down...");
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

export { app };
