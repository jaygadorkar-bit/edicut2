import type { CloudinaryUsage } from "./cloudinary.server";
import { fetchWithTimeout } from "@edicut/shared/server-fetch";
import type { DatabaseClient } from "@edicut/db/client";
import { getGoogleDriveStorageQuota, type GoogleDriveStorageQuotaResult } from "./google-drive-storage.server";
import type { LoaderContext } from "../types";
import { sql } from "drizzle-orm";
import { isPublicAnalyticsPath } from "./site-analytics";

type ProviderEnv = {
  cf?: { env?: Record<string, string | undefined> };
  cloudflare?: { env?: Record<string, string | undefined> };
};

export type UsageCardStat = {
  label: string;
  value: string;
  help?: string;
  meterPercent?: number;
  group?: string;
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
  id: "cloudflare" | "cloudflare-d1" | "vercel" | "supabase" | "cloudinary" | "google-drive";
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

type CloudflareAnalyticsGroup = {
  dimensions?: { date?: string; datetime?: string };
  sum?: {
    requests?: number;
    cachedRequests?: number;
    bytes?: number;
    cachedBytes?: number;
    encryptedRequests?: number;
    threats?: number;
    pageViews?: number;
    countryMap?: Array<{ clientCountryName?: string; requests?: number; bytes?: number; threats?: number }>;
  };
  uniq?: { uniques?: number };
};

export type CloudflareTrafficSnapshot =
  | { status: "available"; recentRequests: number; recognizedBotRequests: number }
  | { status: "not-configured" | "permission-required" | "unavailable" };

export type CloudflareAnalyticsDashboard =
  | {
      status: "available";
      recentRequests: number;
      recentRequestWindow: "five minutes" | "current hour";
      recognizedBotRequests?: number;
      topPagesAvailable: boolean;
      botActivityAvailable: boolean;
      daily: Array<{ day: string; visitors: number; pageViews: number; requests: number; threats: number }>;
      hourly: Array<{ hour: string; visitors: number; pageViews: number; requests: number }>;
      countries: Array<{ country: string; requests: number; threats: number }>;
      countryReports: {
        daily: Array<{ country: string; requests: number; threats: number }>;
        weekly: Array<{ country: string; requests: number; threats: number }>;
        monthly: Array<{ country: string; requests: number; threats: number }>;
      };
      topPages: Array<{ path: string; requests: number; errors: number }>;
      botActivity: Array<{ bot: string; path: string; status: number; requests: number }>;
      sampled: true;
    }
  | { status: "not-configured" | "permission-required" | "unavailable" };

const CLOUDFLARE_TRAFFIC_CACHE_MS = 60_000;
const cloudflareTrafficCache = new Map<string, { expiresAt: number; snapshot: CloudflareTrafficSnapshot | null }>();
const cloudflareAnalyticsCache = new Map<string, { expiresAt: number; snapshot: CloudflareAnalyticsDashboard }>();

type CloudflareWorkerGroup = {
  sum?: { requests?: number; errors?: number; subrequests?: number };
};

type CloudflareD1AnalyticsGroup = {
  dimensions?: { date?: string; databaseId?: string };
  sum?: { rowsRead?: number; rowsWritten?: number };
};

type CloudflareD1StorageGroup = {
  dimensions?: { date?: string; databaseId?: string };
  max?: { databaseSizeBytes?: number };
};

type CloudflareD1Usage = {
  rowsRead: number | null;
  rowsWritten: number | null;
  storageBytes: number | null;
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

    return values;
  } catch {
    return {};
  }
}

