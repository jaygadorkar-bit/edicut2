/** Allow same-origin POST forms, including older clients without Origin. */
export function isSameSiteMutation(request: Request) {
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (request.method !== "POST" || fetchSite === "cross-site") return false;

  const expectedUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");

  if (origin && origin !== "null") return originMatchesRequest(origin, expectedUrl);

  if (referer) {
    try { return originMatchesRequest(new URL(referer).origin, expectedUrl); }
    catch { return false; }
  }

  // Some privacy-focused browsers send Origin: null for top-level local forms.
  // Fetch Metadata still distinguishes a same-origin submission from a foreign site.
  if (fetchSite === "same-origin") return true;
  if (origin === "null") return false;

  // Same-site sibling domains are not trusted when no exact origin is supplied.
  return request.headers.get("Sec-Fetch-Site") !== "same-site";
}

function originMatchesRequest(origin: string, expectedUrl: URL) {
  let submittedOrigin: URL;
  try {
    submittedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (submittedOrigin.origin === expectedUrl.origin) return true;
  if (submittedOrigin.protocol !== expectedUrl.protocol || submittedOrigin.port !== expectedUrl.port) return false;

  // Localhost, IPv4 loopback, and IPv6 loopback are equivalent dev hosts when
  // the browser and server use the same scheme and port.
  return isLoopbackHost(submittedOrigin.hostname) && isLoopbackHost(expectedUrl.hostname);
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
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
