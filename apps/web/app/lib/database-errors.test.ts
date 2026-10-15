import { describe, expect, it, vi } from "vitest";
import { isDatabaseConnectionError, retryDatabaseRead } from "./database-errors";

describe("database connection recovery", () => {
  const outage = new Error("Failed query: private SQL", { cause: { sourceError: new TypeError("fetch failed", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }) } });
  it("recognizes nested driver connection failures without masking SQL failures", () => {
    expect(isDatabaseConnectionError(outage)).toBe(true);
    expect(isDatabaseConnectionError({ code: "42703", message: "missing column" })).toBe(false);
    expect(isDatabaseConnectionError({ code: "42501", message: "permission denied" })).toBe(false);
  });
  it("retries a failed read once", async () => {
    const read = vi.fn().mockRejectedValueOnce(outage).mockResolvedValue("recovered");
    await expect(retryDatabaseRead(read)).resolves.toBe("recovered");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("stops after the retry and does not retry non-connection errors", async () => {
    const read = vi.fn().mockRejectedValue(outage);
    await expect(retryDatabaseRead(read)).rejects.toBe(outage);
    expect(read).toHaveBeenCalledTimes(2);
    read.mockClear().mockRejectedValue(new Error("bad SQL"));
    await expect(retryDatabaseRead(read)).rejects.toThrow("bad SQL");
    expect(read).toHaveBeenCalledOnce();
  });
});
