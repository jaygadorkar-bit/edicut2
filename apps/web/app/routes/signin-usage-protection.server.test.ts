import { describe, expect, it } from "vitest";
import { action } from "./signin";

describe("disabled sign-in abuse surface", () => {
  it("rejects requests before touching authentication or rate limit services", () => {
    expect(action().status).toBe(503);
  });
});
