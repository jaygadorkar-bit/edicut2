import { getSupabaseAdmin } from "../integrations/supabase/client.server";
import type { SupabaseRuntimeContext } from "../integrations/supabase/client.server";

type NotificationViewer = {
  id: string;
  admin: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Broadcast a content-free invalidation after the durable receipt write.
 * HTTP Broadcast avoids a write to realtime.messages and its daily partition.
 * Polling and reconnect refreshes remain the recovery path if delivery fails.
 */
export async function sendWorkspaceReceiptInvalidation(
  context: SupabaseRuntimeContext | undefined,
  viewer: NotificationViewer,
) {
  if (!UUID_PATTERN.test(viewer.id)) return false;

  const topic = `edicut:${viewer.admin ? "admin" : "user"}:${viewer.id}`;
  let client: ReturnType<typeof getSupabaseAdmin> | undefined;
  let channel: ReturnType<ReturnType<typeof getSupabaseAdmin>["channel"]> | undefined;

  try {
    client = getSupabaseAdmin(context);
    channel = client.channel(topic, {
      config: { private: true, broadcast: { ack: false, self: false } },
    });
    const result = await channel.httpSend(
      "workspace-invalidated",
      { source: "workspace" },
      { timeout: 3_000 },
    );
    return result.success;
  } catch {
    // Receipt persistence must remain successful if Realtime is unavailable.
    return false;
  } finally {
    if (client && channel) {
      try {
        await client.removeChannel(channel);
      } catch {
        // This channel is never subscribed; failed cleanup cannot affect reads.
      }
    }
  }
}
