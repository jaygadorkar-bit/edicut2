import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
import { chatAccessRecipients, deferChatNotification, notifyChatAccessChange } from "./chat-realtime.server";
const id = "10000000-0000-4000-8000-000000000001";
afterEach(() => { globalThis.__edicutChatNotify = undefined; vi.restoreAllMocks(); });
describe("access changes invalidate live chat", () => {
  it("deduplicates recipients and includes removed accounts explicitly", async () => {
    const execute = vi.fn(async () => [{ key: "admin:team" }, { key: "admin:team" }, { key: "user:client" }]);
    const keys = await chatAccessRecipients({ execute } as unknown as DatabaseClient, [id]);
    expect(keys).toEqual(["admin:team", "user:client", `user:${id}`]); expect(execute).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed IDs before constructing an access query", async () => {
    const execute = vi.fn();
    expect(await chatAccessRecipients({ execute } as unknown as DatabaseClient, ["invalid"])).toEqual([]);
    expect(await chatAccessRecipients({ execute } as unknown as DatabaseClient, [], "invalid")).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
  it("publishes only refresh notices with no account or message payload", async () => {
    const execute = vi.fn(async () => [{ key: "admin:team" }, { key: "user:client" }]);
    const notify = vi.fn(); globalThis.__edicutChatNotify = notify;
    await notifyChatAccessChange({ execute } as unknown as DatabaseClient, undefined, { subscriptionId: id });
    expect(notify).toHaveBeenCalledExactlyOnceWith(["admin:team", "user:client"], { type: "refresh" });
  });
  it("uses captured recipients after hard deletion removes room links", async () => {
    const execute = vi.fn(), notify = vi.fn(); globalThis.__edicutChatNotify = notify;
    await notifyChatAccessChange({ execute } as unknown as DatabaseClient, undefined, { recipientKeys: ["user:former-manager", "user:client"] });
    expect(execute).not.toHaveBeenCalled(); expect(notify).toHaveBeenCalledExactlyOnceWith(["user:former-manager", "user:client"], { type: "refresh" });
  });
  it("keeps committed account changes successful when notification delivery fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const execute = vi.fn(async () => { throw new Error("provider-private-detail"); });
    await expect(notifyChatAccessChange({ execute } as unknown as DatabaseClient, undefined, { userIds: [id] })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith("Chat access notification interrupted; clients will resync.");
  });
});

describe("deferred chat notifications", () => {
  it("registers socket delivery with the Worker execution context", async () => {
    const pending: Promise<unknown>[] = [], send = vi.fn(async () => {});
    const context = { cf: { ctx: { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } } };
    deferChatNotification(context as never, send);
    expect(pending).toHaveLength(1);
    await pending[0];
    expect(send).toHaveBeenCalledExactlyOnceWith();
  });

  it("contains delivery failures so a saved message still returns successfully", async () => {
    const pending: Promise<unknown>[] = [], warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const context = { cf: { ctx: { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } } };
    deferChatNotification(context as never, async () => { throw new Error("socket unavailable"); });
    await pending[0];
    expect(warn).toHaveBeenCalledExactlyOnceWith("Chat notification interrupted; connected clients will resync.");
  });
});
