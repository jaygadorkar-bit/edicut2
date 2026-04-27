import { redirect } from "react-router";
import { logoutUser } from "../lib/auth.server";
import type { LoaderContext } from "../types";

export async function action({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  if (!context?.env) {
    throw redirect("/");
  }

  return redirect("/", {
    headers: await logoutUser(request, context),
  });
}
