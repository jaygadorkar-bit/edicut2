import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs } from "react-router";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getDbFromContext: vi.fn(),
}));

vi.mock("../lib/db.server", () => ({
  getDbFromContext: mocks.getDbFromContext,
}));

import { loader } from "./health";

describe("health loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDbFromContext.mockReturnValue({ execute: mocks.execute });
    mocks.execute.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  });

  it("reports healthy only after the database responds", async () => {
    const response = await loader({ context: {} } as LoaderFunctionArgs);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      service: "web",
      database: "connected",
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("returns a sanitized service-unavailable response when the database fails", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("private connection details"));

    const response = await loader({ context: {} } as LoaderFunctionArgs);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      service: "web",
      database: "unavailable",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});
