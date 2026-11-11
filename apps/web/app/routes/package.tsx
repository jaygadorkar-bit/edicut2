import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarDays, Captions, Clapperboard, ClipboardList, Clock3, FileVideo, Film, History, Image, Layers3, Library, MessageSquareText, Pause, Play, Scissors, SlidersHorizontal, UserRoundCheck, UsersRound, WandSparkles } from "lucide-react";
import { ContactSection, PageShell } from "../components/site/Marketing.js";
import { EditingArtwork } from "../components/site/EditingArtwork";
import { PackageChoiceLink } from "../components/site/PackageChoiceLink";
import { PackageAddOns } from "../components/site/PackageAddOns";
import { PackageCarousel } from "../components/site/PackageCarousel";
import { FaqSection } from "../components/site/FaqSection";
import { packageAddOnTotal, selectedPackageAddOns, type PackageAddOnId } from "../lib/package-addons";
import packageStyles from "../styles/package.css?url";
import addOnStyles from "../styles/package-addons.css?url";
import { getDbFromContext } from "../lib/db.server";
import { getPricingPackages, configuredEditingPackage, configuredPublicEditingPackages, publicPricingPackages } from "../lib/pricing.server";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { optimizeCloudinaryUrl } from "../lib/cloudinary";
import { createRouteMeta } from "../lib/seo";
import { formatPackagePrice, getCheckoutUrl, REQUIRED_PACKAGE_STAFFING, SHORT_FORM_PACKAGE_SLUG, type EditingPackage } from "../lib/subscriptions";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: packageStyles }, { rel: "stylesheet", href: addOnStyles }];

function getPackageSeoDescription(editingPackage: EditingPackage) {
  if (editingPackage.slug === SHORT_FORM_PACKAGE_SLUG) {
    return `Order a ${formatPackagePrice(editingPackage.basePrice)} short-form video edit for TikTok, Instagram Reels, or YouTube Shorts. One vertical, captioned edit up to 60 seconds, one custom thumbnail, and at least ${editingPackage.revisionRounds} revision rounds are included.`;
  }
  if (editingPackage.packageType === "monthly") {
    return `${editingPackage.name} includes ${editingPackage.editingHoursPerMonth} monthly editing hours with two dedicated video editors, at ${editingPackage.editingHoursPerWorkday} hours per workday, plus one custom thumbnail per edited video.`;
  }

  return `${editingPackage.videoFormat}, ${editingPackage.finishedLength.toLowerCase()} finished from ${editingPackage.rawFootageLimit.toLowerCase()} of footage, with ${editingPackage.revisionRounds} ${editingPackage.revisionRounds === 1 ? "revision" : "revisions"} and one custom thumbnail included. See the current scope and price.`;
}

export const meta: MetaFunction<typeof loader> = (args) => createRouteMeta(
  args,
  args.loaderData?.editingPackage
    ? args.loaderData.editingPackage.slug === SHORT_FORM_PACKAGE_SLUG
      ? "Short-Form Video Editing | Reels, TikTok & Shorts | EdiCut"
      : `${args.loaderData.editingPackage.name} ${args.loaderData.editingPackage.packageType === "monthly" ? "Monthly Video Editing Package" : "Editing Package"} | EdiCut`
    : "Video Editing Package | EdiCut",
  args.loaderData?.editingPackage ? getPackageSeoDescription(args.loaderData.editingPackage) : "Explore EdiCut single-video editing and monthly editing-hours packages.",
);

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context);
  const allPackages = await getPricingPackages(db, context);
  const packages = publicPricingPackages(allPackages);
  const packageRecord = packages.find((item) => item.slug === params.slug);
  const editingPackage = packageRecord ? configuredEditingPackage(packageRecord.slug, packages) : null;
  if (!packageRecord || !editingPackage) throw new Response("Package not found", { status: 404 });

  const alternatives = configuredPublicEditingPackages(allPackages).filter((item) => item.slug !== editingPackage.slug);
  return { packageRecord, editingPackage, alternatives };
}

