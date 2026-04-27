import { createCookieSessionStorage } from "react-router";
import type { WebEnv } from "./context.server";

type AuthSessionData = {
  userId?: string;
  role?: string;
};

function createAuthSessionStorage(env: WebEnv) {
  return createCookieSessionStorage<AuthSessionData>({
    cookie: {
      name: "__edicut_session",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
      sameSite: "lax",
      secrets: [env.SESSION_SECRET],
      secure: env.APP_URL.startsWith("https://"),
    },
  });
}

export async function getAuthSession(request: Request, env: WebEnv) {
  const storage = createAuthSessionStorage(env);

  return storage.getSession(request.headers.get("Cookie"));
}

export async function commitAuthSession(session: Awaited<ReturnType<typeof getAuthSession>>, env: WebEnv) {
  const storage = createAuthSessionStorage(env);

  return storage.commitSession(session);
}

export async function destroyAuthSession(
  session: Awaited<ReturnType<typeof getAuthSession>>,
  env: WebEnv
) {
  const storage = createAuthSessionStorage(env);

  return storage.destroySession(session);
}
