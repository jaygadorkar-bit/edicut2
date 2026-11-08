import { beforeEach, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
import type { LoaderContext } from "../types";
const mocks = vi.hoisted(() => ({ remove: vi.fn(), queue: vi.fn(), done: vi.fn() }));
vi.mock("./chat-files.server", () => ({ deleteChatFile: mocks.remove }));
vi.mock("./chat-attachment-uploads.server", () => ({ queueChatAttachmentCleanup: mocks.queue, markChatAttachmentDeleted: mocks.done }));
import { cleanupRemovedChatAttachment } from "./chat-moderation.server";
const attachment = { publicId: "fixture", driveFileId: "synthetic-drive-file", name: "brief.pdf", mime: "application/pdf", bytes: 100 };
const db = {} as DatabaseClient, context = {} as LoaderContext;
beforeEach(() => { vi.resetAllMocks(); });
it("queues cleanup before deleting the stored file and only then releases its quota", async () => {
  expect(await cleanupRemovedChatAttachment(attachment, db, context)).toBe(false);
  expect(mocks.queue.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
  expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.done.mock.invocationCallOrder[0]);
});
it("keeps cleanup pending and quota charged when storage fails", async () => {
  mocks.remove.mockRejectedValue(new Error("Synthetic storage failure"));
  expect(await cleanupRemovedChatAttachment(attachment, db, context)).toBe(true);
  expect(mocks.queue).toHaveBeenCalledOnce(); expect(mocks.done).not.toHaveBeenCalled();
});
it("still attempts storage cleanup when the retry queue is unavailable", async () => {
  mocks.queue.mockRejectedValue(new Error("Synthetic database failure"));
  expect(await cleanupRemovedChatAttachment(attachment, db, context)).toBe(false);
  expect(mocks.remove).toHaveBeenCalledOnce(); expect(mocks.done).toHaveBeenCalledOnce();
});
it("does not contact storage for a text-only message", async () => {
  expect(await cleanupRemovedChatAttachment(null, db, context)).toBe(false);
  expect(mocks.queue).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
