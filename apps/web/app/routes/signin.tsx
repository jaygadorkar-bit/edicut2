import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";
import { users } from "@edicut/db/schema";
import { findUserByEmail } from "@edicut/db/repositories/users";
import bcrypt from "bcryptjs";
import { createUserSession } from "../lib/session.server";
import { getDbFromContext } from "../lib/db.server";
import { verifyPassword } from "../lib/password.server";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";

export const meta: MetaFunction = () => [
  { title: "Sign in - EdiCut" },
  { name: "description", content: "Sign in or create an account with EdiCut" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const redirectTo = sanitizeRedirect(url.searchParams.get("redirectTo") || "/dashboard");
  throw redirect(`/?auth=signin&redirectTo=${encodeURIComponent(redirectTo)}`);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const email = (formData.get("email") as string).trim().toLowerCase();
  const password = formData.get("password") as string;
  const remember = formData.get("remember") === "on";
  const redirectTo = sanitizeRedirect((formData.get("redirectTo") as string | null) || "/dashboard");

  if (!email || !password || password.length < 6 || typeof email !== "string" || typeof password !== "string") {
    return { error: "Invalid email or password (min 6 characters).", intent };
  }

  const captcha = await verifyRecaptchaToken({
    context,
    token: formData.get("g-recaptcha-response"),
  });

  if (!captcha.success) {
    return { error: captcha.error, intent };
  }

  const db = getDbFromContext(context);

  if (intent === "signup") {
    const name = formData.get("name") as string;
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
    const user = await findUserByEmail(db, email);
    if (!user || !user.passwordHash) {
      return { error: "Invalid credentials.", intent };
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return { error: "Invalid credentials.", intent };
    }

    return createUserSession({ request, context, userId: user.id, remember, redirectTo });
  }

  return { error: "Unknown intent", intent };
}

export default function SigninEndpoint() {
  return null;
}

function sanitizeRedirect(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}
