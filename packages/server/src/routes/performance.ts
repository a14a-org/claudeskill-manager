/**
 * Performance configuration routes
 *
 * Serves performance hints, responsive image configs, font loading
 * directives, and mobile UX guidelines for the frontend.
 *
 * GET /performance returns the full performance configuration.
 * GET /performance/mobile returns mobile-specific configuration.
 */

import { Hono } from "hono";
import { performanceConfig } from "../performance.js";

export const performanceRouter = new Hono();

/**
 * Full performance configuration
 * GET /performance
 */
performanceRouter.get("/", (c) => {
  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  return c.json(performanceConfig());
});

/**
 * Mobile-specific configuration
 * GET /performance/mobile
 */
performanceRouter.get("/mobile", (c) => {
  const config = performanceConfig();
  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  return c.json({
    viewport: config.mobile.viewport,
    touchTargets: config.mobile.touchTargets,
    fontSizing: config.mobile.fontSizing,
    breakpoints: config.mobile.breakpoints,
    heroImage: config.heroImage,
    fonts: config.fonts,
  });
});
