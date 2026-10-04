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
  const workspaceTables = /workspace_(projects|project_files|project_reviews)/i;
  const workspaceColumns = /\b(channel_name|package_slug|cadence|deadline|billing_name|billing_email|billing_company|billing_country|final_amount_cents|invoice_url|estimated_amount_cents|billing_status|coupon_id|coupon_code|discount_amount_cents|affiliate_id|affiliate_code|affiliate_commission_bps|project_id|file_name|share_url|decision|feedback)\b/i;
  const seen = new Set<object>();
  let workspaceContext = false;
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const detail = current as { code?: unknown; message?: unknown; cause?: unknown };
    const message = typeof detail.message === "string" ? detail.message : "";
    workspaceContext ||= workspaceTables.test(message);
    if (detail.code === "42P01" && workspaceTables.test(message)) return true;
    if (/relation\s+["']?workspace_(projects|project_files|project_reviews)["']?\s+does not exist/i.test(message)) return true;
    if (detail.code === "42703" && (workspaceTables.test(message) || workspaceContext && workspaceColumns.test(message))) return true;
    current = detail.cause;
  }
  return false;
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
