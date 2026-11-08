import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { Select } from "../components/Select";
import { toPublicAdminUser } from "../lib/admin-public";
import { adminPath } from "../lib/admin-paths";
import { getDbFromContext } from "../lib/db.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { getAdminSession, requireAdminUser, commitAdminSession } from "../lib/session.server";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { isCryptomusTestWebhookEnabled, sendCryptomusTestWebhook, type CryptomusTestWebhookStatus } from "../lib/cryptomus.server";

export const meta: MetaFunction = () => [
  { title: "Cryptomus webhook test - EdiCut Admin" },
  { name: "robots", content: "noindex,nofollow" },
];

export function headers() {
  return {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "no-store",
    "Referrer-Policy": "same-origin",
  };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const adminUser = await requireAdminUser(request, db, context, new URL(request.url).pathname);
  const adminSession = await getAdminSession(request.headers.get("Cookie"), context);
  return data({
    adminUser: toPublicAdminUser(adminUser),
    testWebhookEnabled: isCryptomusTestWebhookEnabled(context),
  }, {
    headers: {
      ...headers(),
      "Set-Cookie": await commitAdminSession(adminSession, { maxAge: 60 * 60 * 2 }, context),
    },
  });
}

const TEST_STATUSES: CryptomusTestWebhookStatus[] = [
  "process", "check", "paid", "paid_over", "fail", "wrong_amount", "cancel",
  "system_fail", "refund_process", "refund_fail", "refund_paid", "locked",
];

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  if (requestBodyExceedsLimit(request, 4 * 1024)) return { error: "This request is too large." };

  const db = getDbFromContext(context);
  const adminUser = await requireAdminUser(request, db, context);
  if (!isCryptomusTestWebhookEnabled(context)) return { error: "Cryptomus test webhooks are disabled for this environment." };

  const limit = await consumeUsageLimit({
    context,
    request,
    bindingName: "USER_ACTION_LIMITER",
    key: `cryptomus-test:${adminUser.id}`,
    localLimit: 5,
    localPeriodSeconds: 60,
  });
  if (limit !== "allowed") return { error: "Please wait a minute before sending another test webhook." };

  const form = await readMutationForm(request, 4 * 1024);
  if (!form || form.get("intent") !== "send-test-webhook") return { error: "Submit a valid test webhook request." };
  const currency = String(form.get("currency") ?? "").trim().toUpperCase();
  const network = String(form.get("network") ?? "").trim().toLowerCase();
  const status = String(form.get("status") ?? "").trim() as CryptomusTestWebhookStatus;
  if (!/^[A-Z0-9]{2,16}$/u.test(currency) || !/^[a-z0-9_-]{2,32}$/u.test(network) || !TEST_STATUSES.includes(status)) {
    return { error: "Choose a valid currency, network, and payment status." };
  }

  try {
    await sendCryptomusTestWebhook({ context, currency, network, status });
    return { success: `Cryptomus accepted the ${status} test webhook request. Check the staging server logs for callback receipt.` };
  } catch {
    console.error("Cryptomus test webhook request failed.");
    return { error: "Cryptomus did not accept the test webhook request. Check the server configuration and logs." };
  }
}

const STATUS_LABELS: Record<CryptomusTestWebhookStatus, string> = {
  process: "Processing",
  check: "Checking",
  paid: "Paid",
  paid_over: "Overpaid",
  fail: "Failed",
  wrong_amount: "Wrong amount",
  cancel: "Canceled",
  system_fail: "System failed",
  refund_process: "Refund processing",
  refund_fail: "Refund failed",
  refund_paid: "Refund paid",
  locked: "Locked",
};

export default function AdminCryptomusTestRoute() {
  const { adminUser, testWebhookEnabled } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";

  return (
    <AdminPanelShell
      title="Cryptomus webhook test"
      activeTab="infrastructure"
      account={{ name: adminUser.name || "Admin", detail: adminUser.email }}
      headerActions={(
        <Link to={adminPath("/infrastructure")} className="hidden h-10 items-center gap-2 rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(109,85,232,0.22)] transition hover:bg-[#5b44d3] md:inline-flex">
          Infrastructure
        </Link>
      )}
    >
      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-8">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6d55e8]">Payment integration</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Cryptomus webhook test</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Send a signed test callback from Cryptomus to this site’s isolated test receiver. This does not create an invoice, move funds, or update a subscription.</p>
        </header>

        {!testWebhookEnabled ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950" role="status">
            Testing is disabled. Enable it only in development or staging and configure a public HTTPS callback URL for <code>/api/cryptomus/test-webhook</code>. The production host is blocked.
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <Form method="post" className="space-y-5">
              <input type="hidden" name="intent" value="send-test-webhook" />
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-2 text-sm font-bold text-slate-800">
                  <span>Currency</span>
                  <input name="currency" defaultValue="ETH" autoComplete="off" maxLength={16} required className="min-h-11 w-full rounded-xl border border-slate-300 px-3" />
                </label>
                <label className="space-y-2 text-sm font-bold text-slate-800">
                  <span>Network</span>
                  <input name="network" defaultValue="eth" autoComplete="off" maxLength={32} required className="min-h-11 w-full rounded-xl border border-slate-300 px-3" />
                </label>
                <label id="cryptomus-status-label" htmlFor="cryptomus-status" className="space-y-2 text-sm font-bold text-slate-800">
                  <span>Webhook status</span>
                  <Select id="cryptomus-status" name="status" defaultValue="paid" required aria-labelledby="cryptomus-status-label" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">
                    {TEST_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                  </Select>
                </label>
              </div>

              <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">The request omits invoice and order IDs so Cryptomus uses a synthetic test invoice. The receiver verifies the signature and logs the test status; it never calls the live payment handler.</p>

              {actionData?.error ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="alert">{actionData.error}</p> : null}
              {actionData?.success ? <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{actionData.success}</p> : null}

              <button type="submit" disabled={submitting} className="min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
                {submitting ? "Sending test…" : "Send Cryptomus test webhook"}
              </button>
            </Form>
          </section>
        )}
      </main>
    </AdminPanelShell>
  );
}
