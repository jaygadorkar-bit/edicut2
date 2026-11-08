import { useMemo, useState } from "react";
import { Form } from "react-router";
import { Select } from "../Select";
import type { AdminAffiliateProgramView } from "../../lib/affiliate-program";
import "../../styles/affiliate-admin.css";

type ActionData = { error?: string; success?: string } | undefined;
type QueueTab = "applications" | "payouts" | "settings";
type QueueFilter = "all" | "pending" | "approved" | "rejected" | "paid" | "cancelled";

export function AffiliateProgramAdmin({
  program,
  actionData,
  isSubmitting,
}: {
  program: AdminAffiliateProgramView;
  actionData: ActionData;
  isSubmitting: boolean;
}) {
  const [tab, setTab] = useState<QueueTab>("applications");
  const [filter, setFilter] = useState<QueueFilter>("pending");
  const [query, setQuery] = useState("");
  const [revealedPayouts, setRevealedPayouts] = useState<string[]>([]);

  const applications = useMemo(() => program.applications.filter((item) => {
    const matchesStatus = filter === "all" || (filter === "pending" ? item.status === "pending" : item.status === filter);
    const haystack = `${item.name} ${item.email} ${item.channelUrl ?? ""} ${item.audience ?? ""} ${item.whatsappPhone ?? ""} ${item.socialMedia ?? ""} ${item.promotionPlan}`.toLowerCase();
    return matchesStatus && haystack.includes(query.trim().toLowerCase());
  }), [program.applications, filter, query]);

  const payouts = useMemo(() => program.payouts.filter((item) => {
    const matchesStatus = filter === "all" || (filter === "pending" ? ["requested", "approved"].includes(item.status) : item.status === filter);
    const haystack = `${item.name} ${item.email} ${item.method} ${item.destination} ${item.note ?? ""}`.toLowerCase();
    return matchesStatus && haystack.includes(query.trim().toLowerCase());
  }), [program.payouts, filter, query]);

  const pendingApplications = program.applications.filter((item) => item.status === "pending").length;
  const openPayouts = program.payouts.filter((item) => ["requested", "approved"].includes(item.status)).length;

  return (
    <section className="affiliate-program-admin grid min-w-0 gap-5" aria-labelledby="affiliate-program-title">
      <header className="neo-workspace__panel grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="neo-workspace__eyebrow">Partner operations</p>
          <h2 id="affiliate-program-title" className="neo-workspace__module-title mt-1">Affiliate program</h2>
          <p className="neo-workspace__module-copy mt-2 max-w-3xl">Review partner applications, manage payout requests, and set the program-wide attribution and payout rules.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-64">
          <Metric label="Awaiting review" value={pendingApplications} />
          <Metric label="Open payouts" value={openPayouts} />
        </div>
      </header>

      {actionData?.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{actionData.error}</p> : null}
      {actionData?.success ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{actionData.success}</p> : null}

      {!program.schemaReady ? (
        <div className="affiliate-program-admin__notice" role="alert">
          <h2 className="font-bold">Affiliate program database setup is needed</h2>
          <p className="mt-1 text-sm">Apply the tracked application database migrations in order through <code className="rounded bg-amber-100 px-1.5 py-0.5">packages/db/drizzle/0031_affiliate_application_contact_details.sql</code> before reviewing applications, creating affiliate coupons, or saving program settings.</p>
        </div>
      ) : (
        <>
          <div className="neo-workspace__panel grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:p-4">
            <div className="affiliate-program-admin__tablist flex flex-wrap gap-2" role="tablist" aria-label="Affiliate program sections" onKeyDown={(event) => {
              if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
              const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]"));
              const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
              if (current < 0) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
              tabs[next]?.focus();
            }}>
              <TabButton selected={tab === "applications"} onClick={() => { setTab("applications"); setFilter("pending"); setQuery(""); }} id="affiliate-applications-tab" controls="affiliate-applications-panel">Applications <Count>{pendingApplications}</Count></TabButton>
              <TabButton selected={tab === "payouts"} onClick={() => { setTab("payouts"); setFilter("pending"); setQuery(""); }} id="affiliate-payouts-tab" controls="affiliate-payouts-panel">Payouts <Count>{openPayouts}</Count></TabButton>
              <TabButton selected={tab === "settings"} onClick={() => setTab("settings")} id="affiliate-settings-tab" controls="affiliate-settings-panel">Program settings</TabButton>
            </div>
            {tab !== "settings" ? (
              <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto]">
                <label className="sr-only" htmlFor="affiliate-queue-search">Search {tab}</label>
                <input id="affiliate-queue-search" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={tab === "applications" ? "Search name, WhatsApp, social, plan" : "Search names or payout details"} />
                <label className="sr-only" htmlFor="affiliate-queue-filter">Filter by status</label>
                <Select id="affiliate-queue-filter" className="affiliate-admin-select" value={filter} onChange={(event) => setFilter(event.currentTarget.value as QueueFilter)}>
                  <option value="pending">Needs attention</option><option value="all">All statuses</option>
                  {tab === "applications" ? <><option value="approved">Approved</option><option value="rejected">Rejected</option></> : <><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></>}
                </Select>
              </div>
            ) : null}
          </div>

          {tab === "applications" ? (
            <section id="affiliate-applications-panel" role="tabpanel" aria-labelledby="affiliate-applications-tab" className="grid gap-3">
              <QueueHeading title="Application review" description="Review the applicant’s contact details and promotion plan before approving access." count={applications.length} />
              {applications.length ? applications.map((application) => (
                <article key={application.id} className="affiliate-program-admin__item grid gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-bold">{application.name}</h3>
                      <p className="mt-1 break-all text-sm text-[#687583]">{application.email}</p>
                    </div>
                    <Status value={application.status} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {application.whatsappPhone ? <Detail label="WhatsApp" value={application.whatsappPhone} href={`https://wa.me/${application.whatsappPhone.replace(/\D/g, "")}`} /> : null}
                    {application.socialMedia ? <SocialMediaDetails value={application.socialMedia} /> : null}
                    {application.channelUrl ? <Detail label="Previous channel" value={application.channelUrl} href={safeExternalUrl(application.channelUrl)} /> : null}
                    {application.audience ? <Detail label="Previous audience notes" value={application.audience} /> : null}
                    <Detail label="Promotion plan" value={application.promotionPlan} className="sm:col-span-2" />
                    <Detail label="Applied" value={formatDate(application.createdAt)} />
                    {application.reviewNote ? <Detail label="Review note" value={application.reviewNote} /> : null}
                  </div>
                  {application.status === "pending" ? (
                    <Form method="post" className="grid gap-3 border-t border-[#e8edf1] pt-4">
                      <input type="hidden" name="intent" value="affiliate-review-application" />
                      <input type="hidden" name="applicationId" value={application.id} />
                      <p className="text-sm text-[#536779]">Approval activates an affiliate profile while keeping the applicant’s existing account access.</p>
                      <p className="text-xs text-[#687583]">New partners start at 10% commission and a 10% customer discount. Set individual terms below before approval.</p>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
                        <label className="affiliate-program-admin__field-label">Referral code<input name="code" autoComplete="off" maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" defaultValue={suggestAffiliateCode(application.name)} placeholder="For example, JAYGA" disabled={isSubmitting} /></label>
                        <label className="affiliate-program-admin__field-label">Commission rate (%)<input name="commissionRate" type="number" min="0" max="100" step="0.01" defaultValue="10" disabled={isSubmitting} /></label>
                        <label className="affiliate-program-admin__field-label">Customer coupon code<input name="couponCode" autoComplete="off" maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" defaultValue={suggestAffiliateCode(application.name)} placeholder="For example, JAYGA" disabled={isSubmitting} /></label>
                        <label className="affiliate-program-admin__field-label">Customer discount (%)<input name="discountRate" type="number" min="1" max="100" step="1" defaultValue="10" disabled={isSubmitting} /></label>
                        <label className="affiliate-program-admin__field-label sm:col-span-2">Review note<input name="reviewNote" maxLength={1000} placeholder="Optional note for the applicant" disabled={isSubmitting} /></label>
                        <div className="flex flex-wrap gap-2 sm:col-span-2 sm:justify-end">
                          <button className="affiliate-program-admin__action affiliate-program-admin__action--primary" type="submit" name="decision" value="approved" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Approve"}</button>
                          <button className="affiliate-program-admin__action affiliate-program-admin__action--danger" type="submit" name="decision" value="rejected" formNoValidate disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Reject"}</button>
                        </div>
                      </div>
                    </Form>
                  ) : null}
                </article>
              )) : <EmptyState title="No applications match" copy={query || filter !== "pending" ? "Try a different search or status filter." : "New partner applications will appear here."} />}
            </section>
          ) : null}

          {tab === "payouts" ? (
            <section id="affiliate-payouts-panel" role="tabpanel" aria-labelledby="affiliate-payouts-tab" className="grid gap-3">
              <QueueHeading title="Payout requests" description="Approve or reject requests, then record externally completed payments with a reference." count={payouts.length} />
              {payouts.length ? payouts.map((payout) => {
                const revealed = revealedPayouts.includes(payout.id);
                return (
                  <article key={payout.id} className="affiliate-program-admin__item grid gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-base font-bold">{payout.name}</h3>
                        <p className="mt-1 break-all text-sm text-[#687583]">{payout.email} · {payout.method === "paypal" ? "PayPal" : "Manual payout"}</p>
                      </div>
                      <div className="flex items-center gap-3"><strong className="text-lg">{formatMoney(payout.amountCents)}</strong><Status value={payout.status} /></div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wide text-[#687583]">Destination</span>
                        <div className="mt-1 flex min-w-0 items-center gap-2">
                          <span className="min-w-0 break-all text-sm">{revealed ? payout.destination : maskDestination(payout.destination)}</span>
                          <button className="affiliate-program-admin__action affiliate-program-admin__action--quiet shrink-0 px-3 py-1 text-xs" type="button" aria-pressed={revealed} onClick={() => setRevealedPayouts((current) => revealed ? current.filter((id) => id !== payout.id) : [...current, payout.id])}>{revealed ? "Hide" : "Reveal"}</button>
                        </div>
                      </div>
                      <Detail label="Requested" value={formatDate(payout.createdAt)} />
                      {payout.reference ? <Detail label="External reference" value={payout.reference} /> : null}
                      {payout.note ? <Detail label="Payout note" value={payout.note} /> : null}
                    </div>
                    {payout.status === "requested" || payout.status === "approved" ? (
                      <div className="grid gap-4 border-t border-[#e8edf1] pt-4 lg:grid-cols-2">
                        {payout.status === "requested" ? (
                          <Form method="post" className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="intent" value="affiliate-review-payout" /><input type="hidden" name="payoutId" value={payout.id} />
                            <label className="affiliate-program-admin__field-label min-w-48 flex-1">Internal note<input name="note" maxLength={1000} placeholder="Optional review note" disabled={isSubmitting} /></label>
                            <button className="affiliate-program-admin__action affiliate-program-admin__action--primary" type="submit" name="decision" value="approved" disabled={isSubmitting}>Approve request</button>
                            <button className="affiliate-program-admin__action affiliate-program-admin__action--danger" type="submit" name="decision" value="rejected" disabled={isSubmitting}>Reject</button>
                          </Form>
                        ) : <p className="self-center text-sm text-[#536779]">Approved and ready for external payment.</p>}
                        <Form method="post" className="grid gap-3 rounded-xl bg-[#f6f8fa] p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                          <input type="hidden" name="intent" value="affiliate-review-payout" /><input type="hidden" name="payoutId" value={payout.id} />
                          <label className="affiliate-program-admin__field-label">External payment reference<input name="reference" required maxLength={160} placeholder="Transaction or transfer ID" disabled={isSubmitting} /></label>
                          <label className="affiliate-program-admin__field-label">Note (optional)<input name="note" maxLength={1000} placeholder="Payment details" disabled={isSubmitting} /></label>
                          <div className="grid gap-2">
                            <label className="affiliate-program-admin__check"><input type="checkbox" name="confirmExternalPayment" value="true" required disabled={isSubmitting} /><span>I confirm payment was made externally.</span></label>
                            <button className="affiliate-program-admin__action affiliate-program-admin__action--quiet" type="submit" name="decision" value="paid" disabled={isSubmitting}>Record external payment</button>
                          </div>
                        </Form>
                      </div>
                    ) : null}
                  </article>
                );
              }) : <EmptyState title="No payouts match" copy={query || filter !== "pending" ? "Try a different search or status filter." : "Payout requests will appear here when partners submit them."} />}
              <p className="text-xs text-[#687583]">Recording a payment only updates the affiliate ledger. This page does not transfer funds.</p>
            </section>
          ) : null}

          {tab === "settings" ? (
            <section id="affiliate-settings-panel" role="tabpanel" aria-labelledby="affiliate-settings-tab" className="grid gap-4">
              <div className="neo-workspace__panel grid gap-3 p-5 sm:p-6">
                <div><h2 className="text-lg font-bold">Program rules</h2><p className="mt-1 text-sm text-[#687583]">These defaults guide new referrals and payout eligibility. Existing partners keep their individual commission rate.</p></div>
                <Form method="post" className="grid gap-4 border-t border-[#e8edf1] pt-4 sm:grid-cols-2 xl:grid-cols-4">
                  <input type="hidden" name="intent" value="affiliate-save-settings" />
                  <label className="affiliate-program-admin__field-label">Attribution window (days)<input name="attributionDays" type="number" min="1" max="90" step="1" required defaultValue={program.settings.attributionDays} disabled={isSubmitting} /><span className="text-xs font-normal text-[#687583]">How long after a visit a referral can be attributed.</span></label>
                  <label className="affiliate-program-admin__field-label">Commission hold (days)<input name="holdDays" type="number" min="0" max="180" step="1" required defaultValue={program.settings.holdDays} disabled={isSubmitting} /><span className="text-xs font-normal text-[#687583]">Wait period before earned commission becomes available.</span></label>
                  <label className="affiliate-program-admin__field-label">Minimum payout (USD)<input name="minimumPayout" type="number" min="5" max="100000" step="0.01" required defaultValue={(program.settings.minimumPayoutCents / 100).toFixed(2)} disabled={isSubmitting} /><span className="text-xs font-normal text-[#687583]">Minimum balance required to request a payout.</span></label>
                  <div className="grid gap-2">
                    <label className="affiliate-program-admin__check"><input type="checkbox" name="payoutsEnabled" value="true" defaultChecked={program.settings.payoutsEnabled} disabled={isSubmitting} /><span>Enable payout requests</span></label>
                    <label className="affiliate-program-admin__check"><input type="checkbox" name="applicationsOpen" value="true" defaultChecked={program.settings.applicationsOpen} disabled={isSubmitting} /><span>Accept new applications</span></label>
                  </div>
                  <div className="sm:col-span-2 xl:col-span-4"><button className="affiliate-program-admin__action affiliate-program-admin__action--primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving settings…" : "Save program settings"}</button></div>
                </Form>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Tracked visits" value={program.visitCount.toLocaleString()} />
                <Metric label="Applications" value={program.applications.length.toLocaleString()} />
                <Metric label="Payout requests" value={program.payouts.length.toLocaleString()} />
              </div>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}

function TabButton({ selected, onClick, id, controls, children }: { selected: boolean; onClick: () => void; id: string; controls: string; children: React.ReactNode }) {
  return <button type="button" role="tab" id={id} aria-selected={selected} aria-controls={controls} tabIndex={selected ? 0 : -1} className="affiliate-program-admin__tab" onClick={onClick}>{children}</button>;
}

function Count({ children }: { children: number }) {
  return <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-xs">{children}</span>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl bg-[#f3f6f9] px-3 py-2.5"><p className="text-xs font-semibold text-[#536779]">{label}</p><p className="mt-0.5 text-xl font-bold">{value}</p></div>;
}

function QueueHeading({ title, description, count }: { title: string; description: string; count: number }) {
  return <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm text-[#687583]">{description}</p></div><span className="text-sm font-semibold text-[#536779]">{count} shown</span></div>;
}

function Detail({ label, value, href, className = "" }: { label: string; value: string; href?: string; className?: string }) {
  return <div className={`min-w-0 ${className}`}><p className="text-xs font-bold uppercase tracking-wide text-[#687583]">{label}</p>{href ? <a className="mt-1 block break-all text-sm font-semibold text-[#5140c0] underline decoration-[#cbc4ff] underline-offset-2" href={href} target="_blank" rel="noreferrer">{value}</a> : <p className="mt-1 break-words text-sm">{value}</p>}</div>;
}

function SocialMediaDetails({ value }: { value: string }) {
  const links = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-[#687583]">Social media</p><ul className="mt-1 grid gap-1">{links.map((link) => {
    const href = safeExternalUrl(link);
    return <li key={link} className="min-w-0">{href ? <a className="block break-all text-sm font-semibold text-[#5140c0] underline decoration-[#cbc4ff] underline-offset-2" href={href} target="_blank" rel="noreferrer">{link}</a> : <span className="break-all text-sm">{link}</span>}</li>;
  })}</ul></div>;
}

function Status({ value }: { value: string }) {
  return <span className="affiliate-program-admin__status" data-status={value}>{value}</span>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="rounded-2xl border border-dashed border-[#cbd5dd] px-4 py-10 text-center"><p className="font-bold">{title}</p><p className="mt-1 text-sm text-[#687583]">{copy}</p></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function suggestAffiliateCode(name: string) {
  const code = name.toUpperCase().replace(/[^A-Z0-9_-]+/g, "").replace(/^[^A-Z0-9]+/, "").slice(0, 32);
  return code.length >= 3 ? code : "CREATOR";
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function maskDestination(value: string) {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf("@");
  if (at > 0) return `${trimmed[0]}•••${trimmed.slice(at)}`;
  return trimmed.length > 6 ? `${trimmed.slice(0, 2)}••••${trimmed.slice(-3)}` : "••••••";
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
