/** Validate Cloudflare's request identifier before exposing it to the page. */
export function getRequestReference(value: string | null | undefined) {
  const reference = value?.trim();
  return reference && /^[a-f0-9]{16}(?:-[a-z0-9]{3})?$/i.test(reference)
    ? reference
    : null;
}
