/**
 * Email service for OTP delivery
 */

import { Resend } from "resend";

const RESEND_API_KEY = process.env["RESEND_API_KEY"];
const FROM_EMAIL = process.env["FROM_EMAIL"] ?? "noreply@claudeskill.io";
const DEV_MODE = process.env["NODE_ENV"] !== "production";

let resend: Resend | null = null;

/**
 * Get Resend client
 */
const getResend = (): Resend | null => {
  if (!resend && RESEND_API_KEY) {
    resend = new Resend(RESEND_API_KEY);
  }
  return resend;
};

/**
 * Send OTP code via email
 */
export const sendOtpEmail = async (
  email: string,
  code: string
): Promise<boolean> => {
  // In development, just log the code
  if (DEV_MODE || !RESEND_API_KEY) {
    console.log(`[DEV] OTP code for ${email}: ${code}`);
    return true;
  }

  const client = getResend();
  if (!client) {
    console.error("Resend client not initialized");
    return false;
  }

  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Your Claude Skill Sync verification code",
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h1 style="font-size: 24px; margin-bottom: 20px;">Verification Code</h1>
          <p style="color: #666; margin-bottom: 20px;">
            Enter this code to sign in to Claude Skill Sync:
          </p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <code style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">${code}</code>
          </div>
          <p style="color: #999; font-size: 14px;">
            This code expires in 10 minutes. If you didn't request this, you can ignore this email.
          </p>
        </div>
      `,
      text: `Your Claude Skill Sync verification code is: ${code}\n\nThis code expires in 10 minutes.`,
    });

    if (error) {
      console.error("Failed to send email:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Error sending email:", err);
    return false;
  }
};
