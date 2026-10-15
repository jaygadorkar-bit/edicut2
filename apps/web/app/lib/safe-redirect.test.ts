import { describe, expect, it } from "vitest";
import { ADMIN_BASE_PATH } from "./admin-paths";
import { safeAdminRedirect, safeRedirectPath } from "./safe-redirect";

describe("redirect boundaries", () => {
  it.each(["//attacker.test", "/\\attacker.test", "/\t/attacker.test", "/\n/attacker.test", "https://attacker.test", "javascript:alert(1)", null, new File(["/dashboard"], "redirect")])("rejects an unsafe or non-text return path: %s", value => {
    expect(safeRedirectPath(value)).toBe("/dashboard");
  });
  it("preserves internal queries, fragments and Unicode after normalization", () => {
    expect(safeRedirectPath("/dashboard/../dashboard/projects?page=2#recent")).toBe("/dashboard/projects?page=2#recent");
    expect(safeRedirectPath("/contact?name=বাংলা")).toBe(new URL("/contact?name=বাংলা", "https://edicut.com").pathname + new URL("/contact?name=বাংলা", "https://edicut.com").search);
  });
  it.each([`${ADMIN_BASE_PATH}/../..`, `${ADMIN_BASE_PATH}/%2e%2e/%2e%2e`, `${ADMIN_BASE_PATH}evil`, `${ADMIN_BASE_PATH}/login`, `${ADMIN_BASE_PATH}/login/child`, `${ADMIN_BASE_PATH}\\..\\..`])("keeps normalized admin redirects inside the panel: %s", value => {
    expect(safeAdminRedirect(value)).toBe(ADMIN_BASE_PATH);
  });
  it("retains a valid admin return path and filters", () => {
    expect(safeAdminRedirect(`${ADMIN_BASE_PATH}?tab=users&page=2`)).toBe(`${ADMIN_BASE_PATH}?tab=users&page=2`);
  });
});
