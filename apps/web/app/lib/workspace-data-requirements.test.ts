import { describe, expect, it } from "vitest";
import { getWorkspaceDataRequirements } from "./workspace-data-requirements";

describe("getWorkspaceDataRequirements", () => {
  it.each([
    ["projects", { projects: true, projectNames: false, files: false, reviews: false }],
    ["reviews", { projects: false, projectNames: true, files: false, reviews: true }],
    ["uploads", { projects: false, projectNames: true, files: true, reviews: false }],
    ["billing", { projects: true, projectNames: false, files: false, reviews: false }],
    ["affiliates", { projects: false, projectNames: false, files: false, reviews: false }],
    ["settings", { projects: false, projectNames: false, files: false, reviews: false }],
  ])("loads only records needed for the %s section", (section, expected) => {
    expect(getWorkspaceDataRequirements(section)).toEqual(expected);
  });
});
