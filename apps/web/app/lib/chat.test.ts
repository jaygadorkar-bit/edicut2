import { describe, expect, it } from "vitest";
import { canReadChatRoom, canSendChatMessage, chatId, mergeChatMessages, validateChatMessage, type ChatActor, type ChatRoom } from "./chat";
const actor = (id: string, role = "customer", admin = false): ChatActor => ({ id, key: `${admin ? "admin" : "user"}:${id}`, role, admin, name: id });
const room: ChatRoom = { id: "room", clientId: "client", clientName: "Client", clientEmail: "client@example.test", clientActive: true, kind: "manager", managerId: "manager", managerName: "Manager", managerActive: true, lastMessageAt: null, lastMessagePreview: null, updatedAt: "2026-10-08T00:00:00.000Z", unreadCount: 0 };
describe("chat room permissions", () => {
  it("isolates clients and assigned managers", () => { expect(canReadChatRoom(actor("client"), room)).toBe(true); expect(canReadChatRoom(actor("other"), room)).toBe(false); expect(canReadChatRoom(actor("manager", "project_manager"), room)).toBe(true); expect(canReadChatRoom(actor("other", "project_manager"), room)).toBe(false); });
  it("gives support only support rooms and admins all rooms", () => { expect(canReadChatRoom(actor("support", "customer_support"), room)).toBe(false); expect(canReadChatRoom(actor("support", "customer_support"), { ...room, kind: "support" })).toBe(true); expect(canReadChatRoom(actor("admin", "admin", true), room)).toBe(true); });
  it("blocks unassigned manager messages, while support works", () => { expect(canSendChatMessage(actor("client"), { ...room, managerActive: false })).toBe(false); expect(canSendChatMessage(actor("client"), { ...room, kind: "support", managerActive: false })).toBe(true); });
  it("stops former managers and blocks inactive clients", () => { expect(canReadChatRoom(actor("manager", "project_manager"), { ...room, managerId: "replacement" })).toBe(false); expect(canReadChatRoom(actor("client"), { ...room, clientActive: false })).toBe(false); expect(canSendChatMessage(actor("admin", "admin", true), { ...room, clientActive: false })).toBe(false); });
});
describe("chat message validation", () => {
  const nonce = "10000000-0000-4000-8000-000000000001";
  it("bounds messages and allows file-only messages", () => { expect(validateChatMessage("", nonce)).toBeTruthy(); expect(validateChatMessage("", nonce, true)).toBeNull(); expect(validateChatMessage("a".repeat(4000), nonce)).toBeNull(); expect(validateChatMessage("a".repeat(4001), nonce)).toBeTruthy(); expect(validateChatMessage("ok", "invalid")).toBeTruthy(); });
  it("rejects malformed IDs before SQL casts", () => { expect(chatId(nonce)).toBe(true); expect(chatId("x' OR true--")).toBe(false); expect(chatId(null)).toBe(false); });
  it("deduplicates realtime resyncs and updates edited messages", () => { const base = { id:"1", body:"first", createdAt:"2026-10-08T00:00:00Z" } as any; expect(mergeChatMessages([base], [{ ...base, body:"edited" }, { ...base, id:"2", createdAt:"2026-10-08T00:01:00Z" }])).toMatchObject([{ id:"1", body:"edited" }, { id:"2" }]); });
});