async function readEnv(context?: ProviderEnv) {
  const viteEnv = (import.meta.env ?? {}) as Record<string, string | undefined>;
  const nodeEnv = globalThis.process?.env as Record<string, string | undefined> | undefined;
  const localEnv = await readLocalEnvFile();
  const localCloudflareToken = localEnv.CLOUDFLARE_API_TOKEN || localEnv.CF_API_TOKEN;
  const isViteDevelopment = (import.meta.env as unknown as { DEV?: boolean } | undefined)?.DEV === true;
  const preferLocalCloudflareToken = isViteDevelopment && Boolean(localCloudflareToken);

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
    // A running local dev process can retain an older shell token; use the current project config there.
    // Production and deployed Cloudflare bindings continue to take precedence through `value()`.
    cloudflareApiToken: preferLocalCloudflareToken
      ? localCloudflareToken
      : value("CLOUDFLARE_API_TOKEN") || value("CF_API_TOKEN"),
    // Account analytics needs a broader Cloudflare scope than zone analytics.
    // Keep the account credential separate so a zone-only token can still load site traffic.
    cloudflareAccountAnalyticsApiToken: value("CLOUDFLARE_ACCOUNT_ANALYTICS_API_TOKEN") || value("CLOUDFLARE_MASTER_API_TOKEN"),
    cloudflareEmail: value("CLOUDFLARE_EMAIL") || value("CF_EMAIL"),
    cloudflareApiKey: value("CLOUDFLARE_API_KEY") || value("CF_API_KEY"),
    googleDriveAccountEmail: value("GOOGLE_DRIVE_ACCOUNT_EMAIL"),
    googleDriveOAuthClientId: value("YOUTUBE_OAUTH_CLIENT_ID"),
    googleDriveOAuthClientSecret: value("YOUTUBE_OAUTH_CLIENT_SECRET"),
    googleDriveTokenSecret: value("YOUTUBE_TOKEN_SECRET"),
    appUrl: value("APP_URL") || value("NEXT_PUBLIC_APP_URL"),
    vercelToken: value("VERCEL_TOKEN"),
    vercelTeamId: value("VERCEL_TEAM_ID") || value("VERCEL_ORG_ID"),
    supabaseUrl: value("SUPABASE_URL") || value("VITE_SUPABASE_URL"),
    supabaseProjectRef: value("SUPABASE_PROJECT_REF"),
    supabaseAccessToken: value("SUPABASE_ACCESS_TOKEN"),
    supabasePublishableKey: value("SUPABASE_PUBLISHABLE_KEY") || value("VITE_SUPABASE_PUBLISHABLE_KEY"),
    supabaseServiceRoleKey: value("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

async function fetchJson<T>(url: string, init: RequestInit) {
  const response = await fetchWithTimeout(url, { ...init, cache: "no-store" });
  const result = await response.json().catch(() => ({})) as T & { error?: unknown; errors?: unknown[]; message?: string };

  if (!response.ok) {
    const message = typeof result.message === "string" ? result.message : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  if (result.errors?.length) {
    const firstError = result.errors[0];
    const message = firstError && typeof firstError === "object" && "message" in firstError && typeof firstError.message === "string"
      ? firstError.message
      : "Provider analytics query failed.";
    throw new Error(message);
  }

  return result;
}

async function fetchText(url: string, init: RequestInit) {
  const response = await fetchWithTimeout(url, { ...init, cache: "no-store" });
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

type PostgresDatabaseMetrics = {
  databaseName: string;
  databaseBytes: number;
  activeConnections: number;
  maxConnections: number;
  userTables: number;
  postgresVersion: string;
};

const SUPABASE_FREE_DATABASE_LIMIT_BYTES = 500 * 1024 ** 2;

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

function safeNonnegativeCount(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

async function getLivePostgresDatabaseMetrics(db: DatabaseClient): Promise<PostgresDatabaseMetrics> {
  const result = await db.execute(sql`
    SELECT
      current_database() AS database_name,
      (
        SELECT COALESCE(sum(pg_catalog.pg_database_size(datname)), 0)::text
        FROM pg_catalog.pg_database
      ) AS database_bytes,
      (
        SELECT count(*)::text
        FROM pg_catalog.pg_stat_activity
        WHERE datname = current_database()
      ) AS active_connections,
      current_setting('max_connections') AS max_connections,
      (
        SELECT count(*)::text
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
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

function getPostgresDatabaseUsageCards(metrics: PostgresDatabaseMetrics | null): UsageCardStat[] {
  const databasePercent = metrics
    ? (metrics.databaseBytes / SUPABASE_FREE_DATABASE_LIMIT_BYTES) * 100
    : undefined;

  return [
    {
      label: "Postgres database storage",
      value: metrics ? `${formatBytes(metrics.databaseBytes)} / 500 MB` : "Unavailable / 500 MB limit",
      help: metrics
        ? `Live pg_database_size summed across this project's databases. The 500 MB threshold is a Free plan reference; exceeding it can put a Free project into read-only mode. This live query may differ from Supabase's daily usage snapshot.`
        : "Live Postgres database metrics are unavailable. Supabase Free includes a 500 MB database-size reference per project.",
      meterPercent: databasePercent === undefined ? undefined : Math.min(100, databasePercent),
      group: "Postgres database",
    },
    {
      label: "Postgres connections",
      value: metrics ? `${formatNumber(metrics.activeConnections)} / ${formatNumber(metrics.maxConnections)}` : "Unavailable",
      help: metrics
        ? "Current sessions for this database divided by PostgreSQL max_connections. This is a live connection-capacity reading."
        : "Live Postgres connection metrics are unavailable.",
      group: "Postgres database",
    },
    { label: "Postgres user tables", value: metrics ? formatNumber(metrics.userTables) : "Unavailable", group: "Postgres database" },
    { label: "Postgres version", value: metrics?.postgresVersion || "Unavailable", group: "Postgres database" },
  ];
}

function getSupabaseFreePlanReferenceCards(metrics: PostgresDatabaseMetrics | null, apiRequestsToday: number | null): UsageCardStat[] {
  const group = "Free plan limits (reference)";
  return [
    {
      label: "Database disk allocation",
      value: metrics
        ? `${formatBytes(metrics.databaseBytes)} database size · 1 GB disk reference`
        : "No live total-disk meter · 1 GB / project",
      help: metrics
        ? "The measured value is live pg_database_size (database contents), not total disk occupancy. Supabase disk usage also includes WAL and system files, which this SQL query cannot measure. The 500 MB database-size threshold can trigger read-only mode before the disk allocation is full."
        : "Total disk use is unavailable from the current API access. It includes database files, WAL, and system files; the separate Postgres database storage card measures database contents only.",
      group,
    },
    {
      label: "Database compute",
      value: "No live CPU/RAM meter · Nano · 0.5 GB RAM reference",
      help: "This server-side database query and the current Management API access do not provide CPU or memory utilization. The Nano shared CPU and 0.5 GB RAM are plan references, not measured current usage.",
      group,
    },
    {
      label: "Uncached egress allowance",
      value: "No live meter · 5 GB / org / billing cycle",
      help: "The current project API access does not expose the billing-cycle egress total. This organization-wide allowance is shared across Supabase services; check the Supabase organization Usage page for the measured total.",
      group,
    },
    {
      label: "Cached egress allowance",
      value: "No live meter · 5 GB / org / billing cycle",
      help: "The current project API access does not expose the billing-cycle cached-egress total. This quota is separate from uncached egress and applies to content served from Supabase Storage's CDN, not normal Postgres query traffic.",
      group,
    },
    {
      label: "API request allowance",
      value: `${apiRequestsToday === null ? "Usage unavailable" : `${formatNumber(apiRequestsToday)} requests today`} · Unlimited reference`,
      help: "Daily API request count is measured from the Management API when available. The Free plan has no API request-count quota; database size, egress, Auth, Realtime, and rate limits still apply.",
      group,
    },
  ];
}

function getSupabaseRealtimeFreePlanReferenceCards(): UsageCardStat[] {
  const group = "Supabase Realtime · Free limits";
  return [
    { label: "Realtime messages / month", value: "No live meter · 2 million / org reference", help: "The Management API access configured here does not expose the billing-cycle Realtime message total. Each broadcast counts once when sent and once for every subscribed client that receives it; check the Supabase organization Usage page for the measured total.", group },
    { label: "Concurrent Realtime connections", value: "No live meter · 200 / project reference", help: "This app cannot read the project's live connection count through its current API access. Supabase Realtime Reports shows connected clients; each browser tab generally holds a separate WebSocket connection.", group },
    { label: "Realtime messages per second", value: "No live meter · 100 / project reference", help: "The Management API access configured here does not expose the project's current message throughput. The reference is the Free plan limit; high-fanout events can consume it quickly.", group },
    { label: "Channel joins per second", value: "No live meter · 100 / project reference", help: "Current project channel-join throughput is not exposed through the configured API access. The reference is the Free plan limit; reconnect storms and opening many channels per browser can approach it.", group },
    { label: "Channels per connection", value: "No live meter · 100 / connection reference", help: "This is a maximum rather than a usage counter. EdiCut shares one private workspace channel per browser tab for notifications and admin counts.", group },
    { label: "Broadcast payload size", value: "No live meter · 256 KB max reference", help: "Current payload-size usage is not measured in this panel. The value is the Free plan maximum for one Broadcast payload; EdiCut sends small invalidation hints and reloads authorized data through the app.", group },
    { label: "Broadcast replay retention", value: "No live usage meter · 72 hours · 25 per request", help: "This is a platform behavior limit rather than a usage counter. Messages can be replayed for 72 hours, with at most 25 replayed messages per request; EdiCut refetches a fresh snapshot after reconnect.", group },
  ];
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

function formatGoogleStorageBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function getGoogleDriveProvider(result: GoogleDriveStorageQuotaResult): ProviderUsage {
  const quota = result.status === "connected" ? result.quota : null;
  const notConnected = result.status === "not-connected";
  const unavailableReason = result.status === "unavailable" ? result.reason : undefined;
  const issueHelp = unavailableReason
    ? ({
        configuration: "Drive usage could not load because the OAuth settings are incomplete. Configure the Drive OAuth client and token-encryption secret.",
        encryption: "The saved Drive token does not match the configured encryption key. Check YOUTUBE_TOKEN_SECRET or reconnect Google Drive from Video Storage settings.",
        authorization: "The saved Drive authorization could not be refreshed or decrypted. Reconnect Google Drive from Video Storage settings.",
        permission: "Google denied access to the Drive account usage endpoint. Check the Drive API and OAuth permissions, then reconnect if needed.",
        provider: "Google Drive did not return usage data. Retry later and check the provider status if this continues.",
        response: "Google Drive returned an incomplete usage response. Check the Drive API settings and retry.",
      }[unavailableReason])
    : undefined;
  const accountUsage = quota?.accountUsageBytes;
  const driveUsage = quota?.driveUsageBytes;
  const limit = quota?.limitBytes;
  const usedValue = typeof accountUsage === "number"
    ? `${formatGoogleStorageBytes(accountUsage)} / ${limit === null ? "Unlimited" : limit === undefined ? "Unavailable" : formatGoogleStorageBytes(limit)}`
    : "Unavailable";
  const freeValue = limit === null
    ? "Unlimited"
    : typeof limit === "number" && typeof accountUsage === "number"
      ? formatGoogleStorageBytes(Math.max(0, limit - accountUsage))
      : "Unavailable";
  return {
    id: "google-drive",
    name: "Google Drive",
    icon: "drive",
    configured: !notConnected,
    status: quota ? "connected" : notConnected ? "not-configured" : "partial",
    statusLabel: quota ? "Connected" : notConnected ? "Not connected" : unavailableReason === "encryption" ? "Encryption key mismatch" : unavailableReason === "authorization" ? "Reconnect required" : unavailableReason === "configuration" ? "Configuration needed" : unavailableReason === "permission" ? "Permission needed" : "Usage unavailable",
    cards: [
      {
        label: "Google storage used",
        value: notConnected ? "Not connected" : usedValue,
        help: ["Total storage used across this Google account, including Drive, Gmail, and Google Photos.", issueHelp].filter(Boolean).join(" "),
        meterPercent: typeof accountUsage === "number" && typeof limit === "number" ? getUsagePercent(accountUsage, limit) : undefined,
        group: "Google Drive storage",
      },
      {
        label: "Free for Drive uploads",
        value: notConnected ? "Not connected" : freeValue,
        help: ["Remaining shared Google account storage, calculated from the account limit minus total usage across Drive, Gmail, and Photos.", issueHelp].filter(Boolean).join(" "),
        group: "Google Drive storage",
      },
      {
        label: "Files in Drive",
        value: notConnected ? "Not connected" : typeof driveUsage === "number" ? formatGoogleStorageBytes(driveUsage) : "Unavailable",
        help: ["Storage used by files in Drive. The total account usage above also includes Gmail and Google Photos.", issueHelp].filter(Boolean).join(" "),
        group: "Google Drive storage",
      },
      {
        label: "Download bandwidth",
        value: notConnected ? "Not connected" : "No live meter",
        help: "The Drive storage API does not report bandwidth used or remaining. Google's current new-project quota model lists 1 TB of API egress per project per day; this project's assigned limit may differ, so check Google Cloud Console → APIs & Services → Google Drive API → Quotas. Google may also temporarily restrict unusually popular file downloads without publishing a numeric per-file threshold.",
        group: "Google Drive limits",
      },
    ],
    details: [],
    resources: [],
  };
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

/** A cached, five-minute Cloudflare traffic estimate for the admin overview. */
export async function getCloudflareTrafficSnapshot(context?: ProviderEnv): Promise<CloudflareTrafficSnapshot | null> {
  const env = await readEnv(context);
  if (!env.cloudflareApiToken && (!env.cloudflareEmail || !env.cloudflareApiKey)) return { status: "not-configured" };

  const headers: Record<string, string> = env.cloudflareApiToken
    ? { Authorization: `Bearer ${env.cloudflareApiToken}`, "Content-Type": "application/json" }
    : { "X-Auth-Email": env.cloudflareEmail || "", "X-Auth-Key": env.cloudflareApiKey || "", "Content-Type": "application/json" };
  let zoneId: string | undefined = env.cloudflareZoneId;

  if (!zoneId && env.cloudflareZoneName) {
    const params = new URLSearchParams({ per_page: "50", name: env.cloudflareZoneName });
    if (env.cloudflareAccountId) params.set("account.id", env.cloudflareAccountId);
    const zones = await fetchJson<{ result?: CloudflareZone[] }>(`https://api.cloudflare.com/client/v4/zones?${params}`, { headers });
    zoneId = zones.result?.find((zone) => zone.name === env.cloudflareZoneName)?.id;
  }
  if (!zoneId) return { status: "not-configured" };

  const cached = cloudflareTrafficCache.get(zoneId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.snapshot;

  try {
    const query = `
      SELECT
        COUNT(*) AS request_count,
        countIf(
          lower(userAgent) LIKE '%bot%'
          OR lower(userAgent) LIKE '%crawler%'
          OR lower(userAgent) LIKE '%spider%'
          OR lower(userAgent) LIKE '%headless%'
          OR lower(userAgent) LIKE '%preview%'
          OR lower(userAgent) LIKE '%monitor%'
          OR lower(userAgent) LIKE '%validator%'
        ) AS recognized_bot_requests
      FROM events.httpRequests
      WHERE timestamp >= NOW() - INTERVAL '5' MINUTE
    `;
    const result = await fetchJson<{
      data?: Array<{ request_count?: number; recognized_bot_requests?: number }>;
    }>("https://api.cloudflare.com/client/v4/analytics/sql", {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        scope: { zoneTag: zoneId },
      }),
    });

    const row = result.data?.[0];
    const recentRequests = safeNonnegativeCount(row?.request_count);
    const recognizedBotRequests = safeNonnegativeCount(row?.recognized_bot_requests);
    if (recentRequests === null || recognizedBotRequests === null) {
      throw new Error("Cloudflare analytics returned an invalid traffic summary.");
    }
    const snapshot: CloudflareTrafficSnapshot = {
      status: "available",
      recentRequests,
      recognizedBotRequests,
    };
    cloudflareTrafficCache.set(zoneId, { expiresAt: now + CLOUDFLARE_TRAFFIC_CACHE_MS, snapshot });
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const snapshot: CloudflareTrafficSnapshot = {
      status: /permission|access|forbidden|unauthorized/.test(message)
        ? "permission-required"
        : "unavailable",
    };
    cloudflareTrafficCache.set(zoneId, { expiresAt: now + CLOUDFLARE_TRAFFIC_CACHE_MS, snapshot });
    return snapshot;
  }
}

function classifyAnalyticsBot(userAgent: unknown) {
  const value = typeof userAgent === "string" ? userAgent.toLowerCase() : "";
  if (/googlebot|google-inspectiontool/.test(value)) return "Google crawler";
  if (/bingbot|adidxbot/.test(value)) return "Bing crawler";
  if (/gptbot|chatgpt-user|oai-searchbot/.test(value)) return "OpenAI crawler";
  if (/claudebot|anthropic-ai|claude-web/.test(value)) return "Anthropic crawler";
  if (/applebot/.test(value)) return "Apple crawler";
  if (/facebookexternalhit|meta-externalagent|meta-externalfetcher/.test(value)) return "Meta crawler";
  if (/monitor|pingdom|uptime|health.?check|validator/.test(value)) return "Monitor or validator";
  if (/crawl|spider|bot|headless|preview/.test(value)) return "Other bot or crawler";
  return "Unclassified automated request";
}

function safeAnalyticsPath(value: unknown) {
  if (typeof value !== "string") return "/";
  const normalized = value.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/").slice(0, 180) || "/";
  return normalized.split("/").map((segment) => {
    let decoded = segment;
    try { decoded = decodeURIComponent(segment); } catch { /* Keep malformed path segments opaque. */ }
    if (
      /^\d+$/.test(decoded) ||
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded) ||
      /[^/]*@[^/]*\.[^/]+/.test(decoded) ||
      /^[A-Za-z0-9_-]{24,}$/.test(decoded)
    ) return ":id";
    return segment;
  }).join("/");
}

function analyticsCount(value: unknown) {
  return safeNonnegativeCount(value) ?? 0;
}

/**
 * Build a privacy-minimized dashboard from Cloudflare's aggregate analytics.
 * It never selects or returns client IP addresses, query strings, or full user-agent strings.
 */
export async function getCloudflareAnalyticsDashboard(context?: ProviderEnv): Promise<CloudflareAnalyticsDashboard> {
  const env = await readEnv(context);
  if (!env.cloudflareApiToken && (!env.cloudflareEmail || !env.cloudflareApiKey)) return { status: "not-configured" };

  const headers: Record<string, string> = env.cloudflareApiToken
    ? { Authorization: `Bearer ${env.cloudflareApiToken}`, "Content-Type": "application/json" }
    : { "X-Auth-Email": env.cloudflareEmail || "", "X-Auth-Key": env.cloudflareApiKey || "", "Content-Type": "application/json" };
  let zoneId: string | undefined = env.cloudflareZoneId;
  if (!zoneId && env.cloudflareZoneName) {
    const params = new URLSearchParams({ per_page: "50", name: env.cloudflareZoneName });
    if (env.cloudflareAccountId) params.set("account.id", env.cloudflareAccountId);
    const zones = await fetchJson<{ result?: CloudflareZone[] }>(`https://api.cloudflare.com/client/v4/zones?${params}`, { headers });
    zoneId = zones.result?.find((zone) => zone.name === env.cloudflareZoneName)?.id;
  }
  if (!zoneId) return { status: "not-configured" };

  const now = Date.now();
  const cached = cloudflareAnalyticsCache.get(zoneId);
  if (cached && cached.expiresAt > now) return cached.snapshot;

  try {
    const end = new Date().toISOString();
    const hourStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const startDate = new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endDate = end.slice(0, 10);
    const graphQuery = `
      query($zoneTag: string, $hourStart: Time, $end: Time, $startDate: Date, $endDate: Date) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            hourly: httpRequests1hGroups(limit: 24, filter: { datetime_geq: $hourStart, datetime_lt: $end }) {
              dimensions { datetime }
              sum { requests pageViews }
              uniq { uniques }
            }
            daily: httpRequests1dGroups(limit: 31, filter: { date_geq: $startDate, date_leq: $endDate }) {
              dimensions { date }
              sum { requests pageViews threats countryMap { clientCountryName requests threats } }
              uniq { uniques }
            }
          }
        }
      }
    `;
    const [graphResult, pageResult, botResult, trafficResult] = await Promise.allSettled([
      fetchJson<{
        data?: { viewer?: { zones?: Array<{ hourly?: CloudflareAnalyticsGroup[]; daily?: CloudflareAnalyticsGroup[] }> } };
      }>("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers,
        body: JSON.stringify({ query: graphQuery, variables: { zoneTag: zoneId, hourStart, end, startDate, endDate } }),
      }),
      fetchJson<{ data?: Array<{ path?: unknown; requests?: unknown; errors?: unknown }> }>(
        "https://api.cloudflare.com/client/v4/analytics/sql",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: `
              SELECT clientRequestPath AS path, COUNT(*) AS requests,
                countIf(edgeResponseStatus >= 400) AS errors
              FROM events.httpRequests
              WHERE timestamp >= NOW() - INTERVAL '24' HOUR
                AND clientRequestPath != ''
                AND clientRequestPath NOT LIKE '%.%'
                AND clientRequestPath NOT LIKE '/api/%'
              GROUP BY path
              ORDER BY requests DESC
              LIMIT 8
            `,
            scope: { zoneTag: zoneId },
          }),
        },
      ),
      fetchJson<{ data?: Array<{ userAgent?: unknown; path?: unknown; status?: unknown; requests?: unknown }> }>(
        "https://api.cloudflare.com/client/v4/analytics/sql",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: `
              SELECT userAgent, clientRequestPath AS path, edgeResponseStatus AS status, COUNT(*) AS requests
              FROM events.httpRequests
              WHERE timestamp >= NOW() - INTERVAL '24' HOUR
                AND (
                  lower(userAgent) LIKE '%bot%' OR lower(userAgent) LIKE '%crawler%'
                  OR lower(userAgent) LIKE '%spider%' OR lower(userAgent) LIKE '%headless%'
                  OR lower(userAgent) LIKE '%preview%' OR lower(userAgent) LIKE '%monitor%'
                  OR lower(userAgent) LIKE '%validator%'
                )
              GROUP BY userAgent, path, status
              ORDER BY requests DESC
              LIMIT 12
            `,
            scope: { zoneTag: zoneId },
          }),
        },
      ),
      getCloudflareTrafficSnapshot(context),
    ]);

    const traffic = trafficResult.status === "fulfilled" && trafficResult.value?.status === "available"
      ? trafficResult.value
      : null;
    if (graphResult.status === "rejected") throw graphResult.reason;
    const pageData = pageResult.status === "fulfilled" && Array.isArray(pageResult.value.data)
      ? pageResult.value.data
      : [];
    const botData = botResult.status === "fulfilled" && Array.isArray(botResult.value.data)
      ? botResult.value.data
      : [];

    const zone = graphResult.value.data?.viewer?.zones?.[0];
    if (!zone) throw new Error("Cloudflare analytics returned no zone data.");
    const daily = (zone.daily ?? []).map((group) => ({
      day: group.dimensions?.date ?? "",
      visitors: analyticsCount(group.uniq?.uniques),
      pageViews: analyticsCount(group.sum?.pageViews),
      requests: analyticsCount(group.sum?.requests),
      threats: analyticsCount(group.sum?.threats),
    })).filter((group) => /^\d{4}-\d{2}-\d{2}$/.test(group.day)).sort((a, b) => a.day.localeCompare(b.day));
    const hourly = (zone.hourly ?? []).map((group) => ({
      hour: group.dimensions?.datetime ?? "",
      visitors: analyticsCount(group.uniq?.uniques),
      pageViews: analyticsCount(group.sum?.pageViews),
      requests: analyticsCount(group.sum?.requests),
    })).filter((group) => group.hour.length > 0).sort((a, b) => a.hour.localeCompare(b.hour));

    const aggregateCountries = (groups: CloudflareAnalyticsGroup[]) => {
      const byName = new Map<string, { country: string; requests: number; threats: number }>();
      for (const group of groups) {
        for (const entry of group.sum?.countryMap ?? []) {
          const country = typeof entry.clientCountryName === "string" && entry.clientCountryName.length <= 64
            ? entry.clientCountryName : "Unknown";
          const current = byName.get(country) ?? { country, requests: 0, threats: 0 };
          current.requests += analyticsCount(entry.requests);
          current.threats += analyticsCount(entry.threats);
          byName.set(country, current);
        }
      }
      return [...byName.values()].sort((a, b) => b.requests - a.requests).slice(0, 10);
    };
    const countryGroups = (zone.daily ?? []).filter((group) => /^\d{4}-\d{2}-\d{2}$/.test(group.dimensions?.date ?? ""));
    const countryReports = {
      daily: aggregateCountries(countryGroups.slice(-1)),
      weekly: aggregateCountries(countryGroups.slice(-7)),
      monthly: aggregateCountries(countryGroups.slice(-30)),
    };
    const countries = countryReports.monthly;
    const topPages = pageData.flatMap((row) => {
      const path = safeAnalyticsPath(row.path);
      if (!isPublicAnalyticsPath(path)) return [];
      return [{ path, requests: analyticsCount(row.requests), errors: analyticsCount(row.errors) }];
    });
    const botActivity = botData.map((row) => ({
      bot: classifyAnalyticsBot(row.userAgent),
      path: safeAnalyticsPath(row.path),
      status: analyticsCount(row.status),
      requests: analyticsCount(row.requests),
    }));

    const snapshot: CloudflareAnalyticsDashboard = {
      status: "available",
      recentRequests: traffic?.recentRequests ?? analyticsCount(hourly[hourly.length - 1]?.requests),
      recentRequestWindow: traffic ? "five minutes" : "current hour",
      recognizedBotRequests: traffic?.recognizedBotRequests,
      topPagesAvailable: pageResult.status === "fulfilled" && Array.isArray(pageResult.value.data),
      botActivityAvailable: botResult.status === "fulfilled" && Array.isArray(botResult.value.data),
      daily,
      hourly,
      countries,
      countryReports,
      topPages,
      botActivity,
      sampled: true,
    };
    cloudflareAnalyticsCache.set(zoneId, { expiresAt: now + CLOUDFLARE_TRAFFIC_CACHE_MS, snapshot });
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return { status: /permission|access|forbidden|unauthorized/.test(message) ? "permission-required" : "unavailable" };
  }
}

