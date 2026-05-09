import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { findUserById } from "@edicut/db/repositories/users";
import { getDbFromContext } from "../lib/db.server";
import { requireUserId } from "../lib/session.server";
import {
  SUBSCRIPTION_PACKAGES,
  getCheckoutTotal,
  getSubscriptionPackage,
  type SubscriptionPackage,
} from "../lib/subscriptions";

type CheckoutActionData = {
  ok?: boolean;
  error?: string;
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.subscription ? `Checkout ${data.subscription.name} | EdiCut` : "Subscription checkout | EdiCut" },
  { name: "description", content: "Complete an EdiCut creator editing subscription checkout." },
];

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const userId = await requireUserId(request, context, `${url.pathname}${url.search}`);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);
  const slug = params.slug || "creator";
  const packageIndex = Math.max(SUBSCRIPTION_PACKAGES.findIndex((item) => item.slug === slug), 0);
  const fallback = SUBSCRIPTION_PACKAGES[packageIndex] || SUBSCRIPTION_PACKAGES[0];
  const subscription = getSubscriptionPackage(fallback.name, slug, packageIndex);
  const selected = {
    runtime: url.searchParams.get("runtime") === "1",
    raw: url.searchParams.get("raw") === "1",
  };

  return {
    user: {
      name: user?.name || "",
      email: user?.email || "",
    },
    subscription,
    selected,
    total: getCheckoutTotal(subscription, selected),
  };
}

export async function action({ request, context }: ActionFunctionArgs): Promise<CheckoutActionData> {
  await requireUserId(request, context);
  const formData = await request.formData();
  const channelName = String(formData.get("channelName") || "").trim();
  const billingName = String(formData.get("billingName") || "").trim();
  const billingEmail = String(formData.get("billingEmail") || "").trim();

  if (!channelName || !billingName || !billingEmail) {
    return { error: "Add the channel, billing name, and billing email to continue." };
  }

  return { ok: true };
}

