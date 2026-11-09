import { describe, expect, it } from "vitest";
import { getRouteErrorDebugDetails, getRouteErrorPresentation, getSafeRouteErrorDiagnostics } from "./route-error-presentation";

describe("getRouteErrorPresentation", () => {
  it("offers a clear recovery message for a database timeout", () => {
    const error = new Error("Failed query: private SQL", { cause: new TypeError("fetch failed") });
    expect(getRouteErrorPresentation(error).title).toBe("We couldn’t connect just now");
    expect(getRouteErrorDebugDetails(error)).not.toContain("private SQL");
  });
  it("shows a safe recovery message for unexpected errors", () => {
    const presentation = getRouteErrorPresentation(new Error("database secret connection string"));

    expect(presentation.title).toBe("We couldn’t load this page");
    expect(presentation.message).not.toContain("database secret");
    expect(presentation.message).toContain("Please try again");
  });

  it("does not expose server error response bodies", () => {
    const presentation = getRouteErrorPresentation({
      status: 500,
      statusText: "Internal Server Error",
      data: "private database details",
      internal: true,
    });

    expect(presentation.label).toBe("Error 500");
    expect(presentation.message).not.toContain("private database details");
  });

  it("provides useful copy for missing pages", () => {
    const presentation = getRouteErrorPresentation({
      status: 404,
      statusText: "Not Found",
      data: "User not found",
      internal: true,
    });

    expect(presentation.title).toBe("Page not found");
    expect(presentation.message).toContain("address may be incorrect");
  });
});

describe("getRouteErrorDebugDetails", () => {
  it("includes details for the development-only diagnostics panel", () => {
    expect(getRouteErrorDebugDetails(new Error("test failure"))).toContain("Error: test failure");
  });
});

describe("getSafeRouteErrorDiagnostics", () => {
  it("accepts only bounded dashboard diagnostics", () => {
    expect(getSafeRouteErrorDiagnostics({
      status: 500,
      statusText: "Internal Server Error",
      data: { diagnostics: {
        requestReference: "a577a90c4ec041fc-DAC",
        route: "dashboard",
        stage: "client-balance",
        status: 500,
        errorType: "TypeError",
        databaseCode: "08006",
      } },
      internal: true,
    })).toEqual({
      requestReference: "a577a90c4ec041fc-DAC",
      route: "dashboard",
      stage: "client-balance",
      status: 500,
      errorType: "TypeError",
      databaseCode: "08006",
    });
  });

  it("rejects malformed or unapproved diagnostics", () => {
    expect(getSafeRouteErrorDiagnostics({
      status: 500,
      statusText: "Internal Server Error",
      data: { diagnostics: {
        requestReference: "private-account@example.test",
        route: "dashboard",
        stage: "raw-sql-query",
        status: 500,
        errorType: "TypeError",
      } },
      internal: true,
    })).toBeNull();
  });
});
