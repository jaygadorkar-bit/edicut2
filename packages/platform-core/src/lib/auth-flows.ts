import { sendMailViaGmail } from "./gmail";
import { db } from "../db";
import {
  users,
  loginAttempts,
  signupOtps,
  passwordResetTokens,
} from "../db/schema";
import { eq, and, sql, gt } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./crypto";
import { z } from "zod";
import { getSecuritySettings, type SecuritySettings } from "./security-settings";

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MINS = 15;
const RATE_LIMIT_THRESHOLD = 5;
const RATE_LIMIT_WINDOW_MINS = 1;
const SIGNUP_OTP_EXPIRY_MINS = 10;
const SIGNUP_OTP_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_EXPIRY_MINS = 60;

export type ErrorResult = { success: false; error: string };
export type SuccessResult = { success: true; message?: string; requiresOtp?: boolean };
export type AuthActionResult = SuccessResult | ErrorResult;
type SignupValidationSuccess = {
  success: true;
  name: string;
  email: string;
  password: string;
  settings: SecuritySettings;
};
type SignupValidationResult = SignupValidationSuccess | ErrorResult;

export function getClientIp(headerValue: string | null) {
  return headerValue?.split(",")[0]?.trim() || "unknown";
}

function isGmailOtpConfigured() {
  return Boolean(
    process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN &&
      process.env.GMAIL_SENDER_EMAIL
  );
}

function isRecaptchaConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && process.env.RECAPTCHA_SECRET_KEY
  );
}

async function checkRateLimit(ip: string): Promise<{ success: true } | ErrorResult> {
  const settings = await getSecuritySettings();
  if (!settings.rate_limiting_enabled) {
    return { success: true };
  }

  const oneMinuteAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MINS * 60 * 1000);

  const [attempts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.createdAt, oneMinuteAgo)));

  if (attempts.count >= RATE_LIMIT_THRESHOLD) {
    return { success: false, error: "Too many attempts. Please wait a minute." };
  }

  await db.insert(loginAttempts).values({ ip });
  return { success: true };
}

function validatePasswordPolicy(password: string) {
  const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

  return passwordSchema.safeParse(password);
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendSignupOtpEmail(email: string, name: string, otp: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  await sendMailViaGmail({
    to: email,
    subject: "Your Edicut signup verification code",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
        <p style="font-size:14px;margin-bottom:24px;">Hello ${name},</p>
        <p style="font-size:14px;line-height:1.6;margin-bottom:24px;">Use the verification code below to complete your Edicut signup. The code expires in ${SIGNUP_OTP_EXPIRY_MINS} minutes.</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:10px;text-align:center;background:#f4f4f5;padding:18px 24px;border-radius:12px;margin-bottom:24px;">${otp}</div>
        <p style="font-size:13px;line-height:1.6;margin-bottom:8px;">If you did not request this account, you can ignore this email.</p>
        <p style="font-size:12px;color:#6b7280;line-height:1.6;">Sent from ${appUrl}</p>
      </div>
    `,
  });
}

async function sendResetPasswordEmail(email: string, name: string, token: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  await sendMailViaGmail({
    to: email,
    subject: "Reset your Edicut password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
        <h2 style="font-size:24px;font-weight:700;margin-bottom:16px;">Password Reset Request</h2>
        <p style="font-size:14px;line-height:1.6;margin-bottom:24px;">Hello ${name},</p>
        <p style="font-size:14px;line-height:1.6;margin-bottom:24px;">We received a request to reset your Edicut password. Click the button below to set a new password. This link will expire in ${PASSWORD_RESET_EXPIRY_MINS / 60} hour.</p>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${resetUrl}" style="background:#000;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Reset Password</a>
        </div>
        <p style="font-size:12px;color:#6b7280;margin-bottom:24px;">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:24px;" />
        <p style="font-size:12px;color:#9ca3af;line-height:1.6;">If the button above doesn't work, copy and paste this URL into your browser:<br />
        <a href="${resetUrl}" style="color:#2563eb;">${resetUrl}</a></p>
      </div>
    `,
  });
}

async function validateSignupInput(
  input: { name: string; email: string; password: string },
  ip: string,
  checkExistingUser: boolean
): Promise<SignupValidationResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const settings = await getSecuritySettings();

  if (settings.registration_locked) {
    return { success: false, error: "Registration is currently disabled by administrator." };
  }

  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.success) {
    return rateLimit;
  }

  if (!email || !password || !name) {
    return { success: false, error: "Missing required fields." };
  }

  if (settings.strict_password_policy) {
    const validation = validatePasswordPolicy(password);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0]?.message || "Password is too weak.",
      };
    }
  }

  if (checkExistingUser) {
    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) {
      return { success: false, error: "User already exists." };
    }
  }

  return { success: true, name, email, password, settings };
}

