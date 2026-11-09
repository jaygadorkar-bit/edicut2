import { sql } from "drizzle-orm";
import { isRouteErrorResponse } from "react-router";
import { getDbFromContext } from "./db.server";
import type { LoaderContext } from "../types";
import type { AdminSecurityLogRange } from "./provider-usage.server";
import { getRequestReference } from "./request-reference";

const MAX_SIGNATURES_PER_ISOLATE = 128;
const MAX_WRITES_PER_MINUTE = 20;
const DEDUPE_WINDOW_MS = 60_000;
const SIGNATURE_TTL_MS = 30 * 60_000;
const MAX_LOG_ROWS = 500;
const MAX_LOG_RESULTS = 100;
const LOG_RETENTION_DAYS = 30;
const APP_STACK_LINES = 12;

type ErrorRateLimitEntry = { nextAllowedAt: number; expiresAt: number; suppressed: number };

/** Bounded per-isolate gate: collapses repeats and caps writes from unique error floods. */
export function createApplicationErrorLogRateLimiter(
  options: { maxSignatures?: number; maxWritesPerMinute?: number; dedupeWindowMs?: number } = {},
) {
  const maxSignatures = options.maxSignatures ?? MAX_SIGNATURES_PER_ISOLATE;
  const maxWritesPerMinute = options.maxWritesPerMinute ?? MAX_WRITES_PER_MINUTE;
  const dedupeWindowMs = options.dedupeWindowMs ?? DEDUPE_WINDOW_MS;
  const signatures = new Map<string, ErrorRateLimitEntry>();
  let bucketStartedAt = 0;
  let bucketWrites = 0;

  return {
    acquire(fingerprint: string, now = Date.now()) {
      for (const [key, entry] of signatures) {
        if (entry.expiresAt <= now) signatures.delete(key);
      }

      if (now - bucketStartedAt >= 60_000 || now < bucketStartedAt) {
        bucketStartedAt = now;
        bucketWrites = 0;
      }

      const previous = signatures.get(fingerprint);
      if (previous && previous.nextAllowedAt > now) {
        previous.suppressed += 1;
        previous.expiresAt = now + SIGNATURE_TTL_MS;
        signatures.delete(fingerprint);
        signatures.set(fingerprint, previous);
        return { allowed: false as const, suppressed: previous.suppressed };
      }

      const suppressed = previous?.suppressed ?? 0;
      if (bucketWrites >= maxWritesPerMinute) {
        const entry = previous ?? { nextAllowedAt: 0, expiresAt: 0, suppressed: 0 };
        entry.suppressed += 1;
        entry.nextAllowedAt = now + dedupeWindowMs;
        entry.expiresAt = now + SIGNATURE_TTL_MS;
        signatures.delete(fingerprint);
        signatures.set(fingerprint, entry);
        trimSignatures(signatures, maxSignatures);
        return { allowed: false as const, suppressed: entry.suppressed };
      }

      bucketWrites += 1;
      signatures.delete(fingerprint);
      signatures.set(fingerprint, {
        nextAllowedAt: now + dedupeWindowMs,
        expiresAt: now + SIGNATURE_TTL_MS,
        suppressed: 0,
      });
      trimSignatures(signatures, maxSignatures);
      return { allowed: true as const, occurrences: suppressed + 1 };
    },
    get size() {
      return signatures.size;
    },
  };
}

function trimSignatures(signatures: Map<string, ErrorRateLimitEntry>, maxSize: number) {
  while (signatures.size > maxSize) {
    const oldest = signatures.keys().next().value;
    if (oldest === undefined) return;
    signatures.delete(oldest);
  }
}

const rateLimiter = createApplicationErrorLogRateLimiter();

