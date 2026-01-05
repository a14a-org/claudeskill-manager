/**
 * Authentication routes
 */

import { Hono } from "hono";
import {
  findUserByEmail,
  createUser,
  createOtpCode,
  findValidOtpCode,
  markOtpCodeUsed,
  createSession,
  findValidSession,
  deleteSession,
} from "../db/index.js";
import {
  generateOtpCode,
  hashToken,
  createTokenPair,
  checkRateLimit,
} from "../auth.js";
import { sendOtpEmail } from "../email.js";

export const authRoutes = new Hono();

/**
 * Request OTP code
 * POST /auth/otp/request
 */
authRoutes.post("/otp/request", async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const email = body.email?.toLowerCase().trim();

  if (!email || !email.includes("@")) {
    return c.json({ error: "Valid email is required" }, 400);
  }

  // Rate limiting
  if (!checkRateLimit(email)) {
    return c.json({ error: "Too many requests. Please wait a minute." }, 429);
  }

  // Generate OTP
  const code = generateOtpCode();
  await createOtpCode(email, code);

  // Send email
  const sent = await sendOtpEmail(email, code);
  if (!sent) {
    return c.json({ error: "Failed to send verification email" }, 500);
  }

  return c.json({ success: true, message: "OTP sent to email" });
});

/**
 * Verify OTP code and login
 * POST /auth/otp/verify
 */
authRoutes.post("/otp/verify", async (c) => {
  const body = await c.req.json<{ email?: string; code?: string }>();
  const email = body.email?.toLowerCase().trim();
  const code = body.code?.trim();

  if (!email || !code) {
    return c.json({ error: "Email and code are required" }, 400);
  }

  // Find valid OTP
  const otpRecord = await findValidOtpCode(email, code);
  if (!otpRecord) {
    return c.json({ error: "Invalid or expired code" }, 401);
  }

  // Mark OTP as used
  await markOtpCodeUsed(otpRecord.id);

  // Find or create user
  let user = await findUserByEmail(email);
  if (!user) {
    user = await createUser(email);
  }

  // Create tokens
  const { accessToken, refreshToken } = createTokenPair(user.id, email);

  // Store session
  const refreshTokenHash = hashToken(refreshToken);
  await createSession(user.id, refreshTokenHash);

  return c.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      isNewUser: !user.salt,
    },
  });
});

/**
 * Refresh access token
 * POST /auth/refresh
 */
authRoutes.post("/refresh", async (c) => {
  const body = await c.req.json<{ refreshToken?: string }>();
  const refreshToken = body.refreshToken;

  if (!refreshToken) {
    return c.json({ error: "Refresh token is required" }, 400);
  }

  // Find valid session
  const refreshTokenHash = hashToken(refreshToken);
  const session = await findValidSession(refreshTokenHash);

  if (!session) {
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }

  // Create new access token (keep same refresh token)
  const { accessToken } = createTokenPair(session.userId, session.email);

  return c.json({ accessToken });
});

/**
 * Logout
 * POST /auth/logout
 */
authRoutes.post("/logout", async (c) => {
  const body = await c.req.json<{ refreshToken?: string }>();
  const refreshToken = body.refreshToken;

  if (refreshToken) {
    const refreshTokenHash = hashToken(refreshToken);
    const session = await findValidSession(refreshTokenHash);
    if (session) {
      await deleteSession(session.id);
    }
  }

  return c.json({ success: true });
});
