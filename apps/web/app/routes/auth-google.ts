import type { LoaderFunctionArgs } from "react-router";
import { startGoogleOAuth } from "../lib/google-auth.server";
import type { LoaderContext } from "../types";

export async function loader({ request, context }: LoaderFunctionArgs) {
  return startGoogleOAuth(request, context as LoaderContext);
}
