import { useMemo, useState } from "react";
import { Form } from "react-router";
import { Select } from "./Select";
import type { PartnerAffiliateProgramView } from "../lib/affiliate-program";
import "../styles/affiliate.css";

type Props = {
  program: PartnerAffiliateProgramView & {
    couponCode?: string | null;
    discountRateBps?: number | null;
  };
  isSubmitting: boolean;
};

const landingPages = [
  { path: "/", label: "Home" },
  { path: "/services/youtube-video-editing", label: "YouTube video editing" },
  { path: "/pricing", label: "Pricing" },
  { path: "/portfolio", label: "Portfolio" },
];

const money = (cents: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
const readable = (value: string) => value.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const csvCell = (value: string | number) => {
  let text = String(value);
  if (/^[\s\u0000-\u001f]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function AffiliateWorkspace({ program, isSubmitting }: Props) {
  const [landingPath, setLandingPath] = useState("/");
  const [campaign, setCampaign] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [couponCopied, setCouponCopied] = useState(false);
  const [couponCopyError, setCouponCopyError] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const code = program.code;
  const couponCode = program.couponCode?.trim() || null;
  const discountRateBps = typeof program.discountRateBps === "number" && Number.isSafeInteger(program.discountRateBps) && program.discountRateBps >= 0 && program.discountRateBps <= 10000
    ? program.discountRateBps
    : null;
  const referralUrl = useMemo(() => {
    if (!code) return "";
    const url = new URL(landingPath, typeof window === "undefined" ? "https://edicut.com" : window.location.origin);
    url.searchParams.set("ref", code);
    const normalizedCampaign = campaign.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    if (normalizedCampaign) url.searchParams.set("campaign", normalizedCampaign);
    return url.toString();
  }, [campaign, code, landingPath]);
  const filteredOrders = useMemo(() => program.orders.filter((order) => {
    const query = search.trim().toLowerCase();
    const created = new Date(order.createdAt).valueOf();
    const start = from ? new Date(`${from}T00:00:00Z`).valueOf() : -Infinity;
    const end = to ? new Date(`${to}T23:59:59.999Z`).valueOf() : Infinity;
    return (!query || `${order.label} ${order.kind} ${order.status} ${order.payoutStatus}`.toLowerCase().includes(query))
      && (status === "all" || order.payoutStatus === status)
      && created >= start && created <= end;
  }), [from, program.orders, search, status, to]);

  async function copy(value: string) {
    setCopied(false); setCopyError(false);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const input = document.createElement("textarea"); input.value = value; input.setAttribute("readonly", "");
        input.style.position = "fixed"; input.style.opacity = "0"; document.body.appendChild(input); input.select();
        const ok = document.execCommand("copy"); input.remove(); if (!ok) throw new Error("Copy unavailable");
      }
      setCopied(true);
    } catch { setCopyError(true); }
  }

  function exportCsv() {
    const columns = ["Order", "Type", "Date", "Order status", "Payout status", "Order total", "Commission"];
    const records = filteredOrders.map((order) => [order.label, order.kind, order.createdAt, order.status, order.payoutStatus, money(order.amountCents, order.currency), money(order.commissionCents, order.currency)]);
    const csv = [columns, ...records].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = "edicut-affiliate-orders.csv"; anchor.click(); URL.revokeObjectURL(href);
  }

  const eligible = program.active && program.settings.payoutsEnabled && program.schemaReady && program.balance.availableCents >= program.settings.minimumPayoutCents && program.balance.clawbackCents === 0;
  const application = program.application;
  const payoutUnavailable = !program.schemaReady || !program.settings.payoutsEnabled;

  if (!program.schemaReady) return <section className="neo-workspace__panel affiliate-card" role="status"><p className="neo-workspace__eyebrow">Affiliate program</p><h2 className="neo-workspace__module-title">Temporarily unavailable</h2><p className="neo-workspace__module-copy">Partner reporting and applications are unavailable until the required database migrations are applied.</p></section>;

  return <section className="affiliate-workspace" aria-labelledby="affiliate-title">
    <header className="affiliate-hero affiliate-card">
      <div><p className="neo-workspace__eyebrow">EdiCut partner program</p><h2 id="affiliate-title" className="neo-workspace__module-title">Your affiliate workspace</h2><p className="neo-workspace__module-copy">Track referrals, build campaign links, and manage your commission payouts.</p></div>
      {code ? <span className={`affiliate-badge ${program.active ? "is-active" : "is-paused"}`}>{program.active ? "Partner active" : "Code paused"}</span> : null}
    </header>
    {!code ? <section className="affiliate-card" aria-labelledby="affiliate-application-title">
      <p className="neo-workspace__eyebrow">Apply to join</p><h2 id="affiliate-application-title" className="neo-workspace__module-title">Tell us how you’ll share EdiCut</h2>
      {application ? <div className="affiliate-application-state"><p><strong>Application {readable(application.status)}</strong> · submitted {date(application.createdAt)}</p>{application.reviewNote ? <p>{application.reviewNote}</p> : null}
        {application.status === "pending" ? <p>We’re reviewing your application. You’ll be able to apply again if the team needs more information.</p> : null}
        {application.status === "approved" ? <p>Your application is approved. Your partner profile is being prepared.</p> : null}
      </div> : null}
      {(!application || application.status === "rejected") && program.settings.applicationsOpen ? <Form method="post" className="affiliate-form">
        <input type="hidden" name="intent" value="affiliate-apply" />
        <label>WhatsApp phone number<input name="whatsappPhone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={28} pattern="\+[1-9][0-9 .()\-]{6,22}" placeholder="+44 20 7946 0123" aria-describedby="affiliate-workspace-whatsapp-help" disabled={isSubmitting} /><span id="affiliate-workspace-whatsapp-help">Include your country code, for example +44.</span></label>
        <label>Social media profile links <span>(optional)</span><textarea name="socialMedia" rows={3} maxLength={2000} placeholder={"https://youtube.com/@yourchannel\nhttps://instagram.com/yourname"} aria-describedby="affiliate-workspace-social-help" disabled={isSubmitting} /><span id="affiliate-workspace-social-help">Up to five public HTTPS links, one per line.</span></label>
        <label>Promotion plan<textarea name="promotionPlan" rows={3} required maxLength={2000} placeholder="How would you introduce EdiCut to your audience?" disabled={isSubmitting} /></label>
        <button className="affiliate-button is-primary" disabled={isSubmitting}>{isSubmitting ? "Submitting…" : "Submit application"}</button>
      </Form> : !application && !program.settings.applicationsOpen ? <p className="affiliate-note">Applications are currently closed. Please check back later.</p> : null}
    </section> : <>
      <section className="affiliate-balance-grid" aria-label="Commission balances">
        <Balance label="Available to request" value={program.balance.availableCents} tone="primary" />
        <Balance label="On hold" value={program.balance.pendingCents} help={`${program.settings.holdDays} day hold`} />
        <Balance label="In payout review" value={program.balance.reservedCents} />
        <Balance label="Paid out" value={program.balance.paidCents} />
        <Balance label="Unpaid estimates" value={program.balance.estimatedCents} help="From orders that are not paid yet" />
      </section>
      <p className="affiliate-note">Unpaid commission is an estimate and is not included in the payout balance. Legacy project referrals without a payment timestamp use the project’s last update to start the hold period.</p>
      <section className="affiliate-card" aria-labelledby="affiliate-link-title">
        <div className="affiliate-section-heading"><div><p className="neo-workspace__eyebrow">Share your referral</p><h2 id="affiliate-link-title" className="neo-workspace__module-title">Link builder</h2></div><span className="affiliate-code">Code <strong>{code}</strong></span></div>
        <div className="affiliate-form affiliate-link-controls">
          <label>Landing page<Select className="affiliate-select" value={landingPath} onChange={(event) => setLandingPath(event.currentTarget.value)}>{landingPages.map((page) => <option key={page.path} value={page.path}>{page.label}</option>)}</Select></label>
          <label>Campaign name <input value={campaign} onChange={(event) => setCampaign(event.target.value)} maxLength={48} placeholder="e.g. spring-launch" /></label>
        </div>
        <div className="affiliate-copy-row"><label className="affiliate-url-label">Your link<input aria-label="Generated referral URL" readOnly value={referralUrl} onFocus={(event) => event.currentTarget.select()} /></label><button type="button" className="affiliate-button is-primary" onClick={() => void copy(referralUrl)} disabled={!program.active}>Copy link</button></div>
        <p className="affiliate-note" aria-live="polite">{copied ? "Referral link copied." : copyError ? "Copy failed. Select the URL above and copy it." : `${(program.commissionRateBps ?? 0) / 100}% commission · ${program.settings.attributionDays}-day attribution window`}</p>
        <div className="affiliate-coupon" aria-labelledby="affiliate-coupon-title">
          <div className="affiliate-coupon__details">
            <p className="neo-workspace__eyebrow">Customer offer</p>
            <h3 id="affiliate-coupon-title">Your coupon code</h3>
            {couponCode ? <><strong className="affiliate-coupon__code">{couponCode}</strong><p>{discountRateBps === null ? "The customer discount is being finalized by EdiCut." : `Customers save ${(discountRateBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}% when they use this code.`}</p></> : <p>EdiCut will assign your customer coupon code before your promotion starts.</p>}
          </div>
          {couponCode ? <button type="button" className="affiliate-button is-secondary" onClick={() => void copyCoupon(couponCode, setCouponCopied, setCouponCopyError)}>Copy code</button> : null}
          {couponCode ? <p className="affiliate-coupon__status" role="status" aria-live="polite">{couponCopied ? "Coupon code copied." : couponCopyError ? "Copy failed. Select the code and copy it." : ""}</p> : null}
        </div>
        {!program.active ? <p className="affiliate-feedback is-warning">Your code is paused, so new referrals cannot be attributed right now.</p> : null}
        <div className="affiliate-disclosure"><strong>Disclosure template</strong><p>“This post contains my EdiCut referral link. I may earn a commission if you purchase through it, at no extra cost to you.”</p><button type="button" className="affiliate-button is-secondary" onClick={() => void copy("This post contains my EdiCut referral link. I may earn a commission if you purchase through it, at no extra cost to you.")}>Copy disclosure</button></div>
      </section>

      <section className="affiliate-card" aria-labelledby="affiliate-orders-title">
        <div className="affiliate-section-heading"><div><p className="neo-workspace__eyebrow">Attributed activity</p><h2 id="affiliate-orders-title" className="neo-workspace__module-title">Recent referred orders</h2></div><button type="button" className="affiliate-button is-secondary" onClick={exportCsv} disabled={!filteredOrders.length}>Export CSV</button></div>
        <p className="affiliate-note">Showing up to the 100 most recent referred orders loaded for this report. CSV exports only the currently loaded orders that match your filters. Balance totals above are all-time totals; unpaid estimates are separate from held commissions.</p>
        <div className="affiliate-filter-row"><label>Search orders<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, type, status" /></label><label>Status<Select className="affiliate-select" value={status} onChange={(event) => setStatus(event.currentTarget.value)}><option value="all">All statuses</option><option value="available">Available</option><option value="pending">On hold</option><option value="reserved">In payout review</option><option value="paid">Paid</option><option value="reversed">Reversed</option></Select></label><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>
        {filteredOrders.length ? <div className="affiliate-table-wrap"><table><caption className="sr-only">Recent referred orders and commission status</caption><thead><tr><th scope="col">Order</th><th scope="col">Order date</th><th scope="col">Paid date</th><th scope="col">Payout</th><th scope="col">Commission</th></tr></thead><tbody>{filteredOrders.map((order) => <tr key={`${order.kind}-${order.id}`}><th scope="row">{order.label}<small>{readable(order.kind)} · {readable(order.status)}</small></th><td>{date(order.createdAt)}</td><td>{order.paidAt ? date(order.paidAt) : "Not paid"}</td><td>{readable(order.payoutStatus)}</td><td>{money(order.commissionCents, order.currency)}</td></tr>)}</tbody></table></div> : <p className="affiliate-empty">No referred orders match these filters.</p>}
      </section>

      <div className="affiliate-two-col">
        <section className="affiliate-card" aria-labelledby="affiliate-payout-title"><p className="neo-workspace__eyebrow">Withdraw earnings</p><h2 id="affiliate-payout-title" className="neo-workspace__module-title">Request a payout</h2><p className="affiliate-note">Minimum request: {money(program.settings.minimumPayoutCents)}. Available balance: {money(program.balance.availableCents)}.</p>
          {program.balance.clawbackCents > 0 ? <p className="affiliate-feedback is-warning" role="status">An unresolved reversal of {money(program.balance.clawbackCents)} is under review. Payout requests are paused until the balance is reconciled; contact EdiCut support for help.</p> : null}
          {payoutUnavailable ? <p className="affiliate-feedback is-warning">Payout requests are unavailable until required migrations are applied and payouts are enabled.</p> : null}
          <Form method="post" className="affiliate-form"><input type="hidden" name="intent" value="affiliate-request-payout" /><label>Payment method<Select className="affiliate-select" name="method" defaultValue="paypal"><option value="paypal">PayPal</option><option value="manual">Manual arrangement</option></Select></label><label>Payment destination<input name="destination" required maxLength={254} placeholder="PayPal email or agreed destination" disabled={isSubmitting} /></label><p className="affiliate-note">The request uses your full available balance. The team will review and confirm the payout.</p><button className="affiliate-button is-primary" disabled={!eligible || isSubmitting}>{isSubmitting ? "Submitting…" : "Request payout"}</button></Form>
          {program.active && program.settings.payoutsEnabled && program.balance.availableCents < program.settings.minimumPayoutCents ? <p className="affiliate-note">Your available balance has not reached the program minimum yet.</p> : null}
        </section>
        <section className="affiliate-card" aria-labelledby="affiliate-payout-history-title"><p className="neo-workspace__eyebrow">Payout tracking</p><h2 id="affiliate-payout-history-title" className="neo-workspace__module-title">Payout history</h2>
          {program.payouts.length ? <ul className="affiliate-payout-list">{program.payouts.map((payout) => <li key={payout.id}><div><strong>{money(payout.amountCents)}</strong><span>{readable(payout.method)} · {readable(payout.status)} · requested {date(payout.createdAt)}</span>{payout.paidAt ? <small>Paid {date(payout.paidAt)}</small> : null}{payout.reviewedAt ? <small>Reviewed {date(payout.reviewedAt)}</small> : null}{payout.reference ? <small>Reference: {payout.reference}</small> : null}{payout.note ? <small>{payout.note}</small> : null}</div>{payout.status === "requested" ? <Form method="post"><input type="hidden" name="intent" value="affiliate-cancel-payout" /><input type="hidden" name="payoutId" value={payout.id} /><button className="affiliate-button is-secondary" disabled={isSubmitting}>Cancel request</button></Form> : null}</li>)}</ul> : <p className="affiliate-empty">No payout requests yet.</p>}
        </section>
      </div>
      <div className="affiliate-two-col">
        <section className="affiliate-card" aria-labelledby="affiliate-campaign-title"><p className="neo-workspace__eyebrow">Campaign reporting</p><h2 id="affiliate-campaign-title" className="neo-workspace__module-title">Campaign performance</h2><p className="affiliate-note">Visits are consented page visits, not unique people.</p>{program.campaigns.length ? <ul className="affiliate-campaign-list">{program.campaigns.map((item) => <li key={item.campaign ?? "uncategorized"}><span>{item.campaign ?? "Uncategorized"}</span><strong>{item.visits.toLocaleString("en-US")} visits</strong></li>)}</ul> : <p className="affiliate-empty">Campaign visits appear when consented visitors follow your referral links.</p>}</section>
        <section className="affiliate-card" aria-labelledby="affiliate-resources-title"><p className="neo-workspace__eyebrow">Helpful links</p><h2 id="affiliate-resources-title" className="neo-workspace__module-title">Creator resources</h2><ul className="affiliate-resource-list"><li><a href="/services/youtube-video-editing">YouTube video editing service</a><span>Explore the service you can recommend.</span></li><li><a href="/pricing">Pricing and packages</a><span>Help your audience compare plans.</span></li><li><a href="/portfolio">Editing portfolio</a><span>Show examples of EdiCut’s work.</span></li><li><a href="/blog">Creator tips and blog</a><span>Share useful guidance with your audience.</span></li></ul></section>
      </div>
    </>}
  </section>;
}

async function copyCoupon(value: string, onSuccess: (value: boolean) => void, onError: (value: boolean) => void) {
  onSuccess(false);
  onError(false);
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const input = document.createElement("textarea"); input.value = value; input.setAttribute("readonly", "");
      input.style.position = "fixed"; input.style.opacity = "0"; document.body.appendChild(input); input.select();
      const ok = document.execCommand("copy"); input.remove(); if (!ok) throw new Error("Copy unavailable");
    }
    onSuccess(true);
  } catch { onError(true); }
}

function Balance({ label, value, help, tone }: { label: string; value: number; help?: string; tone?: "primary" }) {
  return <article className={`affiliate-balance-card ${tone === "primary" ? "is-primary" : ""}`}><p>{label}</p><strong>{money(value)}</strong>{help ? <small>{help}</small> : null}</article>;
}
