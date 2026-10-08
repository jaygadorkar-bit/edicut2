import { useState } from "react";
import { Form } from "react-router";
import type { AdminMarketingData, MarketingCouponView } from "../../lib/marketing.server";

type MarketingActionData = { error?: string; success?: string } | undefined;

export function MarketingPanel({
  data,
  actionData,
  isSubmitting,
}: {
  data: AdminMarketingData;
  actionData: MarketingActionData;
  isSubmitting: boolean;
}) {
  const [editingCouponId, setEditingCouponId] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const editingCoupon = data.coupons.find((coupon) => coupon.id === editingCouponId);

  return (
    <section className="grid min-w-0 grid-cols-1 gap-5 [&_label]:min-w-0 [&_input]:min-w-0 [&_select]:min-w-0" aria-labelledby="marketing-title">
      <header className="neo-workspace__panel p-5 sm:p-6">
        <p className="neo-workspace__eyebrow">Growth tools</p>
        <h1 id="marketing-title" className="neo-workspace__module-title mt-1">Discounts</h1>
        <p className="neo-workspace__module-copy mt-2 max-w-2xl">
          Create discount codes for eligible package purchases. Payment is recorded manually by staff.
        </p>
      </header>

      {actionData?.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{actionData.error}</p> : null}
      {actionData?.success ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{actionData.success}</p> : null}
      {!data.schemaReady ? (
        <div role="alert" className="neo-workspace__panel border-amber-300 bg-amber-50 p-5 text-sm font-semibold text-amber-950">
          <h2 className="text-base font-black">Discount database setup is needed</h2>
          <p className="mt-2">Apply the marketing database migration before creating discount codes.</p>
        </div>
      ) : (
        <div className="grid gap-5">
          <div className="neo-workspace__panel p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#17202a]">{editingCoupon ? "Edit coupon" : "Create a coupon"}</h2>
                <p className="mt-1 text-sm text-[#687583]">Set the discount, eligible package minimum, and redemption window.</p>
              </div>
              {editingCoupon ? <button type="button" onClick={() => { setEditingCouponId(""); setDiscountType("percent"); }} className="min-h-11 rounded-xl px-3 text-sm font-bold text-[#536779] underline underline-offset-4">Cancel edit</button> : null}
            </div>
            <Form key={editingCoupon?.id ?? "new-coupon"} method="post" className="mt-5 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <input type="hidden" name="intent" value={editingCoupon ? "update-marketing-coupon" : "create-marketing-coupon"} />
              {editingCoupon ? <input type="hidden" name="couponId" value={editingCoupon.id} /> : null}
              <label className="grid gap-1.5 text-sm font-semibold text-[#445260]">
                Coupon code
                <input name="code" required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" defaultValue={editingCoupon?.code ?? ""} placeholder="WELCOME10" autoComplete="off" className="neo-workspace__profile-input h-11 rounded-xl px-3 font-bold uppercase" disabled={isSubmitting} />
                <span className="text-xs font-normal text-[#687583]">3–32 letters, numbers, hyphens, or underscores.</span>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#445260]">
                Discount type
                <select name="discountType" value={discountType} onChange={(event) => setDiscountType(event.currentTarget.value as "percent" | "fixed")} className="neo-workspace__profile-input h-11 rounded-xl px-3" disabled={isSubmitting}>
                  <option value="percent">Percentage</option>
                  <option value="fixed">Fixed amount (USD)</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#445260]">
                Discount value
                <input key={discountType} name="discountValue" type="number" required min={discountType === "fixed" ? "0.01" : "1"} max={discountType === "fixed" ? "9999999.99" : "100"} step={discountType === "fixed" ? "0.01" : "1"} defaultValue={editingCoupon?.discountType === discountType ? (discountType === "fixed" ? (editingCoupon.discountValue / 100).toFixed(2) : editingCoupon.discountValue) : ""} placeholder={discountType === "fixed" ? "10.00" : "10"} className="neo-workspace__profile-input h-11 rounded-xl px-3" disabled={isSubmitting} />
                <span className="text-xs font-normal text-[#687583]">For fixed discounts, enter dollars.</span>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#445260]">
                Maximum uses
                <input name="maxRedemptions" type="number" min="1" max="1000000" step="1" defaultValue={editingCoupon?.maxRedemptions ?? ""} placeholder="No limit" className="neo-workspace__profile-input h-11 rounded-xl px-3" disabled={isSubmitting} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#445260]">
                Starts on
                <input name="startsOn" type="date" defaultValue={toDateInput(editingCoupon?.startsAt)} className="neo-workspace__profile-input h-11 rounded-xl px-3" disabled={isSubmitting} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#445260]">
                Expires on
                <input name="expiresOn" type="date" defaultValue={toDateInput(editingCoupon?.expiresAt)} className="neo-workspace__profile-input h-11 rounded-xl px-3" disabled={isSubmitting} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#445260]">
                Minimum package price (USD)
                <input name="minimumSubtotal" type="number" min="0.01" max="9999999.99" step="0.01" defaultValue={editingCoupon?.minimumSubtotalCents == null ? "" : (editingCoupon.minimumSubtotalCents / 100).toFixed(2)} placeholder="No minimum" className="neo-workspace__profile-input h-11 rounded-xl px-3" disabled={isSubmitting} />
              </label>
              <div className="flex items-end">
                <button type="submit" disabled={isSubmitting} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#6d55e8] px-4 text-sm font-black text-white transition hover:bg-[#5b44d3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8] disabled:cursor-wait disabled:opacity-60">
                  <span className="material-symbols-outlined text-[18px]">{isSubmitting ? "progress_activity" : "sell"}</span>
                  {isSubmitting ? "Saving…" : editingCoupon ? "Save coupon" : "Create coupon"}
                </button>
              </div>
            </Form>
          </div>

          <div className="neo-workspace__panel p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#17202a]">Coupon codes</h2>
                <p className="mt-1 text-sm text-[#687583]">Pause a code at any time. Confirmed redemptions keep their saved discount.</p>
              </div>
              <p className="text-sm font-semibold text-[#536779]">{data.coupons.filter((coupon) => coupon.active).length} active · {data.coupons.length} total</p>
            </div>
            {data.coupons.length ? (
              <div className="mt-4 grid gap-3">
                {data.coupons.map((coupon) => <CouponRow key={coupon.id} coupon={coupon} isSubmitting={isSubmitting} onEdit={() => { setEditingCouponId(coupon.id); setDiscountType(coupon.discountType); }} />)}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-[#cbd5dd] px-4 py-10 text-center">
                <p className="font-bold text-[#17202a]">No coupon codes yet</p>
                <p className="mt-1 text-sm text-[#687583]">Create one above, then customers can apply it to an eligible package purchase.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CouponRow({ coupon, isSubmitting, onEdit }: { coupon: MarketingCouponView; isSubmitting: boolean; onEdit: () => void }) {
  const now = Date.now();
  const expired = coupon.expiresAt ? new Date(coupon.expiresAt).valueOf() < now : false;
  const scheduled = coupon.startsAt ? new Date(coupon.startsAt).valueOf() > now : false;
  const exhausted = coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions;
  const status = !coupon.active ? "Paused" : expired ? "Expired" : exhausted ? "Limit reached" : scheduled ? "Scheduled" : "Active";
  const statusClass = status === "Active" ? "bg-emerald-50 text-emerald-800" : status === "Paused" ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-900";
  const discount = coupon.discountType === "percent" ? `${coupon.discountValue}% off` : `${formatMoney(coupon.discountValue)} off`;

  return (
    <article className="grid gap-4 rounded-xl border border-[#e1e7ec] bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)] sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-[#eef2f6] px-2.5 py-1.5 text-sm font-black tracking-wide text-[#17202a]">{coupon.code}</code>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass}`}>{status}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-[#445260]">{discount}{coupon.minimumSubtotalCents ? ` · $${(coupon.minimumSubtotalCents / 100).toFixed(2)} minimum` : ""}</p>
          <p className="mt-1 text-xs text-[#687583]">
            {coupon.startsAt ? `Starts ${formatDate(coupon.startsAt)}` : "Available now"}
            {coupon.expiresAt ? ` · Expires ${formatDate(coupon.expiresAt)}` : " · No expiry"}
          </p>
        </div>
        <p className="text-sm font-semibold text-[#536779]">{coupon.redemptionCount} used{coupon.maxRedemptions == null ? "" : ` of ${coupon.maxRedemptions}`}</p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <button type="button" onClick={onEdit} disabled={isSubmitting} className="min-h-11 rounded-lg border border-[#dce3e9] px-3 text-sm font-bold text-[#445260] transition hover:bg-[#f4f7f9] disabled:opacity-50">Edit</button>
        <Form method="post">
          <input type="hidden" name="intent" value="set-marketing-coupon-active" />
          <input type="hidden" name="couponId" value={coupon.id} />
          <input type="hidden" name="active" value={String(!coupon.active)} />
          <button type="submit" disabled={isSubmitting} className="min-h-11 rounded-lg border border-[#dce3e9] px-3 text-sm font-bold text-[#445260] transition hover:bg-[#f4f7f9] disabled:opacity-50">{coupon.active ? "Pause" : "Activate"}</button>
        </Form>
      </div>
    </article>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function toDateInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}
