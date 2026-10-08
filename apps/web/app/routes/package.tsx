import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarDays, Captions, Clapperboard, ClipboardList, Clock3, FileVideo, Film, History, Image, Layers3, Library, MessageSquareText, Pause, Play, Scissors, SlidersHorizontal, UserRoundCheck, UsersRound, WandSparkles } from "lucide-react";
import { ContactSection, PageShell } from "../components/site/Marketing.js";
import { EditingArtwork } from "../components/site/EditingArtwork";
import { PackageChoiceLink } from "../components/site/PackageChoiceLink";
import { PackageAddOns } from "../components/site/PackageAddOns";
import { PackageCarousel } from "../components/site/PackageCarousel";
import { packageAddOnTotal, selectedPackageAddOns, type PackageAddOnId } from "../lib/package-addons";
import packageStyles from "../styles/package.css?url";
import addOnStyles from "../styles/package-addons.css?url";
import { getDbFromContext } from "../lib/db.server";
import { getPricingPackages, configuredEditingPackage, configuredPublicEditingPackages, publicPricingPackages } from "../lib/pricing.server";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { optimizeCloudinaryUrl } from "../lib/cloudinary";
import { normalizeMarketingCode } from "../lib/marketing.server";
import { createRouteMeta } from "../lib/seo";
import { formatPackagePrice, getCheckoutUrl, type EditingPackage } from "../lib/subscriptions";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: packageStyles }, { rel: "stylesheet", href: addOnStyles }];

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
  const query = new URL(request.url).searchParams;
  const affiliateCode = normalizeMarketingCode(query.get("ref") || "") || "";
  const addOns = selectedPackageAddOns(query.getAll("addon"), editingPackage.packageType).map(item => item.id);
  return { packageRecord, editingPackage, alternatives, affiliateCode, addOns };
}

export default function PackagePage() {
  const { packageRecord, editingPackage, alternatives, affiliateCode, addOns } = useLoaderData<typeof loader>();
  const isMonthly = editingPackage.packageType === "monthly";
  const facts = isMonthly ? [
    [Clock3, "Editing hours per month", `${editingPackage.editingHoursPerMonth} hours`],
    [Clock3, "Editing hours per workday", `${editingPackage.editingHoursPerWorkday} ${editingPackage.editingHoursPerWorkday === 1 ? "hour" : "hours"}`],
    [CalendarDays, "Monthly planning basis", `${editingPackage.workingDaysPerMonth} working days`],
    [History, "Unused time", "Does not roll over"],
  ] as const : [
    [Film, "Deliverable", editingPackage.videoFormat],
    [Clock3, "Finished length", editingPackage.finishedLength],
    [FileVideo, "Raw footage limit", editingPackage.rawFootageLimit],
    [Scissors, "Included revisions", `${editingPackage.revisionRounds} ${editingPackage.revisionRounds === 1 ? "round" : "rounds"}`],
  ] as const;

  return (
    <PageShell className="package-page">
      <section className="package-hero border-b neo-line" aria-labelledby="package-title">
        <div className="package-container package-hero-grid">
          <div className="package-intro">
            <Link to="/pricing" className="package-back">All packages <ArrowRight size={14} aria-hidden="true" /></Link>
            <div className="package-visual">
              <PackageArtwork />
            </div>
          </div>
          <aside className="package-selection">
            <PackageCheckoutCard key={`${editingPackage.slug}:${addOns.join(",")}`} editingPackage={editingPackage} affiliateCode={affiliateCode} initialAddOns={addOns} />
            <Link to="/pricing" className="package-compare">Compare available packages <ArrowRight size={16} aria-hidden="true" /></Link>
          </aside>
        </div>
        <div className="package-container package-scope">
          <div className="package-scope-heading"><h2><ClipboardList size={17} aria-hidden="true" />Your package at a glance</h2>{!isMonthly ? <p><Clock3 size={16} aria-hidden="true" />First-cut target: <strong>{editingPackage.firstCutHours} hours</strong></p> : null}</div>
          <dl className="package-facts">{facts.map(([Icon, label, value]) => <div key={label} className="neo-inset"><dt><Icon size={16} aria-hidden="true" />{label}</dt><dd>{value}</dd></div>)}</dl>
        </div>
      </section>

      {packageRecord.galleryImages.length ? <section className="border-b neo-line px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <p className="yt-tag neo-section-label"><Image size={16} aria-hidden="true" />Visual showcase</p>
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
          <div className="package-included-heading">
            <p className="yt-tag neo-section-label"><BadgeCheck size={16} aria-hidden="true" />Included in your package</p>
            <h2 className="mt-3 yt-title font-black neo-ink">Clear scope, before the first cut.</h2>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {editingPackage.deliverables.map((item) => {
              const Icon = packageFeatureIcon(item);
              return <div key={item} className="neo-inset flex min-w-0 items-start gap-3 rounded-xl p-4">
                <span className="neo-icon-badge flex h-6 w-6 shrink-0 items-center justify-center rounded-full"><Icon size={15} aria-hidden="true" /></span>
                <span className="text-sm font-bold neo-ink">{item}</span>
              </div>;
            })}
          </div>
        </div>
      </section>

      {alternatives.length ? <section className="border-b neo-line px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-center"><p className="yt-tag neo-section-label"><Layers3 size={16} aria-hidden="true" />Other options</p><h2 className="mt-3 yt-title font-black neo-ink">Compare the other packages</h2></div>
          <PackageCarousel>
            {alternatives.map((item) => <Link key={item.slug} to={`/pricing/${item.slug}${affiliateCode ? `?ref=${encodeURIComponent(affiliateCode)}` : ""}`} className="neo-card flex min-w-0 flex-col justify-between rounded-2xl p-6 transition hover:border-primary/40">
              <div><span className="neo-pill rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider neo-muted">{item.packageType === "monthly" ? "Monthly package" : "Single video"}</span><p className="mt-4 text-xl font-black neo-ink">{item.name}</p><p className="mt-2 text-sm font-medium leading-relaxed neo-muted">{item.description}</p></div>
              <div className="mt-6 flex items-baseline gap-1 border-t neo-line pt-4"><span className="type-price neo-ink">{formatPackagePrice(item.basePrice)}</span><span className="yt-small font-bold neo-muted">{item.packageType === "monthly" ? "/ month" : "/ video"}</span><ArrowRight className="ml-auto" size={17} aria-hidden="true" /></div>
            </Link>)}
          </PackageCarousel>
        </div>
      </section> : null}
      <ContactSection compact />
    </PageShell>
  );
}

function PackageArtwork() {
  const [playback, setPlayback] = useState<"auto" | "playing" | "paused">("auto");
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setReducedMotion(preference.matches);
      setPlayback("auto");
    };
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);
  const paused = playback === "paused" || (playback === "auto" && reducedMotion);
  return <div className="package-art" data-playback={playback} data-paused={paused}>
    <div className="package-art-scene">
      <EditingArtwork stage="edit" timelineScene />
      <button type="button" className="package-art-playback" aria-label={paused ? "Play artwork animation" : "Pause artwork animation"} onClick={() => setPlayback(paused ? "playing" : "paused")}>
        {paused ? <Play aria-hidden="true" fill="currentColor" /> : <Pause aria-hidden="true" />}
      </button>
      <span className="package-art-caption"><Scissors size={15} aria-hidden="true" />Your footage. A fresh cut.</span>
    </div>
  </div>;
}

