type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

function getApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

  if (!baseUrl) {
    return normalizedPath;
  }

  return `${baseUrl}${normalizedPath}`;
}

export async function fetchApi<TResponse>(
  path: string,
  init?: Omit<RequestInit, "body"> & { body?: JsonValue }
): Promise<TResponse> {
  const response = await fetch(getApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { success: false, error: await response.text() };

  if (!response.ok) {
    throw new Error(
      typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : "Request failed."
    );
  }

  return payload as TResponse;
}
