import { fetchNodeApi } from "../lib/api.server";
import type { LoaderContext } from "../types";

export async function loader({ context }: { context?: LoaderContext }) {
  const nodeHealth = context
    ? await fetchNodeApi<{ ok: boolean; runtime: string }>(context, "/api/node/health").catch(() => null)
    : null;

  return Response.json({
    ok: true,
    runtime: "cloudflare-workers",
    nodeApi: nodeHealth?.ok ?? false,
    nodeRuntime: nodeHealth?.runtime ?? "unavailable",
  });
}
