import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCloudflareDbMock, createNodeDbMock } = vi.hoisted(() => ({
  createCloudflareDbMock: vi.fn(),
  createNodeDbMock: vi.fn(),
}));
vi.mock("@edicut/db/client", () => ({
  createCloudflareDb: createCloudflareDbMock,
  createNodeDb: createNodeDbMock,
}));

import { getDatabaseUrlFromContext, getDbFromContext } from "./db.server";

describe("getDatabaseUrlFromContext", () => {
  it("prefers the production Hyperdrive connection over direct Supabase URLs", () => {
    expect(
      getDatabaseUrlFromContext({
        cloudflare: {
          env: {
            SUPABASE_HYPERDRIVE: {
              connectionString: "postgresql://hyperdrive-supabase",
            },
            SUPABASE_DATABASE_URL: "postgresql://supabase-session-pooler",
            DATABASE_URL: "postgresql://legacy-db",
          },
        },
      }),
    ).toBe("postgresql://hyperdrive-supabase");
  });

  it("prefers the configured Cloudflare Supabase session-pooler URL", () => {
    expect(
      getDatabaseUrlFromContext({
        cf: {
          env: {
            DATABASE_URL: "postgresql://legacy-db",
            SUPABASE_DATABASE_URL: "postgresql://supabase-session-pooler",
          },
        },
      }),
    ).toBe("postgresql://supabase-session-pooler");
  });

  it("fails closed instead of using a legacy Worker DATABASE_URL", () => {
    expect(() =>
      getDatabaseUrlFromContext({
        cf: { env: { DATABASE_URL: "postgresql://legacy-db" } },
      }),
    ).toThrow("Supabase Postgres is not configured for this Cloudflare Worker.");
  });

  it("uses the explicit Supabase URL for Node runtimes", () => {
    expect(
      getDatabaseUrlFromContext(
        {},
        {
          nodeEnv: {
            SUPABASE_DATABASE_URL: "postgresql://supabase-node",
            DATABASE_URL: "postgresql://legacy-db",
          },
          viteEnv: {},
        },
      ),
    ).toBe("postgresql://supabase-node");
  });

  it("keeps local Postgres development available without accepting a hosted legacy URL", () => {
    expect(
      getDatabaseUrlFromContext(
        {},
        { nodeEnv: { DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }, viteEnv: {} },
      ),
    ).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

    expect(() =>
      getDatabaseUrlFromContext(
        {},
        { nodeEnv: { DATABASE_URL: "postgresql://legacy-hosted-db" }, viteEnv: {} },
      ),
    ).toThrow("Supabase Postgres is not configured.");
  });

  it("does not silently select the built-in local database when configuration is missing", () => {
    expect(() =>
      getDatabaseUrlFromContext({}, { nodeEnv: {}, viteEnv: {} }),
    ).toThrow("Supabase Postgres is not configured.");
  });
});

describe("getDbFromContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses one Hyperdrive client within a request and creates a fresh client for the next request", () => {
    const firstDb = { request: 1 };
    const secondDb = { request: 2 };
    createCloudflareDbMock.mockReturnValueOnce(firstDb).mockReturnValueOnce(secondDb);
    const firstRequest = { cf: { env: { SUPABASE_HYPERDRIVE: { connectionString: "postgresql://hyperdrive" } } } };
    const secondRequest = { cf: { env: { SUPABASE_HYPERDRIVE: { connectionString: "postgresql://hyperdrive" } } } };

    expect(getDbFromContext(firstRequest)).toBe(firstDb);
    expect(getDbFromContext(firstRequest)).toBe(firstDb);
    expect(getDbFromContext(secondRequest)).toBe(secondDb);
    expect(createCloudflareDbMock).toHaveBeenCalledTimes(2);
  });
});
