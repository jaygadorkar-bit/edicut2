import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), env: vi.fn(), sign: vi.fn(), driveToken: vi.fn(), driveDownload: vi.fn(), driveDelete: vi.fn() }));
vi.mock("./cloudinary.server", () => ({ requireCloudinaryEnv: mocks.env, signUpload: mocks.sign }));
vi.mock("./google-drive-storage.server", async importOriginal => {
  const actual = await importOriginal<typeof import("./google-drive-storage.server")>();
  return { ...actual, googleDriveAccessToken: mocks.driveToken, downloadGoogleDriveFile: mocks.driveDownload, deleteGoogleDriveFile: mocks.driveDelete };
});
vi.mock("@edicut/shared/server-fetch", () => ({ fetchWithHeadersTimeout: mocks.fetch, fetchWithTimeout: mocks.fetch, UPLOAD_FETCH_TIMEOUT_MS: 45000 }));
import type { DatabaseClient } from "@edicut/db/client";
import { CHAT_FILE_MAX_BYTES, chatAttachmentName, deleteChatFile, downloadChatFile, validateChatFile, validateChatFileHeader, validateChatFileMetadata } from "./chat-files.server";
const db = {} as DatabaseClient;
beforeEach(() => { vi.clearAllMocks(); mocks.env.mockResolvedValue({ cloudName: "test-cloud", apiKey: "test-key", apiSecret: "test-secret" }); mocks.sign.mockResolvedValue("test-signature"); mocks.driveToken.mockResolvedValue("drive-token"); });

describe("chat attachments", () => {
  const png = () => new File([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])], "reference.png", { type: "image/png" });
  it("validates supported file types, signatures, and the 10 GB per-file ceiling", async () => {
    expect(await validateChatFile(png())).toBeNull();
    expect(await validateChatFile(new File(["%PDF-1.7"], "brief.pdf", { type: "application/pdf" }))).toBeNull();
    expect(validateChatFileHeader(Uint8Array.from([71,73,70,56,57,97]), "image/gif")).toBe(true);
    expect(validateChatFileHeader(Uint8Array.from([0,0,0,24,102,116,121,112]), "video/mp4")).toBe(true);
    expect(validateChatFileHeader(Uint8Array.from([0x1a,0x45,0xdf,0xa3]), "video/webm")).toBe(true);
    expect(await validateChatFile(new File(["<svg>"], "fake.png", { type: "image/png" }))).toBeTruthy();
    expect(await validateChatFile(new File(["<svg>"], "icon.svg", { type: "image/svg+xml" }))).toBeTruthy();
    expect(await validateChatFile(new File([], "empty.pdf", { type: "application/pdf" }))).toBeTruthy();
    expect(validateChatFileMetadata("application/pdf", CHAT_FILE_MAX_BYTES + 1)).toBeTruthy();
    expect(validateChatFileMetadata("video/mp4", CHAT_FILE_MAX_BYTES)).toBeNull();
  });

  it("normalizes attachment names without splitting surrogate pairs", () => {
    const name = `${"a".repeat(179)}😀brief.pdf`;
    const safeName = chatAttachmentName({ name, type: "application/pdf" });
    expect(Array.from(safeName)).toHaveLength(180);
    expect(() => encodeURIComponent(safeName)).not.toThrow();
    expect(() => encodeURIComponent(chatAttachmentName({ name: "\uD800.pdf", type: "application/pdf" }))).not.toThrow();
    expect(chatAttachmentName({ name: "report\u202Efdp.exe", type: "image/png" })).toBe("reportfdp.png");
    expect(chatAttachmentName({ name: "clip.mov", type: "video/mp4" })).toBe("clip.mp4");
  });

  it("proxies legacy Cloudinary files privately with inline headers for browser formats", async () => {
    mocks.fetch.mockResolvedValue(new Response("%PDF-1.7"));
    const response = await downloadChatFile({ publicId: "edicut/chat/room/file.pdf", name: "brief 'new' (copy).pdf", mime: "application/pdf", bytes: 8 }, db);
    const url = new URL(mocks.fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1_1/test-cloud/raw/download"); expect(url.searchParams.get("type")).toBe("private");
    expect(url.searchParams.has("attachment")).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store"); expect(response.headers.get("Content-Disposition")).toContain("inline;"); expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
  });

  it("streams private Drive media and forwards a video range request", async () => {
    mocks.driveDownload.mockResolvedValue(new Response("video", { status: 206, headers: { "Content-Range": "bytes 0-4/10", "Content-Length": "5", "Accept-Ranges": "bytes" } }));
    const response = await downloadChatFile({ publicId: "google-drive:Abcdefghijklmnop", provider: "google_drive", driveFileId: "Abcdefghijklmnop", name: "clip.mp4", mime: "video/mp4", bytes: 10 }, db, undefined, "bytes=0-4");
    expect(mocks.driveToken).toHaveBeenCalledWith(db, undefined);
    expect(mocks.driveDownload).toHaveBeenCalledWith("Abcdefghijklmnop", "drive-token", "bytes=0-4", undefined);
    expect(response.status).toBe(206); expect(response.headers.get("Content-Range")).toBe("bytes 0-4/10"); expect(response.headers.get("Content-Disposition")).toContain("inline;");
  });

  it("deletes old Cloudinary files and new Drive files using their private provider", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ result: "ok" }));
    await deleteChatFile({ publicId: "test.pdf", name: "test.pdf", mime: "application/pdf", bytes: 8 }, db);
    expect(mocks.fetch.mock.calls[0][0]).toMatch(/\/raw\/destroy$/); expect(mocks.fetch.mock.calls[0][1].body.get("type")).toBe("private");
    await deleteChatFile({ publicId: "google-drive:Abcdefghijklmnop", provider: "google_drive", driveFileId: "Abcdefghijklmnop", name: "clip.mp4", mime: "video/mp4", bytes: 8 }, db);
    expect(mocks.driveDelete).toHaveBeenCalledWith("Abcdefghijklmnop", "drive-token");
  });
});
