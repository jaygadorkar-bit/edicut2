import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useFetcher, useLoaderData, useNavigation } from "react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CreditCard, LockKeyhole, Construction } from "lucide-react";
import { eq } from "drizzle-orm";
import { users as usersTable } from "@edicut/db/schema";
import { CountrySelect } from "../components/CountrySelect";
import { getDbFromContext } from "../lib/db.server";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { requireUserId } from "../lib/session.server";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { findAffiliateByCode, findCouponForQuote, isMissingMarketingSchema, normalizeMarketingCode } from "../lib/marketing.server";
import { getCheckoutTotal, REQUIRED_PACKAGE_STAFFING, STUDIO_PACKAGE_STAFFING, type EditingPackage } from "../lib/subscriptions";
import { configuredEditingPackage, getPricingPackages } from "../lib/pricing.server";
import { countryCallingCode, countryName, updatePhoneForCountryChange, validateCheckoutContact } from "../lib/checkout-contact";
import { getLatestCustomerContact, getOwnedSubscription, isSameSiteMutation, readSubscriptionForm, saveUnpaidSubscription } from "../lib/customer-subscriptions.server";
import { queueTelegramOrderNotice } from "../lib/telegram-notifications.server";
import { PackageAddOns } from "../components/site/PackageAddOns";
import { packageAddOnQuery, packageAddOnTotal, parsePackageAddOns, savedPackageAddOns, selectedPackageAddOns } from "../lib/package-addons";

type CouponPreview = { code: string; subtotalCents: number; discountCents: number; discountedTotalCents: number };
type CheckoutActionData = { error?: string; couponCode?: string; couponError?: string; couponPreview?: CouponPreview };
const COUPON_UNAVAILABLE_NOTICE = "Coupons are temporarily unavailable. Remove the code to continue, or try again later.";
const PAYMENT_UNAVAILABLE_NOTICE = "Payment gateway under construction. Card payments are not available yet.";

async function getCheckoutPackage(slug: string | undefined, context: LoaderFunctionArgs["context"]): Promise<EditingPackage | null> {
  if (!slug) return null;
  const db = getSupabaseClient(context) ? null : getDbFromContext(context);
  const packages = await getPricingPackages(db, context);
  return configuredEditingPackage(slug, packages);
}

function purchaseLabel(packageType: EditingPackage["packageType"]) {
  return packageType === "monthly" ? "Monthly editing package" : "Single video edit";
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.editingPackage ? `${data.editingPackage.name} ${data.paymentStep ? "checkout" : "package review"} | EdiCut` : "Checkout | EdiCut" },
  { name: "description", content: "Review your EdiCut video-editing package and payment details." },
  { name: "robots", content: "noindex, nofollow, noarchive" },
];

export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }; }

