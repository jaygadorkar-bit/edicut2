import { SignInPage } from "../components/auth/SignInPage";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
export { action } from "../lib/auth-disabled.server";

export function loader({ request }: LoaderFunctionArgs) {
  const error = new URL(request.url).searchParams.get("error");
  return { error: error === "google-unavailable" ? "Google sign-in could not be completed. Please try again." : null };
}

export default function SignInRoute() {
  const { error } = useLoaderData<typeof loader>();
  return <SignInPage error={error} />;
}
