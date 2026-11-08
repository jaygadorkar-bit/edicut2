import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseRealtimeClient } from "../integrations/supabase/realtime.client";

export type WorkspaceRealtimeScope = "admin" | "client";
export type WorkspaceRealtimeStatus = "connecting" | "connected" | "disconnected" | "unavailable";

type Listener = {
  onUpdate: () => void;
  onStatus?: (status: WorkspaceRealtimeStatus) => void;
};
type TokenResponse = { accessToken: string; topic: string; expiresAt: number };
type SubscriptionEntry = {
  listeners: Set<Listener>;
  status: WorkspaceRealtimeStatus;
  channel?: RealtimeChannel;
  refreshTimer?: number;
  connectTimer?: number;
  startPromise?: Promise<void>;
  stopped: boolean;
};

const subscriptions = new Map<WorkspaceRealtimeScope, SubscriptionEntry>();

function notifyStatus(entry: SubscriptionEntry, status: WorkspaceRealtimeStatus) {
  if (entry.status === status) return;
  entry.status = status;
  for (const listener of entry.listeners) listener.onStatus?.(status);
}

function notifyUpdate(entry: SubscriptionEntry) {
  for (const listener of entry.listeners) listener.onUpdate();
}

async function getToken(scope: WorkspaceRealtimeScope): Promise<TokenResponse | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  let response: Response;
  try {
    response = await fetch(`/api/realtime-token?scope=${scope}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
  if (response.status === 204 || response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Unable to authorize live updates.");
  const value = await response.json() as Partial<TokenResponse> | null;
  const topic = typeof value?.topic === "string" ? value.topic : "";
  const topicPrefix = scope === "admin" ? "edicut:admin:" : "edicut:user:";
  if (
    !value || typeof value.accessToken !== "string" || value.accessToken.length > 8_192 ||
    !topic.startsWith(topicPrefix) || !/^[0-9a-f-]{36}$/i.test(topic.slice(topicPrefix.length)) ||
    !Number.isSafeInteger(value.expiresAt) || value.expiresAt! <= Date.now()
  ) throw new Error("Invalid live update authorization response.");
  return value as TokenResponse;
}

async function startSubscription(scope: WorkspaceRealtimeScope, entry: SubscriptionEntry) {
  const client = getSupabaseRealtimeClient();
  if (!client) {
    notifyStatus(entry, "unavailable");
    return;
  }

  notifyStatus(entry, "connecting");
  let token: TokenResponse | null;
  try {
    token = await getToken(scope);
  } catch {
    notifyStatus(entry, "unavailable");
    return;
  }
  if (entry.stopped) return;
  if (!token) {
    notifyStatus(entry, "unavailable");
    return;
  }

  client.realtime.setAuth(token.accessToken);
  const channel = client.channel(token.topic, {
    config: { private: true, broadcast: { ack: false, self: false } },
  });
  entry.channel = channel;
  channel.on("broadcast", { event: "workspace-invalidated" }, () => notifyUpdate(entry));
  entry.connectTimer = window.setTimeout(() => {
    entry.connectTimer = undefined;
    if (!entry.stopped && entry.status !== "connected") notifyStatus(entry, "disconnected");
  }, 15_000);
  channel.subscribe((status) => {
    if (entry.stopped) return;
    if (status === "SUBSCRIBED") {
      if (entry.connectTimer !== undefined) window.clearTimeout(entry.connectTimer);
      entry.connectTimer = undefined;
      notifyStatus(entry, "connected");
      // Resync after initial connect and every reconnect to cover missed events.
      notifyUpdate(entry);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      if (entry.connectTimer !== undefined) window.clearTimeout(entry.connectTimer);
      entry.connectTimer = undefined;
      notifyStatus(entry, "disconnected");
    }
  });

  const scheduleRetry = (expiresAt: number) => {
    if (entry.refreshTimer !== undefined) window.clearTimeout(entry.refreshTimer);
    if (Date.now() >= expiresAt - 15_000) {
      notifyStatus(entry, "unavailable");
      return;
    }
    entry.refreshTimer = window.setTimeout(() => {
      entry.refreshTimer = undefined;
      void renewToken();
    }, Math.min(15_000, Math.max(1_000, expiresAt - Date.now() - 15_000)));
  };
  const renewToken = async () => {
    if (entry.stopped) return;
    try {
      const next = await getToken(scope);
      if (entry.stopped) return;
      if (!next || next.topic !== token?.topic) {
        notifyStatus(entry, "unavailable");
        return;
      }
      token = next;
      client.realtime.setAuth(next.accessToken);
      scheduleRefresh(next.expiresAt);
    } catch {
      if (!entry.stopped) {
        notifyStatus(entry, "disconnected");
        scheduleRetry(token?.expiresAt ?? 0);
      }
    }
  };
  const scheduleRefresh = (expiresAt: number) => {
    if (entry.refreshTimer !== undefined) window.clearTimeout(entry.refreshTimer);
    entry.refreshTimer = window.setTimeout(() => {
      entry.refreshTimer = undefined;
      void renewToken();
    }, Math.max(10_000, expiresAt - Date.now() - 60_000));
  };
  scheduleRefresh(token.expiresAt);
}

/** Share one private Realtime connection per scope across workspace widgets. */
export function subscribeWorkspaceRealtime(
  scope: WorkspaceRealtimeScope,
  onUpdate: () => void,
  onStatus?: (status: WorkspaceRealtimeStatus) => void,
) {
  let entry = subscriptions.get(scope);
  if (!entry) {
    entry = { listeners: new Set(), status: "connecting", stopped: false };
    subscriptions.set(scope, entry);
  }
  const current = entry;
  const listener: Listener = { onUpdate, onStatus };
  current.listeners.add(listener);
  onStatus?.(current.status);

  if (!current.startPromise && !current.channel && current.status !== "unavailable") {
    current.startPromise = startSubscription(scope, current).finally(() => {
      current.startPromise = undefined;
    });
  }

  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    current.stopped = true;
    if (current.refreshTimer !== undefined) window.clearTimeout(current.refreshTimer);
    if (current.connectTimer !== undefined) window.clearTimeout(current.connectTimer);
    current.refreshTimer = undefined;
    current.connectTimer = undefined;
    const client = getSupabaseRealtimeClient();
    if (current.channel && client) void client.removeChannel(current.channel);
    current.channel = undefined;
    subscriptions.delete(scope);
  };
}
