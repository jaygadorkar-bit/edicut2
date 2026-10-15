import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
import type { LoaderContext } from "../types";
import {
  beginYouTubeUpload,
  completeYouTubeConnection,
  decryptYouTubeSecret,
  encryptYouTubeSecret,
  safeYouTubeUploadUrl,
  startYouTubeConnection,
  verifyYouTubeVideo,
  youtubeOAuthConfig,
} from "./youtube-storage.server";
vi.mock("./google-auth.server", () => ({
  readRequiredGoogleEnv: () => ({
    clientId: "test-client",
    clientSecret: "test-secret",
    appUrl: "https://edicut.test",
  }),
}));
const context = {
  cf: {
    env: {
      YOUTUBE_TOKEN_SECRET: "test-only-key-012345678901234567890123456789",
    },
  },
} as unknown as LoaderContext;
beforeEach(() => {
  // Vite loads workspace .env values before tests; keep these unit tests isolated
  // from local OAuth configuration and exercise only their explicit fixtures.
  vi.stubEnv("YOUTUBE_OAUTH_CLIENT_ID", "");
  vi.stubEnv("YOUTUBE_OAUTH_CLIENT_SECRET", "");
  vi.stubEnv("APP_URL", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("YouTube storage boundaries", () => {
  it.each(["http://localhost:3002", "https://edicut.com"])(
    "uses the dedicated studio client with the %s callback",
    (appUrl) => {
      const config = youtubeOAuthConfig({
        cf: { env: {
          ...context.cf.env,
          APP_URL: appUrl,
          YOUTUBE_OAUTH_CLIENT_ID: "studio-client",
          YOUTUBE_OAUTH_CLIENT_SECRET: "studio-secret",
        } },
      } as unknown as LoaderContext);
      expect(config.clientId).toBe("studio-client");
      expect(config.clientSecret).toBe("studio-secret");
      expect(config.redirectUri).toBe(`${appUrl}/api/auth/callback/youtube`);
    },
  );
  it("rejects partial studio credentials instead of using the sign-in client", () => {
    expect(() => youtubeOAuthConfig({ cf: { env: {
      ...context.cf.env,
      YOUTUBE_OAUTH_CLIENT_ID: "studio-client",
    } } } as unknown as LoaderContext)).toThrow();
  });
  it.each(["http://edicut.com", "ftp://localhost", "https://user:pass@edicut.com"])(
    "rejects unsafe callback origins: %s", (appUrl) => {
      expect(() => youtubeOAuthConfig({ cf: { env: {
        ...context.cf.env, APP_URL: appUrl,
        YOUTUBE_OAUTH_CLIENT_ID: "studio-client",
        YOUTUBE_OAUTH_CLIENT_SECRET: "studio-secret",
      } } } as unknown as LoaderContext)).toThrow();
    },
  );
  it("encrypts channel credentials with random nonces and rejects wrong keys or tampering", async () => {
    const first = await encryptYouTubeSecret("private-refresh-token", context),
      second = await encryptYouTubeSecret("private-refresh-token", context);
    expect(first).not.toBe(second);
    expect(first).not.toContain("private-refresh-token");
    expect(await decryptYouTubeSecret(first, context)).toBe(
      "private-refresh-token",
    );
    await expect(
      decryptYouTubeSecret(first, {
        cf: {
          env: {
            YOUTUBE_TOKEN_SECRET:
              "different-test-key-012345678901234567890123456789",
          },
        },
      } as unknown as LoaderContext),
    ).rejects.toThrow();
    await expect(
      decryptYouTubeSecret(first.slice(0, -4) + "aaaa", context),
    ).rejects.toThrow();
  });
  it("only accepts the exact Google resumable-upload endpoint", () => {
    expect(
      safeYouTubeUploadUrl(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=abc",
      ),
    ).toBeTruthy();
    for (const value of [
      "http://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=x",
      "https://www.googleapis.com.evil.test/upload/youtube/v3/videos?uploadType=resumable&upload_id=x",
      "https://www.googleapis.com/other?uploadType=resumable&upload_id=x",
      "https://secret@www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=x",
      "https://www.googleapis.com/upload/youtube/v3/videos",
    ])
      expect(safeYouTubeUploadUrl(value)).toBeNull();
  });
  it("uses signed short-lived administrator state, PKCE, and limited upload/read scopes", async () => {
    const response = await startYouTubeConnection(
      new Request("https://edicut.test/site/node-logmin/video-storage"),
      context,
      "11111111-1111-4111-8111-111111111111",
    );
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    );
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://edicut.test/api/auth/callback/youtube",
    );
    expect(response.headers.get("Set-Cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("Set-Cookie")).toMatch(/SameSite=Lax/i);
    expect(response.headers.get("Set-Cookie")).not.toContain("test-only-key");
  });
  it("rejects callback state mismatches before contacting Google or writing a credential", async () => {
    const execute = vi.fn(),
      fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const started = await startYouTubeConnection(
      new Request("https://edicut.test/site/node-logmin/video-storage"),
      context,
      "11111111-1111-4111-8111-111111111111",
    );
    const response = await completeYouTubeConnection(
      new Request(
        "https://edicut.test/api/auth/callback/youtube?state=wrong&code=forged",
        {
          headers: { Cookie: started.headers.get("Set-Cookie")!.split(";")[0] },
        },
      ),
      context,
      { execute } as unknown as DatabaseClient,
    );
    expect(await response.text()).toContain("connection=invalid");
    expect(execute).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("saves only encrypted credentials after valid administrator consent and returns through a first-party document", async () => {
    const adminId = "11111111-1111-4111-8111-111111111111",
      execute = vi
        .fn()
        .mockResolvedValueOnce([{ id: adminId }])
        .mockResolvedValueOnce([{ provider: "youtube" }]);
    const started = await startYouTubeConnection(
        new Request("https://edicut.test/site/node-logmin/video-storage"),
        context,
        adminId,
      ),
      nonce = new URL(started.headers.get("Location")!).searchParams.get(
        "state",
      );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes("oauth2.googleapis.com")
          ? Response.json({
              access_token: "fixture-access",
              refresh_token: "fixture-refresh",
              scope:
                "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
            })
          : Response.json({
              items: [
                {
                  id: "UCaaaaaaaaaaaaaaaaaaaaaa",
                  snippet: { title: "Studio" },
                },
              ],
            }),
      ),
    );
    const response = await completeYouTubeConnection(
      new Request(
        `https://edicut.test/api/auth/callback/youtube?state=${nonce}&code=fixture`,
        {
          headers: { Cookie: started.headers.get("Set-Cookie")!.split(";")[0] },
        },
      ),
      context,
      { execute } as unknown as DatabaseClient,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain("connection=connected");
    expect(html).not.toContain("fixture-refresh");
    expect(JSON.stringify(execute.mock.calls)).not.toContain("fixture-refresh");
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("explicitly uploads as unlisted and embeddable", async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(null, {
          status: 200,
          headers: {
            Location:
              "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=fixture",
          },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    await beginYouTubeUpload("test-token", 1000, "video/mp4", "Cut one");
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body)).status).toMatchObject({
      privacyStatus: "unlisted",
      embeddable: true,
    });
    expect(init.headers).toMatchObject({ "X-Upload-Content-Length": "1000" });
  });
  it("rejects a video from a different channel or with public/private visibility", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          items: [
            {
              id: "abcdefghijk",
              snippet: { channelId: "other-channel" },
              status: {
                privacyStatus: "public",
                embeddable: true,
                uploadStatus: "processed",
              },
            },
          ],
        }),
      ),
    );
    await expect(
      verifyYouTubeVideo("abcdefghijk", "studio-channel", "test-token"),
    ).rejects.toMatchObject({ status: 502 });
  });
});
