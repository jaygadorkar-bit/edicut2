import { Fragment, useEffect, useRef, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { countryName } from "../lib/checkout-contact";
import type { CustomerSubscription, SubscriptionPaymentFilter } from "../lib/customer-subscriptions.server";
import { savedPackageAddOns } from "../lib/package-addons";

type Row = { subscription: CustomerSubscription; name?: string | null; email?: string };
function PurchaseAddOns({ addOns, currency }: { addOns: ReturnType<typeof savedPackageAddOns>; currency: string }) {
  return addOns.length ? <ul aria-label="Purchased add-ons" className="mt-2 grid gap-1 text-xs text-slate-600">{addOns.map(item => <li key={item.id}>{item.label} · {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(item.amountCents / 100)} one time</li>)}</ul> : null;
}
export type SubscriptionSummary = { total: number; paid: number; unpaid: number };

export function SubscriptionList({ rows, admin = false, summary, status = "unpaid" }: { rows: Row[]; admin?: boolean; summary?: SubscriptionSummary; status?: SubscriptionPaymentFilter }) {
  if (admin) {
    const chartSummary = summary ?? rows.reduce<SubscriptionSummary>((counts, { subscription }) => {
      counts.total += 1;
      if (subscription.status === "paid") counts.paid += 1;
      else counts.unpaid += 1;
      return counts;
    }, { total: 0, paid: 0, unpaid: 0 });
    return <AdminSubscriptionChart rows={rows} summary={chartSummary} status={status} />;
  }

  return <div className="neo-subscription-list grid gap-4">{rows.length ? rows.map(row => <SubscriptionCard key={row.subscription.id} row={row} admin={false} />)
    : <p className="rounded-2xl bg-white/50 p-6 text-sm text-slate-600">You haven’t saved a package selection yet.</p>}</div>;
}

function SubscriptionCard({ row: { subscription: record, name, email }, admin }: { row: Row; admin: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  const unpaid = record.status === "unpaid";
  const isMonthly = record.purchaseType === "monthly";
  const addOns = savedPackageAddOns(record.addOns);
  const purchaseLabel = isMonthly ? "Monthly package" : "Single video edit";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: record.currency }).format(record.amountCents / 100);
  return <article className="neo-workspace__panel min-w-0 rounded-3xl p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h3 className="text-xl font-black">{record.planName}</h3><p className="mt-1 text-sm text-slate-600">{purchaseLabel} · {amount}{isMonthly ? addOns.length ? " first month + extras" : " / month" : " one time"}</p><PurchaseAddOns addOns={addOns} currency={record.currency} /></div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${unpaid ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{unpaid ? "Unpaid" : "Paid"}</span>
    </div>
    {admin ? <p className="mt-4 break-words text-sm font-bold">{name || email}<span className="mt-1 block font-normal text-slate-600">{email}</span></p> : null}
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-slate-500">Country</dt><dd className="mt-1 font-semibold">{countryName(record.country)}</dd></div>
      <div><dt className="text-xs text-slate-500">Phone</dt><dd className="mt-1 font-semibold">{record.phone}</dd></div>
      <div><dt className="text-xs text-slate-500">Selected</dt><dd className="mt-1">{new Date(record.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</dd></div>
      {record.paidAt ? <div><dt className="text-xs text-slate-500">Payment recorded</dt><dd className="mt-1">{new Date(record.paidAt).toLocaleDateString("en-US", { timeZone: "UTC" })} · Manual confirmation</dd></div> : null}
      {record.couponCode ? <div><dt className="text-xs text-slate-500">Coupon</dt><dd className="mt-1">{record.couponCode}</dd></div> : null}
    </dl>
    {unpaid ? <div className="mt-5 border-t border-slate-200 pt-4">
      {confirming ? <Form method="post" className="grid gap-3">
        <input type="hidden" name="intent" value={admin ? "mark-paid" : "delete-unpaid"} />
        <input type="hidden" name="subscriptionId" value={record.id} />
        <input type="hidden" name="expectedUpdatedAt" value={new Date(record.updatedAt).toISOString()} />
        <p className="text-sm text-slate-600">{admin ? `Confirm you have received ${amount} for this ${purchaseLabel.toLowerCase()}. This records payment; it does not charge a card.` : `Delete this unpaid ${purchaseLabel.toLowerCase()}? You can select it again later.`}</p>
        <div className="flex flex-wrap gap-3">
          <button disabled={pending} className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">{pending ? "Saving…" : admin ? "Confirm payment received" : "Delete unpaid selection"}</button>
          <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold">Cancel</button>
        </div>
      </Form> : <div className="flex flex-wrap gap-3">
        {!admin ? <Link to={`/checkout/${record.packageSlug}?step=payment&subscription=${record.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white">Review purchase</Link> : null}
        <button type="button" onClick={() => setConfirming(true)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold">{admin ? "Mark as paid" : "Delete unpaid"}</button>
      </div>}
    </div> : null}
  </article>;
}

function AdminSubscriptionChart({ rows, summary, status }: { rows: Row[]; summary: SubscriptionSummary; status: SubscriptionPaymentFilter }) {
  const scale = Math.max(summary.total, 1);
  const statuses = [
    { value: "paid", label: "Paid", count: summary.paid, bar: "bg-emerald-600", icon: "check_circle" },
    { value: "unpaid", label: "Unpaid", count: summary.unpaid, bar: "bg-amber-500", icon: "schedule" },
  ];

  return <div className="neo-subscription-list space-y-4">
    <section className="neo-workspace__panel rounded-2xl p-4 sm:p-5" aria-labelledby="subscription-status-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="neo-workspace__eyebrow">Payment status</p>
          <h3 id="subscription-status-heading" className="mt-1 text-lg font-black text-slate-900">Order overview</h3>
        </div>
        <p className="text-sm font-bold tabular-nums text-slate-600">
          <span className="text-xl font-black text-slate-900">{summary.total}</span> saved {summary.total === 1 ? "plan" : "plans"}
        </p>
      </div>

      {summary.total === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">No package selections have been saved yet.</p>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {statuses.map(({ value, label, count, bar, icon }) => {
            const active = status === value;
            const selectedTone = value === "paid"
              ? "border-emerald-200 bg-emerald-50/70"
              : "border-amber-200 bg-amber-50/70";
            return <Link
              key={value}
              to={`?status=${value}`}
              aria-label={`Show ${label.toLowerCase()} orders (${count})`}
              aria-current={active ? "page" : undefined}
              className={`block min-w-0 rounded-xl border p-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${active ? selectedTone : "border-transparent hover:border-slate-200 hover:bg-slate-50/80"}`}
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2 font-bold text-slate-700">
                  <span aria-hidden="true" className="material-symbols-outlined neo-subscription-icon--overview">{icon}</span>{label}
                </span>
                <span className="font-black tabular-nums text-slate-900">{count}</span>
              </div>
              <div
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label={`${label} package selections`}
                aria-valuemin={0}
                aria-valuemax={scale}
                aria-valuenow={count}
              >
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, (count / scale) * 100)}%` }} />
              </div>
            </Link>;
          })}
        </div>
      )}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white/85 shadow-sm" aria-labelledby="subscription-ledger-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-slate-50/80 px-4 py-3 sm:px-5">
        <div>
          <p className="neo-workspace__eyebrow">Order records</p>
          <h3 id="subscription-ledger-heading" className="mt-1 text-base font-black text-slate-900">Order ledger</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold tabular-nums text-slate-600">{rows.length} on this page</span>
        </div>
      </div>

      <div role="region" aria-label="Order records table" tabIndex={0} className="overflow-x-auto overscroll-x-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
          <caption className="sr-only">Saved customer orders and payment status</caption>
          <colgroup><col className="w-[34%]" /><col className="w-[33%]" /><col className="w-[17%]" /><col className="w-[16%]" /></colgroup>
          <thead>
            <tr className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
              <th scope="col" className="border-b border-r border-slate-200 px-3 py-3">Plan / price</th>
              <th scope="col" className="border-b border-r border-slate-200 px-3 py-3">Customer</th>
              <th scope="col" className="border-b border-r border-slate-200 px-3 py-3">Selected</th>
              <th scope="col" className="border-b border-slate-200 px-3 py-3">Status</th>
            </tr>
          </thead>
          {rows.length ? <tbody>
            {rows.map(row => <AdminSubscriptionRow key={row.subscription.id} row={row} />)}
          </tbody> : <tbody><tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-600">No {status} orders on this page.</td></tr></tbody>}
        </table>
      </div>
    </section>
  </div>;
}

