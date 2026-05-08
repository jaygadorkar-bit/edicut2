import type { CloudinaryImageResource, CloudinaryUsage } from "./cloudinary.server";

type ProviderEnv = {
  cf?: { env?: Record<string, string | undefined> };
  cloudflare?: { env?: Record<string, string | undefined> };
};

const LOCAL_ENV_CACHE_MS = 60_000;
const PROVIDER_CACHE_MS = 60_000;

let localEnvCache: { expiresAt: number; values: Record<string, string> } | null = null;
let providerCache: { expiresAt: number; data: ProviderUsage[] } | null = null;
let providerCachePromise: Promise<ProviderUsage[]> | null = null;

export type UsageCardStat = {
  label: string;
  value: string;
  help?: string;
};

export type UsageDetail = {
  label: string;
  value: string;
};

export type UsageResource = {
  title: string;
  meta?: string;
  status?: string;
};

export type ProviderUsage = {
  id: "cloudflare" | "vercel" | "neon" | "cloudinary";
  name: string;
  icon: string;
  configured: boolean;
  status: "connected" | "partial" | "not-configured" | "error";
  statusLabel: string;
  error?: string;
  cards: UsageCardStat[];
  details: UsageDetail[];
  resources: UsageResource[];
};

type CloudflareZone = {
  id?: string;
  name?: string;
  status?: string;
  paused?: boolean;
  type?: string;
  plan?: { name?: string };
  account?: { name?: string };
  modified_on?: string;
};

type VercelProject = {
  id?: string;
  name?: string;
  framework?: string | null;
  updatedAt?: number;
  latestDeployments?: Array<{ state?: string; url?: string; createdAt?: number }>;
};

type VercelDeployment = {
  uid?: string;
  name?: string;
  url?: string;
  state?: string;
  target?: string;
  createdAt?: number;
};

type NeonProject = {
  id?: string;
  name?: string;
  platform_id?: string;
  region_id?: string;
  pg_version?: number;
  created_at?: string;
  updated_at?: string;
};

type NeonBranch = {
  id?: string;
  name?: string;
  current_state?: string;
  created_at?: string;
};

type NeonEndpoint = {
  id?: string;
  type?: string;
  current_state?: string;
};

type CloudflareAnalyticsGroup = {
  dimensions?: { date?: string };
  sum?: {
    requests?: number;
    cachedRequests?: number;
    bytes?: number;
    cachedBytes?: number;
    encryptedRequests?: number;
    threats?: number;
    pageViews?: number;
  };
  uniq?: { uniques?: number };
};

type CloudflareRequestGroup = {
  count?: number;
  dimensions?: {
    clientCountryName?: string;
    clientRequestHTTPHost?: string;
    clientRequestPath?: string;
    edgeResponseStatus?: number;
    userAgent?: string;
  };
};

type VercelCharge = {
  ChargePeriodStart?: string;
  ChargePeriodEnd?: string;
  BilledCost?: number;
  EffectiveCost?: number;
  ServiceName?: string;
  ServiceCategory?: string;
  ConsumedQuantity?: number;
  ConsumedUnit?: string | null;
};

