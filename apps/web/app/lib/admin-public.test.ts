import { expect, it } from "vitest";
import { toPublicAdminUser, toPublicUser } from "./admin-public";

it("omits credentials and revocation metadata from customer and admin loader payloads", () => {
  const account = { id: "account", name: "Account", passwordHash: "private-password-hash", sessionVersion: "private-session-version" };
  for (const serialize of [toPublicUser, toPublicAdminUser]) {
    expect(serialize(account)).toEqual({ id: "account", name: "Account" });
  }
});
