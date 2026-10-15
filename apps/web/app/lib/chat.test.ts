import { describe, expect, it } from "vitest";
import { canReadChatRoom, canSendChatMessage, chatId, chatMessagePayloadMatches, chatSenderName, formatChatLastActive, isChatParticipantRecentlyActive, mergeChatMessages, sanitizeChatMessageBody, validateChatMessage, validateSupportTicket, type ChatActor, type ChatRoom } from "./chat";
const actor = (id: string, role = "customer", admin = false): ChatActor => ({ id, key: `${admin ? "admin" : "user"}:${id}`, role, admin, name: id });
const room: ChatRoom = { id: "room", clientId: "client", clientName: "Client", clientEmail: "client@example.test", clientActive: true, kind: "manager", managerId: "manager", managerName: "Manager", managerActive: true, lastMessageAt: null, lastMessagePreview: null, updatedAt: "2026-10-08T00:00:00.000Z", unreadCount: 0, projectUnlocked: true, ticket: null };
const ticketRoom: ChatRoom = { ...room, kind: 'support', ticket: { number: 1, subject: 'Billing question', category: 'billing', priority: 'normal', status: 'waiting_support', closedAt: null, updatedAt: room.updatedAt } };
describe("chat room permissions", () => {
  it("isolates clients and assigned managers", () => { expect(canReadChatRoom(actor("client"), room)).toBe(true); expect(canReadChatRoom(actor("other"), room)).toBe(false); expect(canReadChatRoom(actor("manager", "project_manager"), room)).toBe(true); expect(canReadChatRoom(actor("other", "project_manager"), room)).toBe(false); });
  it("gives support only ticket rooms and admins paid groups", () => { expect(canReadChatRoom(actor("support", "customer_support"), room)).toBe(false); expect(canReadChatRoom(actor("support", "customer_support"), ticketRoom)).toBe(true); expect(canReadChatRoom(actor("admin", "admin", true), room)).toBe(true); });
  it("lets paid customers message admins before a manager joins", () => { expect(canSendChatMessage(actor("client"), { ...room, managerActive: false, managerId: null })).toBe(true); expect(canSendChatMessage(actor("client"), { ...ticketRoom, projectUnlocked: false })).toBe(true); });
  it('locks unpaid projects and hides them from admins and managers', () => { const locked = { ...room, projectUnlocked: false }; expect(canReadChatRoom(actor('client'), locked)).toBe(true); expect(canSendChatMessage(actor('client'), locked)).toBe(false); expect(canReadChatRoom(actor('admin', 'admin', true), locked)).toBe(false); expect(canReadChatRoom(actor('manager', 'project_manager'), locked)).toBe(false); });
  it('keeps closed tickets readable and blocks replies until reopened', () => { const closed = { ...ticketRoom, ticket: { ...ticketRoom.ticket!, status: 'closed' as const } }; expect(canReadChatRoom(actor('client'), closed)).toBe(true); expect(canSendChatMessage(actor('client'), closed)).toBe(false); expect(canSendChatMessage(actor('admin', 'admin', true), closed)).toBe(false); expect(canReadChatRoom(actor('other'), closed)).toBe(false); expect(canSendChatMessage(actor('client'), { ...ticketRoom, ticket: null })).toBe(false); });
  it("stops former managers and blocks inactive clients", () => { expect(canReadChatRoom(actor("manager", "project_manager"), { ...room, managerId: "replacement" })).toBe(false); expect(canReadChatRoom(actor("client"), { ...room, clientActive: false })).toBe(false); expect(canSendChatMessage(actor("admin", "admin", true), { ...room, clientActive: false })).toBe(false); });
});
describe("chat message validation", () => {
  const nonce = "10000000-0000-4000-8000-000000000001";
  it("bounds messages and allows file-only messages", () => { expect(validateChatMessage("", nonce)).toBeTruthy(); expect(validateChatMessage("", nonce, true)).toBeNull(); expect(validateChatMessage("a".repeat(4000), nonce)).toBeNull(); expect(validateChatMessage("a".repeat(4001), nonce)).toBeTruthy(); expect(validateChatMessage("ok", "invalid")).toBeTruthy(); });
  it("rejects malformed IDs before SQL casts", () => { expect(chatId(nonce)).toBe(true); expect(chatId("x' OR true--")).toBe(false); expect(chatId(null)).toBe(false); });
  it('validates categorized ticket subjects, descriptions, priorities and retry IDs', () => { expect(validateSupportTicket('Billing question', 'billing', 'Please explain my payment', 'normal', nonce)).toBeNull(); expect(validateSupportTicket('Hi', 'billing', 'Issue', 'normal', nonce)).toBeTruthy(); expect(validateSupportTicket('Subject', '__proto__', 'Issue', 'normal', nonce)).toBeTruthy(); expect(validateSupportTicket('Subject', 'billing', '', 'normal', nonce)).toBeTruthy(); expect(validateSupportTicket('Subject', 'billing', 'Issue', 'critical', nonce)).toBeTruthy(); expect(validateSupportTicket('Subject', 'billing', 'Issue', 'normal', 'invalid')).toBeTruthy(); });
  it("deduplicates realtime resyncs and updates edited messages", () => { const base = { id:"1", body:"first", createdAt:"2026-10-08T00:00:00Z" } as any; expect(mergeChatMessages([base], [{ ...base, body:"edited" }, { ...base, id:"2", createdAt:"2026-10-08T00:01:00Z" }])).toMatchObject([{ id:"1", body:"edited" }, { id:"2" }]); });
  it("only treats a nonce retry as the same send when text and attachment metadata match", () => {
    const saved = { body: "hello", attachment: { publicId: "stored-id", name: "brief.pdf", mime: "application/pdf", bytes: 12 } };
    expect(chatMessagePayloadMatches(saved, "hello", { name: "brief.pdf", mime: "application/pdf", bytes: 12 })).toBe(true);
    expect(chatMessagePayloadMatches(saved, "hello", null)).toBe(false);
    expect(chatMessagePayloadMatches({ body: "hello", attachment: null }, "hello", { name: "brief.pdf", mime: "application/pdf", bytes: 12 })).toBe(false);
    expect(chatMessagePayloadMatches(saved, "hello", { name: "other.pdf", mime: "application/pdf", bytes: 12 })).toBe(false);
    expect(chatMessagePayloadMatches({ body: "hello", attachment: null }, "hello", null)).toBe(true);
  });
});
describe("shared admin chat identity", () => {
  it("uses the team name for admin-authored messages and keeps other sender names", () => {
    expect(chatSenderName("admin", "jayga dorkar")).toBe("EdiCut Admin");
    expect(chatSenderName("project_manager", "Header Smoke")).toBe("Header Smoke");
    expect(chatSenderName("customer", "Alex Morgan")).toBe("Alex Morgan");
    expect(chatSenderName("project_manager", "manager@example.test")).toBe("Project manager");
    expect(chatSenderName("project_manager", null)).toBe("Project manager");
    expect(chatSenderName("customer_support", " ")).toBe("Customer support");
    expect(chatSenderName("customer", "client@example.test")).toBe("Client");
  });
  it("redacts email addresses in legacy assignment notices without changing user messages", () => {
    expect(sanitizeChatMessageBody("system:assignment", "manager@example.test joined the group.")).toBe("Project manager joined the group.");
    expect(sanitizeChatMessageBody("user:client", "Please email manager@example.test.")).toBe("Please email manager@example.test.");
  });
});
describe("chat participant activity", () => {
  const now = Date.parse("2026-10-09T12:00:00.000Z");
  it("formats recent activity and handles missing or invalid timestamps", () => {
    expect(formatChatLastActive(null, now)).toBe("No activity yet");
    expect(formatChatLastActive("not-a-date", now)).toBe("No activity yet");
    expect(formatChatLastActive("2026-10-09T11:59:40.000Z", now)).toBe("Active now");
    expect(formatChatLastActive("2026-10-09T11:54:00.000Z", now)).toBe("Active 6m ago");
    expect(formatChatLastActive("2026-10-09T09:00:00.000Z", now)).toBe("Active 3h ago");
    expect(formatChatLastActive("2026-10-07T12:00:00.000Z", now)).toBe("Active 2d ago");
  });
  it("marks recent group activity without treating future or old timestamps as recent", () => {
    expect(isChatParticipantRecentlyActive("2026-10-09T11:54:01.000Z", now)).toBe(true);
    expect(isChatParticipantRecentlyActive("2026-10-09T11:54:00.000Z", now)).toBe(false);
    expect(isChatParticipantRecentlyActive("2026-10-09T12:01:00.000Z", now)).toBe(false);
    expect(isChatParticipantRecentlyActive(null, now)).toBe(false);
  });
});