export default function PackagePage() {
  const { packageRecord, editingPackage, alternatives } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const rawAffiliateCode = searchParams.get("ref")?.trim().toUpperCase() ?? "";
  const affiliateCode = /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(rawAffiliateCode) ? rawAffiliateCode : "";
  const addOns = selectedPackageAddOns(searchParams.getAll("addon"), editingPackage.packageType, editingPackage.slug).map(item => item.id);
  const isMonthly = editingPackage.packageType === "monthly";
  const isShortForm = editingPackage.slug === SHORT_FORM_PACKAGE_SLUG;
  const editorCount = editingPackage.features.includes(REQUIRED_PACKAGE_STAFFING[1]) ? 2 : 1;
  const facts = isMonthly ? [
    [Clock3, "Editing hours per month", `${editingPackage.editingHoursPerMonth} hours`],
    [Clock3, "Editing hours per workday", `${editingPackage.editingHoursPerWorkday} ${editingPackage.editingHoursPerWorkday === 1 ? "hour" : "hours"}`],
    [Scissors, "Minimum revision rounds per edit", `At least ${editingPackage.revisionRounds}, within reserved hours`],
    [UsersRound, "Included editors", `${editorCount} dedicated ${editorCount === 1 ? "editor" : "editors"}`],
    [CalendarDays, "Monthly planning basis", `${editingPackage.workingDaysPerMonth} working days`],
    [History, "Unused time", "Does not roll over"],
  ] as const : [
    [Film, "Deliverable", editingPackage.videoFormat],
    [Clock3, "Finished length", editingPackage.finishedLength],
    [FileVideo, "Raw footage limit", editingPackage.rawFootageLimit],
    [Scissors, "Included revisions", `${editingPackage.revisionRounds} ${editingPackage.revisionRounds === 1 ? "round" : "rounds"}`],
    [UsersRound, "Included editors", `${editorCount} dedicated ${editorCount === 1 ? "editor" : "editors"}`],
  ] as const;
  const shortFormStructuredData = isShortForm ? JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: "Short-form video editing",
        serviceType: "Short-form video editing",
        description: "One captioned vertical video edit up to 60 seconds, with one custom thumbnail, for TikTok, Instagram Reels, or YouTube Shorts.",
        provider: { "@type": "Organization", name: "EdiCut", url: "https://edicut.com" },
        offers: {
          "@type": "Offer", url: "https://edicut.com/pricing/short-form-video-editing",
          priceCurrency: "USD", price: editingPackage.basePrice, availability: "https://schema.org/InStock",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://edicut.com/" },
          { "@type": "ListItem", position: 2, name: "Pricing", item: "https://edicut.com/pricing" },
          { "@type": "ListItem", position: 3, name: "Short-form video editing", item: "https://edicut.com/pricing/short-form-video-editing" },
        ],
      },
    ],
  }).replace(/</g, "\\u003c") : null;

  return (
    <PageShell className="package-page">
      {shortFormStructuredData ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: shortFormStructuredData }} /> : null}
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

      {isShortForm ? <>
        <section className="border-b neo-line px-5 py-16 sm:px-6" aria-labelledby="short-form-scope-title">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] lg:items-center">
            <div>
              <p className="yt-tag neo-section-label"><Clapperboard size={16} aria-hidden="true" />Short-form video editing</p>
              <h2 id="short-form-scope-title" className="mt-3 yt-title font-black neo-ink">One focused short, ready for a vertical feed.</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 neo-muted">This {formatPackagePrice(editingPackage.basePrice)} package covers one vertical edit up to 60 seconds, made from up to 15 minutes of footage you provide. Share the exact clip or timestamps, the platform, and the point you want viewers to remember. Moment selection from a longer recording, additional versions, and work beyond this scope need a separate quote.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/services/short-form-video-editing" className="package-compare">How our short-form editing works <ArrowRight size={16} aria-hidden="true" /></Link>
                <Link to="/portfolio" className="package-compare">Browse editing examples <ArrowRight size={16} aria-hidden="true" /></Link>
              </div>
            </div>
            <ol className="grid gap-3">
              {([
                ["01", "Share the moment", "Send the footage link, timestamps or exact clip, intended platform, and any caption or brand references."],
                ["02", "We shape the short", "Your editor makes a vertical 9:16 cut with burned-in captions and basic color and audio finishing."],
                ["03", "Review and approve", `A first-cut target of 48 hours applies after the brief and files are ready. At least ${editingPackage.revisionRounds} revision rounds are included.`],
              ] as const).map(([number, title, description]) => <li key={number} className="neo-inset rounded-2xl p-5">
                <p className="text-xs font-black tracking-widest text-primary">{number} / SHORT-FORM EDIT</p>
                <h3 className="mt-2 text-lg font-black neo-ink">{title}</h3>
                <p className="mt-2 text-sm leading-6 neo-muted">{description}</p>
              </li>)}
            </ol>
          </div>
        </section>
        <FaqSection
          title={<>What’s included in short-form video editing?</>}
          description={`Know what one ${formatPackagePrice(editingPackage.basePrice)} short includes before you place an order.`}
          items={[
            { question: "How many short videos are included?", answer: "One edited vertical video up to 60 seconds. Place another order for another short; alternate aspect ratios, multiple versions, or several clips from one source need a separate scope." },
            { question: "What footage should I send?", answer: "Share the video files or a secure folder link, up to 15 minutes of source footage, and the exact clip or timestamps to edit. Selecting highlights from an extended recording is not included in this package." },
            { question: `What does the ${formatPackagePrice(editingPackage.basePrice)} edit include?`, answer: `One 9:16 vertical export, burned-in captions, basic color and audio finishing, at least ${editingPackage.revisionRounds} revision rounds, and a first-cut target of 48 hours once your brief and files are ready.` },
            { question: "Will the edit go viral or guarantee more views?", answer: "No. Editing can make a clip easier to follow and publish, but reach depends on the content, audience, publishing choices, and platform distribution." },
          ]}
        />
      </> : null}

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
  const extras = packageAddOnTotal(selectedPackageAddOns(addOns, editingPackage.packageType, editingPackage.slug)) / 100;
  const checkoutHref = getCheckoutUrl(editingPackage, { affiliateCode, addOns });
  const isMonthly = editingPackage.packageType === "monthly";
  return <section className="package-checkout neo-surface" aria-labelledby="package-title">
    <p className="neo-section-label package-kind">
      {isMonthly ? <CalendarDays size={16} aria-hidden="true" /> : <Film size={16} aria-hidden="true" />}
      {isMonthly ? "Monthly editing hours" : "Single video edit"}
    </p>
            <h1 id="package-title">{editingPackage.slug === SHORT_FORM_PACKAGE_SLUG ? "Short-form Video Editing" : editingPackage.name}</h1>
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
