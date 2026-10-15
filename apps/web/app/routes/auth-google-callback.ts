import type { LoaderFunctionArgs } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { completeGoogleOAuth, createGoogleOAuthFailureResponse } from "../lib/google-auth.server";
import type { LoaderContext } from "../types";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const typedContext = context as LoaderContext;
  try {
    const db = getDbFromContext(typedContext ?? {});
    return await completeGoogleOAuth(request, typedContext, db);
  } catch (error) {
    // Preserve intentional redirects and access denials. Never send database
    // queries, profile data, or provider tokens through this resource route.
    if (error instanceof Response && error.status < 500) throw error;
    console.error("Google sign-in could not be completed.", {
      status: error instanceof Response ? error.status : 500,
    });
    return createGoogleOAuthFailureResponse(request);
  }
}
