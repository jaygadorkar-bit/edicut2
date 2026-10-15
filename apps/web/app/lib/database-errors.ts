/** Identify connection failures through driver wrappers without treating SQL errors as outages. */
export function isDatabaseConnectionError(error: unknown) {
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const item = current as { code?: string; name?: string; message?: string; cause?: unknown; sourceError?: unknown };
    if (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "08000", "08001", "08003", "08006", "57P03"].includes(item.code ?? "")
      || item.name === "TimeoutError" || (item.name === "TypeError" && item.message === "fetch failed")) return true;
    current = item.cause ?? item.sourceError;
  }
  return false;
}

/** Retry reads once. Never retry a write whose commit status may be unknown. */
export async function retryDatabaseRead<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (!isDatabaseConnectionError(error)) throw error;
    return read();
  }
}
