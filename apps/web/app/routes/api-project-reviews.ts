import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  projectReviewAction,
  projectReviewLoader,
} from "../lib/project-review-route.server";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "same-origin" },
  });
export async function loader(args: LoaderFunctionArgs) {
  const result = await projectReviewLoader(
    args,
    new URL(args.request.url).searchParams.get("scope") === "admin",
  );
  return result instanceof Response ? result : json(result);
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
    if (error instanceof Response)
      return json(
        {
          error:
            error.status === 404
              ? "Project or video not found."
              : error.status === 403
                ? "You do not have permission for this review action."
                : "Your session changed. Sign in again before retrying.",
        },
        error.status >= 400 ? error.status : 401,
      );
    return json(
      {
        error:
          "Review is temporarily unavailable. Your draft has not been cleared.",
      },
      503,
    );
  }
}
