import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { countryName } from "../lib/checkout-contact";
import type { CustomerSubscription } from "../lib/customer-subscriptions.server";

type Row = { subscription: CustomerSubscription; name?: string | null; email?: string };
export type SubscriptionSummary = { total: number; paid: number; unpaid: number };

export function SubscriptionList({ rows, admin = false, summary }: { rows: Row[]; admin?: boolean; summary?: SubscriptionSummary }) {
  if (admin) {
    const chartSummary = summary ?? rows.reduce<SubscriptionSummary>((counts, { subscription }) => {
      counts.total += 1;
      if (subscription.status === "paid") counts.paid += 1;
      else counts.unpaid += 1;
      return counts;
    }, { total: 0, paid: 0, unpaid: 0 });
    return <AdminSubscriptionChart rows={rows} summary={chartSummary} />;
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
  const purchaseLabel = isMonthly ? "Monthly package" : "Single video edit";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: record.currency }).format(record.amountCents / 100);
  return <article className="neo-workspace__panel min-w-0 rounded-3xl p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h3 className="text-xl font-black">{record.planName}</h3><p className="mt-1 text-sm text-slate-600">{purchaseLabel} · {amount}{isMonthly ? " / month" : " one time"}</p></div>
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

function AdminSubscriptionChart({ rows, summary }: { rows: Row[]; summary: SubscriptionSummary }) {
  const scale = Math.max(summary.total, 1);
  const statuses = [
    { label: "Paid", count: summary.paid, bar: "bg-emerald-600", icon: "check_circle" },
    { label: "Unpaid", count: summary.unpaid, bar: "bg-amber-500", icon: "schedule" },
  ];

  return <div className="neo-subscription-list space-y-5">
    <section className="neo-workspace__panel rounded-3xl p-5 sm:p-6" aria-labelledby="subscription-status-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="neo-workspace__eyebrow">Payment status</p>
          <h3 id="subscription-status-heading" className="mt-1 text-lg font-black text-slate-900">Purchase overview</h3>
        </div>
        <p className="text-sm font-bold tabular-nums text-slate-600">
          <span className="text-xl font-black text-slate-900">{summary.total}</span> saved {summary.total === 1 ? "plan" : "plans"}
        </p>
      </div>

      {summary.total === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">No package selections have been saved yet.</p>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {statuses.map(({ label, count, bar, icon }) => (
            <div key={label} className="min-w-0">
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
            </div>
          ))}
        </div>
      )}
    </section>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white/70" aria-labelledby="subscription-ledger-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
        <div>
          <p className="neo-workspace__eyebrow">Customer records</p>
          <h3 id="subscription-ledger-heading" className="mt-1 text-base font-black text-slate-900">Purchase ledger</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold tabular-nums text-slate-600">{rows.length} on this page</span>
      </div>

      <div className="hidden grid-cols-[minmax(120px,1fr)_minmax(150px,1.25fr)_minmax(130px,1.1fr)_minmax(110px,.9fr)_minmax(76px,.55fr)_minmax(130px,auto)] gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 xl:grid">
        <span>Plan / price</span><span>Customer</span><span>Contact</span><span>Selected</span><span>Status</span><span className="text-right">Action</span>
      </div>

      {rows.length ? <div className="divide-y divide-slate-200">
        {rows.map(row => <AdminSubscriptionRow key={row.subscription.id} row={row} />)}
      </div> : <p className="px-5 py-8 text-sm text-slate-600">There are no package selections on this page.</p>}
    </section>
  </div>;
}

