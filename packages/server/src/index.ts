/**
 * Claude Skill Sync API Server
 */

// Must be imported first so Sentry can install its instrumentation hooks.
import "./instrument.js";

import { serve } from "@hono/node-server";
import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { closeDb, getPublicStats } from "./db/index.js";
import { accountRoutes } from "./routes/account.js";
import { adminRouter } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { blobRoutes } from "./routes/blobs.js";
import { publicSkillsRouter } from "./routes/public-skills.js";
import { skillsRouter } from "./routes/skills.js";
import { teamsRouter } from "./routes/teams.js";

const app = new Hono();
const enableTeamSharing = process.env["ENABLE_TEAM_SHARING"] === "true";

// Security headers
app.use("*", async (c, next) => {
	await next();
	c.header("X-Frame-Options", "DENY");
	c.header("X-Content-Type-Options", "nosniff");
	c.header("Referrer-Policy", "strict-origin-when-cross-origin");
	c.header("X-XSS-Protection", "1; mode=block");
	c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
	c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
});

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
	}),
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
app.route("/public/skills", publicSkillsRouter);
app.route("/admin", adminRouter);
if (enableTeamSharing) {
	app.route("/teams", teamsRouter);
}

// 404 handler
app.notFound((c) => {
	return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
	console.error("Server error:", err);
	Sentry.captureException(err);
	return c.json({ error: "Internal server error" }, 500);
});

// Start server
const port = parseInt(process.env["PORT"] ?? "3001", 10);

console.log(`Starting server on port ${port}...`);
console.log(`Team sharing routes: ${enableTeamSharing ? "enabled" : "disabled"}`);

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
