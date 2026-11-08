export function isCryptomusPaymentUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "pay.cryptomus.com"
      && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isActiveCryptomusInvoice(url: unknown, expiresAt: Date | string | null | undefined) {
  if (!isCryptomusPaymentUrl(url) || expiresAt == null) return false;
  const expiry = new Date(expiresAt instanceof Date ? expiresAt.valueOf() : expiresAt).valueOf();
  return Number.isFinite(expiry) && expiry > Date.now();
}