function AdminSubscriptionRow({ row: { subscription: record, name, email } }: { row: Row }) {
  const [confirming, setConfirming] = useState(false);
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  const unpaid = record.status === "unpaid";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: record.currency }).format(record.amountCents / 100);
  const isMonthly = record.purchaseType === "monthly";
  const purchaseLabel = isMonthly ? "monthly package" : "single video edit";
  const selectedDate = new Date(record.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" });
  const paidDate = record.paidAt?.toLocaleDateString("en-US", { timeZone: "UTC" });

  return <article className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-4 p-4 sm:gap-x-6 sm:p-5 xl:grid-cols-[minmax(120px,1fr)_minmax(150px,1.25fr)_minmax(130px,1.1fr)_minmax(110px,.9fr)_minmax(76px,.55fr)_minmax(130px,auto)] xl:items-center xl:gap-3">
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 xl:hidden">Plan / price</p>
      <p className="mt-1 break-words text-sm font-black text-slate-900 xl:mt-0">{record.planName}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-600">{amount}<span className="text-xs font-medium">{isMonthly ? " / month" : " · one time"}</span></p>
      {record.couponCode ? <p className="mt-1 text-[11px] font-semibold text-slate-500">Coupon {record.couponCode}</p> : null}
    </div>

    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 xl:hidden">Customer</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-900 xl:mt-0">{name || email || "Customer"}</p>
      {email ? <p className="break-all text-xs text-slate-600">{email}</p> : null}
    </div>

    <div className="col-span-2 grid min-w-0 grid-cols-2 gap-3 xl:col-span-1 xl:block">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 xl:hidden">Country</p>
        <p className="mt-1 break-words text-xs font-semibold text-slate-700 xl:mt-0">{countryName(record.country)}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 xl:hidden">Phone</p>
        <p className="mt-1 break-all text-xs font-semibold text-slate-700 xl:mt-0">{record.phone}</p>
      </div>
    </div>

    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 xl:hidden">Selected</p>
      <p className="mt-1 text-xs font-semibold tabular-nums text-slate-700 xl:mt-0">{selectedDate}</p>
      {paidDate ? <p className="mt-0.5 text-[11px] text-slate-500">Manual confirmation · {paidDate}</p> : null}
    </div>

    <div className="min-w-0 text-right xl:text-left">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 xl:hidden">Status</p>
      <span className={`mt-1 inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold xl:mt-0 ${unpaid ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
        <span aria-hidden="true" className="material-symbols-outlined neo-subscription-icon--status">{unpaid ? "schedule" : "check_circle"}</span>{unpaid ? "Unpaid" : "Paid"}
      </span>
    </div>

    <div className={`min-w-0 ${confirming ? "col-span-2 xl:col-span-6" : "col-span-2 xl:col-span-1"}`}>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 xl:hidden">Action</p>
      {unpaid ? confirming ? <Form method="post" className="mt-2 grid gap-3 xl:mt-0 xl:grid-cols-2">
        <input type="hidden" name="intent" value="mark-paid" />
        <input type="hidden" name="subscriptionId" value={record.id} />
        <input type="hidden" name="expectedUpdatedAt" value={new Date(record.updatedAt).toISOString()} />
        <p className="text-xs leading-5 text-slate-600 xl:col-span-2">Confirm receipt of {amount} for this {purchaseLabel}. This records payment and does not charge a card.</p>
        <div className="flex flex-wrap gap-2 xl:col-span-2 xl:justify-end">
          <button disabled={pending} aria-label={`Confirm payment received for ${name || email || "customer"}'s ${record.planName} package`} className="min-h-11 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50">{pending ? "Saving…" : "Confirm payment"}</button>
          <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-50">Cancel</button>
        </div>
      </Form> : <button type="button" disabled={pending} aria-label={`Mark ${name || email || "customer"}'s ${record.planName} package as paid`} onClick={() => setConfirming(true)} className="mt-2 min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-800 transition-colors hover:border-slate-500 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:cursor-not-allowed disabled:opacity-50 xl:mt-0 xl:w-full">Mark as paid</button>
        : <span className="mt-1 inline-flex min-h-11 items-center text-xs text-slate-500 xl:mt-0 xl:justify-end">Payment recorded</span>}
    </div>
  </article>;
}

export function SubscriptionPagination({ page, hasNext }: { page: number; hasNext: boolean }) {
  return <nav aria-label="Purchase pages" className="mt-6 flex items-center justify-between gap-3 text-sm font-bold">
    {page > 1 ? <Link className="min-h-11 p-3 underline" to={`?page=${page - 1}`}>Previous</Link> : <span />}
    <span>Page {page}</span>
    {hasNext ? <Link className="min-h-11 p-3 underline" to={`?page=${page + 1}`}>Next</Link> : <span />}
  </nav>;
}