export function sanitizeApplicationErrorText(value: string, maxLength = 2000) {
  return value
    .slice(0, maxLength * 2)
    .replace(/https?:\/\/[^\s)\]}>,]+/gi, "[url]")
    .replace(/\b(bearer)\s+[a-z0-9._~+\/-]+=*/gi, "$1 [redacted]")
    .replace(/\b(password|passwd|token|secret|api[_-]?key|authorization|cookie)\b(\s*[:=]\s*|\s+)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\b(?:[0-9a-f]{1,4}:){2,}[0-9a-f:]{1,}\b/gi, "[ip]")
    .replace(/\+?\d[\d(). -]{7,}\d/g, "[number]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[id]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[value]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[value]")
    .replace(/\b\d{8,}\b/g, "[number]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeApplicationErrorStack(value: string | null) {
  if (!value) return null;
  return value.split(/\r?\n/).slice(0, APP_STACK_LINES)
    .map((line) => sanitizeApplicationErrorText(line, 500))
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000) || null;
}

export function safeErrorRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean).map((segment) =>
    /^[a-z-]{1,16}$/i.test(segment) ? segment.toLowerCase() : ":param",
  );
  return `/${segments.join("/")}`.slice(0, 256) || "/";
}

function safeErrorName(error: unknown) {
  const name = error instanceof Error ? error.name : "Error";
  return /^[A-Za-z][A-Za-z0-9_.]{0,79}$/.test(name) ? name : "Error";
}

function safeDatabaseErrorCode(error: Error) {
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? ` · SQLSTATE ${code}` : "";
}

export function getApplicationErrorDiagnostic(error: unknown) {
  if (isRouteErrorResponse(error)) {
    if (error.status !== 500) return null;
    return {
      name: "RouteErrorResponse",
      message: `Route returned HTTP ${error.status}`,
      stack: null,
    };
  }

  if (error instanceof Response) {
    if (error.status !== 500) return null;
    return {
      name: "Response",
      message: `Route returned HTTP ${error.status}`,
      stack: null,
    };
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") return null;
    const databaseFailure = /Failed query:|postgres(?:ql)?:\/\//i.test(error.message);
    const message = databaseFailure
      ? `Database request failed${safeDatabaseErrorCode(error)}. Query details and parameters were omitted.`
      : sanitizeApplicationErrorText(error.message || "No error message", 2000);
    let stack = typeof error.stack === "string" ? error.stack : null;
    if (databaseFailure && stack) {
      const lines = stack.split(/\r?\n/);
      if (lines.length) lines[0] = `${error.name}: ${message}`;
      stack = lines.join("\n");
    }
    stack = sanitizeApplicationErrorStack(stack);
    return { name: safeErrorName(error), message, stack };
  }

  return {
    name: "Error",
    message: sanitizeApplicationErrorText(typeof error === "string" ? error : "A non-Error value was thrown", 2000),
    stack: null,
  };
}

async function hashFingerprint(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type ApplicationErrorLogEntry = {
  fingerprint: string;
  errorName: string;
  message: string;
  stack: string | null;
  route: string;
  method: string;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type ApplicationErrorLogSnapshot =
  | { status: "available"; entries: ApplicationErrorLogEntry[]; range: AdminSecurityLogRange; limit: number; maxStored: number; retentionDays: number }
  | { status: "unavailable"; entries: []; range: AdminSecurityLogRange; limit: number; maxStored: number; retentionDays: number };

const rangeMilliseconds: Record<AdminSecurityLogRange, number> = {
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
};

function errorLogRows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows?: T[] })?.rows ?? []) as T[];
}

export async function getApplicationErrorLog(db: ReturnType<typeof getDbFromContext>, range: AdminSecurityLogRange): Promise<ApplicationErrorLogSnapshot> {
  try {
    const since = new Date(Date.now() - rangeMilliseconds[range]).toISOString();
    await db.execute(sql`DELETE FROM application_error_logs
      WHERE last_seen_at < now() - (${LOG_RETENTION_DAYS} * interval '1 day')`);
    const result = await db.execute(sql`SELECT fingerprint,
      error_name AS "errorName", message, stack, route, method, occurrences,
      first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt"
      FROM application_error_logs
      WHERE last_seen_at >= ${since}::timestamptz
      ORDER BY last_seen_at DESC
      LIMIT ${MAX_LOG_RESULTS}`);
    const entries = errorLogRows<ApplicationErrorLogEntry>(result).map((row) => ({
      ...row,
      errorName: sanitizeApplicationErrorText(row.errorName, 120),
      message: sanitizeApplicationErrorText(row.message, 2000),
      stack: sanitizeApplicationErrorStack(row.stack),
      route: safeErrorRoute(row.route),
      method: /^[A-Z]{1,12}$/.test(row.method) ? row.method : "OTHER",
      occurrences: Math.max(1, Math.floor(Number(row.occurrences) || 1)),
    }));
    return { status: "available", entries, range, limit: MAX_LOG_RESULTS, maxStored: MAX_LOG_ROWS, retentionDays: LOG_RETENTION_DAYS };
  } catch {
    return { status: "unavailable", entries: [], range, limit: MAX_LOG_RESULTS, maxStored: MAX_LOG_ROWS, retentionDays: LOG_RETENTION_DAYS };
  }
}

