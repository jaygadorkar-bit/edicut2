import { logEvent, passwordResetConsumeSchema, type OperationResult } from "@edicut/shared";
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
  const parsed = passwordResetConsumeSchema.safeParse({
    password: String(formData.get("password") || ""),
    confirmPassword: String(formData.get("confirmPassword") || ""),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid password reset request.",
    } satisfies ActionData;
  }

  if (!resolveWebEnv(context).NODE_API_BASE_URL) {
    return {
      error: "Node API base URL is not configured for password resets.",
    } satisfies ActionData;
  }

  const result = await postNodeApi<OperationResult, typeof parsed.data>(
    context,
    "/api/node/ops/password-reset/consume",
    parsed.data
  );

  logEvent("info", "web_password_reset_consume", {
    runtime: "cloudflare-workers",
    requestClass: "cf-password-reset-consume",
  });

  return {
    success: result?.message ?? "Password reset completed.",
  } satisfies ActionData;
}

export default function ResetPasswordRoute() {
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();

  return (
    <main className="auth-shell">
      <section className="panel auth-card">
        <p className="eyebrow">Password reset</p>
        <h1 className="auth-title">Choose a new password</h1>
        <p className="auth-copy">
          This route is intentionally local for now. It completes the user-facing reset journey
          while the final token and email workflow is still dummy content.
        </p>
        <Form className="auth-form" method="post">
          <label className="field">
            <span>New password</span>
            <input name="password" placeholder="New password" type="password" />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input name="confirmPassword" placeholder="Confirm password" type="password" />
          </label>
          {actionData?.error ? <p className="form-error">{actionData.error}</p> : null}
          {actionData?.success ? <p className="form-success">{actionData.success}</p> : null}
          <button className="primary-button" disabled={navigation.state === "submitting"} type="submit">
            {navigation.state === "submitting" ? "Updating..." : "Update password"}
          </button>
        </Form>
      </section>
    </main>
  );
}
