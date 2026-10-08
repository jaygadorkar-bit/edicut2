import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), env: vi.fn(), sign: vi.fn() }));
vi.mock("./cloudinary.server", () => ({ requireCloudinaryEnv: mocks.env, signUpload: mocks.sign }));
vi.mock("@edicut/shared/server-fetch", () => ({ fetchWithTimeout: mocks.fetch, UPLOAD_FETCH_TIMEOUT_MS: 45000 }));
import { CHAT_FILE_MAX_BYTES, deleteChatFile, downloadChatFile, uploadChatFile, validateChatFile } from "./chat-files.server";
beforeEach(() => { vi.clearAllMocks(); mocks.env.mockResolvedValue({ cloudName: "test-cloud", apiKey: "test-key", apiSecret: "test-secret" }); mocks.sign.mockResolvedValue("test-signature"); });
describe("private chat attachments", () => {
  const png = () => new File([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])], "reference.png", { type:"image/png" });
  it("checks MIME type, magic bytes, emptiness, and 5 MB limits", async () => {
    expect(await validateChatFile(png())).toBeNull();
    expect(await validateChatFile(new File(["%PDF-1.7"], "brief.pdf", { type:"application/pdf" }))).toBeNull();
    expect(await validateChatFile(new File(["<svg>"], "fake.png", { type:"image/png" }))).toBeTruthy();
    expect(await validateChatFile(new File(["<svg>"], "icon.svg", { type:"image/svg+xml" }))).toBeTruthy();
    expect(await validateChatFile(new File([], "empty.pdf", { type:"application/pdf" }))).toBeTruthy();
    expect(await validateChatFile(new File([new Uint8Array(CHAT_FILE_MAX_BYTES+1)], "big.pdf", { type:"application/pdf" }))).toBeTruthy();
  });
  it("uploads through signed raw/private requests and excludes provider URLs", async () => {
    mocks.fetch.mockImplementation(async (_url, init) => Response.json({ public_id:init.body.get("public_id"), bytes:12, type:"private", resource_type:"raw", secure_url:"https://not-exposed.example/file" }));
    const saved = await uploadChatFile(png(), "10000000-0000-4000-8000-000000000001");
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toMatch(/\/raw\/upload$/); expect(init.body.get("type")).toBe("private"); expect(init.body.get("signature")).toBe("test-signature");
    expect(saved).toMatchObject({ name:"reference.png", mime:"image/png", bytes:12 }); expect(saved).not.toHaveProperty("secure_url");
  });
  it("rejects upload responses that changed access type or identifier", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ public_id:"wrong", type:"upload", resource_type:"raw" }));
    await expect(uploadChatFile(png(), "room")).rejects.toMatchObject({ status:502 });
  });
  it("proxies a short-lived private download with safe response headers", async () => {
    mocks.fetch.mockResolvedValue(new Response("%PDF-1.7"));
    const response = await downloadChatFile({ publicId:"edicut/chat/room/file.pdf", name:'brief "new".pdf', mime:"application/pdf", bytes:8 });
    const url = new URL(mocks.fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1_1/test-cloud/raw/download"); expect(url.searchParams.get("type")).toBe("private");
    expect(Number(url.searchParams.get("expires_at"))-Number(url.searchParams.get("timestamp"))).toBeLessThanOrEqual(60);
    expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(response.headers.get("Content-Disposition")).toMatch(/^attachment;/); expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
  });
  it("cleans up files with a signed private destroy request", async () => { mocks.fetch.mockResolvedValue(Response.json({ result:"ok" })); await deleteChatFile({ publicId:"test.pdf", name:"test.pdf", mime:"application/pdf", bytes:8 }); expect(mocks.fetch.mock.calls[0][0]).toMatch(/\/raw\/destroy$/); expect(mocks.fetch.mock.calls[0][1].body.get("type")).toBe("private"); });
});
