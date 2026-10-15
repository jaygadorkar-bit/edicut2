import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
import type { LoaderContext } from "../types";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./google-auth.server", () => ({
  readRequiredGoogleEnv: () => ({ clientId: "fixture-client", clientSecret: "fixture-secret", appUrl: "https://edicut.test" }),
}));
vi.mock("./youtube-storage.server", () => ({
  youtubeOAuthConfig: () => ({ clientId: "fixture-client", clientSecret: "fixture-secret", appUrl: "https://edicut.test", redirectUri: "https://edicut.test/api/auth/callback/youtube" }),
}));
import {
  beginGoogleDriveUpload,
  completeGoogleDriveConnection,
  decryptGoogleDriveSecret,
  encryptGoogleDriveSecret,
  getGoogleDriveStorageQuota,
  GOOGLE_DRIVE_SCOPE,
  googleDriveUploadStatusRange,
  safeGoogleDriveFileId,
  safeGoogleDriveUploadUrl,
  startGoogleDriveConnection,
} from "./google-drive-storage.server";

const adminId = "11111111-1111-4111-8111-111111111111";
const context = { cf: { env: { YOUTUBE_TOKEN_SECRET: "fixture-drive-token-secret-0123456789", GOOGLE_DRIVE_ACCOUNT_EMAIL: "jaygadorkar@gmail.com" } } } as unknown as LoaderContext;
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Google Drive storage boundaries", () => {
  it("uses the narrow app-file scope and binds the admin callback to the expected studio account", async () => {
    const started = await startGoogleDriveConnection(new Request("https://edicut.test/site/node-logmin/video-storage"), context, adminId);
    const location = new URL(started.headers.get("Location")!);
    expect(location.searchParams.get("scope")).toBe(`openid email ${GOOGLE_DRIVE_SCOPE}`);
    expect(location.searchParams.get("scope")).not.toContain("/auth/drive ");
    expect(location.searchParams.get("login_hint")).toBe("jaygadorkar@gmail.com");
    expect(location.searchParams.get("redirect_uri")).toBe("https://edicut.test/api/auth/callback/drive");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(started.headers.get("Set-Cookie")).toMatch(/HttpOnly/i);
  });

  it("encrypts Drive refresh tokens independently with authenticated encryption", async () => {
    const first = await encryptGoogleDriveSecret("private-drive-refresh", context);
    const second = await encryptGoogleDriveSecret("private-drive-refresh", context);
    expect(first).not.toBe(second);
    expect(first).not.toContain("private-drive-refresh");
    expect(await decryptGoogleDriveSecret(first, context)).toBe("private-drive-refresh");
    await expect(decryptGoogleDriveSecret(first, { cf: { env: { YOUTUBE_TOKEN_SECRET: "different-drive-secret-0123456789" } } } as unknown as LoaderContext)).rejects.toThrow();
  });

  it("only accepts Google resumable upload URLs and URL-safe Drive IDs", () => {
    expect(safeGoogleDriveUploadUrl("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=fixture")).toBeTruthy();
    for (const value of [
      "http://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x",
      "https://www.googleapis.com.evil.test/upload/drive/v3/files?uploadType=resumable&upload_id=x",
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&upload_id=x",
      "https://secret@www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x",
    ]) expect(safeGoogleDriveUploadUrl(value)).toBeNull();
    expect(safeGoogleDriveFileId("1Abcdefghijklmnopqrstuvwxyz_123")).toBe(true);
    expect(safeGoogleDriveFileId("bad/id")).toBe(false);
  });

  it("formats Google resumable upload status probes with the required bytes unit", () => {
    expect(googleDriveUploadStatusRange(455823)).toBe("bytes */455823");
  });

  it("starts a private resumable upload with the expected media metadata", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=fixture" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(beginGoogleDriveUpload("access-token", 1024, "video/mp4", "EdiCut review.mp4")).resolves.toContain("upload_id=fixture");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("uploadType=resumable");
    expect(init.headers).toMatchObject({ Authorization: "Bearer access-token", "X-Upload-Content-Length": "1024", "X-Upload-Content-Type": "video/mp4" });
    expect(JSON.parse(String(init.body))).toMatchObject({ name: "EdiCut review.mp4", mimeType: "video/mp4" });
    expect(JSON.stringify(init.body)).not.toContain("webViewLink");
  });

  it("saves an encrypted Drive token only for the verified configured Drive account", async () => {
    const execute = vi.fn().mockResolvedValueOnce([{ id: adminId }]).mockResolvedValueOnce([{ provider: "google_drive" }]);
    const started = await startGoogleDriveConnection(new Request("https://edicut.test/site/node-logmin/video-storage"), context, adminId);
    const state = new URL(started.headers.get("Location")!).searchParams.get("state");
    const cookie = started.headers.get("Set-Cookie")!.split(";")[0];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", scope: `openid email ${GOOGLE_DRIVE_SCOPE}` });
      if (url.includes("openidconnect.googleapis.com")) return Response.json({ email: "jaygadorkar@gmail.com", email_verified: true });
      throw new Error("Unexpected Google endpoint");
    });
    vi.stubGlobal("fetch", fetch);
    const response = await completeGoogleDriveConnection(new Request(`https://edicut.test/api/auth/callback/drive?state=${state}&code=fixture`, { headers: { Cookie: cookie } }), context, { execute } as unknown as DatabaseClient);
    expect(await response.text()).toContain("drive=connected");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(execute.mock.calls)).not.toContain("fixture-refresh");
  });

  it("reads Drive and shared Google account storage quota without broader access", async () => {
    const encrypted = await encryptGoogleDriveSecret("fixture-drive-refresh", context);
    const execute = vi.fn().mockResolvedValue([{ refreshToken: encrypted, connectedAt: "2026-10-15T00:00:00Z" }]);
    const fetch = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => String(input).includes("oauth2.googleapis.com/token")
      ? Response.json({ access_token: "fixture-access" })
      : Response.json({ storageQuota: { limit: "5000000000000", usage: "1250000000000", usageInDrive: "250000000000" } }));
    vi.stubGlobal("fetch", fetch);

    const result = await getGoogleDriveStorageQuota({ execute } as unknown as DatabaseClient, context);

    expect(result).toEqual({
      status: "connected",
      quota: { accountUsageBytes: 1_250_000_000_000, driveUsageBytes: 250_000_000_000, limitBytes: 5_000_000_000_000 },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toBe("https://www.googleapis.com/drive/v3/about?fields=storageQuota(limit,usage,usageInDrive)");
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ headers: { Authorization: "Bearer fixture-access" }, cache: "no-store" });
  });

  it("reports an unlimited Drive quota when Google omits the limit", async () => {
    const encrypted = await encryptGoogleDriveSecret("fixture-drive-refresh", context);
    const execute = vi.fn().mockResolvedValue([{ refreshToken: encrypted, connectedAt: "2026-10-15T00:00:00Z" }]);
    const fetch = vi.fn(async (input: string | URL | Request) => String(input).includes("oauth2.googleapis.com/token")
      ? Response.json({ access_token: "fixture-access" })
      : Response.json({ storageQuota: { usage: "1200", usageInDrive: "1000" } }));
    vi.stubGlobal("fetch", fetch);

    await expect(getGoogleDriveStorageQuota({ execute } as unknown as DatabaseClient, context)).resolves.toEqual({
      status: "connected",
      quota: { accountUsageBytes: 1200, driveUsageBytes: 1000, limitBytes: null },
    });
  });

  it("refuses to store a token from a different Google account", async () => {
    const execute = vi.fn().mockResolvedValueOnce([{ id: adminId }]);
    const started = await startGoogleDriveConnection(new Request("https://edicut.test/site/node-logmin/video-storage"), context, adminId);
    const state = new URL(started.headers.get("Location")!).searchParams.get("state");
    const fetch = vi.fn(async (input: string | URL | Request) => String(input).includes("oauth2.googleapis.com/token")
      ? Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", scope: `openid email ${GOOGLE_DRIVE_SCOPE}` })
      : Response.json({ email: "someone-else@gmail.com", email_verified: true }));
    vi.stubGlobal("fetch", fetch);
    const response = await completeGoogleDriveConnection(new Request(`https://edicut.test/api/auth/callback/drive?state=${state}&code=fixture`, { headers: { Cookie: started.headers.get("Set-Cookie")!.split(";")[0] } }), context, { execute } as unknown as DatabaseClient);
    expect(await response.text()).toContain("drive=account");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