/** Best-effort error capture for the React Router server error hook. */
export async function recordApplicationError(context: unknown, request: Request, error: unknown) {
  if (request.signal.aborted) return;
  const diagnostic = getApplicationErrorDiagnostic(error);
  if (!diagnostic) return;

  const route = safeErrorRoute(new URL(request.url).pathname);
  const method = /^[A-Z]{1,12}$/.test(request.method) ? request.method : "OTHER";
  const fingerprint = await hashFingerprint(`${route}\n${method}\n${diagnostic.name}\n${diagnostic.message}\n${diagnostic.stack?.split("\n").slice(0, 5).join("\n") ?? ""}`);
  const decision = rateLimiter.acquire(fingerprint);
  if (!decision.allowed) return;

  const record = {
    fingerprint,
    ...diagnostic,
    route,
    method,
    occurrences: decision.occurrences,
    requestReference: getRequestReference(request.headers.get("cf-ray")),
  };
  try {
    const db = getDbFromContext((context as LoaderContext | undefined) ?? {});
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('edicut:application_error_logs'))`);
      await tx.execute(sql`INSERT INTO application_error_logs
        (fingerprint, error_name, message, stack, route, method, occurrences, first_seen_at, last_seen_at)
        VALUES (${record.fingerprint}, ${record.name}, ${record.message}, ${record.stack}, ${record.route}, ${record.method}, ${record.occurrences}, now(), now())
        ON CONFLICT (fingerprint) DO UPDATE SET
          error_name = EXCLUDED.error_name,
          message = EXCLUDED.message,
          stack = COALESCE(EXCLUDED.stack, application_error_logs.stack),
          route = EXCLUDED.route,
          method = EXCLUDED.method,
          occurrences = LEAST(application_error_logs.occurrences + EXCLUDED.occurrences, 2147483647),
          last_seen_at = now()`);
      await tx.execute(sql`DELETE FROM application_error_logs
        WHERE id IN (
          SELECT id FROM application_error_logs
          WHERE last_seen_at < now() - (${LOG_RETENTION_DAYS} * interval '1 day')
          UNION
          SELECT id FROM (
            SELECT id FROM application_error_logs
            ORDER BY last_seen_at DESC
            OFFSET ${MAX_LOG_ROWS}
          ) AS excess
        )`);
    });
    console.error(JSON.stringify({
      event: "application_error",
      fingerprint,
      name: record.name,
      message: record.message,
      stack: record.stack,
      route,
      method,
      occurrences: record.occurrences,
      requestReference: record.requestReference,
    }));
  } catch {
    // Reporting must not interrupt the failed request. The fallback is still
    // scrubbed and rate-limited, and never serializes the original error object.
    console.error(JSON.stringify({
      event: "application_error_log_unavailable",
      fingerprint,
      route,
      method,
      requestReference: record.requestReference,
      name: diagnostic.name,
      message: diagnostic.message,
      stack: diagnostic.stack,
    }));
  }
}

/** Schedules durable logging without holding the response open on Cloudflare Workers. */
export function scheduleApplicationErrorCapture(context: unknown, request: Request, error: unknown) {
  const report = recordApplicationError(context, request, error).catch(() => undefined);
  const executionContext = (context as { cf?: { ctx?: { waitUntil?: (promise: Promise<unknown>) => void } } } | undefined)?.cf?.ctx;
  if (executionContext && typeof executionContext.waitUntil === "function") executionContext.waitUntil(report);
  else void report;
}
