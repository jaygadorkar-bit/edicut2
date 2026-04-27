import { demoPricingPackages } from "@edicut/shared";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireRole } from "../lib/auth.server";
import type { LoaderContext } from "../types";

type ActionData = {
  error?: string;
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
    packages: demoPricingPackages,
  };
}

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "create");
  const name = String(formData.get("name") || "").trim();

  if (intent === "create" && !name) {
    return { error: "Package name is required." } satisfies ActionData;
  }

  return {
    success: `Demo ${intent} action completed. This Stage 6 route proves the admin package flow without final persistence yet.`,
  } satisfies ActionData;
}

export default function DashboardPackagesRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();

  return (
    <main className="content-shell">
      <section className="panel page-hero">
        <p className="eyebrow">Admin Package Flow</p>
        <h1 className="page-title">Manage pricing packages with demo content before wiring final storage.</h1>
        <p className="lede">
          This route completes the second admin CRUD surface for Stage 6. It uses shared dummy
          package content now and can later move to a real table or settings-backed model.
        </p>
      </section>

      <section className="dashboard-grid">
        <section className="panel auth-card">
          <h2 className="section-title">Create Demo Package</h2>
          <Form className="auth-form" method="post">
            <input name="intent" type="hidden" value="create" />
            <label className="field">
              <span>Name</span>
              <input name="name" placeholder="New package name" type="text" />
            </label>
            <label className="field">
              <span>Price</span>
              <input name="price" placeholder="$480" type="text" />
            </label>
            {actionData?.error ? <p className="form-error">{actionData.error}</p> : null}
            {actionData?.success ? <p className="form-success">{actionData.success}</p> : null}
            <button className="primary-button" disabled={navigation.state === "submitting"} type="submit">
              {navigation.state === "submitting" ? "Saving..." : "Save demo package"}
            </button>
          </Form>
        </section>

        <section className="panel projects">
          <h2 className="section-title">Current Demo Packages</h2>
          <div className="stacked-list">
            {data.packages.map((pkg) => (
              <article className="stacked-item" key={pkg.id}>
                <div>
                  <strong>{pkg.name}</strong>
                  <p>{pkg.detail}</p>
                </div>
                <div className="stacked-meta">
                  <span className="project-chip">{pkg.price}</span>
                  <span className="project-chip">{pkg.status}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