export type AdminSecurityLogRange = "1h" | "24h" | "7d";

export type CloudflareErrorLogEntry = {
  timestamp: string;
  path: string;
  status: number;
  originStatus: number | null;
  rayId: string;
  securityAction: string;
};

export type CloudflareThreatLogEntry = {
  timestamp: string;
  path: string;
  action: string;
  source: string;
  country: string;
};

type CloudflareLogAvailability = "not-configured" | "permission-required" | "unavailable";

export type CloudflareSecurityLogSnapshot =
  | { kind: "errors"; status: "available"; events: CloudflareErrorLogEntry[]; range: AdminSecurityLogRange; sampled: true; retrievedAt: string; limit: number }
  | { kind: "threats"; status: "available"; events: CloudflareThreatLogEntry[]; range: AdminSecurityLogRange; sampled: true; retrievedAt: string; limit: number }
  | { kind: "errors" | "threats"; status: CloudflareLogAvailability; range: AdminSecurityLogRange; sampled: true };

const CLOUDFLARE_SECURITY_LOG_CACHE_MS = 30_000;
const CLOUDFLARE_SECURITY_LOG_LIMIT = 100;
const CLOUDFLARE_SECURITY_LOG_CACHE_MAX_ENTRIES = 12;
const cloudflareSecurityLogCache = new Map<string, { expiresAt: number; snapshot: CloudflareSecurityLogSnapshot }>();

function safeLogTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function safeLogLabel(value: unknown) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) || "Unknown" : "Unknown";
}

function safeLogCountry(value: unknown) {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value) ? value : "--";
}

function safeLogRayId(value: unknown) {
  return typeof value === "string" && /^[a-f0-9-]{8,64}$/i.test(value) ? value : "Unknown";
}

function cloudflareLogAvailability(error: unknown): CloudflareLogAvailability {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return /permission|access|forbidden|unauthorized|not authorized|authentication/.test(message)
    ? "permission-required"
    : "unavailable";
}

async function getCloudflareAnalyticsAccess(context?: ProviderEnv) {
  const env = await readEnv(context);
  if (!env.cloudflareApiToken && (!env.cloudflareEmail || !env.cloudflareApiKey)) return null;

  const headers: Record<string, string> = env.cloudflareApiToken
    ? { Authorization: `Bearer ${env.cloudflareApiToken}`, "Content-Type": "application/json" }
    : { "X-Auth-Email": env.cloudflareEmail || "", "X-Auth-Key": env.cloudflareApiKey || "", "Content-Type": "application/json" };
  let zoneId: string | undefined = env.cloudflareZoneId;

  if (!zoneId && env.cloudflareZoneName) {
    const params = new URLSearchParams({ per_page: "50", name: env.cloudflareZoneName });
    if (env.cloudflareAccountId) params.set("account.id", env.cloudflareAccountId);
    const zones = await fetchJson<{ result?: CloudflareZone[] }>(`https://api.cloudflare.com/client/v4/zones?${params}`, { headers });
    zoneId = zones.result?.find((zone) => zone.name === env.cloudflareZoneName)?.id;
  }

  return zoneId ? { headers, zoneId } : null;
}

