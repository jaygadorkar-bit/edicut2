import { describe, expect, it } from "vitest";
import { getRequestReference } from "./request-reference";

describe("getRequestReference", () => {
  it("accepts a Cloudflare Ray ID", () => {
    expect(getRequestReference("a577a90c4ec041fc-DAC")).toBe("a577a90c4ec041fc-DAC");
  });

  it("rejects arbitrary or sensitive input", () => {
    expect(getRequestReference("user@example.test")).toBeNull();
    expect(getRequestReference("session=private-token")).toBeNull();
    expect(getRequestReference(null)).toBeNull();
  });
});
