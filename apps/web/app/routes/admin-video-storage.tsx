import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import { CheckCircle2, ExternalLink, HardDrive, Video as Youtube } from "lucide-react";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { getDbFromContext } from "../lib/db.server";
import { requireAdminUser } from "../lib/session.server";
import {
  isSameSiteMutation,
  forbiddenMutation,
  readMutationForm,
} from "../lib/mutation-request.server";
import {
  getYouTubeStorageStatus,
  startYouTubeConnection,
  youtubeOAuthConfig,
  disconnectYouTubeStorage,
} from "../lib/youtube-storage.server";
import { isMissingReviewSchema } from "../lib/project-review.server";
import {
  disconnectGoogleDriveStorage,
  getGoogleDriveStorageStatus,
  googleDriveOAuthConfig,
  startGoogleDriveConnection,
} from "../lib/google-drive-storage.server";
import "../styles/project-review.css";
export const meta: MetaFunction = () => [
  { title: "Video storage | EdiCut" },
  { name: "robots", content: "noindex,nofollow" },
];
export function headers() {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
}
export async function loader(args: LoaderFunctionArgs) {
  const db = getDbFromContext(args.context),
    admin = await requireAdminUser(
      args.request,
      db,
      args.context,
      new URL(args.request.url).pathname,
    );
  let config: { ready: boolean; redirectUri?: string; driveRedirectUri?: string; driveAccountEmail?: string } = { ready: false };
  try {
    const youtube = youtubeOAuthConfig(args.context), drive = googleDriveOAuthConfig(args.context);
    config = {
      ready: true,
      redirectUri: youtube.redirectUri,
      driveRedirectUri: drive.redirectUri,
      driveAccountEmail: drive.accountEmail,
    };
  } catch {}
  let storage: Awaited<ReturnType<typeof getYouTubeStorageStatus>> = {
      connected: false,
      channelName: undefined,
      channelId: undefined,
      connectedAt: undefined,
    },
    schemaReady = true;
  let driveStorage: Awaited<ReturnType<typeof getGoogleDriveStorageStatus>> = {
    connected: false,
    channelName: undefined,
    connectedAt: undefined,
  };
  try {
    [storage, driveStorage] = await Promise.all([
      getYouTubeStorageStatus(db),
      getGoogleDriveStorageStatus(db),
    ]);
  } catch (error) {
    if (!isMissingReviewSchema(error)) throw error;
    schemaReady = false;
  }
  return {
    admin: { name: admin.name, email: admin.email },
    storage,
    driveStorage,
    config,
    schemaReady,
    result: new URL(args.request.url).searchParams.get("connection"),
    driveResult: new URL(args.request.url).searchParams.get("drive"),
  };
}
export async function action(args: ActionFunctionArgs) {
  if (!isSameSiteMutation(args.request)) return forbiddenMutation();
  const db = getDbFromContext(args.context),
    admin = await requireAdminUser(
      args.request,
      db,
      args.context,
      new URL(args.request.url).pathname,
    );
  try {
    const form = await readMutationForm(args.request, 4096);
    const intent = String(form?.get("intent") ?? "connect-youtube");
    if (intent === "disconnect-youtube") {
      await disconnectYouTubeStorage(db, admin.id);
      return {
        success:
          "YouTube disconnected. Existing videos remain in YouTube Studio. Google Drive storage is unaffected.",
      };
    }
    if (intent === "disconnect-drive") {
      await disconnectGoogleDriveStorage(db, admin.id);
      return { success: "Google Drive disconnected. Existing review videos remain private in Drive. YouTube storage is unaffected." };
    }
    if (intent === "connect-drive")
      return await startGoogleDriveConnection(args.request, args.context, admin.id);
    return await startYouTubeConnection(args.request, args.context, admin.id);
  } catch {
    return {
      error:
        "Video storage needs its database migration and Google OAuth configuration before a channel can be connected.",
    };
  }
}
export default function VideoStorage() {
  const { admin, storage, driveStorage, config, schemaReady, result, driveResult } =
      useLoaderData<typeof loader>(),
    actionData = useActionData<typeof action>();
  const messages: Record<string, string> = {
    connected:
      "YouTube channel connected. New review videos will be uploaded as unlisted.",
    cancelled: "Channel connection was cancelled.",
    invalid: "The connection request expired. Start again from this page.",
    permissions:
      "Allow video uploads and channel read access to connect. No access was saved.",
    channel: "Choose a Google account with a YouTube channel, then try again.",
    unavailable:
      "The channel could not be connected. Check the Google OAuth configuration and try again.",
  };
  const driveMessages: Record<string, string> = {
    connected: "Google Drive connected for private review video storage. New uploads will use Drive.",
    cancelled: "Google Drive connection was cancelled.",
    invalid: "The connection request expired. Start again from this page.",
    account: `Choose ${config.driveAccountEmail || "the configured Drive account"} to connect Drive. No other Google account was saved.`,
    permissions: "Allow EdiCut Studio to access only the Drive files it creates for review storage.",
    unavailable: "Google Drive could not be connected. Check the Google OAuth configuration and try again.",
  };
  return (
    <AdminPanelShell
      title="Video storage"
      activeTab="projects"
      account={{ name: admin.name || "Admin", detail: admin.email }}
    >
      <div className="video-storage">
        <Link className="review-back" to="/site/node-logmin/projects">
          Back to projects
        </Link>
        <section className="neo-workspace__panel video-storage__panel">
            <HardDrive size={35} color="#4f46e5" />
            <h1>Private review video storage</h1>
          <p>
              Connect EdiCut Studio Drive to store review cuts privately. EdiCut streams the video to authorized project members, with no public Drive link. YouTube remains available as a fallback.
          </p>
            {result && messages[result] ? (
            <div className="review-notice" role="status">
              {messages[result]}
            </div>
          ) : null}
            {driveResult && driveMessages[driveResult] ? <div className="review-notice" role="status">{driveMessages[driveResult]}</div> : null}
          {actionData?.success ? (
            <div className="review-notice" role="status">
              {actionData.success}
            </div>
          ) : null}
          {actionData?.error ? (
            <p className="review-error" role="alert">
              {actionData.error}
            </p>
          ) : null}
          <div className="video-storage__connection">
            {driveStorage.connected ? (
              <>
                <CheckCircle2 size={22} />
                <div>
                  <strong>{driveStorage.channelName}</strong>
                  <span>Connected · private project playback · selected for new uploads</span>
                </div>
              </>
            ) : (
              <>
                <HardDrive size={22} />
                <div>
                  <strong>Google Drive is not connected</strong>
                  <span>
                    {storage.connected ? "New uploads currently use YouTube until Drive is connected." : "Only an administrator can connect studio storage."}
                  </span>
                </div>
              </>
            )}
          </div>
          {driveStorage.connected ? <Form method="post"><input type="hidden" name="intent" value="disconnect-drive" /><button type="submit" className="review-button">Disconnect Google Drive</button></Form> : null}
          <p>Drive files stay private in the connected studio account. EdiCut checks project access before proxying video playback. Keep original masters in your own archive.</p>
          {!schemaReady ? (
            <div className="review-notice">
              The reviewed production migration needs to be activated before
              connecting a channel.
            </div>
          ) : null}
          {!config.ready ? (
            <div className="review-notice">
              Configure Google OAuth and a strong server encryption secret to
              enable channel connection.
            </div>
          ) : config.redirectUri ? (
            <details>
              <summary>Google OAuth setup</summary>
              <p>
                Enable YouTube Data API v3 and Google Drive API. Add the Google Drive file scope to the OAuth consent screen, and register both callback URLs on the same studio OAuth client:
              </p>
              <code>{config.redirectUri}</code><br /><code>{config.driveRedirectUri}</code>
            </details>
          ) : null}
          {!driveStorage.connected ? <Form method="post">
            <input type="hidden" name="intent" value="connect-drive" />
            <button
              type="submit"
              className="review-button review-button--primary"
              disabled={!schemaReady || !config.ready}
            >
              <HardDrive size={17} /> Connect Google Drive
            </button>
          </Form> : null}
          <section className="video-storage__youtube">
            <h2>YouTube backup</h2>
            <p>{storage.connected ? `Connected to ${storage.channelName}. Existing YouTube versions remain playable. Drive is used for new uploads while connected.` : "YouTube uploads can remain available as an alternate storage option."}</p>
            <Form method="post"><input type="hidden" name="intent" value="connect-youtube" /><button type="submit" className="review-button" disabled={!schemaReady || !config.ready}><Youtube size={17} />{storage.connected ? "Reconnect YouTube" : "Connect YouTube"}</button></Form>
          {storage.connected ? (
            <Form method="post"><input type="hidden" name="intent" value="disconnect-youtube" /><button type="submit" className="review-button">Disconnect YouTube</button></Form>
          ) : null}
          </section>
          <p className="video-storage__small">
              Drive access is limited to files created by EdiCut, while YouTube retains its separate upload and read scopes. Refresh tokens are encrypted on the server. Disconnect removes the stored credential; existing files remain in their provider account. You can revoke Google access in{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Google account permissions
            </a>
            .
          </p>
          <a
            href="https://drive.google.com/drive/my-drive"
            target="_blank"
            rel="noopener noreferrer"
            className="review-back"
          >
            Open Google Drive <ExternalLink size={14} />
          </a>
        </section>
      </div>
    </AdminPanelShell>
  );
}