async function readLocalEnvFile() {
  if (!globalThis.process?.cwd) return {};
  const now = Date.now();

  if (localEnvCache && localEnvCache.expiresAt > now) {
    return localEnvCache.values;
  }

  try {
    const [{ readFile }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    let root = globalThis.process.cwd();
    const values: Record<string, string> = {};
    const roots = [root];

    for (let index = 0; index < 3; index += 1) {
      const parent = path.dirname(root);
      if (parent === root) break;
      roots.push(parent);
      root = parent;
    }

    for (const currentRoot of roots) {
      for (const fileName of [".env.vercel.local", ".cf-deploy-secrets.json", "secrets.json", ".env.cloudflare", ".env.local", ".env"]) {
        try {
          const contents = await readFile(path.join(currentRoot, fileName), "utf8");

          if (fileName.endsWith(".json")) {
            const json = JSON.parse(contents) as Record<string, unknown>;
            for (const [key, rawValue] of Object.entries(json)) {
              if (values[key] || typeof rawValue !== "string") continue;
              values[key] = rawValue;
            }
          } else {
            for (const line of contents.split(/\r?\n/)) {
              const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
              if (!match || values[match[1]]) continue;
              values[match[1]] = match[2].replace(/^["']|["']$/g, "");
            }
          }
        } catch {
          // Local env files are optional in deployed environments.
        }
      }
    }

    localEnvCache = { expiresAt: now + LOCAL_ENV_CACHE_MS, values };
    return values;
  } catch {
    return {};
  }
}

async function readEnv(context?: ProviderEnv) {
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  const nodeEnv = globalThis.process?.env as Record<string, string | undefined> | undefined;
  const localEnv = await readLocalEnvFile();

  const value = (key: string) =>
    context?.cloudflare?.env?.[key] ??
    context?.cf?.env?.[key] ??
    nodeEnv?.[key] ??
    viteEnv[key] ??
    localEnv[key];

  return {
    cloudflareAccountId: value("CLOUDFLARE_ACCOUNT_ID") || value("CF_ACCOUNT_ID"),
    cloudflareZoneId: value("CLOUDFLARE_ZONE_ID") || value("CF_ZONE_ID"),
    cloudflareApiToken: value("CLOUDFLARE_API_TOKEN") || value("CF_API_TOKEN"),
    cloudflareEmail: value("CLOUDFLARE_EMAIL") || value("CF_EMAIL"),
    cloudflareApiKey: value("CLOUDFLARE_API_KEY") || value("CF_API_KEY"),
    vercelToken: value("VERCEL_TOKEN"),
    vercelTeamId: value("VERCEL_TEAM_ID") || value("VERCEL_ORG_ID"),
    neonApiKey: value("NEON_API_KEY"),
    neonProjectId: value("NEON_PROJECT_ID") || value("DATABASE_PROJECT_ID"),
    databaseUrl: value("NEON_DATABASE_URL") || value("DATABASE_URL"),
  };
}

async function fetchJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({})) as T & { error?: unknown; errors?: unknown[]; message?: string };

  if (!response.ok) {
    const message = typeof result.message === "string" ? result.message : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return result;
}

async function fetchText(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.text();

  if (!response.ok) {
    throw new Error(result || `${response.status} ${response.statusText}`);
  }

  return {
    text: result,
    rateLimit: response.headers.get("x-ratelimit-limit") || "",
    rateLimitRemaining: response.headers.get("x-ratelimit-remaining") || "",
  };
}

function notConfigured(id: ProviderUsage["id"], name: string, icon: string, envNames: string[]): ProviderUsage {
  return {
    id,
    name,
    icon,
    configured: false,
    status: "not-configured",
    statusLabel: "Not configured",
    cards: [
      { label: "Connection", value: "Missing", help: envNames.join(", ") },
      { label: "Usage", value: "Unavailable" },
      { label: "Limits", value: "Unavailable" },
    ],
    details: envNames.map((envName) => ({ label: envName, value: "Missing" })),
    resources: [],
  };
}

function errorProvider(id: ProviderUsage["id"], name: string, icon: string, error: unknown): ProviderUsage {
  return {
    id,
    name,
    icon,
    configured: true,
    status: "error",
    statusLabel: "API error",
    error: error instanceof Error ? error.message : "Failed to load provider data.",
    cards: [
      { label: "Connection", value: "Error" },
      { label: "Usage", value: "Unavailable" },
      { label: "Limits", value: "Unavailable" },
    ],
    details: [],
    resources: [],
  };
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

function formatCompactNumber(value: number) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value) : "0";
}

function formatPercent(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "0.0%";
}

function formatHours(value: number) {
  if (!Number.isFinite(value)) return "0 hrs";
  if (value < 1) return `${Math.round(value * 60)} min`;
  return `${value.toFixed(value >= 10 ? 0 : 2)} hrs`;
}

function formatUsd(value: number) {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : "$0.00";
}

function formatDate(value?: string | number) {
  if (!value) return "Unknown";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function parseNeonDatabaseUrl(databaseUrl?: string) {
  if (!databaseUrl) return null;

  try {
    const url = new URL(databaseUrl);
    if (!url.hostname.includes("neon.tech")) return null;

    const hostParts = url.hostname.split(".");
    const endpointHost = hostParts[0] || "";
    const endpoint = endpointHost.replace(/-pooler$/, "");
    const region = hostParts.length > 4 ? hostParts.slice(1, -3).join(".") : "";

    return {
      host: url.hostname,
      database: url.pathname.replace(/^\//, "") || "default",
      user: decodeURIComponent(url.username || ""),
      endpoint,
      region,
      pooler: endpointHost.endsWith("-pooler"),
      sslMode: url.searchParams.get("sslmode") || "",
    };
  } catch {
    return null;
  }
}

function formatUsageValue(value: { usage?: number; limit?: number; used_percent?: number } | undefined, type: "bytes" | "number") {
  if (!value) return "Unavailable";
  const usage = typeof value.usage === "number" ? value.usage : null;
  const limit = typeof value.limit === "number" ? value.limit : null;
  const percent = typeof value.used_percent === "number" ? `${value.used_percent.toFixed(1)}%` : null;
  const formatValue = (amount: number) => type === "bytes" ? formatBytes(amount) : amount.toLocaleString();

  if (usage !== null && limit !== null) return `${formatValue(usage)} / ${formatValue(limit)}`;
  if (usage !== null && percent) return `${formatValue(usage)} (${percent})`;
  if (usage !== null) return formatValue(usage);
  return "Unavailable";
}

function monthDateRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return {
    from: start.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

function parseVercelCharges(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as VercelCharge;
      } catch {
        return null;
      }
    })
    .filter((charge): charge is VercelCharge => Boolean(charge));
}

function sumVercelUsage(charges: VercelCharge[], patterns: RegExp[]) {
  return charges.reduce((total, charge) => {
    const service = `${charge.ServiceName || ""} ${charge.ServiceCategory || ""} ${charge.ConsumedUnit || ""}`;
    return patterns.some((pattern) => pattern.test(service)) ? total + Number(charge.ConsumedQuantity || 0) : total;
  }, 0);
}

function hasVercelUsage(charges: VercelCharge[], patterns: RegExp[]) {
  return charges.some((charge) => {
    const service = `${charge.ServiceName || ""} ${charge.ServiceCategory || ""} ${charge.ConsumedUnit || ""}`;
    return patterns.some((pattern) => pattern.test(service));
  });
}

function formatQuota(used: number, limit: number, formatter: (value: number) => string) {
  const remaining = Math.max(limit - used, 0);
  return `${formatter(used)} / ${formatter(limit)}`;
}

async function getCloudflareZoneAnalytics(headers: Record<string, string>, zones: CloudflareZone[]) {
  const zoneTags = zones.map((zone) => zone.id).filter((id): id is string => Boolean(id)).slice(0, 5);
  if (!zoneTags.length) return null;

  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const query = `
    query($zoneTag: string, $start: Date, $end: Date) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1dGroups(limit: 31, filter: { date_geq: $start, date_leq: $end }) {
            dimensions { date }
            sum { requests cachedRequests bytes cachedBytes encryptedRequests threats pageViews }
            uniq { uniques }
          }
        }
      }
    }
  `;

  const groups: CloudflareAnalyticsGroup[] = [];

  await Promise.all(zoneTags.map(async (zoneTag) => {
    const result = await fetchJson<{ data?: { viewer?: { zones?: Array<{ httpRequests1dGroups?: CloudflareAnalyticsGroup[] }> } }; errors?: unknown[] }>(
      "https://api.cloudflare.com/client/v4/graphql",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables: { zoneTag, start, end: today } }),
      },
    );

    const zoneGroups = result.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
    groups.push(...zoneGroups);
  }));

  const totals = groups.reduce((accumulator, group) => {
    const requests = group.sum?.requests || 0;
    const cachedRequests = group.sum?.cachedRequests || 0;
    const bytes = group.sum?.bytes || 0;
    const cachedBytes = group.sum?.cachedBytes || 0;

    accumulator.requests += requests;
    accumulator.cachedRequests += cachedRequests;
    accumulator.bytes += bytes;
    accumulator.cachedBytes += cachedBytes;
    accumulator.encryptedRequests += group.sum?.encryptedRequests || 0;
    accumulator.threats += group.sum?.threats || 0;
    accumulator.pageViews += group.sum?.pageViews || 0;
    accumulator.uniques += group.uniq?.uniques || 0;

    if (group.dimensions?.date === today) {
      accumulator.todayRequests += requests;
      accumulator.todayCachedRequests += cachedRequests;
      accumulator.todayBytes += bytes;
    }

    return accumulator;
  }, {
    requests: 0,
    cachedRequests: 0,
    bytes: 0,
    cachedBytes: 0,
    encryptedRequests: 0,
    threats: 0,
    pageViews: 0,
    uniques: 0,
    todayRequests: 0,
    todayCachedRequests: 0,
    todayBytes: 0,
  });

  return {
    ...totals,
    zoneCount: zoneTags.length,
    cacheHitRate: totals.requests > 0 ? totals.cachedRequests / totals.requests * 100 : 0,
    encryptedRate: totals.requests > 0 ? totals.encryptedRequests / totals.requests * 100 : 0,
  };
}