/** Returns privacy-minimized, recent Cloudflare request or firewall events for the protected admin logs. */
export async function getCloudflareSecurityLog(
  context: ProviderEnv | undefined,
  kind: "errors" | "threats",
  range: AdminSecurityLogRange,
): Promise<CloudflareSecurityLogSnapshot> {
  const unavailable = (status: CloudflareLogAvailability | "not-configured"): CloudflareSecurityLogSnapshot => ({ kind, status, range, sampled: true });

  try {
    const access = await getCloudflareAnalyticsAccess(context);
    if (!access) return unavailable("not-configured");

    const cacheKey = `${access.zoneId}:${kind}:${range}`;
    const now = Date.now();
    for (const [key, entry] of cloudflareSecurityLogCache) {
      if (entry.expiresAt <= now) cloudflareSecurityLogCache.delete(key);
    }
    const cached = cloudflareSecurityLogCache.get(cacheKey);
    if (cached) return cached.snapshot;

    let snapshot: CloudflareSecurityLogSnapshot;
    if (kind === "errors") {
      const units = range === "1h" ? { amount: 1, unit: "HOUR" } : range === "24h" ? { amount: 1, unit: "DAY" } : { amount: 7, unit: "DAY" };
      const result = await fetchJson<{ data?: Array<{ timestamp?: unknown; path?: unknown; status?: unknown; origin_status?: unknown; ray_id?: unknown; security_action?: unknown }> }>(
        "https://api.cloudflare.com/client/v4/analytics/sql",
        {
          method: "POST",
          headers: access.headers,
          body: JSON.stringify({
            query: `
              SELECT timestamp, clientRequestPath AS path, edgeResponseStatus AS status,
                originResponseStatus AS origin_status, rayId AS ray_id,
                securityAction AS security_action
              FROM events.httpRequests
              WHERE edgeResponseStatus >= 400
                AND timestamp >= NOW() - INTERVAL '${units.amount}' ${units.unit}
              ORDER BY timestamp DESC
              LIMIT ${CLOUDFLARE_SECURITY_LOG_LIMIT}
            `,
            scope: { zoneTag: access.zoneId },
          }),
        },
      );
      const events = (Array.isArray(result.data) ? result.data : []).flatMap((row) => {
        const timestamp = safeLogTimestamp(row.timestamp);
        const status = safeNonnegativeCount(row.status);
        if (!timestamp || status === null || status < 400 || status > 599) return [];
        return [{
          timestamp,
          path: safeAnalyticsPath(row.path),
          status,
          originStatus: safeNonnegativeCount(row.origin_status),
          rayId: safeLogRayId(row.ray_id),
          securityAction: safeLogLabel(row.security_action),
        }];
      });
      snapshot = { kind, status: "available", events, range, sampled: true, retrievedAt: new Date().toISOString(), limit: CLOUDFLARE_SECURITY_LOG_LIMIT };
    } else {
      const end = new Date();
      const start = new Date(end.getTime() - (range === "1h" ? 60 : range === "24h" ? 24 * 60 : 7 * 24 * 60) * 60_000);
      const query = `
        query ListFirewallEvents($zoneTag: string, $filter: FirewallEventsAdaptiveFilter_InputObject) {
          viewer {
            zones(filter: { zoneTag: $zoneTag }) {
              firewallEventsAdaptive(filter: $filter, limit: ${CLOUDFLARE_SECURITY_LOG_LIMIT}, orderBy: [datetime_DESC]) {
                action
                clientCountryName
                clientRequestPath
                datetime
                source
              }
            }
          }
        }
      `;
      const result = await fetchJson<{
        data?: { viewer?: { zones?: Array<{ firewallEventsAdaptive?: Array<{ action?: unknown; clientCountryName?: unknown; clientRequestPath?: unknown; datetime?: unknown; source?: unknown }> }> } };
      }>("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: access.headers,
        body: JSON.stringify({
          query,
          variables: {
            zoneTag: access.zoneId,
            filter: { datetime_geq: start.toISOString(), datetime_leq: end.toISOString() },
          },
        }),
      });
      const rows = result.data?.viewer?.zones?.[0]?.firewallEventsAdaptive ?? [];
      const events = rows.flatMap((row) => {
        const timestamp = safeLogTimestamp(row.datetime);
        if (!timestamp) return [];
        return [{
          timestamp,
          path: safeAnalyticsPath(row.clientRequestPath),
          action: safeLogLabel(row.action),
          source: safeLogLabel(row.source),
          country: safeLogCountry(row.clientCountryName),
        }];
      });
      snapshot = { kind, status: "available", events, range, sampled: true, retrievedAt: new Date().toISOString(), limit: CLOUDFLARE_SECURITY_LOG_LIMIT };
    }

    cloudflareSecurityLogCache.delete(cacheKey);
    cloudflareSecurityLogCache.set(cacheKey, { expiresAt: Date.now() + CLOUDFLARE_SECURITY_LOG_CACHE_MS, snapshot });
    while (cloudflareSecurityLogCache.size > CLOUDFLARE_SECURITY_LOG_CACHE_MAX_ENTRIES) {
      const oldest = cloudflareSecurityLogCache.keys().next().value;
      if (oldest === undefined) break;
      cloudflareSecurityLogCache.delete(oldest);
    }
    return snapshot;
  } catch (error) {
    return unavailable(cloudflareLogAvailability(error));
  }
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

