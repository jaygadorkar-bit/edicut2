export type RealtimeAccessTokenClaims = {
  email: string;
  expiresAt: number;
};

/** Read claims from a token that was just verified by the app's Supabase auth guard. */
export function readRealtimeAccessTokenClaims(token: unknown): RealtimeAccessTokenClaims | null {
  if (typeof token !== "string" || token.length > 8_192) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const encoded = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="))) as {
      email?: unknown;
      exp?: unknown;
      sub?: unknown;
    };
    if (
      typeof payload.email !== "string" ||
      !payload.email.trim() ||
      typeof payload.sub !== "string" ||
      !payload.sub ||
      !Number.isSafeInteger(payload.exp) ||
      (payload.exp as number) * 1_000 <= Date.now() + 15_000
    ) return null;

    return { email: payload.email.trim().toLowerCase(), expiresAt: (payload.exp as number) * 1_000 };
  } catch {
    return null;
  }
}