async function getCloudflareRequestGroups(headers: Record<string, string>, zones: CloudflareZone[]) {
  const zoneTag = zones.find((zone) => zone.id)?.id;
  if (!zoneTag) return [];

  const today = new Date().toISOString().slice(0, 10);
  const start = `${today}T00:00:00Z`;
  const end = new Date().toISOString();
  const query = `
    query($zoneTag: string, $start: DateTime, $end: DateTime) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequestsAdaptiveGroups(limit: 20, filter: { datetime_geq: $start, datetime_leq: $end }, orderBy: [count_DESC]) {
            count
            dimensions { clientCountryName clientRequestHTTPHost clientRequestPath edgeResponseStatus userAgent }
          }
        }
      }
    }
  `;
  const result = await fetchJson<{ data?: { viewer?: { zones?: Array<{ httpRequestsAdaptiveGroups?: CloudflareRequestGroup[] }> } } }>(
    "https://api.cloudflare.com/client/v4/graphql",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables: { zoneTag, start, end } }),
    },
  );

  return result.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
}

async function getCloudflareUsage(env: Awaited<ReturnType<typeof readEnv>>): Promise<ProviderUsage> {
  if (!env.cloudflareApiToken && (!env.cloudflareEmail || !env.cloudflareApiKey)) {
    return notConfigured("cloudflare", "Cloudflare", "shield", ["CLOUDFLARE_API_TOKEN", "or CLOUDFLARE_EMAIL + CLOUDFLARE_API_KEY"]);
  }

  try {
    const headers: Record<string, string> = env.cloudflareApiToken
      ? { Authorization: `Bearer ${env.cloudflareApiToken}`, "Content-Type": "application/json" }
      : { "X-Auth-Email": env.cloudflareEmail || "", "X-Auth-Key": env.cloudflareApiKey || "", "Content-Type": "application/json" };
    const zoneParams = new URLSearchParams({ per_page: "50" });
    if (env.cloudflareAccountId) zoneParams.set("account.id", env.cloudflareAccountId);

    const [auth, account, zones] = await Promise.all([
      env.cloudflareApiToken
        ? fetchJson<{ result?: { status?: string; expires_on?: string } }>("https://api.cloudflare.com/client/v4/user/tokens/verify", { headers })
        : fetchJson<{ result?: { email?: string; username?: string; first_name?: string; last_name?: string } }>("https://api.cloudflare.com/client/v4/user", { headers }),
      env.cloudflareAccountId
        ? fetchJson<{ result?: { name?: string; type?: string; settings?: Record<string, unknown> } }>(`https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}`, { headers }).catch(() => null)
        : Promise.resolve(null),
      fetchJson<{ result?: CloudflareZone[] }>(`https://api.cloudflare.com/client/v4/zones?${zoneParams.toString()}`, { headers }),
    ]);

    const zoneList = zones.result || [];
    const activeZones = zoneList.filter((zone) => zone.status === "active").length;
    const pausedZones = zoneList.filter((zone) => zone.paused).length;
    const planNames = Array.from(new Set(zoneList.map((zone) => zone.plan?.name).filter(Boolean)));
    const [analytics, requestGroups] = await Promise.all([
      getCloudflareZoneAnalytics(headers, zoneList).catch(() => null),
      getCloudflareRequestGroups(headers, zoneList).catch(() => [] as CloudflareRequestGroup[]),
    ]);
    const workerFreeDailyLimit = 100_000;
    const workerRequestsRemaining = Math.max(workerFreeDailyLimit - (analytics?.todayRequests || 0), 0);
    const scanRequests = requestGroups.reduce((sum, group) => {
      const path = group.dimensions?.clientRequestPath || "";
      const status = group.dimensions?.edgeResponseStatus || 0;
      return status === 404 || /(?:wp-|wordpress|xmlrpc|\.php|ckeditor|server\.php)/i.test(path)
        ? sum + (group.count || 0)
        : sum;
    }, 0);
    const requestLimitHelp = analytics
      ? "Zone requests are CDN traffic; Workers free quota is 100k invocations/day if every request hits a Worker."
      : "Workers free quota is 100k invocations/day. CDN/DNS traffic is not capped the same way.";

    return {
      id: "cloudflare",
      name: "Cloudflare",
      icon: "shield",
      configured: true,
      status: "connected",
      statusLabel: "Connected",
      cards: [
        { label: "Requests Today", value: analytics ? formatNumber(analytics.todayRequests) : "Unavailable", help: requestLimitHelp },
        { label: "Page Views Today", value: analytics ? formatNumber(analytics.pageViews) : "Unavailable", help: "Closer to human page loads than raw requests" },
        { label: "Likely Scans", value: formatNumber(scanRequests), help: "404/WordPress/PHP probes in top request groups" },
        { label: "Worker Free Left", value: formatNumber(workerRequestsRemaining), help: "Of 100,000/day reference limit" },
        { label: "30 Day Requests", value: analytics ? formatNumber(analytics.requests) : "Unavailable", help: analytics ? `${formatPercent(analytics.cacheHitRate)} cache hit rate` : undefined },
        { label: "Bandwidth 30d", value: analytics ? formatBytes(analytics.bytes) : "Unavailable", help: analytics ? `${formatBytes(analytics.cachedBytes)} cached` : undefined },
        { label: "Threats 30d", value: analytics ? formatNumber(analytics.threats) : "Unavailable" },
        { label: "Plans", value: planNames.length ? planNames.join(", ") : "Unknown", help: `${activeZones} active zones` },
        { label: "Auth", value: env.cloudflareApiToken ? ((auth as { result?: { status?: string } }).result?.status || "Verified") : "Global key" },
      ],
      details: [
        { label: "Account", value: account?.result?.name || env.cloudflareAccountId || "Token scope" },
        { label: "Account type", value: account?.result?.type || "Unknown" },
        { label: "Configured zone", value: env.cloudflareZoneId || "All token-visible zones" },
        { label: "Zones", value: `${formatNumber(zoneList.length)} total, ${formatNumber(pausedZones)} paused` },
        { label: "Free request note", value: "Cloudflare CDN/DNS can absorb high traffic on Free; Workers Free is 100,000 requests/day." },
        { label: "Encrypted requests", value: analytics ? `${formatNumber(analytics.encryptedRequests)} (${formatPercent(analytics.encryptedRate)})` : "Unavailable" },
        { label: "Unique visitors 30d", value: analytics ? formatNumber(analytics.uniques) : "Unavailable" },
        { label: "Identity", value: env.cloudflareApiToken ? "API token" : ((auth as { result?: { email?: string; username?: string } }).result?.email || (auth as { result?: { username?: string } }).result?.username || "Cloudflare user") },
        { label: "Token expires", value: env.cloudflareApiToken ? formatDate((auth as { result?: { expires_on?: string } }).result?.expires_on) : "Global key" },
      ],
      resources: requestGroups.length ? requestGroups.slice(0, 8).map((group) => ({
        title: `${group.dimensions?.clientRequestHTTPHost || "edicut.com"}${group.dimensions?.clientRequestPath || "/"}`,
        meta: [group.dimensions?.clientCountryName, group.dimensions?.userAgent, `${formatNumber(group.count || 0)} requests`].filter(Boolean).join(" · "),
        status: String(group.dimensions?.edgeResponseStatus || ""),
      })) : zoneList.slice(0, 8).map((zone) => ({
        title: zone.name || zone.id || "Unnamed zone",
        meta: [zone.plan?.name, zone.type, zone.modified_on ? `Updated ${formatDate(zone.modified_on)}` : null].filter(Boolean).join(" · "),
        status: zone.paused ? "paused" : zone.status,
      })),
    };
  } catch (error) {
    return errorProvider("cloudflare", "Cloudflare", "shield", error);
  }
}

