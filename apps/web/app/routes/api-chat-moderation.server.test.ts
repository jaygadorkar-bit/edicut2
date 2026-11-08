import { beforeEach, expect, it, vi } from "vitest";
import type { ActionFunctionArgs } from "react-router";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), store: vi.fn(), limit: vi.fn(), cleanup: vi.fn(), notify: vi.fn() }));
vi.mock("../lib/chat-access.server", () => ({ requireChatActor: mocks.actor }));
vi.mock("../lib/chat-store.server", () => ({ createChatStore: mocks.store, chatMigrationPaused: () => false, isMissingChatSchema: () => false }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: mocks.limit }));
vi.mock("../lib/chat-moderation.server", () => ({ cleanupRemovedChatAttachment: mocks.cleanup }));
vi.mock("../lib/chat-realtime.server", () => ({ notifyChatActors: mocks.notify, deferChatNotification: vi.fn() }));
import { action } from "./api-chat";
const roomId = "20000000-0000-4000-8000-000000000002", messageId = "30000000-0000-4000-8000-000000000003";
const admin = { id: "admin", key: "admin:admin", role: "admin", admin: true, name: "Admin" };
const file = { publicId: "fixture", name: "brief.pdf", mime: "application/pdf", bytes: 100 };
const room = { id: roomId, kind: "support", clientActive: true, ticket: { status: "closed" } };
let store: { getChatRoom: ReturnType<typeof vi.fn>; changeChatMessage: ReturnType<typeof vi.fn>; removeChatAttachment: ReturnType<typeof vi.fn>; finishChatAttachmentCleanup: ReturnType<typeof vi.fn>; chatRecipients: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.resetAllMocks();
  store = { getChatRoom: vi.fn().mockResolvedValue(room), changeChatMessage: vi.fn().mockResolvedValue({ id: messageId, body: "", deletedAt: "2026-10-23", attachment: file }),
    removeChatAttachment: vi.fn().mockResolvedValue({ message: { id: messageId, body: "Keep this", attachment: null, deletedAt: null }, attachment: file }),
    finishChatAttachmentCleanup: vi.fn(), chatRecipients: vi.fn().mockResolvedValue([admin.key]) };
  mocks.actor.mockResolvedValue({ actor: admin, db: {} }); mocks.store.mockReturnValue(store);
  mocks.limit.mockResolvedValue("allowed"); mocks.cleanup.mockResolvedValue(false);
});
async function run(intent: string, origin = "http://localhost:3002", id = messageId) {
  const form = new FormData(); form.set("intent", intent); form.set("roomId", roomId); form.set("messageId", id);
  if (intent === "edit") form.set("body", "Changed");
  return await action({ request: new Request("http://localhost:3002/api/chat?scope=admin", { method: "POST", headers: { Origin: origin }, body: form }), context: {}, params: {} } as ActionFunctionArgs) as Response;
}
const payload = async (response: Response) => await response.json() as { message: { attachment: unknown; body: string }; cleanupPending: boolean };
it("allows admin deletion in a closed ticket and removes attachment metadata from the response", async () => {
  const response = await run("delete");
  expect(response.status).toBe(200); expect((await payload(response)).message.attachment).toBeNull();
  expect(store.changeChatMessage).toHaveBeenCalledWith(admin, roomId, messageId, null);
  expect(store.finishChatAttachmentCleanup).toHaveBeenCalledWith(roomId, messageId, file);
  expect(mocks.notify).toHaveBeenCalledOnce();
});
it("removes an attachment while keeping the message text", async () => {
  const response = await run("remove-attachment");
  expect(response.status).toBe(200); expect((await payload(response)).message.body).toBe("Keep this");
  expect(store.changeChatMessage).not.toHaveBeenCalled(); expect(store.removeChatAttachment).toHaveBeenCalledOnce();
});
it("rejects attachment moderation from a non-admin even if its role string says admin", async () => {
  mocks.actor.mockResolvedValue({ actor: { ...admin, admin: false }, db: {} });
  expect((await run("remove-attachment")).status).toBe(403);
  expect(store.removeChatAttachment).not.toHaveBeenCalled(); expect(mocks.cleanup).not.toHaveBeenCalled();
});
it("does not give administrators editing access to closed ticket messages", async () => {
  expect((await run("edit")).status).toBe(403); expect(store.changeChatMessage).not.toHaveBeenCalled();
});
it("rejects cross-site and malformed mutation requests before deleting anything", async () => {
  expect((await run("delete", "https://attacker.example")).status).toBe(403);
  expect((await run("delete", "http://localhost:3002", "invalid")).status).toBe(400);
  expect(store.changeChatMessage).not.toHaveBeenCalled(); expect(mocks.cleanup).not.toHaveBeenCalled();
});
it("reports pending cleanup without restoring a hidden file or prematurely clearing storage metadata", async () => {
  mocks.cleanup.mockResolvedValue(true);
  const response = await run("remove-attachment"); const result = await payload(response);
  expect(response.status).toBe(200); expect(result.cleanupPending).toBe(true); expect(result.message.attachment).toBeNull();
  expect(store.finishChatAttachmentCleanup).not.toHaveBeenCalled(); expect(mocks.notify).toHaveBeenCalledOnce();
});
it("does not delete storage when room or message authorization fails", async () => {
  store.changeChatMessage.mockRejectedValue(new Response("Forbidden", { status: 403 }));
  expect((await run("delete")).status).toBe(403); expect(mocks.cleanup).not.toHaveBeenCalled();
});