function PackageCheckoutCard({ editingPackage, affiliateCode, initialAddOns }: { editingPackage: EditingPackage; affiliateCode: string; initialAddOns: PackageAddOnId[] }) {
  const [addOns, setAddOns] = useState(initialAddOns);
  const extras = packageAddOnTotal(selectedPackageAddOns(addOns, editingPackage.packageType)) / 100;
  const checkoutHref = getCheckoutUrl(editingPackage, { affiliateCode, addOns });
  const isMonthly = editingPackage.packageType === "monthly";
  return <section className="package-checkout neo-surface" aria-labelledby="package-title">
    <p className="neo-section-label package-kind">
      {isMonthly ? <CalendarDays size={16} aria-hidden="true" /> : <Film size={16} aria-hidden="true" />}
      {isMonthly ? "Monthly editing hours" : "Single video edit"}
    </p>
    <h1 id="package-title">{editingPackage.name}</h1>
    <div className="package-base-price neo-inset">
      <p className="text-sm font-black neo-ink">{isMonthly ? "Monthly package price" : "One-time video price"}</p>
      <p className="text-3xl font-black neo-ink">{formatPackagePrice(editingPackage.basePrice)}<span className="block text-right text-xs font-medium neo-muted">{isMonthly ? "/month" : "one time"}</span></p>
    </div>
    <ul className="mt-5 grid gap-3 text-xs font-bold neo-ink">
      {editingPackage.features.slice(0, 2).map((feature) => {
        const Icon = packageFeatureIcon(feature);
        return <li key={feature} className="flex gap-2"><Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{feature}</li>;
      })}
      {isMonthly ? <li className="flex gap-2"><Clock3 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{editingPackage.editingHoursPerMonth} hours per month · {editingPackage.editingHoursPerWorkday} {editingPackage.editingHoursPerWorkday === 1 ? "hour" : "hours"} per workday</li>
        : <li className="flex gap-2"><FileVideo size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{editingPackage.finishedLength} finished · {editingPackage.rawFootageLimit} raw footage</li>}
    </ul>
    <PackageAddOns editingPackage={editingPackage} selected={addOns} onChange={setAddOns} />
    <div className="package-selection-total" aria-live="polite" aria-atomic="true"><span>{isMonthly ? "Monthly total" : "Your total"}</span><strong>{formatPackagePrice(editingPackage.basePrice + extras)}</strong></div>
    <PackageChoiceLink to={checkoutHref} label={isMonthly ? "Choose monthly package" : "Choose this video edit"} className="package-checkout-button" />
  </section>;
}

function packageFeatureIcon(feature: string) {
  const text = feature.toLowerCase();
  if (text.includes("project manager")) return UserRoundCheck;
  if (text.includes("two") && text.includes("editors")) return UsersRound;
  if (text.includes("editor")) return Scissors;
  if (text.includes("revision")) return MessageSquareText;
  if (text.includes("workday") || text.includes("working days")) return CalendarDays;
  if (text.includes("hours")) return Clock3;
  if (text.includes("caption")) return Captions;
  if (text.includes("color") || text.includes("audio")) return SlidersHorizontal;
  if (text.includes("stock") || text.includes("b-roll")) return Library;
  if (text.includes("motion")) return WandSparkles;
  if (text.includes("narrative") || text.includes("pacing")) return Clapperboard;
  if (text.includes("video")) return Film;
  return FileVideo;
}