async function quoteCoupon(context: LoaderFunctionArgs["context"], code: string, subtotalCents: number, userId: string): Promise<CheckoutActionData> {
  const normalized = normalizeMarketingCode(code);
  if (!normalized) return { couponCode: code.trim().toUpperCase(), couponError: "Enter a valid coupon code." };
  try {
    const quote = await findCouponForQuote(getDbFromContext(context), normalized, subtotalCents, userId);
    if ("error" in quote) return { couponCode: normalized, couponError: quote.error };
    return { couponCode: quote.coupon.code, couponPreview: {
      code: quote.coupon.code, subtotalCents, discountCents: quote.discountCents, discountedTotalCents: quote.discountedTotalCents,
    } };
  } catch (error) {
    if (!isMissingMarketingSchema(error)) console.error("Checkout coupon validation failed");
    return { couponCode: normalized, couponError: COUPON_UNAVAILABLE_NOTICE };
  }
}

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const editingPackage = await getCheckoutPackage(params.slug, context);
  if (!editingPackage) throw new Response("Package not found", { status: 404 });
  const userId = await requireUserId(request, context, `${url.pathname}${url.search}`);
  const paymentStep = url.searchParams.get("step") === "payment";
  const savedSubscription = paymentStep || url.searchParams.has("subscription")
    ? await getOwnedSubscription(getDbFromContext(context), userId, url.searchParams.get("subscription") || "", editingPackage.slug)
    : null;
  let customerContact: { country: string; phone: string } | null = null;
  if (!paymentStep && !savedSubscription) {
    try {
      customerContact = await getLatestCustomerContact(getDbFromContext(context), userId);
    } catch {
      // Contact prefill is optional; customers can still enter details manually.
      console.error("Unable to load saved checkout contact");
    }
  }
  if (paymentStep && !savedSubscription) {
    const review = new URLSearchParams(url.searchParams);
    review.delete("step"); review.delete("subscription");
    throw redirect(`/checkout/${editingPackage.slug}${review.size ? `?${review}` : ""}`);
  }
  if (savedSubscription?.status === "paid") throw redirect("/dashboard/projects");
  const addOns = paymentStep ? savedPackageAddOns(savedSubscription?.addOns)
    : parsePackageAddOns(url.searchParams.has("addon") ? url.searchParams.getAll("addon") : savedPackageAddOns(savedSubscription?.addOns).map(item => item.id));
  if (!addOns) throw new Response("Invalid package add-ons", { status: 400 });
  const total = paymentStep && savedSubscription?.subtotalCents != null ? savedSubscription.subtotalCents / 100
    : getCheckoutTotal(editingPackage) + packageAddOnTotal(addOns) / 100;
  const couponCode = (url.searchParams.get("coupon") || (paymentStep ? savedSubscription?.couponCode : "") || "").trim().toUpperCase().slice(0, 32);
  let coupon: CheckoutActionData = {};
  if (couponCode && !paymentStep) {
    const limit = await consumeUsageLimit({ context, request, bindingName: "USER_ACTION_LIMITER", key: `user:${userId}`, localLimit: 60, localPeriodSeconds: 60 });
    coupon = limit === "allowed" ? await quoteCoupon(context, couponCode, total * 100, userId)
      : { couponCode, couponError: limit === "limited" ? "You have made several requests. Wait a minute and try again." : "Usage protection is temporarily unavailable. Please try again shortly." };
  }
  return {
    editingPackage, total, addOns, coupon, couponCode, customerContact,
    paymentStep, savedSubscription,
    affiliateCode: normalizeMarketingCode(url.searchParams.get("ref") || savedSubscription?.affiliateCode || "") || "",
  };
}

export async function action({ request, params, context }: ActionFunctionArgs): Promise<CheckoutActionData | Response> {
  const userId = await requireUserId(request, context);
  if (!isSameSiteMutation(request)) return Response.json({ error: "Please submit checkout from this site." }, { status: 403 });
  if (requestBodyExceedsLimit(request, 64 * 1024)) return { error: "Checkout request is too large." };
  const actionLimit = await consumeUsageLimit({ context, request, bindingName: "USER_ACTION_LIMITER", key: `user:${userId}`, localLimit: 60, localPeriodSeconds: 60 });
  if (actionLimit !== "allowed") return { error: actionLimit === "limited"
    ? "You have made several requests. Wait a minute and try again."
    : "Usage protection is temporarily unavailable. Please try again shortly." };
  const formData = await readSubscriptionForm(request, 64 * 1024);
  if (!formData) return { error: "Submit a valid checkout form under 64 KB." };
  const intent = formData.get("intent");
  // Saving an unpaid selection never creates an editing order or records payment.
  if (intent !== "validate-coupon" && intent !== "start-checkout") return Response.json({ error: PAYMENT_UNAVAILABLE_NOTICE }, { status: 503 });
  const code = String(formData.get("couponCode") || "").trim();
  const editingPackage = await getCheckoutPackage(params.slug, context);
  if (!editingPackage || formData.get("packageSlug") !== editingPackage.slug) return { couponCode: code.toUpperCase(), couponError: "Choose a valid package before applying a coupon." };
  const addOns = parsePackageAddOns(formData.getAll("addon"));
  if (!addOns) return { error: "Choose valid package add-ons." };
  const subtotalCents = getCheckoutTotal(editingPackage) * 100 + packageAddOnTotal(addOns);
  if (intent === "start-checkout") {
    const contact = validateCheckoutContact(String(formData.get("country") || ""), String(formData.get("phone") || ""));
    if ("error" in contact) return { error: contact.error };
    const coupon = code ? await quoteCoupon(context, code, subtotalCents, userId) : {};
    if (code && !coupon.couponPreview) return { ...coupon, error: coupon.couponError };
    try {
      const db = getDbFromContext(context);
      const requestedAffiliateCode = normalizeMarketingCode(String(formData.get("affiliateCode") || ""));
      const affiliate = requestedAffiliateCode ? await findAffiliateByCode(db, requestedAffiliateCode) : null;
      const saved = await saveUnpaidSubscription(db, {
        ownerId: userId, packageSlug: editingPackage.slug, planName: editingPackage.name, purchaseType: editingPackage.packageType, addOns, ...contact,
        subtotalCents, discountCents: coupon.couponPreview?.discountCents ?? 0,
        amountCents: coupon.couponPreview?.discountedTotalCents ?? subtotalCents,
        couponCode: coupon.couponPreview?.code ?? null,
        affiliateId: affiliate?.id ?? null,
        affiliateCode: affiliate?.code ?? null,
        affiliateCommissionBps: affiliate?.commissionRateBps ?? 0,
      });
      queueTelegramOrderNotice(context, {
        orderId: saved.id,
        kind: editingPackage.packageType === "monthly" ? "subscription" : "single",
        summary: `${purchaseLabel(editingPackage.packageType)}: ${saved.planName}${addOns.length ? ` + ${addOns.map(item => item.label).join(" + ")}` : ""}`,
        amountCents: saved.amountCents,
        currency: saved.currency,
      });
      await db.update(usersTable).set({
        phone: contact.phone,
        country: countryName(contact.country),
        updatedAt: new Date(),
      }).where(eq(usersTable.id, userId));
      return redirect(`/checkout/${editingPackage.slug}?step=payment&subscription=${saved.id}`);
    } catch {
      console.error("Unable to save unpaid package selection");
      return { error: "Your package selection could not be saved. Please try again shortly." };
    }
  }
  return quoteCoupon(context, code, subtotalCents, userId);
}

