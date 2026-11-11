import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  projectReviewAction,
  projectReviewLoader,
} from "../lib/project-review-route.server";
const json = (value: unknown, status = 200, extraHeaders?: HeadersInit) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "same-origin", ...Object.fromEntries(new Headers(extraHeaders).entries()) },
  });
function routeError(error: unknown, request: Request) {
  if (!(error instanceof Response)) return json({ error: "Review is temporarily unavailable. Your draft has not been cleared." }, 503);
  if (error.status >= 300 && error.status < 400) {
    const location = error.headers.get("Location");
    const cookie = error.headers.get("Set-Cookie");
    if (location && cookie && new URL(location, request.url).href === request.url) {
      const headers = new Headers(error.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("Referrer-Policy", "same-origin");
      return new Response(null, { status: 307, headers });
    }
    return json({ error: "Your session changed. Sign in again before retrying.", sessionExpired: true }, 401, cookie ? { "Set-Cookie": cookie } : undefined);
  }
  const message = error.status === 404
    ? "Project or video not found."
    : error.status === 403
      ? "You do not have permission for this review action."
      : "Review is temporarily unavailable. Your draft has not been cleared.";
  return json({ error: message }, error.status, error.headers.has("Set-Cookie") ? { "Set-Cookie": error.headers.get("Set-Cookie")! } : undefined);
}
export async function loader(args: LoaderFunctionArgs) {
  try {
    const result = await projectReviewLoader(
      args,
      new URL(args.request.url).searchParams.get("scope") === "admin",
    );
    return result instanceof Response ? result : json(result);
  } catch (error) {
    return routeError(error, args.request);
  }
}
export async function action(args: ActionFunctionArgs) {
  try {
    const result = await projectReviewAction(
      args,
      new URL(args.request.url).searchParams.get("scope") === "admin",
    );
    return result instanceof Response
      ? json({ error: "Please submit changes from this site." }, result.status)
      : json(result, result.error ? 400 : 200);
  } catch (error) {
    return routeError(error, args.request);
  }
}
