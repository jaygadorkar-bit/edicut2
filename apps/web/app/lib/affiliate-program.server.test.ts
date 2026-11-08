import { describe, expect, it } from "vitest";
import { isMissingAffiliateSchema } from "./affiliate-program.server";

describe("isMissingAffiliateSchema", () => {
  it("recognizes missing affiliate columns through a Postgres.js sourceError wrapper", () => {
    const databaseError = Object.assign(new Error('column "whatsapp_phone" of relation "affiliate_applications" does not exist'), {
      code: "42703",
    });

    expect(isMissingAffiliateSchema({ message: "Database request failed", sourceError: databaseError })).toBe(true);
  });

  it("recognizes missing affiliate tables through nested causes", () => {
    const databaseError = Object.assign(new Error('relation "affiliate_applications" does not exist'), {
      code: "42P01",
    });

    expect(isMissingAffiliateSchema(new Error("Failed query", { cause: databaseError }))).toBe(true);
  });

  it("does not hide unrelated database errors", () => {
    expect(isMissingAffiliateSchema(Object.assign(new Error("connection refused"), { code: "08006" }))).toBe(false);
    expect(isMissingAffiliateSchema(Object.assign(new Error('relation "users" does not exist'), { code: "42P01" }))).toBe(false);
  });
});
