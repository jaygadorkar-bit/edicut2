import {
  demoSecuritySettings,
  logEvent,
  securitySettingsSchema,
  type OperationResult,
} from "@edicut/shared";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireRole } from "../lib/auth.server";
import { postNodeApi } from "../lib/api.server";
import { resolveWebEnv } from "../lib/context.server";
import type { LoaderContext } from "../types";

type ActionData = {
  success?: string;
};

export async function loader({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  await requireRole(request, context, ["admin"]);

  return {
    settings: demoSecuritySettings,
  };
}

export async function action({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  const formData = await request.formData();
  const parsed = securitySettingsSchema.safeParse({
    loginAlerts: String(formData.get("loginAlerts") || "") === "on",
    passwordRotationDays: Number(formData.get("passwordRotationDays") || 0),
    mfaRollout: String(formData.get("mfaRollout") || "planned"),
  });

  if (!parsed.success) {
    return {
      success: parsed.error.issues[0]?.message ?? "Invalid security settings payload.",
    } satisfies ActionData;
  }

  if (!resolveWebEnv(context).NODE_API_BASE_URL) {
    return {
      success: "Node API base URL is not configured for security settings.",
    } satisfies ActionData;
  }

  const result = await postNodeApi<OperationResult, typeof parsed.data>(
    context,
    "/api/node/ops/security-settings",
    parsed.data
  );

  logEvent("info", "web_security_settings_save", {
    runtime: "cloudflare-workers",
    requestClass: "cf-security-settings-save",
    mfaRollout: parsed.data.mfaRollout,
  });

  return {
    success: result?.message ?? "Security settings saved.",
  } satisfies ActionData;
}

export default function DashboardSecurityRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();

  return (
    <main className="content-shell">
      <section className="panel page-hero">
        <p className="eyebrow">Security Settings</p>
        <h1 className="page-title">A complete dummy security flow is now present in the new app.</h1>
        <p className="lede">
          This route closes the Stage 6 gap around security settings while keeping the state
          intentionally demo-only until the long-term storage contract is finalized.
        </p>
      </section>

      <section className="dashboard-grid">
        <section className="panel auth-card">
          <h2 className="section-title">Policy Controls</h2>
          <Form className="auth-form" method="post">
            <label className="checkbox-field">
              <input defaultChecked={data.settings.loginAlerts} name="loginAlerts" type="checkbox" />
              <span>Send login alert emails</span>
            </label>
            <label className="field">
              <span>Password rotation period</span>
              <input
                defaultValue={data.settings.passwordRotationDays}
                name="passwordRotationDays"
                type="number"
              />
            </label>
            <label className="field">
              <span>MFA rollout state</span>
              <select defaultValue={data.settings.mfaRollout} name="mfaRollout">
                <option value="planned">Planned</option>
                <option value="pilot">Pilot</option>
                <option value="enabled">Enabled</option>
              </select>
            </label>
            {actionData?.success ? <p className="form-success">{actionData.success}</p> : null}
            <button className="primary-button" disabled={navigation.state === "submitting"} type="submit">
              {navigation.state === "submitting" ? "Saving..." : "Save demo settings"}
            </button>
          </Form>
        </section>

        <section className="panel projects">
          <h2 className="section-title">Current Policy Snapshot</h2>
          <div className="stacked-list">
            <article className="stacked-item">
              <div>
                <strong>Session policy</strong>
                <p>Signed Worker cookie sessions are the current auth boundary.</p>
              </div>
              <div className="stacked-meta">
                <span className="project-chip">{data.settings.sessionPolicy}</span>
              </div>
            </article>
            <article className="stacked-item">
              <div>
                <strong>Password rotation</strong>
                <p>Dummy rotation policy for UI completeness.</p>
              </div>
              <div className="stacked-meta">
                <span className="project-chip">{data.settings.passwordRotationDays} days</span>
              </div>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
