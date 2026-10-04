import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ArrowRight, Check, Clock3, FileVideo, Scissors } from "lucide-react";
import { ContactSection, PageShell, TrustStrip } from "../components/site/Marketing.js";
import { getDbFromContext } from "../lib/db.server";
import { getPricingPackages, configuredEditingPackage, configuredPublicEditingPackages, publicPricingPackages } from "../lib/pricing.server";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { optimizeCloudinaryUrl } from "../lib/cloudinary";
import { normalizeMarketingCode } from "../lib/marketing.server";
import { createRouteMeta } from "../lib/seo";
import { formatPackagePrice, getCheckoutUrl, type EditingPackage } from "../lib/subscriptions";

export const meta: MetaFunction<typeof loader> = (args) => createRouteMeta(
  args,
  args.data?.editingPackage ? `${args.data.editingPackage.name} Video Editing Package | EdiCut` : "Video Editing Package | EdiCut",
  args.data?.editingPackage?.description || "Explore EdiCut single-video editing and monthly editing-hours packages.",
);

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context);
  const allPackages = await getPricingPackages(db, context);
  const packages = publicPricingPackages(allPackages);
  const packageRecord = packages.find((item) => item.slug === params.slug);
  const editingPackage = packageRecord ? configuredEditingPackage(packageRecord.slug, packages) : null;
  if (!packageRecord || !editingPackage) throw new Response("Package not found", { status: 404 });

  const alternatives = configuredPublicEditingPackages(allPackages).filter((item) => item.slug !== editingPackage.slug);
  const affiliateCode = normalizeMarketingCode(new URL(request.url).searchParams.get("ref") || "") || "";
  return { packageRecord, editingPackage, alternatives, affiliateCode };
}

