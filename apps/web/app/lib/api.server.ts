import { SERVICE_AUTH_HEADER } from "@edicut/shared";
import type { WebLoadContext } from "./context.server";
import { resolveWebEnv } from "./context.server";

export async function fetchNodeApi<T>(
  context: WebLoadContext | undefined,
  path: string,
  init?: RequestInit
): Promise<T | null> {
  const env = resolveWebEnv(context);
  const baseUrl = env.NODE_API_BASE_URL?.replace(/\/$/, "");

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      Accept: "application/json",
      [SERVICE_AUTH_HEADER]: env.SERVICE_SHARED_SECRET ?? "",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Node API request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function postNodeApi<TResponse, TBody extends Record<string, unknown>>(
  context: WebLoadContext | undefined,
  path: string,
  body: TBody
) {
  return fetchNodeApi<TResponse>(context, path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Class": "cloudflare-to-node-api",
    },
    body: JSON.stringify(body),
  });
}
