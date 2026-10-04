import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, useLoaderData } from "react-router";
import { getCloudinaryUsage, getCloudinaryVideoUsage } from "../lib/cloudinary.server";
import { getDbFromContext } from "../lib/db.server";
import { toPublicAdminUser } from "../lib/admin-public";
import { adminPath } from "../lib/admin-paths";
import { commitAdminSession, getAdminSession, requireAdminUser } from "../lib/session.server";
import { getProviderUsageOverview } from "../lib/provider-usage.server";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { ServiceUsagePanel } from "../components/admin/ServiceUsagePanel";

export const meta: MetaFunction = () => [
  { title: "Infrastructure - EdiCut Admin" },
  { name: "robots", content: "noindex,nofollow" },
];

export function headers() {
  return {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const adminUser = await requireAdminUser(request, db, context, new URL(request.url).pathname);
  const [cloudinaryUsage, cloudinaryVideoUsage] = await Promise.all([
    getCloudinaryUsage(context).catch((error) => {
      console.error("Cloudinary usage error:", error);
      return null;
    }),
    getCloudinaryVideoUsage(context).catch((error) => {
      console.error("Cloudinary video usage error:", error);
      return null;
    }),
  ]);
  const providers = await getProviderUsageOverview(context, cloudinaryUsage, cloudinaryVideoUsage, db).catch((error) => {
    console.error("Provider usage overview error:", error);
    return [];
  });
  const adminSession = await getAdminSession(request.headers.get("Cookie"), context);

  return data({
    adminUser: toPublicAdminUser(adminUser),
    providers,
  }, {
    headers: {
      "Set-Cookie": await commitAdminSession(adminSession, { maxAge: 60 * 60 * 2 }, context),
    },
  });
}

export default function AdminInfrastructureRoute() {
  const { adminUser, providers } = useLoaderData<typeof loader>();

  return (
    <AdminPanelShell
      title="Infrastructure"
      activeTab="infrastructure"
      account={{ name: adminUser.name || "Admin", detail: adminUser.email }}
      headerActions={(
        <Link
          to={adminPath()}
          className="hidden h-10 items-center gap-2 rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(109,85,232,0.22)] transition hover:bg-[#5b44d3] md:inline-flex"
        >
          <span className="material-symbols-outlined text-[17px]" aria-hidden="true">dashboard_customize</span>
          Dashboard
        </Link>
      )}
    >
      <ServiceUsagePanel providers={providers} />
    </AdminPanelShell>
  );
}
