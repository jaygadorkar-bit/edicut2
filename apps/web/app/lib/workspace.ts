export function parseWorkspaceShareUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.href.length > 2048) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function isWorkspaceRecordId(value: string) {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

export function isMissingWorkspaceSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const detail = error as { code?: unknown; message?: unknown };
  const message = typeof detail.message === "string" ? detail.message : "";
  const workspaceTables = /workspace_(projects|project_files|project_reviews)/i;
  if (detail.code === "42P01" && workspaceTables.test(message)) return true;
  if (/relation\s+["']?workspace_(projects|project_files|project_reviews)["']?\s+does not exist/i.test(message)) return true;
  return detail.code === "42703" && workspaceTables.test(message);
}

export function isValidWorkspaceDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseBillingAmountToCents(value: string) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [dollars, fractional = ""] = normalized.split(".");
  const cents = Number(dollars) * 100 + Number(fractional.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export const WORKSPACE_MIGRATION_NOTICE = "Customer workspace setup is waiting for its database migration. No project information has been changed.";