export default function CheckoutRoute() {
  const { user, subscription, selected, total } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const runtimeSelected = searchParams.get("runtime") === "1";
  const rawSelected = searchParams.get("raw") === "1";
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="min-h-screen bg-white text-foreground">
      <header className="border-b border-gray-200 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link to="/pricing" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
              <span className="material-symbols-outlined text-[22px]">play_arrow</span>
            </span>
            <span>
              <span className="block text-lg font-black uppercase tracking-tight">EdiCut</span>
              <span className="block text-xs font-bold text-muted-foreground">Secure checkout</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-xs font-black text-muted-foreground">
            <StatusChip icon="lock" label="Secure" />
            <StatusChip icon="schedule" label="2 minute checkout" />
            <StatusChip icon="receipt_long" label="Receipt by email" />
          </div>
        </div>
      </header>

      <Form method="post" className="mx-auto grid max-w-[1500px] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)_360px]">
        <input type="hidden" name="packageSlug" value={subscription.slug} />
        <input type="hidden" name="runtime" value={runtimeSelected ? "1" : "0"} />
        <input type="hidden" name="raw" value={rawSelected ? "1" : "0"} />

        <section className="grid content-start gap-4">
          <Panel title="Package" icon="workspace_premium" aside={<Link to={`/pricing/${subscription.slug}`} className="text-xs font-black text-primary">Edit</Link>}>
            <div className="rounded-lg border border-gray-200 bg-[#FAFAFA] p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-black uppercase text-muted-foreground">{subscription.badge}</p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight">{subscription.name}</h1>
                  <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-muted-foreground">{subscription.description}</p>
                </div>
                <p className="text-3xl font-black">${subscription.basePrice}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              <SummaryLine label="Base creator subscription" value={`$${subscription.basePrice}`} checked />
              <SummaryLine label="60 min podcast/runtime coverage" value={`+$${subscription.finishedRuntimePrice}`} checked={runtimeSelected} />
              <SummaryLine label="600 min raw vlog footage coverage" value={`+$${subscription.rawFootagePrice}`} checked={rawSelected} />
            </div>
          </Panel>

          <Panel title="Project basics" icon="edit_note">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Channel name" name="channelName" placeholder="YourTube Studio" autoComplete="organization" required />
              <Field label="Content category" name="category" placeholder="Podcast, tech, beauty" autoComplete="off" />
              <Field label="Upload cadence" name="cadence" placeholder="Weekly" autoComplete="off" />
              <Field label="First deadline" name="deadline" type="date" />
            </div>
            <label className="mt-3 grid gap-2 text-sm font-black">
              Notes for the first edit
              <textarea
                name="notes"
                rows={4}
                placeholder="References, editing style, intro/outro preferences, or anything the editor should know."
                autoComplete="off"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-red-100"
              />
            </label>
          </Panel>
        </section>

        <section className="grid content-start gap-4">
          <Panel title="Payment method" icon="credit_card" aside={<span className="text-xs font-black text-muted-foreground">Provider ready</span>}>
            <div className="grid gap-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-primary bg-red-50 p-3">
                <input type="radio" name="paymentMethod" value="card" defaultChecked className="h-4 w-4 accent-red-600" />
                <span className="material-symbols-outlined text-[20px] text-primary">credit_card</span>
                <span className="flex-1">
                  <span className="block text-sm font-black">Card</span>
                  <span className="block text-xs font-bold text-muted-foreground">Secure card entry connects here when payment processing is enabled.</span>
                </span>
              </label>
              <div className="rounded-lg border border-dashed border-gray-300 bg-[#FAFAFA] p-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-muted-foreground">lock</span>
                  <div>
                    <p className="text-sm font-black">Card details are not stored by EdiCut</p>
                    <p className="mt-1 text-xs font-bold leading-5 text-muted-foreground">
                      This checkout is ready for a PCI-compliant payment provider. Raw card numbers are intentionally not posted to this app.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Billing details" icon="receipt_long">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Billing name" name="billingName" defaultValue={user.name} autoComplete="name" required />
              <Field label="Billing email" name="billingEmail" type="email" defaultValue={user.email} autoComplete="email" required />
              <Field label="Company" name="company" placeholder="Optional" autoComplete="organization" />
              <Field label="Country" name="country" defaultValue="United States" autoComplete="country-name" />
            </div>
          </Panel>

          <Panel title="Included after checkout" icon="check_circle">
            <div className="grid gap-2">
              {["Private dashboard workspace", "Editor matching after intake review", "Upload and review flow", "Email receipt and onboarding checklist"].map((item) => (
                <p key={item} className="flex items-center gap-2 text-sm font-bold">
                  <span className="material-symbols-outlined text-[18px] text-primary">check</span>
                  {item}
                </p>
              ))}
            </div>
          </Panel>
        </section>

        <aside className="lg:sticky lg:top-5 lg:self-start">
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 p-4">
              <p className="text-xs font-black uppercase text-muted-foreground">Order summary</p>
              <h2 className="mt-1 text-2xl font-black">Due today</h2>
            </div>
            <div className="grid gap-3 p-4">
              <PriceRow label={subscription.name} value={subscription.basePrice} />
              {runtimeSelected ? <PriceRow label="60 min podcast runtime" value={subscription.finishedRuntimePrice} /> : null}
              {rawSelected ? <PriceRow label="600 min raw footage" value={subscription.rawFootagePrice} /> : null}
              <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-gray-100 pt-3">
                <input
                  name="discountCode"
                  placeholder="Discount code"
                  autoComplete="off"
                  className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-bold outline-none focus:border-primary"
                />
                <button type="button" className="h-10 rounded-lg border border-gray-200 bg-white px-4 text-xs font-black">
                  Apply
                </button>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between gap-3 text-sm font-bold text-muted-foreground">
                  <span>Subtotal</span>
                  <span>${total}</span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="text-sm font-black">Total due today</span>
                  <span className="text-4xl font-black">${total}</span>
                </div>
                <p className="mt-2 text-xs font-bold leading-5 text-muted-foreground">Renews monthly after kickoff. You can adjust scope before the first invoice is finalized.</p>
              </div>
              {actionData?.error ? <p className="rounded-lg bg-[#FFF5F5] p-3 text-sm font-black text-[#D90000]">{actionData.error}</p> : null}
              {actionData?.ok ? <p className="rounded-lg bg-red-50 p-3 text-sm font-black text-primary">Checkout details received. Payment provider connection is the remaining step before live charging.</p> : null}
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">lock</span>
                {isSubmitting ? "Completing..." : "Complete subscription"}
              </button>
              <Link to={`/pricing/${subscription.slug}`} className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-black">
                Back to plans
              </Link>
            </div>
          </section>
        </aside>
      </Form>
    </main>
  );
}

function Panel({ title, icon, aside, children }: { title: string; icon: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-black">
          <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
          {title}
        </h2>
        {aside}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  required = false,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-black">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-red-100"
      />
    </label>
  );
}

function SummaryLine({ label, value, checked }: { label: string; value: string; checked: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
        <span className={`material-symbols-outlined text-[18px] ${checked ? "text-primary" : "text-gray-300"}`}>{checked ? "check_box" : "check_box_outline_blank"}</span>
        {label}
      </span>
      <span className="shrink-0 text-sm font-black">{value}</span>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm font-bold">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-black text-foreground">${value}</span>
    </div>
  );
}

function StatusChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
      {label}
    </span>
  );
}
