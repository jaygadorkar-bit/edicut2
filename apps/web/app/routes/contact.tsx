import { contactIntakeSchema, logEvent, type OperationResult } from "@edicut/shared";
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
  const parsed = contactIntakeSchema.safeParse({
    name: String(formData.get("name") || ""),
    email: String(formData.get("email") || ""),
    brief: String(formData.get("brief") || ""),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid contact request.",
    } satisfies ActionData;
  }

  if (!resolveWebEnv(context).NODE_API_BASE_URL) {
    return {
      error: "Node API base URL is not configured for contact intake.",
    } satisfies ActionData;
  }

  const result = await postNodeApi<OperationResult, typeof parsed.data>(
    context,
    "/api/node/ops/contact-intake",
    parsed.data
  );

  logEvent("info", "web_contact_intake_submit", {
    runtime: "cloudflare-workers",
    requestClass: "cf-contact-intake",
    email: parsed.data.email,
  });

  return {
    success: result?.message ?? "Contact request accepted.",
  } satisfies ActionData;
}

export default function ContactRoute() {
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();

  return (
    <main className="public-page">
      <section className="panel public-hero">
        <p className="eyebrow">Contact</p>
        <h1 className="public-title">
          Let&apos;s direct your
          <br />
          next editing workflow
        </h1>
        <p className="public-copy">
          The restored contact experience keeps the current bounded API form, but presents it in
          the older studio-style layout instead of the temporary scaffold.
        </p>
      </section>

      <section className="public-contact-layout">
        <section className="panel public-contact-card">
          <h2>Send a Dispatch</h2>
          <Form className="auth-form public-contact-form" method="post">
            <label className="field">
              <span>Name</span>
              <input name="name" placeholder="Your name" type="text" />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" placeholder="you@brand.com" type="email" />
            </label>
            <label className="field">
              <span>Brief</span>
              <textarea
                name="brief"
                placeholder="Tell us about the footage, deadline, and desired style."
                rows={6}
              />
            </label>
            {actionData?.error ? <p className="form-error">{actionData.error}</p> : null}
            {actionData?.success ? <p className="form-success">{actionData.success}</p> : null}
            <button
              className="primary-button public-submit"
              disabled={navigation.state === "submitting"}
              type="submit"
            >
              {navigation.state === "submitting" ? "Sending..." : "Submit Brief"}
            </button>
          </Form>
        </section>

        <section className="public-contact-sidebar">
          <section className="panel public-contact-info">
            <h2>Direct Lines</h2>
            <div className="contact-grid">
              <article>
                <p className="meta-label">Email</p>
                <p className="meta-value">hello@edicut.com</p>
              </article>
              <article>
                <p className="meta-label">Turnaround</p>
                <p className="meta-value">2 to 5 business days</p>
              </article>
              <article>
                <p className="meta-label">Preferred briefs</p>
                <p className="meta-value">YouTube, branded content, creator campaigns</p>
              </article>
              <article>
                <p className="meta-label">Runtime</p>
                <p className="meta-value">Handled by the bounded Node API</p>
              </article>
            </div>
          </section>

          <section className="panel public-contact-visual">
            <div>
              <p className="eyebrow">Studio Access</p>
              <h2>Authorized production workflows only.</h2>
              <p>
                Bring us the footage, references, and release deadline. We will shape the review
                loop around your publishing rhythm.
              </p>
            </div>
          </section>
        </section>
      </section>

      <section className="panel public-cta">
        <p className="eyebrow">Need Another Entry Point?</p>
        <h2>Review the package tiers first, then come back with a focused brief.</h2>
        <p>
          If you are still comparing options, the pricing page gives a faster read on the editing
          scopes before you submit.
        </p>
      </section>
    </main>
  );
}