async function getVercelUsage(env: Awaited<ReturnType<typeof readEnv>>): Promise<ProviderUsage> {
  if (!env.vercelToken) {
    return notConfigured("vercel", "Vercel", "rocket_launch", ["VERCEL_TOKEN"]);
  }

  try {
    const headers = { Authorization: `Bearer ${env.vercelToken}` };
    const teamQuery = env.vercelTeamId ? `?teamId=${encodeURIComponent(env.vercelTeamId)}` : "";
    const teamJoin = env.vercelTeamId ? `&teamId=${encodeURIComponent(env.vercelTeamId)}` : "";
    const billingRange = monthDateRange();
    const [user, projects, deployments] = await Promise.all([
      fetchJson<{ user?: { username?: string; email?: string; name?: string } }>("https://api.vercel.com/v2/user", { headers }),
      fetchJson<{ projects?: VercelProject[] }>(`https://api.vercel.com/v9/projects?limit=100${teamJoin}`, { headers }),
      fetchJson<{ deployments?: VercelDeployment[] }>(`https://api.vercel.com/v6/deployments${teamQuery ? `${teamQuery}&` : "?"}limit=20`, { headers }),
    ]);
    const chargesResult = env.vercelTeamId
      ? await fetchText(
        `https://api.vercel.com/v1/billing/charges?teamId=${encodeURIComponent(env.vercelTeamId)}&from=${billingRange.from}&to=${billingRange.to}`,
        { headers: { ...headers, "Accept-Encoding": "gzip" } },
      ).catch(() => null)
      : null;

    const projectList = projects.projects || [];
    const deploymentList = deployments.deployments || [];
    const readyDeployments = deploymentList.filter((deployment) => deployment.state === "READY").length;
    const failedDeployments = deploymentList.filter((deployment) => ["ERROR", "CANCELED"].includes(deployment.state || "")).length;
    const frameworks = Array.from(new Set(projectList.map((project) => project.framework).filter(Boolean)));
    const charges = chargesResult ? parseVercelCharges(chargesResult.text) : [];
    const subscriptionCharges = charges.filter((charge) => /subscription/i.test(charge.ServiceCategory || "") || /^(pro|hobby|enterprise)$/i.test(charge.ServiceName || ""));
    const usageCharges = charges.filter((charge) => !subscriptionCharges.includes(charge));
    const usageCost = usageCharges.reduce((sum, charge) => sum + Number(charge.BilledCost || 0), 0);
    const subscriptionCost = subscriptionCharges.reduce((sum, charge) => sum + Number(charge.BilledCost || 0), 0);
    const subscriptionNames = Array.from(new Set(subscriptionCharges.map((charge) => charge.ServiceName).filter(Boolean)));
    const activeCpuHours = sumVercelUsage(charges, [/active cpu/i, /cpu-hours?/i, /cpu hrs?/i]);
    const memoryGbHours = sumVercelUsage(charges, [/provisioned memory/i, /gb-hrs?/i, /gb-hours?/i]);
    const functionInvocations = sumVercelUsage(charges, [/function invocations?/i, /invocations?/i]);
    const functionDuration = sumVercelUsage(charges, [/function duration/i]);
    const edgeRequests = sumVercelUsage(charges, [/edge requests?/i]);
    const hasComputeCharges = hasVercelUsage(charges, [/active cpu/i, /provisioned memory/i, /function invocations?/i, /function duration/i, /edge requests?/i]);
    const hobbyLimits = {
      activeCpuHours: 4,
      memoryGbHours: 360,
      functionInvocations: 1_000_000,
      functionDurationGbHours: 100,
      edgeRequests: 1_000_000,
      deploymentsPerDay: 100,
    };
    const todayDeployments = deploymentList.filter((deployment) => {
      if (!deployment.createdAt) return false;
      return new Date(deployment.createdAt).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
    }).length;

    return {
      id: "vercel",
      name: "Vercel",
      icon: "change_history",
      configured: true,
      status: "connected",
      statusLabel: "Connected",
      cards: [
        { label: "Active CPU", value: formatQuota(activeCpuHours, hobbyLimits.activeCpuHours, formatHours), help: hasComputeCharges ? "Current billing period vs Hobby free reference" : "No CPU usage line returned by billing API" },
        { label: "Memory", value: formatQuota(memoryGbHours, hobbyLimits.memoryGbHours, (value) => `${formatNumber(value)} GB-hrs`), help: "Provisioned memory vs Hobby free reference" },
        { label: "Invocations", value: formatQuota(functionInvocations, hobbyLimits.functionInvocations, formatCompactNumber), help: "Function invocations vs Hobby free reference" },
        { label: "Edge Requests", value: formatQuota(edgeRequests, hobbyLimits.edgeRequests, formatCompactNumber), help: "Hobby free reference" },
        { label: "Duration", value: formatQuota(functionDuration, hobbyLimits.functionDurationGbHours, (value) => `${formatNumber(value)} GB-hrs`), help: "Legacy function duration reference" },
        { label: "Usage Overage", value: formatUsd(usageCost), help: "Excludes plan/subscription license rows" },
        { label: "Subscription", value: formatUsd(subscriptionCost), help: subscriptionNames.join(", ") || "No subscription rows" },
        { label: "Deploys Today", value: `${formatNumber(todayDeployments)} / ${formatNumber(hobbyLimits.deploymentsPerDay)}`, help: "Hobby daily deployment limit" },
        { label: "Projects", value: formatNumber(projectList.length), help: "First 100 visible" },
        { label: "Recent Deployments", value: formatNumber(deploymentList.length), help: `${readyDeployments} ready` },
        { label: "Failed Recent", value: formatNumber(failedDeployments) },
      ],
      details: [
        { label: "Account", value: user.user?.name || user.user?.username || user.user?.email || "Token account" },
        { label: "Team scope", value: env.vercelTeamId || "Personal account" },
        { label: "Billing range", value: `${billingRange.from} to ${billingRange.to}` },
        { label: "Usage API", value: chargesResult ? `${charges.length} billing rows, API remaining ${chargesResult.rateLimitRemaining || "unknown"}/${chargesResult.rateLimit || "unknown"}` : "Requires team scope or billing API access" },
        { label: "Cost split", value: `${formatUsd(usageCost)} usage, ${formatUsd(subscriptionCost)} subscription` },
        { label: "Free compute reference", value: "Hobby includes 4 CPU-hrs, 360 GB-hrs memory, and 1M function invocations per month." },
        { label: "Frameworks", value: frameworks.length ? frameworks.slice(0, 5).join(", ") : "Unknown" },
        { label: "API window", value: "Latest 20 deployments" },
      ],
      resources: deploymentList.slice(0, 8).map((deployment) => ({
        title: deployment.name || deployment.url || deployment.uid || "Deployment",
        meta: [deployment.target, deployment.url, formatDate(deployment.createdAt)].filter(Boolean).join(" · "),
        status: deployment.state,
      })),
    };
  } catch (error) {
    return errorProvider("vercel", "Vercel", "change_history", error);
  }
}

