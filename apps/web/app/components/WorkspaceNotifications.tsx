import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "react-router";
import { FormSelect } from "./FormSelect";
import { adminAccessPath, adminPath } from "../lib/admin-paths";
import { safeAdminRedirect, safeRedirectPath } from "../lib/safe-redirect";
import { startAdminNavigationPolling } from "../lib/admin-navigation-live";
import { subscribeWorkspaceRealtime } from "../lib/workspace-realtime.client";
import {
  notificationKinds,
  notificationDayGroup,
  notificationTime,
  groupNotificationEvents,
  mergeNotificationDismissals,
  notificationEventForEntity,
  validNotificationReads,
  validNotificationDismissals,
  type NotificationFeed,
  type NotificationDismissals,
  type NotificationKind,
  type NotificationReads,
  type WorkspaceEvent,
} from "../lib/notifications";
import "../styles/notifications.css";

type NotificationsContextValue = {
  scope: "client" | "admin";
  feed: NotificationFeed | null;
  reads: NotificationReads;
  dismissed: NotificationDismissals;
  loading: boolean;
  error: string;
  authRequired: boolean;
  signInTo: string;
  storageAvailable: boolean;
  importantKinds: NotificationKind[];
  refresh: () => void;
  mark: (events: WorkspaceEvent[], read: boolean) => void;
  dismiss: (events: WorkspaceEvent[]) => void;
  setImportantKinds: (kinds: NotificationKind[]) => void;
  open: (kind?: NotificationKind) => void;
};
const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);
const NotificationsScopeContext = createContext<"client" | "admin" | null>(null);
const storageKey = (identity: string) => `edicut:notifications:v1:${identity}`;
const dismissedStorageKey = (identity: string) =>
  `edicut:notifications:dismissed:v1:${identity}`;
const importanceStorageKey = (identity: string) =>
  `edicut:notifications:important-kinds:v1:${identity}`;