export default function CheckoutRoute() {
  const { editingPackage, paymentStep, couponCode, addOns } = useLoaderData<typeof loader>();
  return <CheckoutContent key={`${editingPackage.slug}:${paymentStep}:${couponCode}:${addOns.map(item => item.id).join(",")}`} />;
}

function CheckoutContent() {
  const { editingPackage, addOns: initialAddOns, coupon: initialCoupon, couponCode, customerContact, paymentStep, affiliateCode, savedSubscription } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state !== "idle";
  const couponFetcher = useFetcher<typeof action>();
  const [couponInput, setCouponInput] = useState(couponCode);
  const [couponRequestCode, setCouponRequestCode] = useState("");
  const [selectedAddOnIds, setSelectedAddOnIds] = useState(initialAddOns.map(item => item.id));
  const addOns = paymentStep ? initialAddOns : selectedPackageAddOns(selectedAddOnIds);
  const addOnCents = packageAddOnTotal(addOns);
  const subtotalCents = paymentStep ? savedSubscription!.subtotalCents : editingPackage.basePrice * 100 + addOnCents;
  const [phone, setPhone] = useState(() => savedSubscription?.phone ?? customerContact?.phone ?? (savedSubscription?.country ? `${countryCallingCode(savedSubscription.country)} ` : ""));
  const normalizedCode = couponInput.trim().toUpperCase();
  const couponResult = couponFetcher.data ?? initialCoupon;
  const appliedCoupon = couponResult.couponPreview?.code === normalizedCode && couponResult.couponPreview.subtotalCents === subtotalCents ? couponResult.couponPreview : undefined;
  const couponError = couponResult.couponCode === normalizedCode ? couponResult.couponError
    : couponRequestCode === normalizedCode ? couponFetcher.data?.error : undefined;
  const amountCents = (paymentStep ? savedSubscription?.amountCents : undefined) ?? appliedCoupon?.discountedTotalCents ?? subtotalCents;
  const couponBusy = couponFetcher.state !== "idle";
  const canProceed = !saving && !couponBusy && (!normalizedCode || Boolean(appliedCoupon));
  const query = packageAddOnQuery(selectedAddOnIds);
  if (affiliateCode) query.set("ref", affiliateCode);
  if (appliedCoupon) query.set("coupon", appliedCoupon.code);
  if (paymentStep && savedSubscription) {
    query.set("subscription", savedSubscription.id);
    if (savedSubscription.couponCode) query.set("coupon", savedSubscription.couponCode);
  }
  const reviewHref = `/checkout/${editingPackage.slug}${query.size ? `?${query}` : ""}`;
  const planQuery = packageAddOnQuery(selectedAddOnIds);
  if (affiliateCode) planQuery.set("ref", affiliateCode);
  const planHref = `/pricing/${editingPackage.slug}${planQuery.size ? `?${planQuery}` : ""}`;
  const includedTeam = editingPackage.slug === "creator-pro" ? STUDIO_PACKAGE_STAFFING : REQUIRED_PACKAGE_STAFFING;

  function applyCoupon() {
    setCouponRequestCode(normalizedCode);
    const form = new FormData();
    form.set("intent", "validate-coupon"); form.set("packageSlug", editingPackage.slug); form.set("couponCode", couponInput);
    selectedAddOnIds.forEach(id => form.append("addon", id));
    couponFetcher.submit(form, { method: "post", encType: "application/x-www-form-urlencoded" });
  }

  function handleCountryChange(nextCountryCode: string, previousCountryCode: string) {
    setPhone(current => updatePhoneForCountryChange(current, previousCountryCode, nextCountryCode));
  }

  return (
    <main className="neo-home min-h-screen text-foreground">
      <header className="border-b neo-line px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1040px] items-center justify-between gap-4">
          <Link to="/" aria-label="EdiCut home" className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <img src="/icons/edicut-logo.svg" alt="EdiCut" className="h-9 w-auto sm:h-10" />
          </Link>
          <Link to={paymentStep ? reviewHref : planHref} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold neo-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
            <ArrowLeft size={16} aria-hidden="true" /> {paymentStep ? "Back to review" : "Back to plan"}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1040px] px-4 pb-12 pt-7 sm:px-6 sm:pt-10">
        <nav aria-label="Checkout progress" className="mb-5 flex items-center gap-3 text-xs font-bold">
          <span aria-current={!paymentStep ? "step" : undefined} className={!paymentStep ? "neo-ink" : "neo-muted"}>Plan review</span>
          <ArrowRight size={14} className="neo-muted" aria-hidden="true" />
          <span aria-current={paymentStep ? "step" : undefined} className={paymentStep ? "neo-ink" : "neo-muted"}>Payment</span>
        </nav>
        <h1 className={paymentStep ? "text-3xl font-black tracking-tight neo-ink sm:text-4xl" : "sr-only"}>{paymentStep ? "Checkout" : "Plan review"}</h1>
        {paymentStep ? <p className="mt-3 max-w-xl text-sm leading-6 neo-muted">Pay for your plan, then share your project details when you start an order.</p> : null}

        {actionData?.error ? <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{actionData.error}</p> : null}
        <Form method="post" id="checkout-form" className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_350px] lg:gap-8">
          <input type="hidden" name="intent" value="start-checkout" />
          <input type="hidden" name="packageSlug" value={editingPackage.slug} />
          <input type="hidden" name="couponCode" value={appliedCoupon?.code ?? ""} />
          <input type="hidden" name="affiliateCode" value={affiliateCode} />
          {paymentStep ? (
            <section className="neo-surface min-w-0 rounded-3xl p-5 sm:p-7" aria-labelledby="payment-title">
              <h2 id="payment-title" className="text-xl font-black neo-ink">Payment method</h2>
              <p role="status" className="mt-3 text-sm neo-muted">Your {purchaseLabel(editingPackage.packageType).toLowerCase()} is saved as <strong className="neo-ink">{savedSubscription?.status === "paid" ? "paid" : "unpaid"}</strong>. <Link className="font-bold underline" to="/dashboard/subscriptions">View purchase</Link></p>
              <p className="mt-2 text-xs neo-muted">{countryName(savedSubscription!.country)} · {savedSubscription!.phone}</p>
              <fieldset disabled className="mt-5">
                <legend className="sr-only">Available payment methods</legend>
                <label className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-300 px-4 py-3">
                  <input type="radio" name="payment-method" checked readOnly aria-describedby="gateway-notice" className="h-4 w-4 accent-slate-800" />
                  <CreditCard size={22} className="shrink-0 neo-ink" aria-hidden="true" />
                  <span className="text-sm font-bold neo-ink">Credit card</span>
                  <span className="ml-auto text-xs neo-muted">Coming soon</span>
                </label>
              </fieldset>
              <div id="gateway-notice" role="status" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <Construction size={24} className="text-amber-800" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-black text-amber-950">Payment gateway under construction</h3>
                <p className="mt-2 text-sm leading-6 text-amber-900">Credit-card payments are not available yet. Please check back later to purchase your plan.</p>
              </div>
            </section>
          ) : (
            <div className="grid min-w-0 gap-6">
              <section className="neo-surface relative z-10 order-2 min-w-0 rounded-3xl p-5 sm:p-7" aria-labelledby="contact-title">
                <h2 id="contact-title" className="text-lg font-black neo-ink">Contact details</h2>
                <fieldset className="mt-4 grid gap-4 sm:grid-cols-2" aria-describedby={customerContact ? "checkout-contact-prefill" : undefined}>
                  <legend className="sr-only">Customer contact details</legend>
                  <div className="grid min-w-0 content-start gap-2 text-sm font-bold neo-ink">
                    <label htmlFor="checkout-country">Country</label>
                    <CountrySelect defaultValue={savedSubscription?.country ?? customerContact?.country ?? ""} onCountryChange={handleCountryChange} />
                  </div>
                  <div className="grid min-w-0 content-start gap-2 text-sm font-bold neo-ink">
                    <label htmlFor="checkout-phone">Phone number</label>
                    <input id="checkout-phone" name="phone" type="tel" required autoComplete="tel" value={phone} onChange={event => setPhone(event.currentTarget.value)} maxLength={64} placeholder="Enter phone number" className="neo-inset h-12 min-w-0 rounded-xl px-3 text-base font-medium focus:outline-2 focus:outline-primary" />
                  </div>
                  {customerContact ? <p id="checkout-contact-prefill" className="text-xs font-medium neo-muted sm:col-span-2">Filled from your most recent purchase. You can update these details before continuing.</p> : null}
                </fieldset>
              </section>
            <section className="neo-surface order-1 min-w-0 rounded-3xl p-5 sm:p-7" aria-labelledby="plan-title">
              <div className="flex items-center justify-between gap-3">
                <h2 id="plan-title" className="text-2xl font-black neo-ink">{editingPackage.name}</h2>
                <Link to={planHref} className="inline-flex min-h-11 items-center rounded-md px-1 text-xs font-bold neo-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">Plan details</Link>
              </div>
              <p className="mt-2 text-sm leading-6 neo-muted">{editingPackage.description}</p>
              <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-6 border-t neo-line pt-6">
                {editingPackage.packageType === "monthly" ? <>
                  <ScopeItem label="Editing hours per month" value={`${editingPackage.editingHoursPerMonth} hours`} />
                  <ScopeItem label="Editing hours per workday" value={`${editingPackage.editingHoursPerWorkday} ${editingPackage.editingHoursPerWorkday === 1 ? "hour" : "hours"}`} />
                  <ScopeItem label="Monthly planning basis" value={`${editingPackage.workingDaysPerMonth} working days`} />
                  <ScopeItem label="Unused hours" value="Do not roll over" />
                </> : <>
                  <ScopeItem label="Deliverable" value={editingPackage.videoFormat} />
                  <ScopeItem label="Finished length" value={editingPackage.finishedLength} />
                  <ScopeItem label="Raw footage limit" value={editingPackage.rawFootageLimit} />
                  <ScopeItem label="Revision rounds" value={String(editingPackage.revisionRounds)} />
                </>}
              </dl>
              <PackageAddOns selected={selectedAddOnIds} onChange={setSelectedAddOnIds} disabled={saving} />
            </section>
            </div>
          )}

          <aside className="neo-surface min-w-0 rounded-3xl p-5 sm:p-6" aria-labelledby="summary-title">
            <h2 id="summary-title" className="text-lg font-black neo-ink">Order summary</h2>
            <div className="mt-4 flex items-start justify-between gap-3 border-b neo-line pb-5">
              <div><p className="text-sm font-bold neo-ink">{paymentStep ? savedSubscription?.planName : editingPackage.name}</p><p className="mt-1 text-xs neo-muted">{purchaseLabel(editingPackage.packageType)}</p></div>
              <span className="text-sm font-bold neo-ink">{formatUsd(subtotalCents - addOnCents)}</span>
            </div>
            {addOns.length ? <ul aria-label="Selected add-ons" className="mt-4 grid gap-3 text-xs neo-muted">{addOns.map(item => <li key={item.id} className="flex justify-between gap-3"><span>{item.label} <span className="text-[10px]">· one time</span></span><strong className="neo-ink">{formatUsd(item.amountCents)}</strong></li>)}</ul> : null}
            <ul aria-label="Included team" className="mt-4 grid gap-2 text-xs font-bold neo-ink">
              {includedTeam.map((member) => <li key={member} className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />{member}</li>)}
            </ul>
            {!paymentStep ? <div className="mt-5">
              <label htmlFor="coupon-code" className="text-sm font-bold neo-ink">Coupon code</label>
              <div className="mt-2 flex min-w-0 gap-2">
                <input id="coupon-code" value={couponInput} onChange={event => setCouponInput(event.currentTarget.value)}
                  onKeyDown={event => { if (event.key === "Enter" && normalizedCode && !couponBusy) { event.preventDefault(); applyCoupon(); } }}
                  autoComplete="off" maxLength={32} placeholder="Enter code" aria-describedby="coupon-result" aria-invalid={Boolean(couponError)}
                  className="neo-inset h-11 min-w-0 flex-1 rounded-xl px-3 text-base font-semibold uppercase outline-none neo-ink placeholder:normal-case placeholder:font-medium placeholder:text-slate-500 focus:ring-2 focus:ring-primary/40 sm:text-sm" />
                <button type="button" onClick={applyCoupon} disabled={!normalizedCode || couponBusy}
                  className="min-h-11 shrink-0 rounded-xl border border-slate-300 px-3 text-sm font-bold neo-ink hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">
                {couponBusy ? "Checking…" : appliedCoupon ? "Applied" : "Apply"}
                </button>
              </div>
              <p id="coupon-result" aria-live="polite" className={`mt-2 text-xs leading-5 ${couponError ? "text-red-700" : "text-emerald-700"}`}>
                {couponError || (appliedCoupon ? `${appliedCoupon.code} saves ${formatUsd(appliedCoupon.discountCents)}.` : normalizedCode && couponResult.couponPreview ? "Apply your coupon again after changing add-ons." : "")}
              </p>
            </div> : null}
            <div className="mt-5 grid gap-3 border-t neo-line pt-5">
              {((paymentStep ? savedSubscription?.discountCents : undefined) ?? appliedCoupon?.discountCents ?? 0) > 0 ? <div className="flex justify-between gap-3 text-xs neo-muted"><span>Coupon discount</span><span>−{formatUsd((paymentStep ? savedSubscription?.discountCents : undefined) ?? appliedCoupon!.discountCents)}</span></div> : null}
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-bold neo-ink">{editingPackage.packageType === "monthly" ? addOns.length ? "First month total" : "Monthly total" : "One-time total"}</span>
                <p aria-live="polite" aria-atomic="true" className="text-2xl font-black tracking-tight neo-ink">{formatUsd(amountCents)}<span className="ml-1 text-xs font-medium neo-muted">{editingPackage.packageType === "monthly" && !addOns.length ? "/month" : "one time"}</span></p>
              </div>
            </div>
            {paymentStep ? (
              <>
                <button type="button" disabled aria-describedby="payment-unavailable" className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#19232d] px-4 py-3 text-sm font-bold text-white opacity-50 cursor-not-allowed">
                  <LockKeyhole size={17} aria-hidden="true" /> Pay {formatUsd(amountCents)}
                </button>
                <p id="payment-unavailable" className="mt-3 text-center text-xs leading-5 neo-muted">Payment gateway under construction</p>
              </>
            ) : (
              <button type="submit" disabled={!canProceed}
                className={`mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#19232d] px-4 py-3 text-sm font-bold text-white hover:bg-[#303e4b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${!canProceed ? "cursor-not-allowed opacity-50" : ""}`}>
                {saving ? "Saving…" : "Proceed to checkout"} <ArrowRight size={17} aria-hidden="true" />
              </button>
            )}
          </aside>
        </Form>
      </div>
    </main>
  );
}

function ScopeItem({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 flex-col"><dt className="mt-1 text-xs leading-5 neo-muted">{label}</dt><dd className="order-first text-2xl font-black neo-ink">{value}</dd></div>;
}

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
