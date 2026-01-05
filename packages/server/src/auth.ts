/**
 * Authentication utilities
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, randomBytes } from "@noble/hashes/utils";

/** JWT configuration */
const JWT_SECRET = process.env["JWT_SECRET"] ?? "development-secret-change-me";
const ACCESS_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds

/** OTP configuration */
const OTP_LENGTH = 6;

/**
 * Generate a random OTP code
 */
export const generateOtpCode = (): string => {
  const bytes = randomBytes(4);
  const num =
    ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>>
    0;
  return String(num % 1000000).padStart(OTP_LENGTH, "0");
};

/**
 * Hash a token for storage
 */
export const hashToken = (token: string): string => {
  return bytesToHex(sha256(token));
};

/**
 * Generate a random token
 */
export const generateToken = (): string => {
  return bytesToHex(randomBytes(32));
};

/**
 * Base64URL encode
 */
const base64UrlEncode = (data: string): string => {
  return Buffer.from(data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
};

/**
 * Base64URL decode
 */
const base64UrlDecode = (data: string): string => {
  const padded = data + "=".repeat((4 - (data.length % 4)) % 4);
  return Buffer.from(
    padded.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString();
};

/**
 * JWT payload
 */
export type JwtPayload = {
  sub: string; // user ID
  email: string;
  iat: number; // issued at
  exp: number; // expiration
};

/**
 * Create a JWT token
 */
export const createJwt = (userId: string, email: string): string => {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "HS256", typ: "JWT" };
  const payload: JwtPayload = {
    sub: userId,
    email,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const message = `${headerB64}.${payloadB64}`;

  const signature = bytesToHex(sha256(`${message}.${JWT_SECRET}`));
  const signatureB64 = base64UrlEncode(signature);

  return `${message}.${signatureB64}`;
};

/**
 * Verify and decode a JWT token
 */
export const verifyJwt = (token: string): JwtPayload | null => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const message = `${headerB64}.${payloadB64}`;

    // Verify signature
    const expectedSignature = bytesToHex(sha256(`${message}.${JWT_SECRET}`));
    const expectedSignatureB64 = base64UrlEncode(expectedSignature);

    if (signatureB64 !== expectedSignatureB64) return null;

    // Decode payload
    const payload = JSON.parse(base64UrlDecode(payloadB64!)) as JwtPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
};

/**
 * Create access and refresh tokens for a user
 */
export const createTokenPair = (
  userId: string,
  email: string
): { accessToken: string; refreshToken: string } => {
  const accessToken = createJwt(userId, email);
  const refreshToken = generateToken();
  return { accessToken, refreshToken };
};

/**
 * Rate limiting state (in-memory for simplicity)
 */
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for OTP requests
 */
export const checkRateLimit = (
  email: string,
  maxRequests = 5,
  windowMs = 60000
): boolean => {
  const now = Date.now();
  const state = rateLimitState.get(email);

  if (!state || state.resetAt < now) {
    rateLimitState.set(email, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (state.count >= maxRequests) {
    return false;
  }

  state.count++;
  return true;
};

/**
 * Clean up expired rate limit entries
 */
export const cleanupRateLimits = (): void => {
  const now = Date.now();
  const expiredKeys = Array.from(rateLimitState.entries())
    .filter(([, state]) => state.resetAt < now)
    .map(([key]) => key);

  expiredKeys.forEach((key) => rateLimitState.delete(key));
};
