import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessageActions } from "./ChatMessageActions";
import { canDeleteChatMessage, type ChatActor, type ChatMessage, type ChatRoom } from "../lib/chat";

const admin: ChatActor = { id: "admin", key: "admin:admin", role: "admin", name: "Admin", admin: true };
const client: ChatActor = { id: "client", key: "user:client", role: "customer", name: "Client", admin: false };
const room = { kind: "manager", clientId: client.id, clientActive: true, projectUnlocked: true } as ChatRoom;
const message = { id: "message", actorKey: client.key, senderRole: "customer", body: "Keep this text", deletedAt: null,
  attachment: { publicId: "fixture", name: "brief.pdf", mime: "application/pdf", bytes: 100 } } as ChatMessage;
const render = (actor: ChatActor, changes: Partial<ChatMessage> = {}, selected = room, pending = false) => renderToStaticMarkup(
  <ChatMessageActions actor={actor} room={selected} message={{ ...message, ...changes }} pending={pending} onDelete={() => {}} onEdit={() => {}} onRemoveAttachment={() => {}} />,
);
describe("chat moderation menu", () => {
  it("lets administrators remove another author's message or attachment, but not edit its text", () => {
    const html = render(admin);
    expect(html).toContain("Delete message"); expect(html).toContain("Remove attachment");
    expect(html).not.toContain("Edit message"); expect(html).toContain("<details");
  });
  it("keeps sender editing and deleting while hiding moderation from other customers", () => {
    expect(render(client)).toContain("Edit message"); expect(render(client)).toContain("Delete message");
    expect(render(client)).not.toContain("Remove attachment");
    expect(render({ ...client, id: "other", key: "user:other" })).toBe("");
    expect(render({ ...client, role: "admin" })).not.toContain("Remove attachment");
  });
  it("allows admin moderation in closed tickets and inactive client conversations", () => {
    const closed = { ...room, kind: "support", ticket: { status: "closed" } } as ChatRoom;
    expect(render(admin, {}, closed)).toContain("Remove attachment");
    expect(render(client, {}, closed)).toBe("");
    expect(canDeleteChatMessage(admin, { ...room, clientActive: false }, message)).toBe(true);
  });
  it("protects system history, deleted messages, pending sends, and locked project rooms", () => {
    expect(render(admin, { senderRole: "system" })).toBe("");
    expect(render(admin, { deletedAt: "2026-10-23T00:00:00Z" })).toBe("");
    expect(render(admin, {}, room, true)).toBe("");
    expect(render(admin, {}, { ...room, projectUnlocked: false })).toBe("");
  });
});
