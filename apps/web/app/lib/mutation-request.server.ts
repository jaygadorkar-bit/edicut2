/** Allow same-origin POST forms, including older clients without Origin. */
export function isSameSiteMutation(request: Request) {
  if (request.method !== "POST" || request.headers.get("Sec-Fetch-Site") === "cross-site") return false;
  const origin = request.headers.get("Origin");
  const expected = new URL(request.url).origin;
  if (origin) return origin === expected;
  const referer = request.headers.get("Referer");
  if (referer) {
    try { return new URL(referer).origin === expected; }
    catch { return false; }
  }
  // Same-site sibling domains are not trusted when no exact origin is supplied.
  return request.headers.get("Sec-Fetch-Site") !== "same-site";
}

/** Bound the actual stream before parsing either text forms or media uploads. */
export async function readMutationForm(request: Request, maximumBytes: number): Promise<FormData | null> {
  const type = request.headers.get("Content-Type")?.toLowerCase() || "";
  if (request.method !== "POST" || !request.body || !/^(application\/x-www-form-urlencoded|multipart\/form-data)(?:;|$)/.test(type)) return null;
  let bytes = 0;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maximumBytes) throw new Error("Form body exceeded its limit.");
      controller.enqueue(chunk);
    },
  }));
  try {
    const bounded = new Request(request.url, { method: "POST", headers: request.headers, body, duplex: "half" } as RequestInit & { duplex: "half" });
    return await bounded.formData();
  } catch {
    return null;
  }
}

export function forbiddenMutation() {
  return new Response("Please submit changes from this site.", { status: 403, headers: { "Cache-Control": "no-store" } });
}
