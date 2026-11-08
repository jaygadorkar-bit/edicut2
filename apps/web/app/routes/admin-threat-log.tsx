import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, useLoaderData, useRevalidator } from "react-router";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { SecurityLogDashboard } from "../components/admin/SecurityLogDashboard";
import { adminPath } from "../lib/admin-paths";
import { toPublicAdminUser } from "../lib/admin-public";
import { getDbFromContext } from "../lib/db.server";
import { commitAdminSession, getAdminSession, requireAdminUser } from "../lib/session.server";
import { getCloudflareSecurityLog, type AdminSecurityLogRange } from "../lib/provider-usage.server";

export const meta: MetaFunction = () => [
  { title: "Threat Log - EdiCut Admin" },
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
  const [snapshot, adminSession] = await Promise.all([
    getCloudflareSecurityLog(context, "threats", range),
    getAdminSession(request.headers.get("Cookie"), context),
  ]);

  return data({
    adminUser: toPublicAdminUser(adminUser),
    snapshot,
  }, {
    headers: {
      "Set-Cookie": await commitAdminSession(adminSession, { maxAge: 60 * 60 * 2 }, context),
    },
  });
}

export default function AdminThreatLogRoute() {
  const { adminUser, snapshot } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  return (
    <AdminPanelShell
      title="Threat log"
      activeTab="threat-log"
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
      <section className="mb-6" aria-labelledby="admin-threat-log-heading">
        <p className="neo-workspace__eyebrow">Cloudflare firewall events</p>
        <h1 id="admin-threat-log-heading" className="neo-workspace__title mt-1">Threat log</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687583]">Review recent security actions and investigate their route, source, country, and exact time.</p>
      </section>
      <SecurityLogDashboard kind="threats" snapshot={snapshot} />
    </AdminPanelShell>
  );
}