async function getCloudflareD1Usage(headers: Record<string, string>, accountId: string): Promise<CloudflareD1Usage> {
  const today = new Date().toISOString().slice(0, 10);
  const query = `
    query($accountTag: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            sum { rowsRead rowsWritten }
            dimensions { date databaseId }
          }
          d1StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
            max { databaseSizeBytes }
            dimensions { date databaseId }
          }
        }
      }
    }
  `;
  const result = await fetchJson<{
    data?: {
      viewer?: {
        accounts?: Array<{
          d1AnalyticsAdaptiveGroups?: CloudflareD1AnalyticsGroup[];
          d1StorageAdaptiveGroups?: CloudflareD1StorageGroup[];
        }>;
      };
    };
  }>("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables: { accountTag: accountId, start: today, end: today } }),
  });
  const account = result.data?.viewer?.accounts?.[0];
  const analytics = account?.d1AnalyticsAdaptiveGroups;
  const storage = account?.d1StorageAdaptiveGroups;
  if (!analytics || !storage) throw new Error("Cloudflare did not return D1 analytics.");

  const databaseSizes = new Map<string, number>();
  for (const group of storage) {
    const databaseId = group.dimensions?.databaseId;
    const bytes = group.max?.databaseSizeBytes;
    if (!databaseId || typeof bytes !== "number" || !Number.isFinite(bytes)) continue;
    databaseSizes.set(databaseId, Math.max(databaseSizes.get(databaseId) || 0, bytes));
  }

  return {
    rowsRead: analytics.reduce((total, group) => total + (typeof group.sum?.rowsRead === "number" ? group.sum.rowsRead : 0), 0),
    rowsWritten: analytics.reduce((total, group) => total + (typeof group.sum?.rowsWritten === "number" ? group.sum.rowsWritten : 0), 0),
    storageBytes: storage.length ? Array.from(databaseSizes.values()).reduce((total, bytes) => total + bytes, 0) : null,
  };
}

