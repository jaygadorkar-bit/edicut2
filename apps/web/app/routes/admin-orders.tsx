import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator,
} from "react-router";
import { Check, RefreshCw } from "lucide-react";
import { AdminOrdersWorkspace } from "../components/admin/AdminOrdersWorkspace";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { toPublicAdminUser } from "../lib/admin-public";
import { loadAdminOrders, mutateAdminOrder } from "../lib/admin-orders.server";
import { getDbFromContext } from "../lib/db.server";
import {
  isSameSiteMutation,
  readSubscriptionForm,
} from "../lib/customer-subscriptions.server";
import { isAdminRole, requireAdminUser } from "../lib/session.server";
import {
  consumeUsageLimit,
  requestBodyExceedsLimit,
} from "../lib/usage-protection.server";
import stylesheet from "../styles/admin-clients.css?url";

export const links = () => [{ rel: "stylesheet", href: stylesheet }];
export const meta: MetaFunction = () => [
  { title: "Orders | EdiCut Admin" },
  { name: "robots", content: "noindex,nofollow" },
];
export function headers() {
  return {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const url = new URL(request.url);
  const admin = await requireAdminUser(
    request,
    db,
    context,
    `${url.pathname}${url.search}`,
  );
  if (!admin.active || !isAdminRole(admin.role))
    throw new Response("Permission denied", { status: 403 });
  return {
    admin: toPublicAdminUser(admin),
    orders: await loadAdminOrders(db, request),
    generatedAt: new Date().toISOString(),
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request))
    return { error: "Please submit changes from this site." };
  if (requestBodyExceedsLimit(request, 4096))
    return { error: "This request is too large." };
  const db = getDbFromContext(context);
  const admin = await requireAdminUser(request, db, context);
  if (!admin.active || !isAdminRole(admin.role))
    throw new Response("Permission denied", { status: 403 });
  const limit = await consumeUsageLimit({
    request,
    context,
    bindingName: "USER_ACTION_LIMITER",
    key: `admin:${admin.id}`,
    localLimit: 60,
    localPeriodSeconds: 60,
  });
  if (limit !== "allowed")
    return { error: "Please wait a minute and try again." };
  const form = await readSubscriptionForm(request, 4096);
  if (!form) return { error: "Submit a valid order record form under 4 KB." };
  return mutateAdminOrder(db, context, admin, form);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default function AdminOrdersRoute() {
  const { admin, orders, generatedAt } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const busy = navigation.state !== "idle" || revalidator.state !== "idle";
  return (
    <AdminPanelShell
      title="Orders"
      activeTab="orders"
      pendingOrderCount={orders.summary.unpaid}
      account={{ name: admin.name || "Admin", detail: admin.email }}
    >
      <div className="clients-workspace" aria-busy={busy}>
        <header className="clients-page-heading">
          <div>
            <h2>
              Orders <span>{orders.summary.total}</span>
            </h2>
          </div>
          <button
            type="button"
            className="clients-button"
            onClick={() => void revalidator.revalidate()}
            disabled={busy}
          >
            <RefreshCw
              size={15}
              className={busy ? "clients-spin" : ""}
              aria-hidden="true"
            />
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </header>
        {actionData ? (
          <div
            className={`clients-result ${actionData.error ? "is-error" : ""}`}
            role={actionData.error ? "alert" : "status"}
          >
            {"success" in actionData ? actionData.success : actionData.error}
            {"warning" in actionData && actionData.warning ? (
              <p>{actionData.warning}</p>
            ) : null}
          </div>
        ) : null}
        <AdminOrdersWorkspace data={orders} now={generatedAt} />
        <p className="clients-updated">
          <Check size={13} aria-hidden="true" />
          Updated {date(generatedAt)} UTC
        </p>
      </div>
    </AdminPanelShell>
  );
}
