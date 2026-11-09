import { describe, expect, it } from "vitest";
import { action, loader } from "./signin";

describe("disabled customer authentication", () => {
  it("shows the Google-only sign-in page without an error", () => expect(loader({ request: new Request("http://localhost:3002/signin"), context: {}, params: {} } as never)).toEqual({ error: null }));
  it("rejects password sign-in and registration", async () => {
    const response = action();
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("temporarily unavailable");
  });
});
