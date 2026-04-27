import { logEvent, passwordResetRequestSchema, type OperationResult } from "@edicut/shared";
import { Form, useActionData, useNavigation } from "react-router";
import { postNodeApi } from "../lib/api.server";
import { resolveWebEnv } from "../lib/context.server";
import type { LoaderContext } from "../types";

type ActionData = {
  error?: string;
  success?: string;
};

export async function action({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  const formData = await request.formData();
  const parsed = passwordResetRequestSchema.safeParse({
    email: String(formData.get("email") || "").trim(),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Email is required.",
    } satisfies ActionData;
  }

  if (!resolveWebEnv(context).NODE_API_BASE_URL) {
    return {
      error: "Node API base URL is not configured for password reset requests.",
    } satisfies ActionData;
  }

  const result = await postNodeApi<OperationResult, { email: string }>(
    context,
    "/api/node/ops/password-reset/request",
    parsed.data
  );

  logEvent("info", "web_password_reset_request", {
    runtime: "cloudflare-workers",
    requestClass: "cf-password-reset-request",
    email: parsed.data.email,
  });

  return {
    success: result?.message ?? "Password reset request accepted.",
  } satisfies ActionData;
}

export default function ForgotPasswordRoute() {
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();

  return (
    <main className="auth-shell">
      <section className="panel auth-card">
        <p className="eyebrow">Password reset</p>
        <h1 className="auth-title">Request a reset link</h1>
        <p className="auth-copy">
          This is a dummy flow that completes the Stage 6 user journey without sending mail yet.
        </p>
        <Form className="auth-form" method="post">
          <label className="field">
            <span>Email</span>
            <input autoComplete="email" name="email" placeholder="you@edicut.com" type="email" />
          </label>
          {actionData?.error ? <p className="form-error">{actionData.error}</p> : null}
          {actionData?.success ? <p className="form-success">{actionData.success}</p> : null}
          <button className="primary-button" disabled={navigation.state === "submitting"} type="submit">
            {navigation.state === "submitting" ? "Submitting..." : "Send reset link"}
          </button>
        </Form>
      </section>
    </main>
  );
}