function getCloudflareD1Provider(usage: CloudflareD1Usage | null, configured: boolean): ProviderUsage {
  const d1ReadLimit = 5_000_000;
  const d1WriteLimit = 100_000;
  const d1AccountStorageLimitBytes = 5 * 1024 * 1024 * 1024;

  return {
    id: "cloudflare-d1",
    name: "Cloudflare D1",
    icon: "database",
    configured,
    status: usage ? "connected" : configured ? "partial" : "not-configured",
    statusLabel: usage ? "Live usage" : configured ? "Limits only" : "Not configured",
    cards: [
      {
        label: "Rows read (today UTC)",
        value: usage ? `${formatNumber(usage.rowsRead ?? 0)} / 5M Free reference` : "Unavailable",
        help: usage
          ? "Rows scanned across all D1 databases in this account for the current UTC day. Workers Free allows 5 million rows read per day; this is a reference because this panel cannot verify your plan."
          : "Requires Account Analytics:Read access. D1 reads count rows scanned, summed across the account. The Free limit is 5 million rows read per UTC day; Workers Paid is billed monthly.",
        meterPercent: usage?.rowsRead === null || !usage ? undefined : getUsagePercent(usage.rowsRead, d1ReadLimit),
      },
      {
        label: "Rows written (today UTC)",
        value: usage ? `${formatNumber(usage.rowsWritten ?? 0)} / 100K Free reference` : "Unavailable",
        help: usage
          ? "Rows written across all D1 databases in this account for the current UTC day. Workers Free allows 100,000 rows written per day; this is a reference because this panel cannot verify your plan."
          : "Requires Account Analytics:Read access. D1 writes count rows written, summed across the account. The Free limit is 100,000 rows written per UTC day; Workers Paid is billed monthly.",
        meterPercent: usage?.rowsWritten === null || !usage ? undefined : getUsagePercent(usage.rowsWritten, d1WriteLimit),
      },
      {
        label: "Storage (account)",
        value: usage?.storageBytes === null || !usage ? "Unavailable" : `${formatBytes(usage.storageBytes)} / 5 GB Free reference`,
        help: usage?.storageBytes === null || !usage
          ? "Requires Account Analytics:Read access. Cloudflare D1 storage metrics are summed across databases. Workers Free includes 5 GB total account storage; Workers Paid includes 5 GB before additional storage charges."
          : "Current maximum database sizes summed across databases in this account. Workers Free includes 5 GB total D1 storage; this is a Free-tier reference because this panel cannot verify your plan.",
        meterPercent: usage?.storageBytes === null || !usage ? undefined : getUsagePercent(usage.storageBytes, d1AccountStorageLimitBytes),
      },
      {
        label: "Max database size",
        value: "500 MB Free reference",
        help: "Cloudflare lists a 500 MB per-database maximum on Workers Free and 10 GB on Workers Paid. Account plan is not available to this panel.",
      },
      {
        label: "Queries per Worker invocation",
        value: "50 Free reference",
        help: "Cloudflare allows up to 50 D1 query subrequests per Worker invocation on Free and 1,000 on Workers Paid. Account plan is not available to this panel.",
      },
    ],
    details: [],
    resources: [],
  };
}