async function createUserWithCredentials(
  signup: SignupValidationSuccess
): Promise<AuthActionResult> {
  try {
    const hashedPassword = await hashPassword(signup.password);
    await db.insert(users).values({
      name: signup.name,
      email: signup.email,
      password: hashedPassword,
      role: "customer",
      emailVerified: new Date(),
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to sign up with credentials:", error);
    return { success: false, error: "An error occurred during signup." };
  }
}

export async function verifyCaptchaToken(token: string | null): Promise<{ success: true } | ErrorResult> {
  const settings = await getSecuritySettings();
  if (!settings.recaptcha_enabled || !isRecaptchaConfigured()) {
    return { success: true };
  }

  if (!token) {
    return { success: false, error: "Captcha token is missing." };
  }

  try {
    const params = new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET_KEY || "",
      response: token,
    });

    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = (await response.json()) as { success: boolean };
    return data.success
      ? { success: true }
      : { success: false, error: "Captcha verification failed." };
  } catch {
    return { success: false, error: "An error occurred during captcha verification." };
  }
}

export async function requestSignupOtpAction(
  input: { name: string; email: string; password: string },
  ip: string
): Promise<AuthActionResult> {
  const signup = await validateSignupInput(input, ip, true);
  if (!signup.success) {
    return signup;
  }

  if (!signup.settings.signup_otp_enabled) {
    return createUserWithCredentials(signup);
  }

  if (!isGmailOtpConfigured()) {
    return {
      success: false,
      error:
        "Signup OTP is enabled, but Gmail API is not configured. Add the Gmail env values or disable signup OTP in admin security settings.",
    };
  }

  const passwordHash = await hashPassword(signup.password);
  const otp = generateOtp();
  const otpHash = await hashPassword(otp);
  const expiresAt = new Date(Date.now() + SIGNUP_OTP_EXPIRY_MINS * 60 * 1000);

  try {
    const [existingOtp] = await db
      .select()
      .from(signupOtps)
      .where(eq(signupOtps.email, signup.email))
      .limit(1);

    if (existingOtp) {
      await db
        .update(signupOtps)
        .set({
          name: signup.name,
          passwordHash,
          otpHash,
          attempts: 0,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(signupOtps.email, signup.email));
    } else {
      await db.insert(signupOtps).values({
        email: signup.email,
        name: signup.name,
        passwordHash,
        otpHash,
        attempts: 0,
        expiresAt,
      });
    }

    await sendSignupOtpEmail(signup.email, signup.name, otp);

    return {
      success: true,
      requiresOtp: true,
      message: `Verification code sent to ${signup.email}.`,
    };
  } catch (error) {
    console.error("Failed to issue signup OTP. Primary Error:", error);

    try {
      await db.delete(signupOtps).where(eq(signupOtps.email, signup.email));
    } catch (cleanupError) {
      console.error("Failed cleanup after OTP error:", cleanupError);
    }

    return {
      success: false,
      error: "Failed to send verification email. Please check your network or Gmail settings and try again.",
    };
  }
}

export async function verifySignupOtpAction(
  input: { email: string; password: string; otp: string },
  ip: string
): Promise<AuthActionResult> {
  const settings = await getSecuritySettings();
  if (!settings.signup_otp_enabled) {
    return signUpWithCredentialsAction(
      { name: "", email: input.email, password: input.password },
      ip
    );
  }

  if (!isGmailOtpConfigured()) {
    return {
      success: false,
      error:
        "Signup OTP is enabled, but Gmail API is not configured. Add the Gmail env values or disable signup OTP in admin security settings.",
    };
  }

  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.success) {
    return rateLimit;
  }

  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const otp = input.otp.trim();

  if (!email || !password || !otp) {
    return { success: false, error: "Email, password, and OTP are required." };
  }

  const [pendingSignup] = await db
    .select()
    .from(signupOtps)
    .where(eq(signupOtps.email, email))
    .limit(1);

  if (!pendingSignup) {
    return { success: false, error: "No active signup verification was found. Request a new OTP." };
  }

  if (pendingSignup.expiresAt <= new Date()) {
    await db.delete(signupOtps).where(eq(signupOtps.email, email));
    return { success: false, error: "OTP expired. Request a new code." };
  }

  const passwordMatches = await verifyPassword(password, pendingSignup.passwordHash);
  if (!passwordMatches) {
    return { success: false, error: "Signup details changed. Request a new OTP." };
  }

  const otpMatches = await verifyPassword(otp, pendingSignup.otpHash);
  if (!otpMatches) {
    const attempts = pendingSignup.attempts + 1;

    if (attempts >= SIGNUP_OTP_MAX_ATTEMPTS) {
      await db.delete(signupOtps).where(eq(signupOtps.email, email));
      return { success: false, error: "Too many invalid OTP attempts. Request a new code." };
    }

    await db
      .update(signupOtps)
      .set({ attempts, updatedAt: new Date() })
      .where(eq(signupOtps.email, email));

    return {
      success: false,
      error: `Invalid OTP. ${SIGNUP_OTP_MAX_ATTEMPTS - attempts} attempts remaining.`,
    };
  }

  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    await db.delete(signupOtps).where(eq(signupOtps.email, email));
    return { success: false, error: "User already exists." };
  }

  try {
    await db.insert(users).values({
      name: pendingSignup.name,
      email,
      password: pendingSignup.passwordHash,
      role: "customer",
      emailVerified: new Date(),
    });

    await db.delete(signupOtps).where(eq(signupOtps.email, email));
    return { success: true };
  } catch (error) {
    console.error("Failed to verify signup OTP:", error);
    return { success: false, error: "An error occurred during signup verification." };
  }
}