const DEFAULT_IMPORTANT_KINDS: NotificationKind[] = ["project"];
function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && Object.hasOwn(notificationKinds, value);
}
function savedImportantKinds(identity: string) {
  try {
    const saved = JSON.parse(
      localStorage.getItem(importanceStorageKey(identity)) || "null",
    );
    if (!Array.isArray(saved)) return [...DEFAULT_IMPORTANT_KINDS];
    return [...new Set(saved.filter(isNotificationKind))];
  } catch {
    return [...DEFAULT_IMPORTANT_KINDS];
  }
}
function savedReads(identity: string) {
  try {
    return validNotificationReads(
      JSON.parse(localStorage.getItem(storageKey(identity)) || "{}"),
    );
  } catch {
    return {};
  }
}
function savedDismissals(identity: string) {
  try {
    return validNotificationDismissals(
      JSON.parse(localStorage.getItem(dismissedStorageKey(identity)) || "{}"),
    );
  } catch {
    return {};
  }
}
export function WorkspaceNotificationsProvider({
  scope,
  children,
}: {
  scope: "client" | "admin";
  children: ReactNode;
}) {
  const existingScope = useContext(NotificationsScopeContext);
  // Route shells reuse the persistent workspace feed instead of reconnecting.
  if (existingScope === scope) return <>{children}</>;
  return (
    <NotificationsScopeContext.Provider value={scope}>
      <WorkspaceNotificationsStateProvider scope={scope}>{children}</WorkspaceNotificationsStateProvider>
    </NotificationsScopeContext.Provider>
  );
}
function WorkspaceNotificationsStateProvider({ scope, children }: {
  scope: "client" | "admin";
  children: ReactNode;
}) {
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [reads, setReads] = useState<NotificationReads>({});
  const [dismissed, setDismissed] = useState<NotificationDismissals>({});
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [importantKinds, setImportantKindsState] = useState<NotificationKind[]>(
    [...DEFAULT_IMPORTANT_KINDS],
  );
  const [isOpen, setOpen] = useState(false);
  const [selectedKind, setSelectedKind] = useState<NotificationKind | "all">(
    "all",
  );
  const active = useRef<AbortController | null>(null);
  const refreshAfterRead = useRef(false);
  const liveRefreshTimer = useRef<number | undefined>(undefined);
  const receiptVersions = useRef(new Map<string, number>());
  const legacyReadImportInFlight = useRef(false);
  const ordersVisitAcknowledged = useRef(new Set<string>());
  const identityRef = useRef("");
  const location = useLocation();
  const read = useCallback(
    async (outerSignal?: AbortSignal) => {
      if (active.current) return;
      const controller = new AbortController();
      active.current = controller;
      const timer = setTimeout(() => controller.abort(), 10_000);
      const signal = outerSignal
        ? AbortSignal.any([controller.signal, outerSignal])
        : controller.signal;
      setLoading(true);
      try {
        const response = await fetch(`/api/notifications?scope=${scope}`, {
          signal,
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.status === 401 || response.status === 403) {
          setFeed(null);
          setReads({});
          setDismissed({});
          identityRef.current = "";
          const requiresSignIn = response.status === 401;
          setAuthRequired(requiresSignIn);
          setError(requiresSignIn
            ? "Sign in again to view notifications."
            : "This account doesn’t have permission to view notifications.");
          return false;
        }
        if (!response.ok) throw new Error("Unavailable");
        const next = (await response.json()) as NotificationFeed;
        if (
          !next ||
          typeof next.identity !== "string" ||
          !next.identity.startsWith(scope === "admin" ? "admin:" : "user:") ||
          !Array.isArray(next.events) ||
          next.events.length > 100
        )
          throw new Error("Invalid response");
        if (signal.aborted) return;
        identityRef.current = next.identity;
        setImportantKindsState(
          scope === "admin"
            ? savedImportantKinds(next.identity)
            : [...DEFAULT_IMPORTANT_KINDS],
        );
        const databaseReads = validNotificationReads(
          Object.fromEntries(
            next.events.flatMap((event) => {
              const readAt = event.readAt ? Date.parse(event.readAt) : NaN;
              return Number.isFinite(readAt) ? [[event.id, readAt]] : [];
            }),
          ),
        );
        const legacy = next.readReceiptsAvailable === true
          ? savedReads(next.identity)
          : {};
        const legacyReceipts = next.events.flatMap((event) => {
          const readAt = legacy[event.id];
          return Number.isFinite(readAt)
            ? [{ eventId: event.id, readAt: new Date(readAt).toISOString() }]
            : [];
        });
        setReads(databaseReads);
        setDismissed(savedDismissals(next.identity));
        setFeed(next);
        setError("");
        setAuthRequired(false);
        if (legacyReceipts.length && !legacyReadImportInFlight.current) {
          legacyReadImportInFlight.current = true;
          void fetch(`/api/notifications?scope=${scope}`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identity: next.identity, legacyReads: legacyReceipts }),
          })
            .then(async (receiptResponse) => {
              if (!receiptResponse.ok) throw new Error("Legacy receipts could not be imported");
              const remaining = savedReads(next.identity);
              for (const { eventId } of legacyReceipts) delete remaining[eventId];
              try {
                if (Object.keys(remaining).length)
                  localStorage.setItem(storageKey(next.identity), JSON.stringify(remaining));
                else localStorage.removeItem(storageKey(next.identity));
              } catch {
                setStorageAvailable(false);
              }
              if (identityRef.current === next.identity) {
                if (active.current) refreshAfterRead.current = true;
                else window.setTimeout(() => {
                  if (identityRef.current === next.identity) void read();
                }, 0);
              }
            })
            .catch(() => {
              if (identityRef.current === next.identity)
                setError("Previous read status couldn’t sync. Try again.");
            })
            .finally(() => {
              legacyReadImportInFlight.current = false;
            });
        }
      } catch {
        if (active.current === controller && !outerSignal?.aborted)
          setError("Notifications couldn’t refresh. Try again.");
      } finally {
        clearTimeout(timer);
        if (active.current === controller) {
          active.current = null;
          setLoading(false);
          if (refreshAfterRead.current) {
            refreshAfterRead.current = false;
            liveRefreshTimer.current = window.setTimeout(() => {
              liveRefreshTimer.current = undefined;
              if (identityRef.current) void read();
            }, 0);
          }
        }
      }
    },
    [scope],
  );
  const refreshFromRealtime = useCallback(() => {
    if (liveRefreshTimer.current !== undefined) window.clearTimeout(liveRefreshTimer.current);
    liveRefreshTimer.current = window.setTimeout(() => {
      liveRefreshTimer.current = undefined;
      if (active.current) refreshAfterRead.current = true;
      else void read();
    }, 150);
  }, [read]);
  useEffect(() => {
    setFeed(null);
    setReads({});
    setDismissed({});
    setError("");
    identityRef.current = "";
    void read();
    const stopRealtime = subscribeWorkspaceRealtime(scope, refreshFromRealtime);
    // Keep a visible-tab safety poll for disconnected clients and missed broadcasts.
    const stopFallback = startAdminNavigationPolling(read, 30_000);
    return () => {
      stopRealtime();
      stopFallback?.();
      if (liveRefreshTimer.current !== undefined) window.clearTimeout(liveRefreshTimer.current);
      liveRefreshTimer.current = undefined;
      refreshAfterRead.current = false;
      const controller = active.current;
      active.current = null;
      controller?.abort();
    };
  }, [read, refreshFromRealtime, scope]);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (!identityRef.current) return;
      if (event.key === dismissedStorageKey(identityRef.current))
        setDismissed(savedDismissals(identityRef.current));
      if (
        scope === "admin" &&
        event.key === importanceStorageKey(identityRef.current)
      )
        setImportantKindsState(savedImportantKinds(identityRef.current));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [scope]);
  const mark = useCallback((events: WorkspaceEvent[], value: boolean) => {
    if (!feed) return;
    const eventIds = [...new Set(events.map((event) => event.id))].slice(0, 100);
    const versions = new Map<string, number>();
    for (const eventId of eventIds) {
      const version = (receiptVersions.current.get(eventId) ?? 0) + 1;
      receiptVersions.current.delete(eventId);
      receiptVersions.current.set(eventId, version);
      versions.set(eventId, version);
    }
    while (receiptVersions.current.size > 1000) {
      const oldest = receiptVersions.current.keys().next().value;
      if (oldest === undefined) break;
      receiptVersions.current.delete(oldest);
    }
    const optimisticAt = Date.now();
    setReads((current) => {
      const next = { ...current };
      for (const eventId of eventIds) {
        if (value) next[eventId] = optimisticAt;
        else delete next[eventId];
      }
      return validNotificationReads(next);
    });
    void fetch(`/api/notifications?scope=${scope}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventIds, read: value }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Receipt update failed");
        const result = (await response.json()) as {
          eventIds?: unknown;
          readAt?: unknown;
        };
        if (
          !Array.isArray(result.eventIds) ||
          result.eventIds.some((id) => typeof id !== "string") ||
          (value && typeof result.readAt !== "string")
        )
          throw new Error("Invalid receipt response");
        const confirmedAt = value ? Date.parse(result.readAt as string) : NaN;
        if (value && !Number.isFinite(confirmedAt))
          throw new Error("Invalid receipt timestamp");
        setReads((current) => {
          const next = { ...current };
          for (const eventId of result.eventIds as string[]) {
            if (versions.get(eventId) !== receiptVersions.current.get(eventId))
              continue;
            if (value) next[eventId] = confirmedAt;
            else delete next[eventId];
          }
          return validNotificationReads(next);
        });
        setError("");
      })
      .catch(() => {
        if (!eventIds.some((id) => versions.get(id) === receiptVersions.current.get(id)))
          return;
        setError("Read status couldn’t be saved. Try again.");
        if (active.current) refreshAfterRead.current = true;
        else void read();
      });
  }, [feed, scope, read]);
  const dismiss = (events: WorkspaceEvent[]) => {
    if (!feed) return;
    const next = mergeNotificationDismissals(
      savedDismissals(feed.identity),
      dismissed,
    );
    const dismissedAt = Date.now();
    for (const event of events) next[event.id] = dismissedAt;
    const bounded = validNotificationDismissals(next);
    setDismissed(bounded);
    try {
      localStorage.setItem(
        dismissedStorageKey(feed.identity),
        JSON.stringify(bounded),
      );
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  };
  const setImportantKinds = (kinds: NotificationKind[]) => {
    const next = [...new Set(kinds.filter(isNotificationKind))];
    setImportantKindsState(next);
    if (scope !== "admin" || !identityRef.current) return;
    try {
      localStorage.setItem(
        importanceStorageKey(identityRef.current),
        JSON.stringify(next),
      );
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  };
  // Visiting Orders acknowledges the current order events for this admin. The
  // receipts are persisted by the same API used by the notification controls.
  useEffect(() => {
    if (scope !== "admin" || location.pathname !== adminPath("/orders")) {
      ordersVisitAcknowledged.current.clear();
      return;
    }
    if (!feed) return;
    const orderEvents = feed.events.filter(
      (event) => event.kind === "order" && !reads[event.id] && !ordersVisitAcknowledged.current.has(event.id),
    );
    if (orderEvents.length) {
      for (const event of orderEvents) ordersVisitAcknowledged.current.add(event.id);
      mark(orderEvents, true);
    }
  }, [feed, location.pathname, mark, reads, scope]);
  const value = {
    scope,
    feed,
    reads,
    dismissed,
    loading,
    error,
    authRequired,
    signInTo: (() => {
      const currentPath = `${location.pathname}${location.search}`;
      const destination = scope === "admin"
        ? adminAccessPath(safeAdminRedirect(currentPath))
        : safeRedirectPath(currentPath);
      return `/signin?mode=signin&redirectTo=${encodeURIComponent(destination)}`;
    })(),
    storageAvailable,
    importantKinds,
    refresh: () => {
      void read();
    },
    mark,
    dismiss,
    setImportantKinds,
    open: (kind?: NotificationKind) => {
      setSelectedKind(kind ?? "all");
      setOpen(true);
      if (!feed || error) void read();
    },
  };
  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <NotificationDialog
        open={isOpen}
        selectedKind={selectedKind}
        close={() => setOpen(false)}
      />
    </NotificationsContext.Provider>
  );
}
function Icon({ name }: { name: string }) {
  return (
    <span className="material-symbols-outlined" aria-hidden="true">
      {name}
    </span>
  );
}
export function NotificationBell() {
  const context = useContext(NotificationsContext);
  if (!context) return null;
  const unread =
    context.feed?.events.filter(
      (event) => !context.reads[event.id] && !context.dismissed[event.id],
    ).length ?? 0;
  return (
    <>
      <button
        type="button"
        className="neo-workspace__icon-button notification-bell"
        aria-label={
          context.error
            ? "Notifications unavailable. Open to retry"
            : unread
              ? `Notifications, ${unread} unread`
              : "Notifications"
        }
        title="Notifications"
        aria-haspopup="dialog"
        onClick={() => context.open()}
      >
        <Icon name="notifications" />
        {unread ? (
          <span className="notification-bell__count" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : context.error ? (
          <span className="notification-bell__error" aria-hidden="true">
            !
          </span>
        ) : null}
      </button>
      <span className="sr-only" role="status" aria-atomic="true">
        {context.feed ? `${unread} unread notifications.` : ""}
      </span>
    </>
  );
}
export function useUnreadNotificationCount(kind?: NotificationKind) {
  const context = useContext(NotificationsContext);
  if (!context || context.scope !== "admin" || !kind) return 0;
  return (
    context.feed?.events.filter(
      (event) =>
        event.kind === kind &&
        !context.reads[event.id] &&
        !context.dismissed[event.id],
    ).length ?? 0
  );
}

export function useMarkNotificationRead() {
  const context = useContext(NotificationsContext);
  const feed = context?.feed;
  const reads = context?.reads;
  const mark = context?.mark;
  const loading = context?.loading ?? false;
  const hasContext = context !== null;
  const refreshRef = useRef(context?.refresh);
  refreshRef.current = context?.refresh;
  const pendingReads = useRef(new Map<string, { kind: NotificationKind; entityId: string }>());

  useEffect(() => {
    if (!feed || !reads || !mark || !pendingReads.current.size) return;
    const matchingEvents: WorkspaceEvent[] = [];
    for (const [key, pending] of pendingReads.current) {
      const event = notificationEventForEntity(feed.events, pending.kind, pending.entityId);
      if (event) {
        if (!reads[event.id]) matchingEvents.push(event);
        pendingReads.current.delete(key);
      } else if (!loading && !feed.unavailableKinds?.includes(pending.kind)) {
        pendingReads.current.delete(key);
      }
    }
    if (matchingEvents.length) mark(matchingEvents, true);
  }, [feed, loading, mark, reads]);

  return useCallback((kind: NotificationKind, entityId: string) => {
    if (!hasContext) return;
    if (!feed) {
      const key = `${kind}:${entityId}`;
      pendingReads.current.set(key, { kind, entityId });
      if (pendingReads.current.size > 100) {
        const oldest = pendingReads.current.keys().next().value;
        if (oldest !== undefined) pendingReads.current.delete(oldest);
      }
      if (!loading) refreshRef.current?.();
      return;
    }
    if (!reads || !mark) return;
    const event = notificationEventForEntity(feed.events, kind, entityId);
    if (event && !reads[event.id]) mark([event], true);
  }, [feed, hasContext, loading, mark, reads]);
}

function EventList({
  events,
  close,
  prioritize = false,
}: {
  events: WorkspaceEvent[];
  close?: () => void;
  prioritize?: boolean;
}) {
  const context = useContext(NotificationsContext)!;
  const grouped = new Map<string, WorkspaceEvent[]>();
  const now = Date.now();
  for (const event of events) {
    const day = notificationDayGroup(event.occurredAt, now);
    const dayEvents = grouped.get(day) ?? [];
    dayEvents.push(event);
    grouped.set(day, dayEvents);
  }
  const priorityRank = { normal: 0, important: 1, action: 2 } as const;
  const dayGroups = [...grouped].map(([day, dayEvents]) => {
    const eventGroups = groupNotificationEvents(dayEvents);
    return {
      day,
      events: prioritize
        ? eventGroups
        : eventGroups.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      priority: eventGroups.reduce<"action" | "important" | "normal">(
        (highest, group) =>
          priorityRank[group.priority] > priorityRank[highest]
            ? group.priority
            : highest,
        "normal",
      ),
      occurredAt: dayEvents.reduce(
        (latest, event) => event.occurredAt > latest ? event.occurredAt : latest,
        "",
      ),
    };
  }).sort((a, b) => prioritize
    ? priorityRank[b.priority] - priorityRank[a.priority] || b.occurredAt.localeCompare(a.occurredAt)
    : b.occurredAt.localeCompare(a.occurredAt));
  return (
    <div className="notification-events">
      {dayGroups.map(({ day, events: dayEventGroups }) => (
        <section
          className="notification-events__group"
          aria-label={day}
          key={day}
        >
          <h3>{day}</h3>
          <ul>
            {dayEventGroups.map((group) => {
              const event = group.events[0];
              if (!event) return null;
              const unread = group.events.some((member) => !context.reads[member.id]);
              const priorityLabel = group.priority === "action"
                ? "Needs an editor"
                : group.priority === "important"
                  ? "Important"
                  : null;
              const moveFocusAfterRemoval = (button: HTMLButtonElement) => {
                const row = button.closest("li");
                return row?.nextElementSibling?.querySelector<HTMLElement>(
                  ".notification-event__link",
                ) ?? row?.parentElement?.parentElement?.nextElementSibling?.querySelector<HTMLElement>(
                  ".notification-event__link",
                ) ?? button.closest("dialog")?.querySelector<HTMLElement>(
                  ".notification-tabs button",
                );
              };
              const markGroupRead = () => context.mark(group.events, true);
              return (
                <li
                  key={group.id}
                  className={`notification-event${unread ? " is-unread" : ""}${group.priority !== "normal" ? ` is-${group.priority}` : ""}`}
                >
                  <div className="notification-event__main">
                    <Link
                      to={event.to}
                      className="notification-event__link"
                      onClick={() => {
                        markGroupRead();
                        close?.();
                      }}
                    >
                      {unread ? (
                        <span className="notification-event__unread-dot" aria-hidden="true" />
                      ) : null}
                      <span className={`notification-event__icon notification-event__icon--${event.kind}`}>
                        <Icon name={notificationKinds[event.kind].icon} />
                      </span>
                      <span className="notification-event__copy">
                        <strong>
                          {event.title}
                          {group.events.length > 1 ? (
                            <span className="notification-event__group-count">{group.events.length} updates</span>
                          ) : null}
                          {priorityLabel ? (
                            <span className={`notification-event__priority notification-event__priority--${group.priority}`}>
                              {priorityLabel}
                            </span>
                          ) : null}
                          {unread ? <span className="sr-only">, unread</span> : null}
                        </strong>
                        <span>{event.detail}</span>
                        {group.events.length > 1 ? (
                          <span className="notification-event__group-detail">
                            Latest update shown; open the project to review the full activity.
                          </span>
                        ) : null}
                        <time
                          dateTime={event.occurredAt}
                          title={new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "Asia/Dhaka",
                          }).format(new Date(event.occurredAt))}
                        >
                          {notificationTime(event.occurredAt)}
                        </time>
                      </span>
                    </Link>
                    <div className="notification-event__actions">
                      <Link
                        to={event.actionTo || event.to}
                        className="notification-event__action"
                        onClick={() => {
                          markGroupRead();
                          close?.();
                        }}
                      >
                        {event.actionLabel || "Open update"}
                      </Link>
                      <details
                        className="notification-event__menu"
                        onKeyDown={(key) => {
                          if (key.key === "Escape") {
                            key.preventDefault();
                            key.currentTarget.open = false;
                            key.currentTarget.querySelector("summary")?.focus();
                          }
                        }}
                      >
                        <summary
                          aria-label={`More options for ${event.title}${group.events.length > 1 ? `, ${group.events.length} updates` : ""}: ${event.detail}`}
                          title="More options"
                          onClick={(click) => {
                            const details = click.currentTarget.parentElement;
                            const bounds = click.currentTarget.getBoundingClientRect();
                            const panelHeight = 96;
                            const panelWidth = Math.min(184, window.innerWidth - 16);
                            const top = window.innerHeight - bounds.bottom >= panelHeight + 8
                              ? bounds.bottom + 4
                              : Math.max(8, bounds.top - panelHeight - 4);
                            const left = Math.max(
                              8,
                              Math.min(window.innerWidth - panelWidth - 8, bounds.right - panelWidth),
                            );
                            details?.style.setProperty("--notification-menu-top", `${top}px`);
                            details?.style.setProperty("--notification-menu-left", `${left}px`);
                          }}
                        >
                          <Icon name="more_vert" />
                        </summary>
                        <div
                          className="notification-event__menu-panel"
                          role="group"
                          aria-label="Notification actions"
                        >
                          <button
                            type="button"
                            className="notification-event__menu-item"
                            onClick={(click) => {
                              click.currentTarget.closest("details")!.open = false;
                              context.mark(group.events, unread);
                            }}
                          >
                            {unread ? "Mark as read" : "Mark as unread"}
                          </button>
                          <button
                            type="button"
                            className="notification-event__menu-item notification-event__menu-item--danger"
                            aria-label={`Hide ${event.title} from this browser`}
                            title="Hides these notifications from this browser only"
                            onClick={(click) => {
                              const next = moveFocusAfterRemoval(click.currentTarget);
                              click.currentTarget.closest("details")!.open = false;
                              context.dismiss(group.events);
                              requestAnimationFrame(() => next?.focus());
                            }}
                          >
                            Hide here
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
function NotificationDialog({
  open,
  selectedKind,
  close,
}: {
  open: boolean;
  selectedKind: NotificationKind | "all";
  close: () => void;
}) {
  const context = useContext(NotificationsContext)!;
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLElement | null>(null);
  const [view, setView] = useState<"important" | "all">("important"),
    [kind, setKind] = useState("all");
  const [showImportanceSettings, setShowImportanceSettings] = useState(false);
  useEffect(() => {
    if (open) {
      setKind(selectedKind);
      setView(selectedKind === "all" ? "important" : "all");
      setShowImportanceSettings(false);
    }
  }, [open, selectedKind]);
  useEffect(() => {
    if (!open) {
      if (dialog.current?.open) dialog.current.close();
      return;
    }
    trigger.current = document.activeElement as HTMLElement;
    const triggerTop = trigger.current?.getBoundingClientRect().top ?? 20;
    dialog.current?.style.setProperty(
      "--notification-dialog-top",
      `${Math.max(8, Math.round(triggerTop))}px`,
    );
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);
  const events = (context.feed?.events ?? []).filter(
    (event) => !context.dismissed[event.id],
  );
  const unread = events.filter((event) => !context.reads[event.id]);
  const important = events.filter(
    (event) =>
      context.importantKinds.includes(event.kind) || event.priority === "action",
  );
  const importantCount = groupNotificationEvents(important).length;
  const allCount = groupNotificationEvents(events).length;
  const visible = (view === "important" ? important : events).filter(
    (event) => kind === "all" || event.kind === kind,
  );
  const sourceUnavailable = context.feed?.unavailableKinds?.includes(
    kind as NotificationKind,
  );
  return (
    <dialog
      ref={dialog}
      className="notification-dialog"
      aria-labelledby="notifications-title"
      onCancel={close}
      onClose={close}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          !event.target.closest(".notification-event__menu")
        ) {
          event.currentTarget
            .querySelectorAll<HTMLDetailsElement>(
              ".notification-event__menu[open]",
            )
            .forEach((menu) => {
              menu.open = false;
            });
        }
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            close();
        }
      }}
    >
      <header className="notification-dialog__header">
        <div>
          <h2 id="notifications-title">Notifications</h2>
          <p>Take action on project staffing, then catch up on every update.</p>
        </div>
        <div className="notification-dialog__header-actions">
          {context.scope === "admin" ? (
            <button
              type="button"
              className="notification-icon-button"
              aria-label="Important notification settings"
              aria-controls="notification-importance-settings"
              aria-expanded={showImportanceSettings}
              onClick={() => setShowImportanceSettings((current) => !current)}
            >
              <Icon name="tune" />
            </button>
          ) : null}
          <button
            type="button"
            className="notification-icon-button"
            aria-label="Refresh notifications"
            disabled={context.loading}
            onClick={context.refresh}
          >
            <Icon name="refresh" />
          </button>
          <button
            type="button"
            className="notification-icon-button"
            aria-label="Close notifications"
            onClick={close}
            autoFocus
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      <div className="notification-dialog__actions">
        <div
          className="notification-tabs"
          role="group"
          aria-label="Notification view"
        >
          {(["important", "all"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              <span>{value === "important" ? "Important" : "All events"}</span>
              <span className="notification-tabs__count">
                {value === "important" ? importantCount : allCount}
              </span>
            </button>
          ))}
        </div>
        <div className="notification-dialog__filter">
          <label
            className="sr-only"
            id="notification-kind-label"
            htmlFor="notification-kind"
          >
            Filter notifications by event type
          </label>
          <FormSelect
            id="notification-kind"
            name="kind"
            className="notification-type-select"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "All types" },
              ...Object.entries(notificationKinds)
                .filter(
                  ([key]) =>
                    !context.feed?.kinds ||
                    context.feed.kinds.includes(key as NotificationKind),
                )
                .map(([key, value]) => ({
                  value: key,
                  label: value.label,
                })),
            ]}
          />
        </div>
        <button
          type="button"
          className="notification-text-button"
          disabled={!unread.length}
          onClick={() => {
            context.mark(unread, true);
            dialog.current
              ?.querySelector<HTMLElement>(".notification-tabs button")
              ?.focus();
          }}
        >
          Mark all read
        </button>
      </div>
      {context.error ? (
        <p className="notification-notice" role="alert">
          {context.error}{" "}
          {context.authRequired ? <Link to={context.signInTo}>Sign in</Link> : null}{" "}
          <button type="button" onClick={context.refresh}>
            Retry
          </button>
        </p>
      ) : null}
      <div className="notification-dialog__body" aria-busy={context.loading}>
        {context.scope === "admin" ? (
          <section
            className="notification-importance-settings"
            id="notification-importance-settings"
            aria-labelledby="notification-importance-title"
            hidden={!showImportanceSettings}
          >
            <div className="notification-importance-settings__heading">
              <h3 id="notification-importance-title">
                Important notification types
              </h3>
              <p>
                Selected types appear in Important. Urgent staffing actions stay
                there too.
              </p>
            </div>
            <fieldset className="notification-importance-settings__options">
              <legend className="sr-only">
                Choose notification types to include in Important
              </legend>
              {Object.entries(notificationKinds)
                .filter(
                  ([key]) =>
                    !context.feed?.kinds ||
                    context.feed.kinds.includes(key as NotificationKind),
                )
                .map(([key, definition]) => {
                  const notificationKind = key as NotificationKind;
                  const selected =
                    context.importantKinds.includes(notificationKind);
                  return (
                    <label
                      className={`notification-importance-settings__option${selected ? " is-selected" : ""}`}
                      key={key}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          const next = event.currentTarget.checked
                            ? [...context.importantKinds, notificationKind]
                            : context.importantKinds.filter(
                                (kind) => kind !== notificationKind,
                              );
                          context.setImportantKinds(next);
                        }}
                      />
                      <Icon name={definition.icon} />
                      <span>{definition.label}</span>
                    </label>
                  );
                })}
            </fieldset>
            <div className="notification-importance-settings__footer">
              <span>Saved for this admin in this browser.</span>
              <button
                type="button"
                className="notification-text-button"
                onClick={() =>
                  context.setImportantKinds([...DEFAULT_IMPORTANT_KINDS])
                }
              >
                Reset defaults
              </button>
            </div>
          </section>
        ) : null}
        {context.loading && !context.feed ? (
          <p className="notification-empty" role="status">
            Loading notifications…
          </p>
        ) : visible.length ? (
          <EventList
            events={visible}
            close={close}
            prioritize={view === "important"}
          />
        ) : !context.error ? (
          <div className="notification-empty">
            <Icon name="notifications_none" />
            <h3>
              {sourceUnavailable
                ? "Updates temporarily unavailable"
                : context.feed?.partial
                  ? "No available events in this view"
                  : view === "important"
                    ? "Nothing needs your attention"
                    : "No notifications in this view"}
            </h3>
            <p>
              {sourceUnavailable
                ? "Other event types are still available. Try refreshing later."
                : kind !== "all"
                  ? "Choose another event type to see more updates."
                  : view === "important"
                    ? "Selected event types and urgent staffing actions will appear here."
                    : "Workspace activity from the last 90 days will appear here."}
            </p>
            {view === "important" && events.length ? (
              <button
                type="button"
                className="notification-text-button"
                onClick={() => setView("all")}
              >
                See all events
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {!context.storageAvailable ||
      context.feed?.partial ||
      context.feed?.readReceiptsAvailable === false ? (
        <footer className="notification-dialog__footer">
          {!context.storageAvailable ? (
            <p>Hidden status can’t be saved in this browser and will reset when you leave.</p>
          ) : null}
          {context.feed?.partial ? (
          <p>
            Some event sources are unavailable. Other notifications are still
            shown.
          </p>
          ) : null}
          {context.feed?.readReceiptsAvailable === false ? (
            <p>
              Read status can’t sync across devices because the database receipts
              table is unavailable. Contact an administrator if this continues.
            </p>
          ) : null}
        </footer>
      ) : null}
    </dialog>
  );
}
export function AdminRecentEvents() {
  const context = useContext(NotificationsContext);
  const [selectedKind, setSelectedKind] = useState<NotificationKind | "all">(
    "all",
  );
  if (!context) return null;
  const events = (context.feed?.events ?? []).filter(
    (event) => !context.dismissed[event.id],
  );
  const unread = events.filter((event) => !context.reads[event.id]);
  const tabKinds: Array<NotificationKind | "all"> = [
    "all",
    ...(Object.keys(notificationKinds) as NotificationKind[]),
  ];
  const visibleEvents = events.filter(
    (event) => selectedKind === "all" || event.kind === selectedKind,
  );
  const unreadCount = (kind: NotificationKind | "all") =>
    unread.filter((event) => kind === "all" || event.kind === kind).length;
  const selectedSourceUnavailable = Boolean(
    selectedKind !== "all" &&
      context.feed?.unavailableKinds?.includes(selectedKind),
  );
  return (
    <section
      className="notification-overview neo-workspace__panel"
      aria-labelledby="admin-events-title"
    >
      <header className="notification-overview__header">
        <div>
          <h2 id="admin-events-title">
            New events
            {unread.length ? <span>{unread.length} unread</span> : null}
          </h2>
          <p>Requests, purchases, and feedback arriving in your workspace.</p>
        </div>
        <button
          type="button"
          className="notification-text-button"
          onClick={() => context.open(selectedKind === "all" ? undefined : selectedKind)}
        >
          View all notifications <Icon name="arrow_forward" />
        </button>
      </header>
      <nav className="notification-overview__tabs" aria-label="Event type">
        {tabKinds.map((kind) => {
          const count = unreadCount(kind);
          const total = events.filter(
            (event) => kind === "all" || event.kind === kind,
          ).length;
          const unavailable =
            kind !== "all" && context.feed?.unavailableKinds?.includes(kind);
          return (
            <button
              type="button"
              key={kind}
              aria-pressed={selectedKind === kind}
              aria-label={`${kind === "all" ? "All events" : notificationKinds[kind].label}: ${unavailable ? "event source unavailable" : `${count} unread of ${total}`}`}
              onClick={() => setSelectedKind(kind)}
            >
              {kind !== "all" ? (
                <Icon name={notificationKinds[kind].icon} />
              ) : null}
              <span>{kind === "all" ? "All events" : notificationKinds[kind].label}</span>
              <strong
                className={`notification-overview__tab-count${count ? " is-unread" : ""}`}
                aria-hidden="true"
              >
                {context.feed && !unavailable ? (count || total) : "—"}
              </strong>
            </button>
          );
        })}
      </nav>
      {context.error ? (
        <p className="notification-notice" role="alert">
          {context.error}{" "}
          {context.authRequired ? <Link to={context.signInTo}>Sign in</Link> : null}{" "}
          <button type="button" onClick={context.refresh}>
            Retry
          </button>
        </p>
      ) : null}
      {visibleEvents.length ? (
        <EventList events={visibleEvents.slice(0, 6)} />
      ) : context.loading ? (
        <p className="notification-empty" role="status">
          Loading recent events…
        </p>
      ) : !context.error ? (
        <p className="notification-empty">
          {selectedSourceUnavailable
            ? `${notificationKinds[selectedKind as NotificationKind].label} are temporarily unavailable.`
            : selectedKind === "all"
              ? "New requests and workspace updates will appear here."
              : `No ${notificationKinds[selectedKind as NotificationKind].label.toLowerCase()} yet.`}
        </p>
      ) : null}
      {context.feed?.partial ? (
        <p className="notification-overview__partial">
          Some event sources are unavailable. Available events are shown.
        </p>
      ) : null}
    </section>
  );
}
