import { describe, expect, it, vi } from "vitest";
import type { ChatAuthority } from "./chat-authority.server";
import { createD1ChatStore } from "./chat-d1.server";
import type { ChatActor, ChatMessage } from "./chat";

const actorId = "10000000-0000-4000-8000-000000000001";
const roomId = "20000000-0000-4000-8000-000000000002";
const nonce = "30000000-0000-4000-8000-000000000003";
const actor: ChatActor = { id: actorId, key: `user:${actorId}`, name: "Alex", role: "customer", admin: false };

describe("D1 chat message write batching", () => {
  it("initializes customer rooms in one batch and limits preview repairs to authorized rooms", async () => {
    const prepare = vi.fn(() => {
      const statement = { bind: vi.fn(() => statement) };
      return statement as unknown as D1PreparedStatement;
    });
    const batch = vi.fn().mockResolvedValue([]);
    const authority = vi.fn(async (): Promise<ChatAuthority> => ({
      users: [{ id: actorId, email: "alex@example.test", name: actor.name, role: actor.role, active: true, deletedAt: null, paid: true }], admins: [],
    }));
    await createD1ChatStore({ prepare, batch } as unknown as D1Database, authority).ensureClientChatRooms(actor);
    expect(batch).toHaveBeenCalledOnce(); expect(batch.mock.calls[0][0]).toHaveLength(5);
    const repair = prepare.mock.calls.at(-1)! as unknown as [string];
    expect(repair[0]).toContain("chat_rooms.id IN (SELECT r.id");
    expect(repair[0]).toContain("r.client_id=?");
    expect(authority).toHaveBeenCalledExactlyOnceWith(actor);
  });

  it("copies identities, saves the message, and reads it in one D1 batch", async () => {
    const saved: ChatMessage = {
      id: "40000000-0000-4000-8000-000000000004", roomId, actorKey: actor.key, senderName: actor.name,
      senderRole: actor.role, body: "Hello", clientNonce: nonce, createdAt: "2026-10-09T10:00:00.000Z",
      editedAt: null, deletedAt: null, attachment: null,
    };
    const prepare = vi.fn(() => {
      const statement = { bind: vi.fn(() => statement), all: vi.fn(), first: vi.fn(), run: vi.fn() };
      return statement as unknown as D1PreparedStatement;
    });
    const batch = vi.fn(async (statements: D1PreparedStatement[]) => statements.map((_, index) => ({
      success: true, results: index === statements.length - 1 ? [saved] : [],
    } as unknown as D1Result)));
    const authority = vi.fn(async (): Promise<ChatAuthority> => ({
      users: [{ id: actorId, email: "alex@example.test", name: actor.name, role: actor.role, active: true, deletedAt: null, paid: true }],
      admins: [],
    }));
    const store = createD1ChatStore({ prepare, batch } as unknown as D1Database, authority);

    await expect(store.sendChatMessage(actor, roomId, saved.body, nonce)).resolves.toEqual(saved);
    expect(authority).toHaveBeenCalledTimes(1);
    expect(authority).toHaveBeenCalledWith(actor);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(6);
  });
});