export default function PackagePage() {
  const { packageRecord, editingPackage, alternatives, affiliateCode } = useLoaderData<typeof loader>();
  const isMonthly = editingPackage.packageType === "monthly";
  const facts = isMonthly ? [
    ["schedule", "Editing hours per month", `${editingPackage.editingHoursPerMonth} hours`],
    ["schedule", "Editing hours per workday", `${editingPackage.editingHoursPerWorkday} ${editingPackage.editingHoursPerWorkday === 1 ? "hour" : "hours"}`],
    ["calendar_month", "Monthly planning basis", `${editingPackage.workingDaysPerMonth} working days`],
    ["history", "Unused time", "Does not roll over"],
  ] : [
    ["movie", "Deliverable", editingPackage.videoFormat],
    ["schedule", "Finished length", editingPackage.finishedLength],
    ["video_file", "Raw footage limit", editingPackage.rawFootageLimit],
    ["edit_note", "Included revisions", `${editingPackage.revisionRounds} ${editingPackage.revisionRounds === 1 ? "round" : "rounds"}`],
  ];

  return (
    <PageShell>
      <section className="relative overflow-hidden border-b neo-line px-5 pb-16 pt-16 sm:px-6 lg:pb-24 lg:pt-20">
        <div className="pointer-events-none absolute -right-24 top-16 h-72 w-72 rounded-full bg-[#e2c9ce]/35 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-[#cbdbe8]/60 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-start gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            <div className="neo-pill inline-flex items-center gap-2 rounded-full px-4 py-2 yt-tag tracking-[0.16em] neo-section-label">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {isMonthly ? "Monthly editing hours" : "Single video edit"}
            </div>
            <h1 className="yt-display mt-7 neo-ink">{editingPackage.name}</h1>
            <p className="yt-subtitle mt-6 max-w-2xl leading-8 neo-muted">{editingPackage.description}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <FactPill label={isMonthly ? "Monthly package" : "One-time price"} value={`${formatPackagePrice(editingPackage.basePrice)}${isMonthly ? " / month" : ""}`} />
              {isMonthly ? <>
                <FactPill label="Editing time" value={`${editingPackage.editingHoursPerMonth} hours / month`} />
                <FactPill label="Per workday" value={`${editingPackage.editingHoursPerWorkday} ${editingPackage.editingHoursPerWorkday === 1 ? "hour" : "hours"}`} />
              </> : <>
                <FactPill label="Deliverable" value={editingPackage.videoFormat} />
                <FactPill label="Finished length" value={editingPackage.finishedLength} />
              </>}
            </div>

            <div className="neo-surface mt-10 rounded-[2rem] p-6 sm:p-8">
              <p className="yt-tag neo-section-label">Best suited for</p>
              <h2 className="mt-2 text-2xl font-black neo-ink">{editingPackage.bestFor}</h2>
              <p className="mt-3 yt-small leading-relaxed neo-muted">{isMonthly
                ? "This package reserves editing capacity across a standard 22-workday month. The work and feedback rounds you choose use that time. We agree the scope and delivery schedule before production begins; work beyond the reserved hours is quoted separately."
                : "This package covers one finished video within the listed footage and runtime limits. Your brief, revision rounds, and delivery timing are confirmed before editing starts."}</p>
            </div>

            <div className="neo-inset mt-6 rounded-2xl p-5 sm:p-6">
              <h2 className="yt-tag font-black uppercase tracking-[0.14em] neo-muted">Package details</h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {facts.map(([icon, label, value]) => (
                  <div key={label} className="neo-card min-w-0 rounded-xl p-4">
                    <dt className="flex items-center gap-2 text-sm font-bold neo-ink">
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{icon}</span>{label}
                    </dt>
                    <dd className="mt-2 break-words text-sm neo-muted">{value}</dd>
                  </div>
                ))}
              </dl>
              {!isMonthly ? <p className="mt-4 flex items-center gap-2 text-sm neo-muted"><Clock3 size={17} aria-hidden="true" />First-cut target: {editingPackage.firstCutHours} hours</p> : null}
            </div>
          </div>

          <aside className="h-fit lg:sticky lg:top-24">
            <PackageCheckoutCard editingPackage={editingPackage} affiliateCode={affiliateCode} />
            <Link to="/pricing" className="neo-card mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl p-4 text-sm font-black neo-ink transition hover:border-primary/40">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">compare_arrows</span>
              Compare all six packages
            </Link>
          </aside>
        </div>
      </section>

      {packageRecord.galleryImages.length ? <section className="border-b neo-line px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <p className="yt-tag neo-section-label">Visual showcase</p>
          <h2 className="mt-3 yt-title font-black neo-ink">Editing style previews</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {packageRecord.galleryImages.map((imageUrl, index) => <div key={imageUrl} className={`neo-card overflow-hidden rounded-2xl p-2 ${index === 0 ? "md:col-span-2 md:row-span-2" : ""}`}>
              <img src={optimizeCloudinaryUrl(imageUrl)} alt={`${editingPackage.name} preview ${index + 1}`} loading="lazy" decoding="async" className="aspect-video w-full rounded-xl object-cover" />
            </div>)}
          </div>
        </div>
      </section> : null}

      <section className="border-b neo-line px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <p className="yt-tag neo-section-label">Included in your package</p>
          <h2 className="mt-3 yt-title font-black neo-ink">Clear scope, before the first cut.</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {editingPackage.deliverables.map((item) => <div key={item} className="neo-inset flex min-w-0 items-start gap-3 rounded-xl p-4">
              <span className="neo-icon-badge flex h-6 w-6 shrink-0 items-center justify-center rounded-full"><Check size={15} aria-hidden="true" /></span>
              <span className="text-sm font-bold neo-ink">{item}</span>
            </div>)}
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm neo-muted"><Scissors size={17} aria-hidden="true" />{editingPackage.packageType === "monthly"
            ? "Monthly editing and revisions draw from your reserved hours. The plan is a monthly capacity package; recurring card billing is not enabled."
            : `Includes ${editingPackage.revisionRounds} ${editingPackage.revisionRounds === 1 ? "revision round" : "revision rounds"}; additional work is quoted separately.`}</p>
        </div>
      </section>

      <section className="border-b neo-line px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-center"><p className="yt-tag neo-section-label">Other options</p><h2 className="mt-3 yt-title font-black neo-ink">Compare the other packages</h2></div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {alternatives.map((item) => <Link key={item.slug} to={`/pricing/${item.slug}${affiliateCode ? `?ref=${encodeURIComponent(affiliateCode)}` : ""}`} className="neo-card flex min-w-0 flex-col justify-between rounded-2xl p-6 transition hover:border-primary/40">
              <div><span className="neo-pill rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider neo-muted">{item.packageType === "monthly" ? "Monthly package" : "Single video"}</span><p className="mt-4 text-xl font-black neo-ink">{item.name}</p><p className="mt-2 text-sm font-medium leading-relaxed neo-muted">{item.description}</p></div>
              <div className="mt-6 flex items-baseline gap-1 border-t neo-line pt-4"><span className="type-price neo-ink">{formatPackagePrice(item.basePrice)}</span><span className="yt-small font-bold neo-muted">{item.packageType === "monthly" ? "/ month" : "/ video"}</span><ArrowRight className="ml-auto" size={17} aria-hidden="true" /></div>
            </Link>)}
          </div>
        </div>
      </section>
      <TrustStrip />
      <ContactSection compact />
    </PageShell>
  );
}

