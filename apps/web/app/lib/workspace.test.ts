import { describe, expect, it } from "vitest";
import { hasReturnedRows } from "./db.server";
import { formatRequestedCoverageNotes, getCheckoutTotal, SUBSCRIPTION_PACKAGES } from "./subscriptions";
import {
  isMissingWorkspaceSchema,
  isValidWorkspaceDate,
  isWorkspaceRecordId,
  parseBillingAmountToCents,
  parseWorkspaceShareUrl,
} from "./workspace";

describe("workspace validation", () => {
  it("detects returned rows from both supported Drizzle drivers", () => {
    expect(hasReturnedRows([{ id: "postgres-js" }])).toBe(true);
    expect(hasReturnedRows({ rows: [{ id: "neon-http" }] })).toBe(true);
    expect(hasReturnedRows([])).toBe(false);
    expect(hasReturnedRows({ rows: [] })).toBe(false);
  });

  it("accepts HTTPS share links and normalizes their URL", () => {
    expect(parseWorkspaceShareUrl(" https://drive.google.com/file/d/example ")).toBe(
      "https://drive.google.com/file/d/example",
    );
  });

  it("accepts UUID workspace record ids and rejects malformed ids", () => {
    expect(isWorkspaceRecordId("3f54d4c6-3ad2-4a8e-9fd5-1a5d39381ef1")).toBe(true);
    expect(isWorkspaceRecordId("not-a-uuid")).toBe(false);
    expect(isWorkspaceRecordId("3f54d4c6-3ad2-4a8e-9fd5-1a5d39381ef1;drop table users")).toBe(false);
  });

  it.each([
    "http://example.com/file",
    "https://user:password@example.com/file",
    "not a URL",
    `https://example.com/${"a".repeat(2050)}`,
  ])("rejects unsafe or malformed share link %s", (value) => {
    expect(parseWorkspaceShareUrl(value)).toBeNull();
  });

  it("recognizes missing workspace relations while ignoring other database errors", () => {
    expect(isMissingWorkspaceSchema({ code: "42P01", message: 'relation "workspace_projects" does not exist' })).toBe(true);
    expect(isMissingWorkspaceSchema({ code: "42P01", message: 'relation "users" does not exist' })).toBe(false);
    expect(isMissingWorkspaceSchema({ code: "42703", message: "column workspace_projects.invoice_url does not exist" })).toBe(true);
    expect(isMissingWorkspaceSchema({ code: "42703", message: 'column "email" does not exist' })).toBe(false);
    expect(isMissingWorkspaceSchema(new Error("connection reset"))).toBe(false);
  });

  it("accepts valid optional dates and rejects impossible calendar dates", () => {
    expect(isValidWorkspaceDate("")).toBe(true);
    expect(isValidWorkspaceDate("2026-10-01")).toBe(true);
    expect(isValidWorkspaceDate("2026-02-30")).toBe(false);
    expect(isValidWorkspaceDate("10/01/2026")).toBe(false);
  });

  it.each([
    ["80", 8000],
    ["120.5", 12050],
    ["0.01", 1],
  ])("converts billing amount %s into integer cents", (value, expected) => {
    expect(parseBillingAmountToCents(value)).toBe(expected);
  });

  it.each(["", "0", "-1", "1.999", "1e2", "12,50", "10000000", "  "]) (
    "rejects invalid or out-of-range billing amount %s",
    (value) => expect(parseBillingAmountToCents(value)).toBeNull(),
  );
});

describe("monthly package estimates", () => {
  const creator = SUBSCRIPTION_PACKAGES[0];

  it("adds selected monthly coverage to a package estimate", () => {
    expect(getCheckoutTotal(creator, { runtime: true, raw: true })).toBe(400);
    expect(getCheckoutTotal(creator, { runtime: true })).toBe(240);
  });

  it("keeps selected coverage in the team brief without overwriting customer notes", () => {
    expect(formatRequestedCoverageNotes(creator, "Use the reference intro", { runtime: true })).toBe(
      "Requested monthly coverage: 60 min finished runtime (+$160/mo estimate).\n\nCustomer brief:\nUse the reference intro",
    );
  });

  it("leaves notes unchanged when no optional coverage is selected", () => {
    expect(formatRequestedCoverageNotes(creator, "Use the reference intro")).toBe("Use the reference intro");
    expect(formatRequestedCoverageNotes(creator, "   ")).toBeNull();
  });
});
