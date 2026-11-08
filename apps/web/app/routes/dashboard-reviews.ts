import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireClientWorkspace } from "../lib/client-workspace-access.server";

export function headers() {
  return { "Cache-Control": "no-store", "Referrer-Policy": "same-origin" };
}

export async function loader(args: LoaderFunctionArgs) {
  const { features } = await requireClientWorkspace(args);
  if (!features.includes("reviews")) throw redirect("/dashboard/projects");
  return redirect("/dashboard/projects?view=reviews");
}
