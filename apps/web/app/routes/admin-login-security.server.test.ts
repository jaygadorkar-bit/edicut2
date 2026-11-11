import { describe, expect, it } from "vitest";
import * as adminLoginRoute from "./admin-login";

describe("admin login policy", () => {
  it("does not expose an email and password authentication action", () => {
    expect(adminLoginRoute).not.toHaveProperty("action");
  });
});