async function getCloudflareUsage(env: Awaited<ReturnType<typeof readEnv>>): Promise<ProviderUsage[]> {
  if (!env.cloudflareApiToken && (!env.cloudflareEmail || !env.cloudflareApiKey)) {
    return [
      notConfigured("cloudflare", "Cloudflare", "shield", ["CLOUDFLARE_API_TOKEN", "or CLOUDFLARE_EMAIL + CLOUDFLARE_API_KEY"]),
      getCloudflareD1Provider(null, false),
    ];
  }

  try {
    const headers: Record<string, string> = env.cloudflareApiToken
      ? { Authorization: `Bearer ${env.cloudflareApiToken}`, "Content-Type": "application/json" }
      : { "X-Auth-Email": env.cloudflareEmail || "", "X-Auth-Key": env.cloudflareApiKey || "", "Content-Type": "application/json" };
    const accountAnalyticsHeaders: Record<string, string> = env.cloudflareAccountAnalyticsApiToken
      ? { Authorization: `Bearer ${env.cloudflareAccountAnalyticsApiToken}`, "Content-Type": "application/json" }
      : headers;
    const zoneParams = new URLSearchParams({ per_page: "50" });
    if (env.cloudflareAccountId) zoneParams.set("account.id", env.cloudflareAccountId);
    if (env.cloudflareZoneName) zoneParams.set("name", env.cloudflareZoneName);

    const zones = await fetchJson<{ result?: CloudflareZone[] }>(`https://api.cloudflare.com/client/v4/zones?${zoneParams.toString()}`, { headers });
    const zoneList = (zones.result || []).filter((zone) =>
      (!env.cloudflareZoneId || zone.id === env.cloudflareZoneId) &&
      (!env.cloudflareZoneName || zone.name === env.cloudflareZoneName),
    );
    const [analytics, workerUsage, d1Usage] = await Promise.all([
      getCloudflareZoneAnalytics(headers, zoneList).catch(() => null),
      env.cloudflareAccountId && env.cloudflareWorkerName
        ? getCloudflareWorkerUsage(accountAnalyticsHeaders, env.cloudflareAccountId, env.cloudflareWorkerName).catch(() => null)
        : Promise.resolve(null),
      env.cloudflareAccountId
        ? getCloudflareD1Usage(accountAnalyticsHeaders, env.cloudflareAccountId).catch(() => null)
        : Promise.resolve(null),
    ]);
    const hasUsageData = Boolean(analytics || workerUsage);
    const cloudflareProvider: ProviderUsage = {
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
          group: "Workers & website",
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
          group: "Workers & website",
        },
        {
          label: "Worker errors (today UTC)",
          value: workerUsage ? `${formatNumber(workerUsage.errors)} / ${formatNumber(workerUsage.requests)} invocations` : "Unavailable",
          help: "Errors compared with this Worker's invocations; there is no separate error-count quota.",
          group: "Workers & website",
        },
        {
          label: "Zone requests (30d)",
          value: analytics ? `${formatNumber(analytics.requests)} / unmetered` : "Unavailable",
          help: analytics ? `${formatPercent(analytics.cacheHitRate)} cache hit rate · Free website traffic has no metered request allowance.` : undefined,
          group: "Workers & website",
        },
        {
          label: "Bandwidth (30d)",
          value: analytics ? `${formatBytes(analytics.bytes)} / unmetered` : "Unavailable",
          help: analytics ? `${formatBytes(analytics.cachedBytes)} served from cache · Free website traffic is unmetered.` : undefined,
          group: "Workers & website",
        },
      ],
      details: [],
      resources: [],
    };
    return [cloudflareProvider, getCloudflareD1Provider(d1Usage, true)];
  } catch (error) {
    return [
      errorProvider("cloudflare", "Cloudflare", "shield", error),
      getCloudflareD1Provider(null, true),
    ];
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

async function getSupabaseUsage(env: Awaited<ReturnType<typeof readEnv>>, db: DatabaseClient): Promise<ProviderUsage> {
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

  const [databaseMetrics, health, apiCounts] = await Promise.all([
    getLivePostgresDatabaseMetrics(db).catch(() => null),
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

  if (!hasHealthCheck && !hasUsageAccess && !databaseMetrics) {
    return notConfigured("supabase", "Supabase", "database", [
      "Supabase Postgres connection",
      "SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY for Auth API health",
      "SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF for API request counts",
    ]);
  }

  const requestCounts = apiCounts.rows.reduce((totals, row) => ({
    auth: totals.auth + (row.total_auth_requests || 0),
    realtime: totals.realtime + (row.total_realtime_requests || 0),
    rest: totals.rest + (row.total_rest_requests || 0),
    storage: totals.storage + (row.total_storage_requests || 0),
  }), { auth: 0, realtime: 0, rest: 0, storage: 0 });
  const totalRequests = requestCounts.auth + requestCounts.realtime + requestCounts.rest + requestCounts.storage;
  const status = databaseMetrics || health.ok || apiCounts.ok ? "connected" : "partial";
  const usageHelp = !hasUsageAccess
    ? "Add a server-side SUPABASE_ACCESS_TOKEN scoped with analytics_usage_read."
    : apiCounts.ok
      ? "Daily endpoint request count. This is not a remaining-quota meter."
      : "Check that the token has analytics_usage_read permission and the project ref is correct.";
  const requestHelp = apiCounts.ok
    ? "Live daily endpoint request count by API category. This is not a billing-cycle usage total."
    : "Request count unavailable until the analytics token and project scope are configured.";
  return {
    id: "supabase",
    name: "Supabase",
    icon: "database",
    configured: true,
    status,
    statusLabel: databaseMetrics ? "Connected" : apiCounts.ok ? "Usage live" : hasUsageAccess ? "Usage unavailable" : health.ok ? "API reachable" : "Token needed",
    cards: [
      ...getPostgresDatabaseUsageCards(databaseMetrics),
      ...getSupabaseFreePlanReferenceCards(databaseMetrics, apiCounts.ok ? totalRequests : null),
      ...getSupabaseRealtimeFreePlanReferenceCards(),
      { label: "API requests (today)", value: apiCounts.ok ? formatNumber(totalRequests) : hasUsageAccess ? "Unavailable" : "Not configured", help: usageHelp, group: "Supabase APIs" },
      {
        label: "Auth requests (today)",
        value: apiCounts.ok ? formatNumber(requestCounts.auth) : "Unavailable",
        help: requestHelp,
        group: "Supabase APIs",
      },
      {
        label: "REST requests (today)",
        value: apiCounts.ok ? formatNumber(requestCounts.rest) : "Unavailable",
        help: requestHelp,
        group: "Supabase APIs",
      },
      {
        label: "Realtime API requests (today)",
        value: apiCounts.ok ? formatNumber(requestCounts.realtime) : "Unavailable",
        help: requestHelp,
        group: "Supabase APIs",
      },
      {
        label: "Storage requests (today)",
        value: apiCounts.ok ? formatNumber(requestCounts.storage) : "Unavailable",
        help: requestHelp,
        group: "Supabase APIs",
      },
      { label: "Auth API", value: health.ok ? "Reachable" : hasHealthCheck ? "Unavailable" : "Not configured", help: "Connectivity check; this is not a usage counter.", group: "Supabase APIs" },
    ],
    details: [
      { label: "Project ref", value: projectRef || "Missing" },
      { label: "Database", value: databaseMetrics?.databaseName || "Unavailable" },
      { label: "Postgres version", value: databaseMetrics?.postgresVersion || "Unavailable" },
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
  cloudinaryUsage: CloudinaryUsage | null | Promise<CloudinaryUsage | null>,
  cloudinaryVideoUsage: CloudinaryUsage | null | Promise<CloudinaryUsage | null>,
  db: DatabaseClient,
) {
  const env = await readEnv(context);
  const originalContext = context as (LoaderContext & ProviderEnv) | undefined;
  const driveContext = {
    ...originalContext,
    cf: {
      ...originalContext?.cf,
      env: {
        ...originalContext?.cloudflare?.env,
        ...originalContext?.cf?.env,
        ...(env.googleDriveAccountEmail ? { GOOGLE_DRIVE_ACCOUNT_EMAIL: env.googleDriveAccountEmail } : {}),
        ...(env.googleDriveOAuthClientId ? { YOUTUBE_OAUTH_CLIENT_ID: env.googleDriveOAuthClientId } : {}),
        ...(env.googleDriveOAuthClientSecret ? { YOUTUBE_OAUTH_CLIENT_SECRET: env.googleDriveOAuthClientSecret } : {}),
        ...(env.googleDriveTokenSecret ? { YOUTUBE_TOKEN_SECRET: env.googleDriveTokenSecret } : {}),
        ...(env.appUrl ? { APP_URL: env.appUrl } : {}),
      },
    },
  } as LoaderContext;
  const [cloudflareProviders, supabaseProvider, imageUsage, videoUsage, driveQuota] = await Promise.all([
    getCloudflareUsage(env), getSupabaseUsage(env, db),
    cloudinaryUsage, cloudinaryVideoUsage,
    getGoogleDriveStorageQuota(db, driveContext).catch(() => ({ status: "unavailable", reason: "provider" } as const)),
  ]);
  const infrastructureProviders = [...cloudflareProviders, supabaseProvider];

  return [
    ...infrastructureProviders.filter((provider) => provider.id === "cloudflare"),
    ...infrastructureProviders.filter((provider) => provider.id === "cloudflare-d1"),
    ...infrastructureProviders.filter((provider) => provider.id !== "cloudflare" && provider.id !== "cloudflare-d1"),
    getGoogleDriveProvider(driveQuota),
    getCloudinaryProvider(imageUsage, videoUsage),
  ].map(({ id, name, status, statusLabel, cards }) => ({ id, name, status, statusLabel, cards }));
}
