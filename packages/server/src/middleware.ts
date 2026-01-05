/**
 * Middleware for authentication and common operations
 */

import type { Context, Next } from "hono";
import { verifyJwt, type JwtPayload } from "./auth.js";

/**
 * Extended context with user info
 */
export type AuthContext = {
  user: JwtPayload;
};

/**
 * Authentication middleware
 * Verifies JWT token and adds user to context
 */
export const authMiddleware = async (
  c: Context,
  next: Next
): Promise<Response | void> => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization header required" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = verifyJwt(token);

  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  // Add user to context
  c.set("user", payload);

  await next();
};

/**
 * Get user from context (use after authMiddleware)
 */
export const getUser = (c: Context): JwtPayload => {
  return c.get("user") as JwtPayload;
};
