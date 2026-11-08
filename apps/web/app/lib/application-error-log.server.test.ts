import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), transaction: vi.fn(), execute: vi.fn() }));
vi.mock("./db.server", () => ({ getDbFromContext: mocks.getDb }));
import {
  createApplicationErrorLogRateLimiter,
  getApplicationErrorDiagnostic,
  recordApplicationError,
  safeErrorRoute,
  sanitizeApplicationErrorText,
} from "./application-error-log.server";

describe("application error log safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (callback: (tx: { execute: typeof mocks.execute }) => unknown) => callback({ execute: mocks.execute }));
    mocks.getDb.mockReturnValue({ transaction: mocks.transaction });
  });

  it("removes credentials, request identifiers, and URLs from diagnostic text", () => {
    const text = sanitizeApplicationErrorText(
      "Invalid token=secret-value for jaygadorkar@example.com at https://example.test/reset?token=private, id 7a18f058-5fd3-4410-9fbb-6715be920cb4, phone +880 1712-345678, ip 2001:db8::1",
    );

    expect(text).not.toContain("secret-value");
    expect(text).not.toContain("jaygadorkar@example.com");
    expect(text).not.toContain("private");
    expect(text).not.toContain("7a18f058");
    expect(text).toContain("[redacted]");
    expect(text).toContain("[email]");
    expect(text).toContain("[url]");
    expect(text).not.toContain("1712-345678");
    expect(text).not.toContain("2001:db8");
  });

  it("normalizes dynamic route segments before storing them", () => {
    expect(safeErrorRoute("/site/node-logmin/users/7a18f058-5fd3-4410-9fbb-6715be920cb4"))
      .toBe("/site/node-logmin/users/:param");
    expect(safeErrorRoute("/forgot-password/AbCdEf0123456789"))
      .toBe("/forgot-password/:param");
  });

  it("ignores expected client errors and aborted requests", () => {
    expect(getApplicationErrorDiagnostic(new Response("private response body", { status: 404 }))).toBeNull();
    expect(getApplicationErrorDiagnostic(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBeNull();
  });

  it("records a 500 response without retaining its response body", () => {
    expect(getApplicationErrorDiagnostic(new Response("secret response detail", { status: 500 }))).toEqual({
      name: "Response",
      message: "Route returned HTTP 500",
      stack: null,
    });
    expect(getApplicationErrorDiagnostic(new Response("known outage", { status: 503 }))).toBeNull();
  });

  it("keeps SQLSTATE for database diagnosis but drops query text and parameters", () => {
    const error = Object.assign(new Error("Failed query: INSERT INTO users VALUES ('person@example.test') params: very-private-password"), { code: "23505" });
    const diagnostic = getApplicationErrorDiagnostic(error);

    expect(diagnostic?.message).toContain("SQLSTATE 23505");
    expect(diagnostic?.message).not.toContain("INSERT INTO users");
    expect(diagnostic?.stack).not.toContain("person@example.test");
    expect(diagnostic?.stack).not.toContain("very-private-password");
  });

  it("stores a bounded scrubbed exception aggregate without request query data", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = new Request("https://edicut.test/site/node-logmin/projects/123456789?token=query-secret");
    await recordApplicationError({ cf: { env: {} } }, request, new Error("Could not read password=database-secret for jane@example.test"));

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledTimes(3);
    const queries = mocks.execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query));
    expect(queries[0].sql).toContain("pg_advisory_xact_lock");
    expect(queries[1].sql).toContain("INSERT INTO application_error_logs");
    expect(queries[2].sql).toContain("OFFSET");
    const recorded = JSON.stringify(queries.flatMap((query) => query.params));
    expect(recorded).not.toContain("query-secret");
    expect(recorded).not.toContain("database-secret");
    expect(recorded).not.toContain("jane@example.test");
    expect(consoleError.mock.calls[0]?.[0]).not.toContain("database-secret");
    expect(consoleError.mock.calls[0]?.[0]).not.toContain("query-secret");
    consoleError.mockRestore();
  });

  it("deduplicates repeated signatures and caps unique reports and in-memory entries", () => {
    const limiter = createApplicationErrorLogRateLimiter({ maxSignatures: 2, maxWritesPerMinute: 2, dedupeWindowMs: 100 });
    expect(limiter.acquire("a", 1_000)).toEqual({ allowed: true, occurrences: 1 });
    expect(limiter.acquire("a", 1_001)).toEqual({ allowed: false, suppressed: 1 });
    expect(limiter.acquire("a", 1_101)).toEqual({ allowed: true, occurrences: 2 });
    expect(limiter.acquire("b", 61_102)).toEqual({ allowed: true, occurrences: 1 });
    expect(limiter.acquire("d", 61_103)).toEqual({ allowed: true, occurrences: 1 });
    expect(limiter.acquire("c", 61_104)).toMatchObject({ allowed: false });
    expect(limiter.size).toBeLessThanOrEqual(2);
  });
});
