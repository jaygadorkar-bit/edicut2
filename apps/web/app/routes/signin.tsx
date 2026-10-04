import type { ActionFunctionArgs, MetaFunction } from "react-router";
import { AuthPage } from "../components/auth/AuthModal";
import { users } from "@edicut/db/schema";
import { findUserByEmail } from "@edicut/db/repositories/users";
import { findAdminUserByEmail } from "@edicut/db/repositories/admin-users";
import bcrypt from "bcryptjs";
import { createUserSession, isAdminRole } from "../lib/session.server";
import { getDbFromContext } from "../lib/db.server";
import { verifyPassword } from "../lib/password.server";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";
import { consumeUsageLimit, hashUsageLimitKey, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import {
  signInWithSupabase,
  signUpWithSupabase,
  supabaseAuthEnabled,
} from "../integrations/supabase/auth.server";

export const meta: MetaFunction = () => [
  { title: "Sign in - EdiCut" },
  { name: "description", content: "Sign in or create an account with EdiCut" },
  { name: "robots", content: "noindex, nofollow, noarchive" },
];

export async function action({ request, context }: ActionFunctionArgs) {
  if (requestBodyExceedsLimit(request, 64 * 1024)) {
    return { error: "Sign-in request is too large. Please try again.", intent: "signin" };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const remember = formData.get("remember") === "on";
  const redirectTo = sanitizeRedirect((formData.get("redirectTo") as string | null) || "/dashboard");

  if (!(["signin", "signup"] as const).includes(intent as "signin" | "signup") || !email || email.length > 254 || !password || password.length < 6 || password.length > 1024) {
    return { error: "Invalid email or password (min 6 characters).", intent };
  }

  const identityKey = await hashUsageLimitKey(email);
  const authLimit = await consumeUsageLimit({
    context,
    request,
    bindingName: "AUTH_IDENTITY_LIMITER",
    key: identityKey,
    localLimit: 5,
    localPeriodSeconds: 60,
  });

  if (authLimit !== "allowed") {
    return {
      error: authLimit === "limited"
        ? "Too many attempts for this account. Wait a minute and try again."
        : "Sign-in protection is temporarily unavailable. Please try again shortly.",
      intent,
    };
  }

  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (intent === "signup" && name.length > 120) {
    return { error: "Your name must be 120 characters or fewer.", intent };
  }

  const captcha = await verifyRecaptchaToken({
    context,
    token: formData.get("g-recaptcha-response"),
  });

  if (!captcha.success) {
    return { error: captcha.error, intent };
  }

  const db = getDbFromContext(context);
  const adminUser = intent === "signin" ? await findAdminUserByEmail(db, email) : null;
  const adminCredentialsVerified = Boolean(
    adminUser?.active &&
    isAdminRole(adminUser.role) &&
    adminUser.passwordHash &&
    await verifyPassword(password, adminUser.passwordHash),
  );

  if (intent === "signup") {
    if (supabaseAuthEnabled(context)) {
      const result = await signUpWithSupabase({
        context,
        email,
        password,
        name,
      });

      if (result.error) {
        return { error: result.error, intent };
      }

      if (!result.user || !result.session) {
        return {
          error: "Account created. Check your email to confirm the account before signing in.",
          intent,
        };
      }

      return createUserSession({
        request,
        context,
        userId: result.user.id,
        remember,
        redirectTo,
        accessToken: result.session.access_token,
        refreshToken: result.session.refresh_token,
      });
    }

    const existing = await findUserByEmail(db, email);
    if (existing) {
      return { error: "User with this email already exists.", intent };
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const [user] = await db.insert(users).values({
      email,
      name: name || null,
      passwordHash,
    }).returning();

    return createUserSession({ request, context, userId: user.id, remember, redirectTo });
  }

  if (intent === "signin") {
    if (supabaseAuthEnabled(context)) {
      const result = await signInWithSupabase({ context, email, password });

      if (!result.error && result.user && result.session) {
        const verifiedAdminIdentity = Boolean(
          adminUser?.active &&
          isAdminRole(adminUser.role) &&
          result.user.email?.trim().toLowerCase() === adminUser.email.toLowerCase() &&
          result.user.email_confirmed_at,
        );

        return createUserSession({
          request,
          context,
          userId: result.user.id,
          remember,
          redirectTo,
          accessToken: result.session.access_token,
          refreshToken: result.session.refresh_token,
          adminUserId: verifiedAdminIdentity ? adminUser?.id : undefined,
          adminAccessVerified: verifiedAdminIdentity,
        });
      }

      if (result.error) {
        // Keep existing local accounts usable while they are being moved into
        // Supabase Auth. New accounts never use this fallback path.
        const legacyUser = await findUserByEmail(db, email);
        if (legacyUser?.passwordHash && await verifyPassword(password, legacyUser.passwordHash)) {
          return createUserSession({
            request,
            context,
            userId: legacyUser.id,
            remember,
            redirectTo,
            adminUserId: adminCredentialsVerified ? adminUser?.id : undefined,
            adminAccessVerified: adminCredentialsVerified,
          });
        }

        if (adminUser?.active && isAdminRole(adminUser.role) && adminUser.passwordHash && await verifyPassword(password, adminUser.passwordHash)) {
          const existingProfile = await findUserByEmail(db, email);
          const [profile] = existingProfile
            ? [existingProfile]
            : await db.insert(users).values({
                email,
                name: adminUser.name,
                role: "customer",
                active: true,
                passwordHash: adminUser.passwordHash,
              }).returning();

          return createUserSession({
            request,
            context,
            userId: profile.id,
            remember,
            redirectTo,
            adminUserId: adminUser.id,
            adminAccessVerified: true,
          });
        }

        return { error: "Invalid credentials.", intent };
      }

      return { error: "Supabase did not return an authenticated session.", intent };
    }

    const user = await findUserByEmail(db, email);
    if (!user || !user.passwordHash) {
      if (adminUser?.active && isAdminRole(adminUser.role) && adminUser.passwordHash && await verifyPassword(password, adminUser.passwordHash)) {
        const existingProfile = user || await findUserByEmail(db, email);
        const [profile] = existingProfile
          ? [existingProfile]
          : await db.insert(users).values({
              email,
              name: adminUser.name,
              role: "customer",
              active: true,
              passwordHash: adminUser.passwordHash,
            }).returning();

        if (profile) {
          return createUserSession({
            request,
            context,
            userId: profile.id,
            remember,
            redirectTo,
            adminUserId: adminUser.id,
            adminAccessVerified: true,
          });
        }
      }

      return { error: "Invalid credentials.", intent };
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return { error: "Invalid credentials.", intent };
    }

    return createUserSession({
      request,
      context,
      userId: user.id,
      remember,
      redirectTo,
      adminUserId: adminCredentialsVerified ? adminUser?.id : undefined,
      adminAccessVerified: adminCredentialsVerified,
    });
  }

  return { error: "Unknown intent", intent };
}

export default function SigninPage() {
  return <AuthPage />;
}

function sanitizeRedirect(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}
