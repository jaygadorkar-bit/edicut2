/** Loopback hosts are reserved for local development, where Google CAPTCHA cannot reliably validate requests. */
export function isLocalDevelopmentHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "127.0.0.1"
    || normalized === "::1";
}
