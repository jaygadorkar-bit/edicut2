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
    <main className="min-h-screen neo-home text-foreground">
      {/* Checkout Top Bar */}
      <header className="border-b neo-line px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link to="/pricing" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white neo-red-glow">
              <span className="material-symbols-outlined text-[22px]">play_arrow</span>
            </span>
            <span>
              <span className="block text-lg font-black uppercase tracking-tight neo-ink">EdiCut</span>
              <span className="block text-xs font-bold neo-muted">Secure creator checkout</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-xs font-black">
            <StatusChip icon="lock" label="256-Bit SSL Encrypted" />
            <StatusChip icon="schedule" label="2-Minute Setup" />
            <StatusChip icon="receipt_long" label="Receipt via Email" />
          </div>
        </div>
      </header>

      <Form
        method="post"
        className="mx-auto grid max-w-[1400px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)_380px]"
      >
        <input type="hidden" name="packageSlug" value={subscription.slug} />
        <input type="hidden" name="runtime" value={runtimeSelected ? "1" : "0"} />
        <input type="hidden" name="raw" value={rawSelected ? "1" : "0"} />

        {/* Left Column: Package Summary & Project Details */}
        <section className="grid content-start gap-6">
          <Panel
            title="Selected Package"
            icon="workspace_premium"
            aside={
              <Link to={`/pricing/${subscription.slug}`} className="text-xs font-black text-primary hover:underline">
                Change tier
              </Link>
            }
          >
            <div className="neo-inset rounded-2xl p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <span className="neo-pill rounded-full px-2.5 py-1 text-[11px] font-black uppercase neo-section-label">
                    {subscription.badge}
                  </span>
                  <h1 className="mt-2 text-2xl font-black neo-ink">{subscription.name}</h1>
                  <p className="mt-1 max-w-xl text-xs font-medium leading-5 neo-muted">{subscription.description}</p>
                </div>
                <p className="text-2xl font-black neo-ink">${subscription.basePrice}<span className="text-xs font-bold neo-muted">/mo</span></p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <SummaryLine label="Base creator subscription" value={`$${subscription.basePrice}`} checked />
              <SummaryLine
                label="60 min podcast/runtime booster"
                value={`+$${subscription.finishedRuntimePrice}`}
                checked={runtimeSelected}
              />
              <SummaryLine
                label="600 min raw vlog footage booster"
                value={`+$${subscription.rawFootagePrice}`}
                checked={rawSelected}
              />
            </div>
          </Panel>

          <Panel title="Project & Channel Intake" icon="edit_note">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="YouTube Channel Name" name="channelName" placeholder="e.g. CreatorLab" autoComplete="organization" required />
              <Field label="Content Category" name="category" placeholder="Tech, gaming, lifestyle..." autoComplete="off" />
              <Field label="Target Upload Cadence" name="cadence" placeholder="1-2 videos / week" autoComplete="off" />
              <Field label="First Target Deadline" name="deadline" type="date" />
            </div>
            <label className="mt-4 grid gap-2 text-sm font-black neo-ink">
              Notes & Editing Style Preferences
              <textarea
                name="notes"
                rows={4}
                placeholder="References, pacing speed, color preference, motion graphics style, or anything your editor should know."
                autoComplete="off"
                className="neo-inset rounded-xl p-3 text-sm font-medium outline-none neo-ink placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </Panel>
        </section>

        {/* Middle Column: Payment & Billing Details */}
        <section className="grid content-start gap-6">
          <Panel
            title="Payment Method"
            icon="credit_card"
            aside={<span className="text-xs font-black neo-muted">PCI Level 1 Ready</span>}
          >
            <div className="grid gap-4">
              <label className="neo-card flex cursor-pointer items-center gap-3 rounded-xl p-4 ring-2 ring-primary bg-[#fdf2f4]">
                <input type="radio" name="paymentMethod" value="card" defaultChecked className="h-4 w-4 accent-red-600" />
                <span className="material-symbols-outlined text-[22px] text-primary">credit_card</span>
                <span className="flex-1">
                  <span className="block text-sm font-black neo-ink">Credit / Debit Card</span>
                  <span className="block text-xs font-medium neo-muted">Secure checkout via Stripe / payment gateway.</span>
                </span>
              </label>

              <div className="neo-inset rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-primary">verified_user</span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider neo-ink">No card details stored on EdiCut</p>
                    <p className="mt-1 text-xs font-medium leading-5 neo-muted">
                      Your billing token is securely handled by our PCI-compliant payment infrastructure.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Billing Information" icon="receipt_long">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Billing Name" name="billingName" defaultValue={user.name} autoComplete="name" required />
              <Field label="Billing Email" name="billingEmail" type="email" defaultValue={user.email} autoComplete="email" required />
              <Field label="Company / Entity" name="company" placeholder="Optional" autoComplete="organization" />
              <Field label="Country" name="country" defaultValue="United States" autoComplete="country-name" />
            </div>
          </Panel>

          <Panel title="What Happens Next" icon="check_circle">
            <div className="space-y-2.5">
              {[
                "Instant access to private creator dashboard",
                "Lead editor matched within 24 hours",
                "Async Google Drive / Frame.io sync",
                "Direct onboarding checklist delivered via email",
              ].map((item) => (
                <p key={item} className="flex items-center gap-2 text-xs font-bold neo-ink">
                  <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
                  {item}
                </p>
              ))}
            </div>
          </Panel>
        </section>

        {/* Right Column: Sticky Order Summary */}
        <aside className="lg:sticky lg:top-5 lg:self-start">
          <section className="neo-surface rounded-[2rem] p-6 shadow-xl">
            <div className="border-b neo-line pb-4">
              <p className="yt-tag neo-section-label">Order Summary</p>
              <h2 className="mt-1 text-2xl font-black neo-ink">Due Today</h2>
            </div>

            <div className="mt-5 space-y-3">
              <PriceRow label={`${subscription.name} Base Plan`} value={subscription.basePrice} />
              {runtimeSelected ? <PriceRow label="60 min podcast runtime" value={subscription.finishedRuntimePrice} /> : null}
              {rawSelected ? <PriceRow label="600 min raw vlog footage" value={subscription.rawFootagePrice} /> : null}

              {/* Promo Code Input */}
              <div className="neo-inset flex items-center rounded-xl p-1.5 mt-4">
                <input
                  name="discountCode"
                  placeholder="Discount or promo code"
                  autoComplete="off"
                  className="w-full bg-transparent px-3 py-1.5 text-xs font-bold outline-none neo-ink placeholder:text-gray-400"
                />
                <button
                  type="button"
                  className="neo-pill rounded-lg px-3 py-1 text-xs font-black uppercase neo-muted hover:text-foreground"
                >
                  Apply
                </button>
              </div>

              <div className="border-t neo-line pt-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold neo-muted">
                  <span>Monthly Subtotal</span>
                  <span>${total}</span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-sm font-black neo-ink">Total Due Today</span>
                  <span className="text-3xl font-black tracking-tight neo-ink">${total}</span>
                </div>
                <p className="text-[11px] font-medium leading-relaxed neo-muted pt-1">
                  Renews automatically every month. Cancel or adjust footage coverage anytime before billing.
                </p>
              </div>

              {actionData?.error ? (
                <p className="rounded-xl bg-[#FFF5F5] p-3 text-xs font-black text-[#D90000]">{actionData.error}</p>
              ) : null}
              {actionData?.ok ? (
                <p className="rounded-xl bg-red-50 p-3 text-xs font-black text-primary">
                  Order information captured. Connecting to secure gateway...
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="neo-button neo-button--primary mt-4 w-full justify-center text-sm font-black uppercase tracking-wider"
              >
                <span className="material-symbols-outlined text-[18px]">lock</span>
                <span>{isSubmitting ? "Processing..." : "Complete Checkout"}</span>
              </button>

              <Link
                to={`/pricing/${subscription.slug}`}
                className="neo-card mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl text-xs font-black neo-ink transition hover:border-primary/40"
              >
                ← Back to package details
              </Link>
            </div>
          </section>
        </aside>
      </Form>
    </main>
  );
}

