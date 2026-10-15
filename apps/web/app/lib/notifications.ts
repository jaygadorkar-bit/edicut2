export const notificationKinds = {
  project: { label: "Project requests", icon: "video_library" },
  order: { label: "Orders", icon: "receipt_long" },
  payment: { label: "Payments", icon: "payments" },
  enquiry: { label: "Enquiries", icon: "mail" },
  quote: { label: "Custom quotes", icon: "description" },
  review: { label: "Video reviews", icon: "rate_review" },
} as const;
export type NotificationKind = keyof typeof notificationKinds;
export type WorkspaceEvent = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  to: string;
  occurredAt: string;
};
export type NotificationFeed = {
  kinds?: NotificationKind[];
  unavailableKinds?: NotificationKind[];
  identity: string;
  events: WorkspaceEvent[];
  generatedAt: string;
  partial: boolean;
};
export type NotificationReads = Record<string, number>;
export type NotificationDismissals = Record<string, number>;
export const NOTIFICATION_HISTORY_DAYS = 90;
export const NOTIFICATION_FEED_LIMIT = 100;
const notificationDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
function notificationDayNumber(date: Date) {
  const parts = notificationDayFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000;
}
export function notificationDayGroup(iso: string, now = Date.now()) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Earlier";
  const daysAgo = notificationDayNumber(new Date(now)) - notificationDayNumber(date);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Dhaka",
  }).format(date);
}
export function validNotificationReads(
  value: unknown,
  now = Date.now(),
): NotificationReads {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([id, at]) =>
          id.length <= 180 &&
          typeof at === "number" &&
          Number.isFinite(at) &&
          at <= now + 60_000 &&
          at >= now - NOTIFICATION_HISTORY_DAYS * 86400_000,
      )
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 1000),
  );
}
export function validNotificationDismissals(
  value: unknown,
  now = Date.now(),
): NotificationDismissals {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([id, at]) =>
          id.length <= 180 &&
          typeof at === "number" &&
          Number.isFinite(at) &&
          at <= now + 60_000 &&
          at >= now - NOTIFICATION_HISTORY_DAYS * 86400_000,
      )
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 1000),
  );
}
export function mergeNotificationDismissals(
  a: NotificationDismissals,
  b: NotificationDismissals,
  now = Date.now(),
) {
  return validNotificationDismissals({ ...a, ...b }, now);
}
export function mergeNotificationReads(
  a: NotificationReads,
  b: NotificationReads,
  now = Date.now(),
) {
  return validNotificationReads({ ...a, ...b }, now);
}
export function notificationTime(iso: string, now = Date.now()) {
  const difference = Math.max(0, now - new Date(iso).getTime());
  if (difference < 60_000) return "Just now";
  if (difference < 3600_000) return `${Math.floor(difference / 60_000)}m ago`;
  if (difference < 86400_000)
    return `${Math.floor(difference / 3600_000)}h ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Dhaka",
  }).format(new Date(iso));
}