async function getNeonUsage(env: Awaited<ReturnType<typeof readEnv>>): Promise<ProviderUsage> {
  if (!env.neonApiKey) {
    const database = parseNeonDatabaseUrl(env.databaseUrl);
    if (database) {
      return {
        id: "neon",
        name: "Neon",
        icon: "database",
        configured: true,
        status: "partial",
        statusLabel: "Database URL",
        cards: [
          { label: "Connection", value: "Configured", help: "Loaded from DATABASE_URL" },
          { label: "Database", value: database.database },
          { label: "Pooler", value: database.pooler ? "Enabled" : "Direct" },
          { label: "Region", value: database.region || "Unknown" },
        ],
        details: [
          { label: "Host", value: database.host },
          { label: "Endpoint", value: database.endpoint || "Unknown" },
          { label: "User", value: database.user || "Unknown" },
          { label: "SSL mode", value: database.sslMode || "Unknown" },
          { label: "Limits", value: "Add NEON_API_KEY to show project, branch, endpoint, compute, and plan data from Neon." },
        ],
        resources: [
          {
            title: database.database,
            meta: [database.endpoint, database.region, database.pooler ? "pooled connection" : "direct connection"].filter(Boolean).join(" · "),
            status: "connected",
          },
        ],
      };
    }

    return notConfigured("neon", "Neon", "database", ["NEON_API_KEY"]);
  }

  try {
    const headers = { Authorization: `Bearer ${env.neonApiKey}`, Accept: "application/json" };
    const projects = await fetchJson<{ projects?: NeonProject[] }>("https://console.neon.tech/api/v2/projects", { headers });
    const projectList = projects.projects || [];
    const selectedProjects = (env.neonProjectId ? projectList.filter((project) => project.id === env.neonProjectId) : projectList).slice(0, 4);

    const projectStats = await Promise.all(selectedProjects.map(async (project) => {
      if (!project.id) return { project, branches: [] as NeonBranch[], endpoints: [] as NeonEndpoint[] };
      const [branches, endpoints] = await Promise.all([
        fetchJson<{ branches?: NeonBranch[] }>(`https://console.neon.tech/api/v2/projects/${project.id}/branches`, { headers }).catch(() => ({ branches: [] })),
        fetchJson<{ endpoints?: NeonEndpoint[] }>(`https://console.neon.tech/api/v2/projects/${project.id}/endpoints`, { headers }).catch(() => ({ endpoints: [] })),
      ]);
      return { project, branches: branches.branches || [], endpoints: endpoints.endpoints || [] };
    }));

    const branchCount = projectStats.reduce((sum, item) => sum + item.branches.length, 0);
    const endpointCount = projectStats.reduce((sum, item) => sum + item.endpoints.length, 0);
    const runningEndpoints = projectStats.reduce((sum, item) => sum + item.endpoints.filter((endpoint) => endpoint.current_state === "active").length, 0);
    const regions = Array.from(new Set(projectList.map((project) => project.region_id).filter(Boolean)));

    return {
      id: "neon",
      name: "Neon",
      icon: "database",
      configured: true,
      status: projectStats.length ? "connected" : "partial",
      statusLabel: projectStats.length ? "Connected" : "No projects",
      cards: [
        { label: "Projects", value: formatNumber(projectList.length), help: env.neonProjectId ? "Filtered project configured" : "Token-visible projects" },
        { label: "Branches", value: formatNumber(branchCount), help: `Across ${selectedProjects.length || 0} checked` },
        { label: "Endpoints", value: formatNumber(endpointCount), help: `${runningEndpoints} active` },
        { label: "Regions", value: formatNumber(regions.length), help: regions.slice(0, 2).join(", ") || "Unknown" },
      ],
      details: [
        { label: "Configured project", value: env.neonProjectId || "All token-visible projects" },
        { label: "Postgres versions", value: Array.from(new Set(projectList.map((project) => project.pg_version).filter(Boolean))).join(", ") || "Unknown" },
        { label: "Limits", value: "Compute, storage, and branch limits depend on the Neon plan." },
        { label: "Checked projects", value: selectedProjects.map((project) => project.name || project.id).filter(Boolean).join(", ") || "None" },
      ],
      resources: projectStats.flatMap((item) => [
        {
          title: item.project.name || item.project.id || "Neon project",
          meta: [item.project.region_id, item.project.pg_version ? `Postgres ${item.project.pg_version}` : null, `Updated ${formatDate(item.project.updated_at)}`].filter(Boolean).join(" · "),
          status: "project",
        },
        ...item.branches.slice(0, 2).map((branch) => ({
          title: branch.name || branch.id || "Branch",
          meta: `Branch · Created ${formatDate(branch.created_at)}`,
          status: branch.current_state,
        })),
      ]).slice(0, 8),
    };
  } catch (error) {
    return errorProvider("neon", "Neon", "database", error);
  }
}

