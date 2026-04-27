import { findUserByEmail, findUserById } from "@edicut/db";
import { redirect } from "react-router";
import type { LoaderContext } from "../types";
import { resolveWebDb, resolveWebEnv } from "./context.server";
import { verifyPassword } from "./password.server";
import { commitAuthSession, destroyAuthSession, getAuthSession } from "./session.server";

export async function getCurrentUser(request: Request, context?: LoaderContext) {
  try {
    const env = resolveWebEnv(context);
    const db = resolveWebDb(context);
    const session = await getAuthSession(request, env);
    const userId = session.get("userId");

    if (!userId) {
      return null;
    }

    const user = await findUserById(db, userId);

    if (!user || !user.active) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

export async function requireUser(request: Request, context?: LoaderContext) {
  const user = await getCurrentUser(request, context);

  if (!user) {
    const requestUrl = new URL(request.url);
    const redirectTo = `${requestUrl.pathname}${requestUrl.search}`;
    throw redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return user;
}

export async function requireRole(
  request: Request,
  context: LoaderContext | undefined,
  roles: string[]
) {
  const user = await requireUser(request, context);

  if (!roles.includes(user.role)) {
    throw redirect("/dashboard");
  }

  return user;
}

export async function loginUser(args: {
  request: Request;
  context: LoaderContext;
  email: string;
  password: string;
}) {
  const env = resolveWebEnv(args.context);
  const db = resolveWebDb(args.context);
  const user = await findUserByEmail(db, args.email);

  if (!user || !user.passwordHash || !user.active) {
    return { ok: false as const, error: "Invalid email or password." };
  }

  const isValid = await verifyPassword(args.password, user.passwordHash);

  if (!isValid) {
    return { ok: false as const, error: "Invalid email or password." };
  }

  const session = await getAuthSession(args.request, env);
  session.set("userId", user.id);
  session.set("role", user.role);

  return {
    ok: true as const,
    headers: {
      "Set-Cookie": await commitAuthSession(session, env),
    },
    user,
  };
}

export async function logoutUser(request: Request, context: LoaderContext) {
  const env = resolveWebEnv(context);
  const session = await getAuthSession(request, env);

  return {
    "Set-Cookie": await destroyAuthSession(session, env),
  };
}
