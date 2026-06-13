/**
 * Sentry/GlitchTip instrumentation.
 *
 * This module MUST be imported before any other application code so that
 * Sentry can install its instrumentation hooks first. Error tracking is
 * enabled only in production and only when a DSN is provided.
 */

import * as Sentry from "@sentry/node";

const dsn = process.env["SENTRY_DSN"];

if (process.env["NODE_ENV"] === "production" && dsn) {
	Sentry.init({
		dsn,
		environment: "production",
		// Error tracking only — no performance tracing.
		tracesSampleRate: 0,
	});
}