function getCloudinaryProvider(usage: CloudinaryUsage | null, images: CloudinaryImageResource[]): ProviderUsage {
  const totalBytes = images.reduce((sum, image) => sum + (image.bytes || 0), 0);
  const formats = Array.from(new Set(images.map((image) => image.format).filter(Boolean)));
  const latestImages = [...images].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return {
    id: "cloudinary",
    name: "Cloudinary",
    icon: "cloud",
    configured: Boolean(usage || images.length),
    status: usage ? "connected" : images.length ? "partial" : "not-configured",
    statusLabel: usage ? "Connected" : images.length ? "Image list only" : "Unavailable",
    cards: [
      { label: "Images", value: formatNumber(images.length), help: "edicut folder" },
      { label: "Listed Storage", value: formatBytes(totalBytes) },
      { label: "Cloud Storage", value: formatUsageValue(usage?.storage, "bytes") },
      { label: "Credits", value: formatUsageValue(usage?.credits, "number") },
      { label: "Bandwidth", value: formatUsageValue(usage?.bandwidth, "bytes") },
      { label: "Transformations", value: formatUsageValue(usage?.transformations, "number") },
    ],
    details: [
      { label: "Folder scope", value: "edicut/" },
      { label: "Formats", value: formats.length ? formats.join(", ") : "Unknown" },
      { label: "Storage limit", value: formatUsageValue(usage?.storage, "bytes") },
      { label: "Transformation limit", value: formatUsageValue(usage?.transformations, "number") },
    ],
    resources: latestImages.slice(0, 8).map((image) => ({
      title: image.public_id,
      meta: [formatBytes(image.bytes || 0), image.width && image.height ? `${image.width}x${image.height}` : null, formatDate(image.created_at)].filter(Boolean).join(" · "),
      status: image.format,
    })),
  };
}

export async function getProviderUsageOverview(
  context: ProviderEnv | undefined,
  cloudinaryUsage: CloudinaryUsage | null,
  cloudinaryImages: CloudinaryImageResource[],
) {
  const now = Date.now();
  let infrastructureProviders = providerCache && providerCache.expiresAt > now ? providerCache.data : null;

  if (!infrastructureProviders) {
    if (!providerCachePromise) {
      providerCachePromise = (async () => {
        const env = await readEnv(context);
        const providers = await Promise.all([
          getCloudflareUsage(env),
          getVercelUsage(env),
          getNeonUsage(env),
        ]);
        providerCache = { expiresAt: Date.now() + PROVIDER_CACHE_MS, data: providers };
        providerCachePromise = null;
        return providers;
      })().catch((error) => {
        providerCachePromise = null;
        throw error;
      });
    }

    infrastructureProviders = await providerCachePromise;
  }

  return [
    ...infrastructureProviders,
    getCloudinaryProvider(cloudinaryUsage, cloudinaryImages),
  ];
}
