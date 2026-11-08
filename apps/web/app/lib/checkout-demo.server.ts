type RuntimeEnv = Record<string, string | undefined>;
type RuntimeContext = {
  cf?: { env?: RuntimeEnv };
  cloudflare?: { env?: RuntimeEnv };
  env?: RuntimeEnv;
};

const PRODUCTION_HOSTS = new Set(["edicut.com", "www.edicut.com"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isCheckoutDemoMode(context: unknown, requestUrl: string) {
  const runtime = context as RuntimeContext | undefined;
  const processEnv = globalThis.process?.env as RuntimeEnv | undefined;
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return false;
  }
  const hostname = url.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(hostname)) return false;
  const isLoopback = LOOPBACK_HOSTS.has(hostname) || hostname.endsWith(".localhost");
  if (isLoopback && url.searchParams.get("demo") === "1") return true;

  const readEnv = (key: string) => {
    const runtimeValue = runtime?.cloudflare?.env?.[key]
    ?? runtime?.cf?.env?.[key]
    ?? runtime?.env?.[key];
    const processValue = processEnv?.[key];
    if (runtimeValue?.trim()) return runtimeValue;
    if (processValue?.trim()) return processValue;
    return "";
  };
  if (readEnv("CHECKOUT_DEMO_MODE").trim().toLowerCase() !== "true") return false;

  if (isLoopback) return true;
  const allowedHosts = new Set(readEnv("CHECKOUT_DEMO_ALLOWED_HOSTS")
    .split(",")
    .map(host => host.trim().toLowerCase())
    .filter(Boolean));
  return allowedHosts.has(hostname);
}
