import type { LoaderFunctionArgs } from "react-router";

export async function loader(_args: LoaderFunctionArgs) {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "web",
      timestamp: new Date().toISOString(),
    }),
    {
      headers: {
        "content-type": "application/json",
      },
    }
  );
}