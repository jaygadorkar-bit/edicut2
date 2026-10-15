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
import { startAdminNavigationPolling } from "../lib/admin-navigation-live";
import {
  mergeNotificationReads,
  notificationKinds,
  notificationDayGroup,
  notificationTime,
  mergeNotificationDismissals,
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
  feed: NotificationFeed | null;
  reads: NotificationReads;
  dismissed: NotificationDismissals;
  loading: boolean;
  error: string;
  storageAvailable: boolean;
  refresh: () => void;
  mark: (events: WorkspaceEvent[], read: boolean) => void;
  dismiss: (event: WorkspaceEvent) => void;
  open: (kind?: NotificationKind) => void;
};
const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);
const storageKey = (identity: string) => `edicut:notifications:v1:${identity}`;
const dismissedStorageKey = (identity: string) =>
  `edicut:notifications:dismissed:v1:${identity}`;
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
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [reads, setReads] = useState<NotificationReads>({});
  const [dismissed, setDismissed] = useState<NotificationDismissals>({});
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [isOpen, setOpen] = useState(false);
  const [selectedKind, setSelectedKind] = useState<NotificationKind | "all">(
    "all",
  );
  const active = useRef<AbortController | null>(null);
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
          setError("Sign in again to view notifications.");
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
        setReads(savedReads(next.identity));
        setDismissed(savedDismissals(next.identity));
        setFeed(next);
        setError("");
      } catch {
        if (active.current === controller && !outerSignal?.aborted)
          setError("Notifications couldn’t refresh. Try again.");
      } finally {
        clearTimeout(timer);
        if (active.current === controller) {
          active.current = null;
          setLoading(false);
        }
      }
    },
    [scope],
  );
  useEffect(() => {
    setFeed(null);
    setReads({});
    setDismissed({});
    setError("");
    identityRef.current = "";
    void read();
    const stop = startAdminNavigationPolling(read);
    return () => {
      stop();
      const controller = active.current;
      active.current = null;
      controller?.abort();
    };
  }, [read]);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (!identityRef.current) return;
      if (event.key === storageKey(identityRef.current))
        setReads(savedReads(identityRef.current));
      if (event.key === dismissedStorageKey(identityRef.current))
        setDismissed(savedDismissals(identityRef.current));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const mark = (events: WorkspaceEvent[], value: boolean) => {
    if (!feed) return;
    const next = mergeNotificationReads(savedReads(feed.identity), reads);
    for (const event of events) {
      if (value) next[event.id] = Date.now();
      else delete next[event.id];
    }
    const bounded = validNotificationReads(next);
    setReads(bounded);
    try {
      localStorage.setItem(storageKey(feed.identity), JSON.stringify(bounded));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  };
  const dismiss = (event: WorkspaceEvent) => {
    if (!feed) return;
    const next = mergeNotificationDismissals(
      savedDismissals(feed.identity),
      dismissed,
    );
    next[event.id] = Date.now();
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
  const value = {
    feed,
    reads,
    dismissed,
    loading,
    error,
    storageAvailable,
    refresh: () => {
      void read();
    },
    mark,
    dismiss,
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
function EventList({
  events,
  close,
  unreadOnly = false,
}: {
  events: WorkspaceEvent[];
  close?: () => void;
  unreadOnly?: boolean;
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
  return (
    <div className="notification-events">
      {[...grouped].map(([day, dayEvents]) => (
        <section
          className="notification-events__group"
          aria-label={day}
          key={day}
        >
          <h3>{day}</h3>
          <ul>
            {dayEvents.map((event) => {
              const unread = !context.reads[event.id];
              return (
                <li
                  key={event.id}
                  className={`notification-event${unread ? " is-unread" : ""}`}
                >
                  <Link
                    to={event.to}
                    className="notification-event__link"
                    onClick={() => {
                      context.mark([event], true);
                      close?.();
                    }}
                  >
                    {unread ? (
                      <span
                        className="notification-event__unread-dot"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className={`notification-event__icon notification-event__icon--${event.kind}`}
                    >
                      <Icon name={notificationKinds[event.kind].icon} />
                    </span>
                    <span className="notification-event__copy">
                      <strong>
                        {event.title}
                        {unread ? (
                          <span className="sr-only">, unread</span>
                        ) : null}
                      </strong>
                      <span>{event.detail}</span>
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
                      aria-label={`More options for ${event.title}: ${event.detail}`}
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
                          const row = click.currentTarget.closest("li");
                          const next =
                            row?.nextElementSibling?.querySelector<HTMLElement>(
                              ".notification-event__link",
                            ) ??
                            row?.parentElement?.parentElement?.nextElementSibling?.querySelector<HTMLElement>(
                              ".notification-event__link",
                            ) ??
                            click.currentTarget
                              .closest("dialog")
                              ?.querySelector<HTMLElement>(".notification-tabs button");
                          click.currentTarget.closest("details")!.open = false;
                          context.mark([event], unread);
                          if (unread && unreadOnly)
                            requestAnimationFrame(() => next?.focus());
                        }}
                      >
                        {unread ? "Mark as read" : "Mark as unread"}
                      </button>
                      <button
                        type="button"
                        className="notification-event__menu-item notification-event__menu-item--danger"
                        aria-label={`Delete notification from this browser: ${event.title}`}
                        title="Removes this notification from this browser only"
                        onClick={(click) => {
                          const row = click.currentTarget.closest("li");
                          const next =
                            row?.nextElementSibling?.querySelector<HTMLElement>(
                              ".notification-event__link",
                            ) ??
                            row?.parentElement?.parentElement?.nextElementSibling?.querySelector<HTMLElement>(
                              ".notification-event__link",
                            ) ??
                            click.currentTarget
                              .closest("dialog")
                              ?.querySelector<HTMLElement>(".notification-tabs button");
                          context.dismiss(event);
                          requestAnimationFrame(() => next?.focus());
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </details>
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
  const [view, setView] = useState("unread"),
    [kind, setKind] = useState("all");
  useEffect(() => {
    if (open) {
      setKind(selectedKind);
      setView("unread");
    }
  }, [open, selectedKind]);
  useEffect(() => {
    if (!open) {
      if (dialog.current?.open) dialog.current.close();
      return;
    }
    trigger.current = document.activeElement as HTMLElement;
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
  const visible = (view === "unread" ? unread : events).filter(
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
        </div>
        <button
          type="button"
          className="notification-icon-button"
          aria-label="Close notifications"
          onClick={close}
          autoFocus
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="notification-dialog__actions">
        <div className="notification-tabs" aria-label="Notification view">
          {["unread", "all"].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {value === "unread" ? "Unread" : "All events"}
            </button>
          ))}
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
        <button
          type="button"
          className="notification-icon-button"
          aria-label="Refresh notifications"
          disabled={context.loading}
          onClick={context.refresh}
        >
          <Icon name="refresh" />
        </button>
      </div>
      <div className="notification-dialog__filter">
        <label className="sr-only" id="notification-kind-label" htmlFor="notification-kind">
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
      {context.error ? (
        <p className="notification-notice" role="alert">
          {context.error}{" "}
          <button type="button" onClick={context.refresh}>
            Retry
          </button>
        </p>
      ) : null}
      <div className="notification-dialog__body" aria-busy={context.loading}>
        {context.loading && !context.feed ? (
          <p className="notification-empty" role="status">
            Loading notifications…
          </p>
        ) : visible.length ? (
          <EventList
            events={visible}
            close={close}
            unreadOnly={view === "unread"}
          />
        ) : !context.error ? (
          <div className="notification-empty">
            <Icon name="notifications_none" />
            <h3>
              {sourceUnavailable
                ? "Updates temporarily unavailable"
                : context.feed?.partial
                  ? "No available events in this view"
                  : view === "unread"
                    ? "You’re up to date"
                    : "No notifications in this view"}
            </h3>
            <p>
              {sourceUnavailable
                ? "Other event types are still available. Try refreshing later."
                : kind !== "all"
                  ? "Choose another event type to see more updates."
                  : view === "unread"
                    ? "New requests and updates will appear here."
                    : "Workspace activity from the last 90 days will appear here."}
            </p>
            {view === "unread" && events.length ? (
              <button
                type="button"
                className="notification-text-button"
                onClick={() => setView("all")}
              >
                View all events
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {!context.storageAvailable || context.feed?.partial ? (
        <footer className="notification-dialog__footer">
          {!context.storageAvailable ? (
            <p>Read status and deleted notifications can’t be saved in this browser and will reset when you leave.</p>
          ) : null}
          {context.feed?.partial ? (
          <p>
            Some event sources are unavailable. Other notifications are still
            shown.
          </p>
          ) : null}
        </footer>
      ) : null}
    </dialog>
  );
}
export function AdminRecentEvents() {
  const context = useContext(NotificationsContext);
  if (!context) return null;
  const events = (context.feed?.events ?? []).filter(
    (event) => !context.dismissed[event.id],
  );
  const unread = events.filter((event) => !context.reads[event.id]);
  const counts = (kind: NotificationKind) =>
    unread.filter((event) => event.kind === kind).length;
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
          onClick={() => context.open()}
        >
          View notifications <Icon name="arrow_forward" />
        </button>
      </header>
      <div className="notification-overview__counts">
        {(Object.keys(notificationKinds) as NotificationKind[]).map((kind) => (
          <button type="button" key={kind} onClick={() => context.open(kind)}>
            <Icon name={notificationKinds[kind].icon} />
            <span>{notificationKinds[kind].label}</span>
            <strong>
              {context.feed && !context.feed.unavailableKinds?.includes(kind)
                ? counts(kind)
                : "—"}
            </strong>
            <span className="sr-only">
              {context.feed?.unavailableKinds?.includes(kind)
                ? "event source unavailable"
                : "unread in recent events"}
            </span>
          </button>
        ))}
      </div>
      {context.error ? (
        <p className="notification-notice" role="alert">
          {context.error}{" "}
          <button type="button" onClick={context.refresh}>
            Retry
          </button>
        </p>
      ) : null}
      {events.length ? (
        <EventList events={events.slice(0, 6)} />
      ) : context.loading ? (
        <p className="notification-empty" role="status">
          Loading recent events…
        </p>
      ) : !context.error ? (
        <p className="notification-empty">
          New requests and workspace updates will appear here.
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
