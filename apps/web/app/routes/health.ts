import type { LoaderFunctionArgs } from "react-router";
import { sql } from "drizzle-orm";
import { getDbFromContext } from "../lib/db.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const timestamp = new Date().toISOString();

  try {
    await getDbFromContext(context).execute(sql`SELECT 1`);
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        service: "web",
        database: "unavailable",
        timestamp,
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      service: "web",
      database: "connected",
      timestamp,
    }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    }
  );
}