function AdminSubscriptionRow({ row: { subscription: record, name, email } }: { row: Row }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState<"mark-paid" | "mark-unpaid" | "delete-purchase" | null>(null);
  const confirmationButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmingAction) confirmationButtonRef.current?.focus();
    else returnFocusRef.current?.focus();
  }, [confirmingAction]);
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  const unpaid = record.status === "unpaid";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: record.currency }).format(record.amountCents / 100);
  const isMonthly = record.purchaseType === "monthly";
  const addOns = savedPackageAddOns(record.addOns);
  const purchaseLabel = isMonthly ? "monthly package" : "single video edit";
  const selectedDate = new Date(record.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" });
  const paidDate = record.paidAt?.toLocaleDateString("en-US", { timeZone: "UTC" });
  const customerLabel = name || email || "Customer";
  const overviewId = `purchase-overview-${record.id}`;
  const toggleExpanded = () => {
    if (expanded) setConfirmingAction(null);
    setExpanded(open => !open);
  };

  return <Fragment>
    <tr onClick={toggleExpanded} className={`group cursor-pointer transition-colors ${expanded ? "bg-blue-50/50" : "odd:bg-white even:bg-slate-50/70 hover:bg-slate-50"}`}>
      <td className="border-b border-r border-slate-200 px-3 py-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? overviewId : undefined}
          aria-label={`Order overview for ${customerLabel}'s ${record.planName} plan`}
          className="min-h-10 w-full rounded-md text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <span className="block truncate font-bold text-slate-900">{record.planName}<span className="ml-2 font-semibold tabular-nums text-slate-700">{amount}<span className="font-normal text-slate-500">{isMonthly ? addOns.length ? " · first month + extras" : " / month" : " · one time"}</span></span></span>
        </button>
      </td>
      <td className="min-w-0 truncate border-b border-r border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">{customerLabel}</td>
      <td className="truncate border-b border-r border-slate-200 px-3 py-2 text-[13px] font-medium tabular-nums text-slate-700">{selectedDate}</td>
      <td className="border-b border-slate-200 px-3 py-2">
        <span className="flex min-w-0 items-center justify-between gap-1">
          <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ${unpaid ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
            <span aria-hidden="true" className="material-symbols-outlined neo-subscription-icon--status">{unpaid ? "schedule" : "check_circle"}</span>{unpaid ? "Unpaid" : "Paid"}
            <span aria-hidden="true" className={`material-symbols-outlined text-sm transition-transform ${expanded ? "rotate-180" : ""}`}>expand_more</span>
          </span>
        </span>
      </td>
    </tr>

    {expanded ? <tr className="bg-slate-50/70">
      <td colSpan={4} className="border-b border-slate-200 px-3 py-4 sm:px-4">
        <section id={overviewId} aria-label={`Order overview for ${record.planName}`} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <p className="neo-workspace__eyebrow">Selected order</p>
              <h4 className="mt-1 text-base font-black text-slate-900">Order overview</h4>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{purchaseLabel}</span>
          </div>
          <dl className="grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Plan / price</dt><dd className="mt-1.5 break-words font-bold text-slate-900">{record.planName} · {amount}{isMonthly ? addOns.length ? " first month + extras" : " / month" : " · one time"}</dd></div>
            <div className="min-w-0"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer</dt><dd className="mt-1.5 break-words font-bold text-slate-900">{customerLabel}</dd>{email ? <dd className="mt-0.5 break-all text-xs text-slate-600">{email}</dd> : null}</div>
            <div className="min-w-0"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Contact</dt><dd className="mt-1.5 break-words font-semibold text-slate-800">{countryName(record.country)}</dd><dd className="mt-0.5 break-all text-xs text-slate-600">{record.phone}</dd></div>
            <div className="min-w-0"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Selected</dt><dd className="mt-1.5 font-semibold tabular-nums text-slate-800">{selectedDate}</dd>{paidDate ? <dd className="mt-0.5 text-xs text-slate-600">Manual confirmation · {paidDate}</dd> : null}</div>
            {record.couponCode ? <div className="min-w-0"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Coupon</dt><dd className="mt-1.5 break-words font-semibold text-slate-800">{record.couponCode}</dd></div> : null}
          </dl>
          {addOns.length ? <div className="border-t border-slate-100 pt-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Purchased add-ons</p><PurchaseAddOns addOns={addOns} currency={record.currency} /></div> : null}
        </section>

        {confirmingAction ? <div role="group" aria-label={`Confirm ${confirmingAction === "mark-paid" ? "payment" : confirmingAction === "mark-unpaid" ? "setting order unpaid" : "order deletion"}`} className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${confirmingAction === "delete-purchase" ? "border-red-200 bg-red-50" : confirmingAction === "mark-unpaid" ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
          <div className="max-w-xl text-xs leading-5 text-slate-800">
            {confirmingAction === "mark-paid" ? <p>Confirm receipt of {amount} for this {purchaseLabel}. This records payment and does not charge a card.</p>
              : confirmingAction === "mark-unpaid" ? <p>Set this order to unpaid? Paid access will be removed and the coupon use released. This is blocked after project work starts.</p>
                : <p>Remove this {purchaseLabel} from the ledger and customer account? {unpaid ? "The selection can be created again later." : "Paid access and its coupon use will be removed."} Deletion is blocked after project work starts.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Form method="post">
              <input type="hidden" name="intent" value={confirmingAction} />
              <input type="hidden" name="subscriptionId" value={record.id} />
              <input type="hidden" name="expectedUpdatedAt" value={new Date(record.updatedAt).toISOString()} />
              <button ref={confirmationButtonRef} disabled={pending} aria-label={`${confirmingAction === "mark-paid" ? "Confirm payment received for" : confirmingAction === "mark-unpaid" ? "Confirm setting unpaid for" : "Confirm deletion of"} ${customerLabel}'s ${record.planName} order`} className={`min-h-10 rounded-md px-3 text-xs font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${confirmingAction === "delete-purchase" ? "bg-red-700 hover:bg-red-800 focus-visible:outline-red-700" : "bg-slate-900 hover:bg-slate-700 focus-visible:outline-slate-700"}`}>{pending ? "Saving…" : confirmingAction === "mark-paid" ? "Confirm payment" : confirmingAction === "mark-unpaid" ? "Confirm unpaid" : "Delete order"}</button>
            </Form>
            <button type="button" disabled={pending} onClick={() => setConfirmingAction(null)} className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:opacity-50">Cancel</button>
          </div>
        </div> : <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className={`text-xs font-semibold ${unpaid ? "text-slate-600" : "text-emerald-800"}`}>{unpaid ? "Confirm only after funds have arrived." : "Payment recorded"}</p>
          <div className="flex flex-wrap gap-2">
            {unpaid ? <button ref={returnFocusRef} type="button" disabled={pending} aria-label={`Mark ${customerLabel}'s ${record.planName} package as paid`} onClick={event => { returnFocusRef.current = event.currentTarget; setConfirmingAction("mark-paid"); }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 transition-colors hover:border-slate-500 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Mark as paid</button>
              : <button ref={returnFocusRef} type="button" disabled={pending} aria-label={`Set ${customerLabel}'s ${record.planName} package as unpaid`} onClick={event => { returnFocusRef.current = event.currentTarget; setConfirmingAction("mark-unpaid"); }} className="min-h-11 rounded-lg border border-amber-300 bg-amber-50 px-4 text-xs font-bold text-amber-950 transition-colors hover:border-amber-400 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:opacity-50">Set as unpaid</button>}
            <button ref={unpaid ? undefined : returnFocusRef} type="button" disabled={pending} aria-label={`Delete ${customerLabel}'s ${record.planName} order`} onClick={event => { returnFocusRef.current = event.currentTarget; setConfirmingAction("delete-purchase"); }} className="min-h-11 rounded-lg border border-red-200 bg-white px-4 text-xs font-bold text-red-800 transition-colors hover:border-red-300 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-50">Delete order</button>
          </div>
        </div>}
      </td>
    </tr> : null}
  </Fragment>;
}

export function SubscriptionPagination({ page, hasNext, status }: { page: number; hasNext: boolean; status?: SubscriptionPaymentFilter }) {
  const pageUrl = (targetPage: number) => status ? `?status=${status}&page=${targetPage}` : `?page=${targetPage}`;
  return <nav aria-label={status ? "Order pages" : "Purchase pages"} className="mt-6 flex items-center justify-between gap-3 text-sm font-bold">
    {page > 1 ? <Link className="min-h-11 p-3 underline" to={pageUrl(page - 1)}>Previous</Link> : <span />}
    <span>Page {page}</span>
    {hasNext ? <Link className="min-h-11 p-3 underline" to={pageUrl(page + 1)}>Next</Link> : <span />}
  </nav>;
}
