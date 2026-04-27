import { Form, redirect, useActionData, useNavigation } from "react-router";
import { getCurrentUser, loginUser } from "../lib/auth.server";
import type { LoaderContext } from "../types";

type ActionData = {
  error?: string;
};

export async function loader({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  const user = await getCurrentUser(request, context);

  if (user) {
    throw redirect("/dashboard");
  }

  return null;
}

export async function action({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  if (!context?.env) {
    return { error: "Session environment is not configured." } satisfies ActionData;
  }

  const formData = await request.formData();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const redirectTo = String(formData.get("redirectTo") || "/dashboard");

  if (!email || !password) {
    return { error: "Email and password are required." } satisfies ActionData;
  }

  const result = await loginUser({
    request,
    context,
    email,
    password,
  });

  if (!result.ok) {
    return { error: result.error } satisfies ActionData;
  }

  return redirect(redirectTo.startsWith("/") ? redirectTo : "/dashboard", {
    headers: result.headers,
  });
}

export default function LoginRoute() {
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="auth-shell">
      <section className="panel auth-card">
        <p className="eyebrow">Worker-native session auth</p>
        <h1 className="auth-title">Sign in to the Cloudflare app</h1>
        <p className="auth-copy">
          This login flow is handled in the Worker runtime with a signed cookie session. No shared
          Next auth layer and no cross-runtime browser redirect machinery.
        </p>
        <p className="footer-note">
          Forgot your password? Use the dummy recovery flow at <a href="/forgot-password">/forgot-password</a>.
        </p>

        <Form className="auth-form" method="post">
          <input name="redirectTo" type="hidden" value="/dashboard" />
          <label className="field">
            <span>Email</span>
            <input autoComplete="email" name="email" placeholder="you@edicut.com" type="email" />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              name="password"
              placeholder="Enter your password"
              type="password"
            />
          </label>
          {actionData?.error ? <p className="form-error">{actionData.error}</p> : null}
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </Form>
      </section>
    </main>
  );
}