function FactPill({ label, value }: { label: string; value: string }) {
  return <div className="neo-pill max-w-full rounded-2xl px-4 py-2.5"><p className="text-xs font-black uppercase tracking-wider neo-muted">{label}</p><p className="mt-0.5 break-words text-base font-black neo-ink">{value}</p></div>;
}

function PackageCheckoutCard({ editingPackage, affiliateCode }: { editingPackage: EditingPackage; affiliateCode: string }) {
  const checkoutHref = getCheckoutUrl(editingPackage, { affiliateCode });
  const isMonthly = editingPackage.packageType === "monthly";
  return <section className="neo-surface rounded-[2rem] p-6 shadow-xl" aria-labelledby="checkout-card-title">
    <div className="flex items-center justify-between gap-3"><p className="yt-tag neo-section-label">{isMonthly ? "Monthly package" : "One-time package"}</p><span className="neo-pill rounded-full px-2.5 py-1 text-[11px] font-black uppercase neo-muted">Fixed scope</span></div>
    <h2 id="checkout-card-title" className="mt-2 text-2xl font-black neo-ink">{editingPackage.name}</h2>
    <div className="neo-inset mt-5 rounded-xl p-4">
      <p className="text-sm font-black neo-ink">{isMonthly ? "Monthly package price" : "One-time video price"}</p>
      <p className="mt-1 text-3xl font-black neo-ink">{formatPackagePrice(editingPackage.basePrice)}<span className="ml-1 text-xs font-bold neo-muted">{isMonthly ? "/month" : "one time"}</span></p>
    </div>
    <ul className="mt-5 grid gap-3 text-xs font-bold neo-ink">
      {editingPackage.features.slice(0, 5).map((feature) => <li key={feature} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{feature}</li>)}
      {isMonthly ? <li className="flex gap-2"><Clock3 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{editingPackage.editingHoursPerMonth} hours per month · {editingPackage.editingHoursPerWorkday} {editingPackage.editingHoursPerWorkday === 1 ? "hour" : "hours"} per workday</li>
        : <li className="flex gap-2"><FileVideo size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{editingPackage.finishedLength} finished · {editingPackage.rawFootageLimit} raw footage</li>}
    </ul>
    <Link to={checkoutHref} className="neo-button neo-button--primary mt-6 min-h-12 w-full justify-center text-sm font-black uppercase tracking-wider">
      <span>{isMonthly ? "Choose monthly package" : "Choose this video edit"}</span><ArrowRight size={18} aria-hidden="true" />
    </Link>
    <p className="mt-3 text-center text-xs font-medium neo-muted">Review and save your selection. Card payments are currently unavailable.</p>
  </section>;
}