function Panel({
  title,
  icon,
  aside,
  children,
}: {
  title: string;
  icon: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="neo-surface rounded-[2rem] p-6">
      <div className="flex items-center justify-between border-b neo-line pb-4">
        <h2 className="flex items-center gap-2 text-base font-black neo-ink">
          <span className="neo-icon-badge flex h-7 w-7 items-center justify-center rounded-lg">
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
          </span>
          {title}
        </h2>
        {aside}
      </div>
      <div className="pt-5">{children}</div>
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
    <label className="grid gap-1.5 text-xs font-black uppercase tracking-wider neo-muted">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        className="neo-inset h-11 w-full rounded-xl px-3.5 text-sm font-semibold normal-case tracking-normal outline-none neo-ink placeholder:text-gray-400 focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

function SummaryLine({ label, value, checked }: { label: string; value: string; checked: boolean }) {
  return (
    <div className={`neo-card flex items-center justify-between gap-3 rounded-xl p-3.5 ${checked ? "ring-1 ring-primary/40" : "opacity-75"}`}>
      <span className="flex min-w-0 items-center gap-2 text-xs font-bold neo-ink">
        <span className={`material-symbols-outlined text-[18px] ${checked ? "text-primary" : "text-gray-400"}`}>
          {checked ? "check_circle" : "radio_button_unchecked"}
        </span>
        {label}
      </span>
      <span className="shrink-0 text-xs font-black neo-ink">{value}</span>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs font-bold">
      <span className="neo-muted">{label}</span>
      <span className="font-black neo-ink">${value}</span>
    </div>
  );
}

function StatusChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="neo-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black neo-muted">
      <span className="material-symbols-outlined text-[15px] text-primary">{icon}</span>
      {label}
    </span>
  );
}
