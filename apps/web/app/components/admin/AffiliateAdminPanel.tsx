import { useState } from "react";
import { Form, Link } from "react-router";
import type { AdminMarketingData, MarketingAffiliateView } from "../../lib/marketing.server";

type AffiliateActionData = { error?: string; success?: string } | undefined;

export function AffiliateAdminPanel({
  data,
  actionData,
  isSubmitting,
}: {
  data: AdminMarketingData;
  actionData: AffiliateActionData;
  isSubmitting: boolean;
}) {
  const [editingAffiliateId, setEditingAffiliateId] = useState("");
  const [copiedAffiliateId, setCopiedAffiliateId] = useState("");
  const [copyError, setCopyError] = useState("");
  const editingAffiliate = data.affiliates.find((affiliate) => affiliate.id === editingAffiliateId);
  const activePartners = data.affiliates.filter((affiliate) => affiliate.active).length;
  const attributedOrders = data.affiliates.reduce((total, affiliate) => total + affiliate.referralCount, 0);
  const paidOrders = data.affiliates.reduce((total, affiliate) => total + affiliate.paidReferralCount, 0);
  const earnedCommission = data.affiliates.reduce((total, affiliate) => total + affiliate.commissionEarnedCents, 0);
  const potentialCommission = data.affiliates.reduce((total, affiliate) => total + affiliate.pendingCommissionCents, 0);

  async function copyReferralLink(affiliate: MarketingAffiliateView) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(affiliate.referralUrl);
      setCopiedAffiliateId(affiliate.id);
      window.setTimeout(() => setCopiedAffiliateId((current) => current === affiliate.id ? "" : current), 1800);
    } catch {
      setCopyError("Copy was blocked by the browser. Select the referral link to copy it manually.");
    }
  }

  return (
    <section className="grid gap-5" aria-labelledby="affiliates-title">
      <header className="neo-workspace__panel flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="neo-workspace__eyebrow">Growth tools</p>
          <h1 id="affiliates-title" className="neo-workspace__module-title mt-1">Affiliate partners</h1>
          <p className="neo-workspace__module-copy mt-2 max-w-2xl">
            Manage partner accounts, referral links, attributed orders, and commission earned on paid orders.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryValue label="Active partners" value={activePartners} />
        <SummaryValue label="Attributed orders" value={attributedOrders} />
        <SummaryValue label="Paid orders" value={paidOrders} />
        <SummaryValue label="Commission earned" value={formatMoney(earnedCommission)} />
        <SummaryValue label="Potential on unpaid orders" value={formatMoney(potentialCommission)} />
      </div>

      {actionData?.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{actionData.error}</p> : null}
      {actionData?.success ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{actionData.success}</p> : null}
      {!data.schemaReady ? (
        <div role="alert" className="neo-workspace__panel border-amber-300 bg-amber-50 p-5 text-sm font-semibold text-amber-950">
          <h2 className="text-base font-black">Affiliate database setup is needed</h2>
          <p className="mt-2">Apply the marketing database migration before managing partners.</p>
        </div>
      ) : (
        <>
          <div className="neo-workspace__panel p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#17202a]">{editingAffiliate ? "Edit affiliate" : "Add an affiliate"}</h2>
                <p className="mt-1 text-sm text-[#687583]">Select a user with the Affiliate role, then set their referral code and commission rate.</p>
              </div>
              {editingAffiliate ? <button type="button" onClick={() => setEditingAffiliateId("")} className="min-h-11 rounded-xl px-3 text-sm font-bold text-[#536779] underline underline-offset-4">Cancel edit</button> : null}
            </div>
            <Form key={editingAffiliate?.id ?? "new-affiliate"} method="post" className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="intent" value={editingAffiliate ? "update-marketing-affiliate" : "create-marketing-affiliate"} />
              {editingAffiliate ? (
                <input type="hidden" name="affiliateId" value={editingAffiliate.id} />
              ) : (
                <label className="grid gap-1.5 text-sm font-semibold text-[#445260]">
                  Affiliate account
                  <select name="userId" required defaultValue="" className="neo-workspace__profile-input h-11 rounded-xl px-3" disabled={isSubmitting || !data.affiliateCandidates.length}>
                    <option value="" disabled>{data.affiliateCandidates.length ? "Choose an account" : "No eligible accounts"}</option>
                    {data.affiliateCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.email}</option>)}
                  </select>
                </label>
              )}
              <label className="grid gap-1.5 text-sm font-semibold text-[#445260]">
                Referral code
                <input name="code" required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" defaultValue={editingAffiliate?.code ?? ""} placeholder="JAYGA" autoComplete="off" className="neo-workspace__profile-input h-11 rounded-xl px-3 font-bold uppercase" disabled={isSubmitting} />
                <span className="text-xs font-normal text-[#687583]">3–32 letters, numbers, hyphens, or underscores.</span>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#445260]">
                Commission rate (%)
                <input name="commissionRate" type="number" required min="0" max="100" step="0.01" defaultValue={editingAffiliate ? (editingAffiliate.commissionRateBps / 100).toFixed(2) : ""} placeholder="Set a rate" className="neo-workspace__profile-input h-11 rounded-xl px-3" disabled={isSubmitting} />
                <span className="text-xs font-normal text-[#687583]">Changes apply to future orders; existing orders keep their saved rate.</span>
              </label>
              <div className="flex items-end">
                <button type="submit" disabled={isSubmitting || (!editingAffiliate && !data.affiliateCandidates.length)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#6d55e8] px-4 text-sm font-black text-white transition hover:bg-[#5b44d3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8] disabled:cursor-not-allowed disabled:opacity-60">
                  <span className="material-symbols-outlined text-[18px]">{isSubmitting ? "progress_activity" : "person_add"}</span>
                  {isSubmitting ? "Saving…" : editingAffiliate ? "Save partner" : "Add affiliate"}
                </button>
              </div>
            </Form>
            {!editingAffiliate && !data.affiliateCandidates.length ? (
              <p className="mt-3 text-sm text-[#687583]">Assign the Affiliate role to an account on the <Link to="?tab=users" className="font-bold text-[#5b44d3] underline underline-offset-2">Users page</Link> first.</p>
            ) : null}
          </div>

          {copyError ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">{copyError}</p> : null}
          <div className="neo-workspace__panel p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#17202a]">Partner activity</h2>
                <p className="mt-1 text-sm text-[#687583]">Potential commission assumes current unpaid orders are paid. Payouts are reviewed and settled outside this page.</p>
              </div>
              <p className="text-sm font-semibold text-[#536779]">{data.affiliates.length} total partners</p>
            </div>
            {data.affiliates.length ? (
              <div className="mt-4 grid gap-3">
                {data.affiliates.map((affiliate) => (
                  <AffiliateRow
                    key={affiliate.id}
                    affiliate={affiliate}
                    isSubmitting={isSubmitting}
                    copied={copiedAffiliateId === affiliate.id}
                    onCopy={() => void copyReferralLink(affiliate)}
                    onEdit={() => setEditingAffiliateId(affiliate.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-[#cbd5dd] px-4 py-10 text-center">
                <p className="font-bold text-[#17202a]">No affiliate partners yet</p>
                <p className="mt-1 text-sm text-[#687583]">Add a user with the Affiliate role to create a trackable referral link.</p>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function AffiliateRow({
  affiliate,
  isSubmitting,
  copied,
  onCopy,
  onEdit,
}: {
  affiliate: MarketingAffiliateView;
  isSubmitting: boolean;
  copied: boolean;
  onCopy: () => void;
  onEdit: () => void;
}) {
  return (
    <article className="grid gap-4 rounded-xl border border-[#e1e7ec] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-black text-[#17202a]">{affiliate.name}</h3>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${affiliate.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{affiliate.active ? "Active" : "Paused"}</span>
          </div>
          <p className="mt-1 break-all text-sm text-[#687583]">{affiliate.email} · <span className="font-bold text-[#445260]">{affiliate.code}</span> · {(affiliate.commissionRateBps / 100).toFixed(2)}% commission</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} disabled={isSubmitting} className="min-h-11 rounded-lg border border-[#dce3e9] px-3 text-sm font-bold text-[#445260] transition hover:bg-[#f4f7f9] disabled:opacity-50">Edit</button>
          <Form method="post">
            <input type="hidden" name="intent" value="set-marketing-affiliate-active" />
            <input type="hidden" name="affiliateId" value={affiliate.id} />
            <input type="hidden" name="active" value={String(!affiliate.active)} />
            <button type="submit" disabled={isSubmitting} className="min-h-11 rounded-lg border border-[#dce3e9] px-3 text-sm font-bold text-[#445260] transition hover:bg-[#f4f7f9] disabled:opacity-50">{affiliate.active ? "Pause" : "Activate"}</button>
          </Form>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SmallMetric label="Attributed orders" value={affiliate.referralCount} />
        <SmallMetric label="Paid orders" value={affiliate.paidReferralCount} />
        <SmallMetric label="Commission earned" value={formatMoney(affiliate.commissionEarnedCents)} />
        <SmallMetric label="Potential commission" value={formatMoney(affiliate.pendingCommissionCents)} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`affiliate-link-${affiliate.id}`}>Referral link for {affiliate.name}</label>
        <input id={`affiliate-link-${affiliate.id}`} type="url" readOnly value={affiliate.referralUrl} onFocus={(event) => event.currentTarget.select()} className="neo-workspace__profile-input min-h-11 min-w-0 flex-1 rounded-lg px-3 text-xs text-[#536779]" />
        <button type="button" onClick={onCopy} disabled={isSubmitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#dce3e9] px-3 text-sm font-bold text-[#445260] transition hover:bg-[#f4f7f9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8] disabled:opacity-50">
          <span className="material-symbols-outlined text-[18px]">{copied ? "check" : "content_copy"}</span>{copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </article>
  );
}

function SummaryValue({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="neo-workspace__panel flex min-h-20 flex-col justify-center gap-1 px-3 py-3 sm:px-4">
      <span className="text-xs font-semibold leading-tight text-[#536779]">{label}</span>
      <span className="break-words text-base font-black text-[#17202a] sm:text-lg">{value}</span>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-[#f4f7f9] px-3 py-2.5">
      <p className="text-xs font-semibold text-[#687583]">{label}</p>
      <p className="mt-1 font-black text-[#17202a]">{value}</p>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
