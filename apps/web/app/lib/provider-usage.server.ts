import type { CloudinaryUsage } from "./cloudinary.server";
import { fetchWithTimeout } from "@edicut/shared/server-fetch";
import type { DatabaseClient } from "@edicut/db/client";
import { sql } from "drizzle-orm";
import { getDatabaseUrlFromContext } from "./db.server";

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
  meterPercent?: number;
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
  id: "cloudflare" | "vercel" | "neon" | "supabase" | "cloudinary";
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

type CloudflareWorkerGroup = {
  sum?: { requests?: number; errors?: number; subrequests?: number };
};

type SupabaseApiCount = {
  total_auth_requests?: number;
  total_realtime_requests?: number;
  total_rest_requests?: number;
  total_storage_requests?: number;
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
    cloudflareZoneName: value("CLOUDFLARE_ZONE_NAME"),
    cloudflareWorkerName: value("CLOUDFLARE_WORKER_NAME"),
    cloudflareApiToken: value("CLOUDFLARE_API_TOKEN") || value("CF_API_TOKEN"),
    cloudflareEmail: value("CLOUDFLARE_EMAIL") || value("CF_EMAIL"),
    cloudflareApiKey: value("CLOUDFLARE_API_KEY") || value("CF_API_KEY"),
    vercelToken: value("VERCEL_TOKEN"),
    vercelTeamId: value("VERCEL_TEAM_ID") || value("VERCEL_ORG_ID"),
    neonApiKey: value("NEON_API_KEY"),
    neonProjectId: value("NEON_PROJECT_ID") || value("DATABASE_PROJECT_ID"),
    databaseUrl: getDatabaseUrlFromContext(context ?? {}),
    supabaseUrl: value("SUPABASE_URL") || value("VITE_SUPABASE_URL"),
    supabaseProjectRef: value("SUPABASE_PROJECT_REF"),
    supabaseAccessToken: value("SUPABASE_ACCESS_TOKEN"),
    supabasePublishableKey: value("SUPABASE_PUBLISHABLE_KEY") || value("VITE_SUPABASE_PUBLISHABLE_KEY"),
    supabaseServiceRoleKey: value("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

async function fetchJson<T>(url: string, init: RequestInit) {
  const response = await fetchWithTimeout(url, init);
  const result = await response.json().catch(() => ({})) as T & { error?: unknown; errors?: unknown[]; message?: string };

  if (!response.ok) {
    const message = typeof result.message === "string" ? result.message : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  if (result.errors?.length) {
    throw new Error("Provider analytics query failed.");
  }

  return result;
}

async function fetchText(url: string, init: RequestInit) {
  const response = await fetchWithTimeout(url, init);
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
  const isCloudflare = id === "cloudflare";

  return {
    id,
    name,
    icon,
    configured: true,
    status: "error",
    statusLabel: isCloudflare ? "Access issue" : "API error",
    error: error instanceof Error ? error.message : "Failed to load provider data.",
    cards: [
      { label: "Connection", value: "Error" },
      {
        label: "Usage",
        value: "Unavailable",
        help: isCloudflare
          ? "Check connectivity and token access: Zone:Read + Zone Analytics:Read; Account Analytics:Read enables Worker metrics."
          : "Check the server-side credentials and analytics permissions, then refresh.",
      },
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

function getUsagePercent(usage: number, limit: number) {
  return Number.isFinite(usage) && Number.isFinite(limit) && limit > 0
    ? Math.max(0, usage / limit * 100)
    : undefined;
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

type NeonDatabaseMetrics = {
  databaseName: string;
  databaseBytes: number;
  activeConnections: number;
  maxConnections: number;
  userTables: number;
  postgresVersion: string;
};

function firstQueryRow(result: unknown): Record<string, unknown> | null {
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && "rows" in result
      ? (result as { rows?: unknown }).rows
      : undefined;
  if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== "object") return null;
  return rows[0] as Record<string, unknown>;
}

function safeNonnegativeInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

async function getLiveNeonDatabaseMetrics(db: DatabaseClient): Promise<NeonDatabaseMetrics> {
  const result = await db.execute(sql`
    SELECT
      current_database() AS database_name,
      pg_catalog.pg_database_size(current_database())::text AS database_bytes,
      (
        SELECT count(*)::text
        FROM pg_catalog.pg_stat_activity
        WHERE datname = current_database()
      ) AS active_connections,
      current_setting('max_connections') AS max_connections,
      (
        SELECT count(*)::text
        FROM pg_catalog.pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ) AS user_tables,
      current_setting('server_version') AS postgres_version
  `);
  const row = firstQueryRow(result);
  if (!row) throw new Error("The database returned no usage metrics.");

  const databaseBytes = safeNonnegativeInteger(row.database_bytes);
  const activeConnections = safeNonnegativeInteger(row.active_connections);
  const maxConnections = safeNonnegativeInteger(row.max_connections);
  const userTables = safeNonnegativeInteger(row.user_tables);
  if (databaseBytes === null || activeConnections === null || maxConnections === null || userTables === null) {
    throw new Error("The database returned invalid usage metrics.");
  }

  return {
    databaseName: typeof row.database_name === "string" ? row.database_name : "Current database",
    databaseBytes,
    activeConnections,
    maxConnections,
    userTables,
    postgresVersion: typeof row.postgres_version === "string" ? row.postgres_version : "Unknown",
  };
}

const neonFreeStorageLimitBytes = 1024 * 1024 * 1024;

function getNeonDatabaseUsageCards(metrics: NeonDatabaseMetrics | null): UsageCardStat[] {
  return [
    {
      label: "Database storage",
      value: metrics ? `${formatBytes(metrics.databaseBytes)} / 1 GB Free reference` : "Unavailable",
      help: metrics
        ? `Live pg_database_size for ${metrics.databaseName} on the active DATABASE_URL. Neon Free includes 1 GB of Postgres storage per project, but the app cannot verify your account plan from this URL. This reading covers this database on the connected branch; other branches and retained history can affect project storage separately.`
        : "Live database metrics could not be read through the active DATABASE_URL.",
      meterPercent: metrics ? getUsagePercent(metrics.databaseBytes, neonFreeStorageLimitBytes) : undefined,
    },
    {
      label: "Active connections",
      value: metrics ? `${formatNumber(metrics.activeConnections)} / ${formatNumber(metrics.maxConnections)}` : "Unavailable",
      help: metrics
        ? "Current PostgreSQL sessions for this database divided by max_connections reported by the active Neon compute. This is a live connection-capacity measure, not a monthly quota."
        : "Live connection metrics could not be read through the active DATABASE_URL.",
      meterPercent: metrics ? getUsagePercent(metrics.activeConnections, metrics.maxConnections) : undefined,
    },
    { label: "User tables", value: metrics ? formatNumber(metrics.userTables) : "Unavailable" },
  ];
}

function getNeonConnectionUsage(database: NonNullable<ReturnType<typeof parseNeonDatabaseUrl>>, metrics: NeonDatabaseMetrics | null): ProviderUsage {
  return {
    id: "neon",
    name: "Neon Database",
    icon: "database",
    configured: true,
    status: metrics ? "connected" : "partial",
    statusLabel: metrics ? "Live usage" : "Usage unavailable",
    cards: getNeonDatabaseUsageCards(metrics),
    details: [
      { label: "Database", value: metrics?.databaseName || database.database },
      { label: "Host", value: database.host },
      { label: "Endpoint", value: database.endpoint || "Unknown" },
      { label: "Region", value: database.region || "Unknown" },
      { label: "Pooler", value: database.pooler ? "Enabled" : "Direct" },
      { label: "PostgreSQL", value: metrics?.postgresVersion || "Unknown" },
      { label: "Storage reading", value: "Current database on the connected branch; not project-wide billed usage." },
    ],
    resources: [
      {
        title: metrics?.databaseName || database.database,
        meta: [database.endpoint, database.region, database.pooler ? "pooled connection" : "direct connection"].filter(Boolean).join(" · "),
        status: metrics ? "connected" : "unavailable",
      },
    ],
  };
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

async function getCloudflareWorkerUsage(headers: Record<string, string>, accountId: string, workerName: string) {
  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const query = `
    query($accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!, $scriptName: string!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(limit: 1000, filter: {
            scriptName: $scriptName,
            datetime_geq: $datetimeStart,
            datetime_leq: $datetimeEnd
          }) {
            sum { requests errors subrequests }
          }
        }
      }
    }
  `;
  const result = await fetchJson<{
    data?: { viewer?: { accounts?: Array<{ workersInvocationsAdaptive?: CloudflareWorkerGroup[] }> } };
  }>("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({
      query,
      variables: {
        accountTag: accountId,
        datetimeStart: start.toISOString(),
        datetimeEnd: end.toISOString(),
        scriptName: workerName,
      },
    }),
  });
  const groups = result.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];

  return groups.reduce((total, group) => ({
    requests: total.requests + (group.sum?.requests || 0),
    errors: total.errors + (group.sum?.errors || 0),
    subrequests: total.subrequests + (group.sum?.subrequests || 0),
  }), { requests: 0, errors: 0, subrequests: 0 });
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
    if (env.cloudflareZoneName) zoneParams.set("name", env.cloudflareZoneName);

    const zones = await fetchJson<{ result?: CloudflareZone[] }>(`https://api.cloudflare.com/client/v4/zones?${zoneParams.toString()}`, { headers });
    const zoneList = (zones.result || []).filter((zone) =>
      (!env.cloudflareZoneId || zone.id === env.cloudflareZoneId) &&
      (!env.cloudflareZoneName || zone.name === env.cloudflareZoneName),
    );
    const [analytics, workerUsage] = await Promise.all([
      getCloudflareZoneAnalytics(headers, zoneList).catch(() => null),
      env.cloudflareAccountId && env.cloudflareWorkerName
        ? getCloudflareWorkerUsage(headers, env.cloudflareAccountId, env.cloudflareWorkerName).catch(() => null)
        : Promise.resolve(null),
    ]);
    const hasUsageData = Boolean(analytics || workerUsage);
    return {
      id: "cloudflare",
      name: "Cloudflare",
      icon: "shield",
      configured: true,
      status: hasUsageData ? "connected" : "partial",
      statusLabel: hasUsageData ? "Connected" : "Analytics unavailable",
      cards: [
        {
          label: "Worker invocations (today UTC)",
          value: workerUsage ? formatQuota(workerUsage.requests, 100_000, formatNumber) : "Unavailable",
          help: workerUsage
            ? "Workers Free allows 100,000 requests per account per UTC day; this count is for the configured Worker, and other Workers share the allowance."
            : "Requires account analytics access and a configured Worker name.",
          meterPercent: workerUsage ? getUsagePercent(workerUsage.requests, 100_000) : undefined,
        },
        {
          label: "Worker subrequests (today UTC)",
          value: workerUsage
            ? `${formatNumber(workerUsage.subrequests)} / ${formatNumber(workerUsage.requests * 50)} maximum`
            : "Unavailable",
          help: "Workers Free allows up to 50 subrequests per invocation; this total maximum scales with this Worker's invocation count.",
          meterPercent: workerUsage && workerUsage.requests > 0
            ? getUsagePercent(workerUsage.subrequests, workerUsage.requests * 50)
            : undefined,
        },
        {
          label: "Worker errors (today UTC)",
          value: workerUsage ? `${formatNumber(workerUsage.errors)} / ${formatNumber(workerUsage.requests)} invocations` : "Unavailable",
          help: "Errors compared with this Worker's invocations; there is no separate error-count quota.",
        },
        {
          label: "Zone requests (30d)",
          value: analytics ? `${formatNumber(analytics.requests)} / unmetered` : "Unavailable",
          help: analytics ? `${formatPercent(analytics.cacheHitRate)} cache hit rate · Free website traffic has no metered request allowance.` : undefined,
        },
        {
          label: "Bandwidth (30d)",
          value: analytics ? `${formatBytes(analytics.bytes)} / unmetered` : "Unavailable",
          help: analytics ? `${formatBytes(analytics.cachedBytes)} served from cache · Free website traffic is unmetered.` : undefined,
        },
      ],
      details: [],
      resources: [],
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

async function getNeonUsage(env: Awaited<ReturnType<typeof readEnv>>, db: DatabaseClient): Promise<ProviderUsage> {
  const database = parseNeonDatabaseUrl(env.databaseUrl);
  const databaseMetrics = database
    ? await getLiveNeonDatabaseMetrics(db).catch(() => null)
    : null;

  if (!env.neonApiKey) {
    if (database) {
      return getNeonConnectionUsage(database, databaseMetrics);
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
      name: "Neon Database",
      icon: "database",
      configured: true,
      status: databaseMetrics || projectStats.length ? "connected" : "partial",
      statusLabel: databaseMetrics ? "Live usage" : projectStats.length ? "Connected" : "No projects",
      cards: [
        ...(database ? getNeonDatabaseUsageCards(databaseMetrics) : []),
        { label: "Projects", value: formatNumber(projectList.length), help: env.neonProjectId ? "Filtered project configured" : "Token-visible projects" },
        { label: "Branches", value: formatNumber(branchCount), help: `Across ${selectedProjects.length || 0} checked` },
        { label: "Endpoints", value: formatNumber(endpointCount), help: `${runningEndpoints} active` },
        { label: "Regions", value: formatNumber(regions.length), help: regions.slice(0, 2).join(", ") || "Unknown" },
      ],
      details: [
        { label: "Configured project", value: env.neonProjectId || "All token-visible projects" },
        { label: "Postgres versions", value: Array.from(new Set(projectList.map((project) => project.pg_version).filter(Boolean))).join(", ") || "Unknown" },
        { label: "Limits", value: "Compute, storage, and branch limits depend on the Neon plan." },
        ...(database ? [
          { label: "Connected database", value: databaseMetrics?.databaseName || database.database },
          { label: "Connected host", value: database.host },
          { label: "Database size scope", value: "Current database on the connected branch, not project-wide billed usage." },
        ] : []),
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
    if (database) {
      const connectionUsage = getNeonConnectionUsage(database, databaseMetrics);
      return {
        ...connectionUsage,
        statusLabel: databaseMetrics ? "Live usage" : "API unavailable",
        details: [...connectionUsage.details, { label: "Neon API", value: "Project and billing details unavailable." }],
      };
    }
    return errorProvider("neon", "Neon", "database", error);
  }
}

async function getSupabaseUsage(env: Awaited<ReturnType<typeof readEnv>>): Promise<ProviderUsage> {
  const url = env.supabaseUrl?.replace(/\/$/, "");
  let projectRef = env.supabaseProjectRef;

  if (!projectRef && url) {
    try {
      const hostname = new URL(url).hostname;
      if (hostname.endsWith(".supabase.co")) projectRef = hostname.split(".")[0];
    } catch {
      // A malformed URL is reported as an unavailable connection below.
    }
  }

  const hasHealthCheck = Boolean(url && env.supabasePublishableKey);
  const hasUsageAccess = Boolean(env.supabaseAccessToken && projectRef);
  if (!hasHealthCheck && !hasUsageAccess) {
    return notConfigured("supabase", "Supabase APIs", "api", [
      "SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF for usage counts",
    ]);
  }

  const [health, apiCounts] = await Promise.all([
    hasHealthCheck
      ? fetchJson<{ external?: boolean }>(`${url}/auth/v1/settings`, {
        headers: {
          apikey: env.supabasePublishableKey || "",
          Authorization: `Bearer ${env.supabasePublishableKey || ""}`,
        },
      }).then(() => ({ ok: true as const })).catch(() => ({ ok: false as const }))
      : Promise.resolve({ ok: false as const }),
    hasUsageAccess
      ? (() => {
        const query = new URLSearchParams({ interval: "1day" });
        return fetchJson<{ result?: SupabaseApiCount[] }>(
          `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef || "")}/analytics/endpoints/usage.api-counts?${query}`,
          { headers: { Authorization: `Bearer ${env.supabaseAccessToken}` } },
        ).then((result) => ({ ok: true as const, rows: result.result || [] }))
          .catch(() => ({ ok: false as const, rows: [] as SupabaseApiCount[] }));
      })()
      : Promise.resolve({ ok: false as const, rows: [] as SupabaseApiCount[] }),
  ]);

  const requestCounts = apiCounts.rows.reduce((totals, row) => ({
    auth: totals.auth + (row.total_auth_requests || 0),
    realtime: totals.realtime + (row.total_realtime_requests || 0),
    rest: totals.rest + (row.total_rest_requests || 0),
    storage: totals.storage + (row.total_storage_requests || 0),
  }), { auth: 0, realtime: 0, rest: 0, storage: 0 });
  const totalRequests = requestCounts.auth + requestCounts.realtime + requestCounts.rest + requestCounts.storage;
  const status = apiCounts.ok && (health.ok || !hasHealthCheck) ? "connected" : "partial";
  const usageHelp = !hasUsageAccess
    ? "Add a server-side SUPABASE_ACCESS_TOKEN scoped with analytics_usage_read."
    : apiCounts.ok
      ? "Daily endpoint request count. API requests have no fixed Free plan cap; this is not a billing resource meter."
      : "Check that the token has analytics_usage_read permission and the project ref is correct.";
  const requestHelp = apiCounts.ok
    ? "Live daily endpoint request count. This is not a billing resource meter; Supabase's published Management API does not provide organization billing-cycle usage totals."
    : "Request count unavailable until the analytics token and project scope are configured.";
  return {
    id: "supabase",
    name: "Supabase APIs",
    icon: "api",
    configured: true,
    status,
    statusLabel: apiCounts.ok ? "Connected" : hasUsageAccess ? "Usage unavailable" : health.ok ? "API reachable" : "Token needed",
    cards: [
      { label: "API requests (today)", value: apiCounts.ok ? formatNumber(totalRequests) : hasUsageAccess ? "Unavailable" : "Not configured", help: usageHelp },
      {
        label: "Auth requests (today)",
        value: apiCounts.ok ? formatNumber(requestCounts.auth) : "Unavailable",
        help: requestHelp,
      },
      {
        label: "REST requests (today)",
        value: apiCounts.ok ? formatNumber(requestCounts.rest) : "Unavailable",
        help: requestHelp,
      },
      {
        label: "Realtime API requests (today)",
        value: apiCounts.ok ? formatNumber(requestCounts.realtime) : "Unavailable",
        help: requestHelp,
      },
      {
        label: "Storage requests (today)",
        value: apiCounts.ok ? formatNumber(requestCounts.storage) : "Unavailable",
        help: requestHelp,
      },
      { label: "Auth API", value: health.ok ? "Reachable" : hasHealthCheck ? "Unavailable" : "Not configured", help: "Connectivity check; this is not a usage counter." },
    ],
    details: [
      { label: "Project ref", value: projectRef || "Missing" },
      { label: "Management token", value: hasUsageAccess ? "Configured as a server secret" : "Missing" },
      {
        label: "Usage permissions",
        value: hasUsageAccess ? "analytics_usage_read" : "Not configured",
      },
    ],
    resources: [],
  };
}

function getCloudinaryProvider(
  usage: CloudinaryUsage | null,
  videoUsage: CloudinaryUsage | null,
): ProviderUsage {
  const createUsageCard = (
    label: string,
    accountUsage: CloudinaryUsage | null,
    metric: "storage" | "bandwidth" | "credits" | "transformations",
    type: "bytes" | "number",
    help: string,
    freePlanFallback?: "storage" | "bandwidth" | "transformations",
  ): UsageCardStat => {
    const metricUsage = accountUsage?.[metric];
    let limit = typeof metricUsage?.limit === "number" && metricUsage.limit > 0 ? metricUsage.limit : undefined;
    const isFreePlan = Boolean(accountUsage?.plan?.toLowerCase().includes("free"));
    const freeCreditLimit = accountUsage?.credits?.limit;

    if (!limit && isFreePlan && typeof freeCreditLimit === "number" && freeCreditLimit > 0) {
      if (freePlanFallback === "storage" || freePlanFallback === "bandwidth") {
        limit = freeCreditLimit * 1024 ** 3;
      } else if (freePlanFallback === "transformations") {
        limit = freeCreditLimit * 1_000;
      }
    }

    const usageWithLimit = metricUsage && limit ? { ...metricUsage, limit } : metricUsage;
    const hasUsageAndLimit = typeof usageWithLimit?.usage === "number" && typeof usageWithLimit.limit === "number";

    return {
      label,
      value: formatUsageValue(usageWithLimit, type),
      help: accountUsage
        ? `${help}${hasUsageAndLimit ? "" : " Provider did not return a quota for this metric."}`
        : "Usage unavailable from the Cloudinary Admin API.",
      meterPercent: hasUsageAndLimit
        ? usageWithLimit.used_percent ?? getUsagePercent(usageWithLimit.usage!, usageWithLimit.limit!)
        : undefined,
    };
  };

  const rollingWindowHelp = (accountUsage: CloudinaryUsage | null) => {
    const credits = accountUsage?.credits?.limit;
    const allowance = typeof credits === "number" ? `${formatNumber(credits)} shared credits` : "25 shared credits (Free plan reference)";
    const plan = accountUsage?.plan ? `${accountUsage.plan} plan` : "Cloudinary";
    return `${plan} allowance: ${allowance} over a rolling 30-day window; storage, bandwidth, and transformations draw from the same pool.`;
  };

  return {
    id: "cloudinary",
    name: "Cloudinary",
    icon: "cloud",
    configured: Boolean(usage || videoUsage),
    status: usage && videoUsage ? "connected" : usage || videoUsage ? "partial" : "not-configured",
    statusLabel: usage && videoUsage ? "Connected" : usage || videoUsage ? "Partial data" : "Unavailable",
    cards: [
      createUsageCard("Image storage", usage, "storage", "bytes", `Current stored assets · ${rollingWindowHelp(usage)}`, "storage"),
      createUsageCard("Image bandwidth", usage, "bandwidth", "bytes", `Rolling 30-day delivery · ${rollingWindowHelp(usage)}`, "bandwidth"),
      createUsageCard("Image transformations", usage, "transformations", "number", `Rolling 30-day transformations · ${rollingWindowHelp(usage)}`, "transformations"),
      createUsageCard("Image credits", usage, "credits", "number", `Total credits used by this image product environment · ${rollingWindowHelp(usage)}`),
      createUsageCard("Video storage", videoUsage, "storage", "bytes", `Current stored assets · ${rollingWindowHelp(videoUsage)}`, "storage"),
      createUsageCard("Video bandwidth", videoUsage, "bandwidth", "bytes", `Rolling 30-day delivery · ${rollingWindowHelp(videoUsage)}`, "bandwidth"),
      createUsageCard("Video transformations", videoUsage, "transformations", "number", `Rolling 30-day processing · ${rollingWindowHelp(videoUsage)}`, "transformations"),
      createUsageCard("Video credits", videoUsage, "credits", "number", `Total credits used by this video product environment · ${rollingWindowHelp(videoUsage)}`),
    ],
    details: [],
    resources: [],
  };
}

export async function getProviderUsageOverview(
  context: ProviderEnv | undefined,
  cloudinaryUsage: CloudinaryUsage | null,
  cloudinaryVideoUsage: CloudinaryUsage | null,
  db: DatabaseClient,
) {
  const env = await readEnv(context);
  const now = Date.now();
  let infrastructureProviders = providerCache && providerCache.expiresAt > now ? providerCache.data : null;

  if (!infrastructureProviders) {
    if (!providerCachePromise) {
      providerCachePromise = (async () => {
        const providers = await Promise.all([
          getCloudflareUsage(env),
          getSupabaseUsage(env),
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

  const neonProvider = parseNeonDatabaseUrl(env.databaseUrl) || env.neonApiKey
    ? await getNeonUsage(env, db)
    : null;

  return [
    ...infrastructureProviders.filter((provider) => provider.id === "cloudflare"),
    ...(neonProvider ? [neonProvider] : []),
    ...infrastructureProviders.filter((provider) => provider.id !== "cloudflare"),
    getCloudinaryProvider(cloudinaryUsage, cloudinaryVideoUsage),
  ].map(({ id, name, status, statusLabel, cards }) => ({ id, name, status, statusLabel, cards }));
}
