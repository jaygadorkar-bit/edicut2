import type { LoaderFunctionArgs } from "react-router";
import { completeGoogleOAuth, createGoogleOAuthFailureResponse } from "../lib/google-auth.server";
import { getDbFromContext } from "../lib/db.server";
import type { LoaderContext } from "../types";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const typedContext = context as LoaderContext;
  let stage = "transaction-validation";
  try {
    return await completeGoogleOAuth(request, typedContext, () => getDbFromContext(typedContext ?? {}), value => { stage = value; });
  } catch (error) {
    if (error instanceof Response && error.status < 500) throw error;
    console.error("Google sign-in could not be completed.", {
      stage,
      type: error instanceof Error ? error.name : "UnknownError",
      status: error instanceof Response ? error.status : 500,
    });
    return createGoogleOAuthFailureResponse(request, typedContext);
  }
}
