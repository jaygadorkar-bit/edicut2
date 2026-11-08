import { describe, expect, it } from "vitest";
import { countAvailableSoftwareUpdates, getSoftwareUpdateStatus } from "./admin-software-versions";
import { getLatestSupportedPostgresVersion } from "./admin-software-versions.server";

describe("software version status", () => {
  it("recognizes matching versions including an LTS label", () => {
    expect(getSoftwareUpdateStatus({ currentVersion: "26.13.0 LTS", latestVersion: "26.13.0 LTS", latestStatus: "automatic" })).toBe("up-to-date");
  });

  it("recognizes a newer latest version for three-part and PostgreSQL versions", () => {
    expect(getSoftwareUpdateStatus({ currentVersion: "2.118.0", latestVersion: "2.119.0", latestStatus: "automatic" })).toBe("out-of-date");
    expect(getSoftwareUpdateStatus({ currentVersion: "17.6", latestVersion: "17.11", latestStatus: "automatic" })).toBe("out-of-date");
    expect(getSoftwareUpdateStatus({ currentVersion: "17.11", latestVersion: "17.11", latestStatus: "automatic" })).toBe("up-to-date");
  });

  it("checks the latest supported PostgreSQL minor for the installed major", () => {
    const releases = "<table><tr><th>18</th><td>18.6</td><td>Yes</td></tr><tr><th>17</th><td>17.11</td><td>Yes</td></tr></table>";
    expect(getLatestSupportedPostgresVersion(releases, "17.11")).toBe("17.11");
    expect(getLatestSupportedPostgresVersion(releases, "18.6")).toBe("18.6");
  });

  it("treats a current version newer than the listed stable release as up to date", () => {
    expect(getSoftwareUpdateStatus({ currentVersion: "8.6.0", latestVersion: "8.5.1", latestStatus: "automatic" })).toBe("up-to-date");
  });

  it("does not report stale references or invalid versions as current", () => {
    expect(getSoftwareUpdateStatus({ currentVersion: "2.118.0", latestVersion: "2.118.0", latestStatus: "saved-reference" })).toBe("unavailable");
    expect(getSoftwareUpdateStatus({ currentVersion: "unknown", latestVersion: "2.119.0", latestStatus: "automatic" })).toBe("unavailable");
  });

  it("counts only releases verified as newer than the installed version", () => {
    expect(countAvailableSoftwareUpdates([
      { currentVersion: "2.118.0", latestVersion: "2.119.0", latestStatus: "automatic" },
      { currentVersion: "8.5.1", latestVersion: "8.5.1", latestStatus: "automatic" },
      { currentVersion: "2.117.0", latestVersion: "2.119.0", latestStatus: "saved-reference" },
    ])).toBe(1);
  });
});
