import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, useLoaderData, useRevalidator } from "react-router";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { SecurityLogDashboard } from "../components/admin/SecurityLogDashboard";
import { adminPath } from "../lib/admin-paths";
import { toPublicAdminUser } from "../lib/admin-public";
import { getDbFromContext } from "../lib/db.server";
import { commitAdminSession, getAdminSession, requireAdminUser } from "../lib/session.server";
import { getCloudflareSecurityLog, type AdminSecurityLogRange } from "../lib/provider-usage.server";
import { getApplicationErrorLog } from "../lib/application-error-log.server";

export const meta: MetaFunction = () => [
  { title: "Error Log - EdiCut Admin" },
  { name: "robots", content: "noindex,nofollow" },
];

export function headers() {
  return {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
}

function getRange(value: string | null): AdminSecurityLogRange {
  return value === "1h" || value === "7d" ? value : "24h";
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const adminUser = await requireAdminUser(request, db, context, new URL(request.url).pathname);
  const range = getRange(new URL(request.url).searchParams.get("range"));
  const [snapshot, applicationErrors, adminSession] = await Promise.all([
    getCloudflareSecurityLog(context, "errors", range),
    getApplicationErrorLog(db, range),
    getAdminSession(request.headers.get("Cookie"), context),
  ]);

  return data({
    adminUser: toPublicAdminUser(adminUser),
    snapshot,
    applicationErrors,
  }, {
    headers: {
      "Set-Cookie": await commitAdminSession(adminSession, { maxAge: 60 * 60 * 2 }, context),
    },
  });
}

export default function AdminErrorLogRoute() {
  const { adminUser, snapshot, applicationErrors } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  return (
    <AdminPanelShell
      title="Error log"
      activeTab="error-log"
      account={{ name: adminUser.name || "Admin", detail: adminUser.email }}
      headerActions={(
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => revalidator.revalidate()} disabled={revalidator.state !== "idle"} aria-busy={revalidator.state !== "idle"} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d5dee8] bg-white/80 px-4 text-xs font-black text-[#425365] transition hover:bg-white disabled:opacity-60">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">refresh</span>
            {revalidator.state === "idle" ? "Refresh" : "Updating"}
          </button>
          <Link to={adminPath()} className="hidden h-10 items-center gap-2 rounded-full bg-[#172838] px-4 text-xs font-black text-white transition hover:bg-[#2c4054] md:inline-flex">
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">dashboard_customize</span>
            Dashboard
          </Link>
        </div>
      )}
    >
      <section className="mb-6" aria-labelledby="admin-error-log-heading">
        <p className="neo-workspace__eyebrow">Application and Cloudflare events</p>
        <h1 id="admin-error-log-heading" className="neo-workspace__title mt-1">Error log</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687583]">Investigate sampled edge responses alongside deduplicated application 500 diagnostics and their safe stack details.</p>
      </section>
      <SecurityLogDashboard kind="errors" snapshot={snapshot} applicationErrors={applicationErrors} />
    </AdminPanelShell>
  );
}
