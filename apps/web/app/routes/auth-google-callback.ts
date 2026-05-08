import type { LoaderFunctionArgs } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { completeGoogleOAuth } from "../lib/google-auth.server";
import type { LoaderContext } from "../types";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const typedContext = context as LoaderContext;
  const db = getDbFromContext(typedContext ?? {});

  return completeGoogleOAuth(request, typedContext, db);
}
