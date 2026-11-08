import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("react-router", () => ({ useRouteLoaderData: () => ({ signOutCsrfToken: "signed-test-token" }) }));
import { ConfirmSignOutButton } from "./ConfirmSignOutButton";

describe("ConfirmSignOutButton", () => {
  it("keeps the sign-out action behind an accessible confirmation dialog", () => {
    const html = renderToStaticMarkup(
      <ConfirmSignOutButton buttonClassName="signout-trigger">
        <span aria-hidden="true">logout</span>
      </ConfirmSignOutButton>,
    );

    expect(html).toContain('type="button" class="signout-trigger"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Sign out?");
    expect(html).toContain("Are you sure you want to sign out of your account?");
    expect(html).toContain('<form action="/signout" method="post">');
    expect(html).toContain('name="_csrf" value="signed-test-token"');
    expect(html).toContain(">Cancel</button>");
    expect(html).toContain('type="submit"');
  });
});
