import { cookies } from "next/headers";

function getApiOrigin() {
  return (
    process.env.INTERNAL_API_ORIGIN?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
  );
}

export async function fetchServerApi<TResponse>(
  path: string,
  init?: Omit<RequestInit, "body"> & { body?: BodyInit | null }
): Promise<TResponse> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const apiOrigin = getApiOrigin();
  const url = apiOrigin ? `${apiOrigin}${normalizedPath}` : normalizedPath;
  const cookieHeader = (await cookies()).toString();

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(init?.headers ?? {}),
    },
    cache: init?.cache ?? "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(
      typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}.`
    );
  }

  return payload as TResponse;
}