export async function signUpWithCredentialsAction(
  input: { name: string; email: string; password: string },
  ip: string
): Promise<AuthActionResult> {
  const signup = await validateSignupInput(input, ip, true);
  if (!signup.success) {
    return signup;
  }

  if (signup.settings.signup_otp_enabled) {
    return requestSignupOtpAction(input, ip);
  }

  return createUserWithCredentials(signup);
}

export async function requestPasswordResetAction(input: { email: string }): Promise<AuthActionResult> {
  const email = input.email.trim().toLowerCase();

  if (!email) {
    return { success: false, error: "Email is required." };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || !user.password) {
    return {
      success: true,
      message: "If an account exists with this email, you will receive a reset link.",
    };
  }

  try {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINS * 60 * 1000);

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, email));

    await db.insert(passwordResetTokens).values({
      email,
      token,
      expiresAt,
    });

    await sendResetPasswordEmail(email, user.name || "User", token);

    return {
      success: true,
      message: "If an account exists with this email, you will receive a reset link.",
    };
  } catch (error) {
    console.error("Failed to request password reset:", error);
    return { success: false, error: "An error occurred. Please try again later." };
  }
}

export async function resetPasswordAction(input: { token: string; password: string }): Promise<AuthActionResult> {
  const token = input.token;
  const password = input.password;

  if (!token || !password) {
    return { success: false, error: "Token and password are required." };
  }

  const settings = await getSecuritySettings();
  if (settings.strict_password_policy) {
    const validation = validatePasswordPolicy(password);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0]?.message || "Password is too weak.",
      };
    }
  }

  try {
    const [resetRecord] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);

    if (!resetRecord) {
      return { success: false, error: "Invalid or expired reset token." };
    }

    if (resetRecord.expiresAt < new Date()) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, resetRecord.id));
      return { success: false, error: "Reset token has expired." };
    }

    const hashedPassword = await hashPassword(password);

    await db
      .update(users)
      .set({ password: hashedPassword, failedAttempts: 0, lockedUntil: null })
      .where(eq(users.email, resetRecord.email));

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, resetRecord.email));

    return { success: true, message: "Password updated successfully. You can now log in." };
  } catch (error) {
    console.error("Failed to reset password:", error);
    return { success: false, error: "An error occurred. Please try again later." };
  }
}

export {
  LOCKOUT_DURATION_MINS,
  LOCKOUT_THRESHOLD,
};
