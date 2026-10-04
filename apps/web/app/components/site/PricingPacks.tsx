import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, ChevronDown, Clapperboard, Clock3, FileVideo, Film, Image, Play, Scissors, Upload } from "lucide-react";
import { formatPackagePrice, getCheckoutUrl, type EditingPackage, type SingleVideoPackage, type SubscriptionPackage } from "../../lib/subscriptions";

const questions = [
  { question: "How does monthly editing time work?", answer: "Your package reserves the listed editing hours across a standard 22-workday month. Editing, feedback rounds, and included finishing work draw from that time. We agree the scope and schedule with you before production starts." },
  { question: "Are unused monthly hours carried over?", answer: "No. Each package is a monthly capacity reservation, so unused hours expire at the end of that package month. We’ll help prioritize the work that fits your available time." },
  { question: "How is a single-video package different?", answer: "A single-video package is priced per deliverable, with a finished-length limit, raw-footage limit, revision allowance, and first-cut target shown on its card. Choose one when you have a specific edit rather than recurring monthly work." },
  { question: "Can I ask for work outside the listed scope?", answer: "Yes. Longer edits, extra source footage, custom VFX, project files, and work beyond reserved monthly hours can be quoted separately. We confirm any added price and timing before work begins." },
  { question: "Can I pay online today?", answer: "The checkout currently saves your selection and contact details, but card payments are not enabled yet. Contact us if you’d like to discuss a package or confirm the next step." },
];

type PackageKind = EditingPackage["packageType"];

function comparisonRows(packages: EditingPackage[]) {
  const monthly = packages.filter((pack): pack is SubscriptionPackage => pack.packageType === "monthly");
  if (monthly.length) {
    return [
      { label: "Price per month", values: monthly.map((pack) => formatPackagePrice(pack.basePrice)) },
      { label: "Editing hours per month", values: monthly.map((pack) => `${pack.editingHoursPerMonth} hours`) },
      { label: "Editing hours per workday", values: monthly.map((pack) => `${pack.editingHoursPerWorkday} ${pack.editingHoursPerWorkday === 1 ? "hour" : "hours"}`) },
      { label: "Monthly planning basis", values: monthly.map((pack) => `${pack.workingDaysPerMonth} working days`) },
      { label: "How time is used", values: monthly.map(() => "Editing and revisions use reserved hours") },
      { label: "Unused time", values: monthly.map(() => "Does not roll over") },
      { label: "Stock and B-roll", values: monthly.map((pack) => pack.slug === "creator" ? "Quoted separately" : "Included asset library") },
      { label: "Branded motion", values: monthly.map((pack) => pack.slug === "creator-pro" ? "Light template-based motion" : "Not included") },
    ];
  }

  const single = packages.filter((pack): pack is SingleVideoPackage => pack.packageType === "single");
  return [
    { label: "Price per edit", values: single.map((pack) => formatPackagePrice(pack.basePrice)) },
    { label: "Deliverable", values: single.map((pack) => pack.videoFormat) },
    { label: "Finished length", values: single.map((pack) => pack.finishedLength) },
    { label: "Raw footage", values: single.map((pack) => pack.rawFootageLimit) },
    { label: "Revisions", values: single.map((pack) => `${pack.revisionRounds} ${pack.revisionRounds === 1 ? "round" : "rounds"}`) },
    { label: "First-cut target", values: single.map((pack) => `${pack.firstCutHours} hours`) },
  ];
}

function PackageScope({ pack }: { pack: EditingPackage }) {
  if (pack.packageType === "monthly") {
    return <div className="pack-output neo-inset" aria-label="Monthly editing capacity">
      <p><Clock3 size={19} aria-hidden="true" /><strong>{pack.editingHoursPerMonth} editing hours / month</strong></p>
      <p><Clock3 size={19} aria-hidden="true" />{pack.editingHoursPerWorkday} {pack.editingHoursPerWorkday === 1 ? "hour" : "hours"} per workday</p>
      <p><FileVideo size={19} aria-hidden="true" />Planned across 22 working days</p>
    </div>;
  }

  return <div className="pack-output neo-inset" aria-label="Single video scope">
    <p><FileVideo size={19} aria-hidden="true" /><strong>{pack.videoFormat}</strong></p>
    <p><Film size={19} aria-hidden="true" />Finished edit: {pack.finishedLength.toLowerCase()}</p>
    <p><Upload size={19} aria-hidden="true" />Source footage: {pack.rawFootageLimit.toLowerCase()}</p>
  </div>;
}

export function HomePricingSection({ packages }: { packages: EditingPackage[] }) {
  const [packageKind, setPackageKind] = useState<PackageKind>("single");
  return <div className="pack-pricing pack-pricing--home">
    <PricingPackageOptions packages={packages} packageKind={packageKind} onPackageKindChange={setPackageKind} id="pricing" comparisonHref={`/pricing?type=${packageKind}#pack-comparison`} />
  </div>;
}

function PricingPackageOptions({ packages, packageKind, onPackageKindChange, id = "editing-packs", comparisonHref }: {
  packages: EditingPackage[];
  packageKind: PackageKind;
  onPackageKindChange: (kind: PackageKind) => void;
  id?: string;
  comparisonHref?: string;
}) {
  const packs = packages.filter((pack) => pack.packageType === packageKind);
  const isMonthly = packageKind === "monthly";
  const titleId = `${id}-title`;

  return <section id={id} className="pack-options pack-container" aria-labelledby={titleId}>
    <div className="pack-options-intro">
      <div>
        <h2 id={titleId}>{isMonthly ? "Reserve editing time for your month." : "Choose the edit you need."}</h2>
        <p>{isMonthly ? "Monthly packages are measured in editing hours per month and per workday." : "One clear price for one finished video, with limits shown up front."}</p>
      </div>
      {packs.length > 0 && (comparisonHref
        ? <Link to={comparisonHref} className="pack-text-link">Compare every detail <ChevronDown size={16} aria-hidden="true" /></Link>
        : <a href="#pack-comparison" className="pack-text-link">Compare every detail <ChevronDown size={16} aria-hidden="true" /></a>)}
    </div>

    <div className="pack-type-switch neo-inset" role="group" aria-label="Choose a pricing option">
      <button type="button" aria-pressed={!isMonthly} onClick={() => onPackageKindChange("single")}>Single video</button>
      <button type="button" aria-pressed={isMonthly} onClick={() => onPackageKindChange("monthly")}>Monthly packages</button>
    </div>

    {packs.length ? <>
      {isMonthly ? <p className="pack-capacity-note">Monthly capacity is based on 22 working days. Editing and revisions use the reserved hours; unused hours do not roll over.</p> : null}
      <div className={`pack-grid pack-grid--${packs.length}`}>
        {packs.map((pack) => {
          const popular = pack.badge.toLowerCase().includes("popular");
          return <article key={pack.slug} id={`pack-${pack.slug}`} className={`pack-card neo-card ${popular ? "pack-card--recommended" : ""}`} aria-labelledby={`pack-${pack.slug}-name`}>
            <div className="pack-card-topline">
              <span className="pack-card-icon neo-inset"><Clapperboard size={23} aria-hidden="true" /></span>
              <span className="pack-card-badge">{popular ? <Check size={14} aria-hidden="true" /> : null}{pack.badge}</span>
            </div>
            <h3 id={`pack-${pack.slug}-name`}>{pack.name}</h3>
            <p className="pack-card-description">{pack.description}</p>
            <p className="pack-price"><strong>{formatPackagePrice(pack.basePrice)}</strong><span>{isMonthly ? "USD / month" : "USD / video"}</span></p>
            <PackageScope pack={pack} />
            <Link to={getCheckoutUrl(pack)} className="neo-button pack-button">Choose {pack.name} <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link to={`/pricing/${pack.slug}`} className="pack-details-link">See {pack.name} details</Link>
            <ul className="pack-features">{pack.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" /><span>{feature}</span></li>)}</ul>
            {pack.packageType === "single" ? <div className="pack-delivery"><Clock3 size={17} aria-hidden="true" /><span>First-cut target: <strong>{pack.firstCutHours} hours</strong></span></div> : null}
            <p className="pack-audience">{pack.bestFor}</p>
          </article>;
        })}
      </div>
      <div className="pack-custom"><div><strong>Have a larger project?</strong><span>We’ll confirm the scope and price before production starts.</span></div><Link to="/contact" className="neo-button pack-button">Request a custom quote <ArrowRight size={17} aria-hidden="true" /></Link></div>
    </> : <div className="pack-empty neo-surface"><p>We’re updating these editing packages. Tell us what you need and we’ll help you find the right scope.</p><Link to="/contact" className="neo-button pack-button">Discuss my editing needs <ArrowRight size={17} aria-hidden="true" /></Link></div>}
  </section>;
}

export function PricingPacks({ packages, initialKind = "single" }: { packages: EditingPackage[]; initialKind?: PackageKind }) {
  const [packageKind, setPackageKind] = useState<PackageKind>(initialKind);
  const packs = packages.filter((pack) => pack.packageType === packageKind);
  const singlePackageCount = packages.filter((pack) => pack.packageType === "single").length;
  const monthlyPackageCount = packages.filter((pack) => pack.packageType === "monthly").length;
  const isMonthly = packageKind === "monthly";

  return (
    <div className="pack-pricing">
      <section className="pack-hero" aria-labelledby="pricing-title">
        <div className="pack-hero-objects" aria-hidden="true">
          <Clapperboard className="pack-hero-object pack-hero-object--clapper" strokeWidth={1.5} />
          <Scissors className="pack-hero-object pack-hero-object--scissors" strokeWidth={1.5} />
          <Play className="pack-hero-object pack-hero-object--play" strokeWidth={1.5} />
          <Film className="pack-hero-object pack-hero-object--film" strokeWidth={1.5} />
        </div>
        <div className="pack-container pack-hero-content">
          <p className="pack-hero-label"><Scissors size={17} aria-hidden="true" /> Your footage. Our editing team.</p>
          <h1 id="pricing-title">More creating.<br />Less editing.</h1>
          <p className="pack-hero-copy">Choose one video at a time, or reserve editing hours for the month.<br className="pack-desktop-break" /> Clear scope and pricing before the first cut.</p>
          <div className="pack-hero-actions">
            <a href="#editing-packs" className="neo-button pack-button">Explore editing packages <ArrowRight size={18} aria-hidden="true" /></a>
            <Link to="/portfolio" className="neo-button pack-button">See the work <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
          <div className="pack-value-strip" aria-label="EdiCut pricing options">
            <span><Check size={16} aria-hidden="true" /> {singlePackageCount} single-video {singlePackageCount === 1 ? "package" : "packages"}</span>
            <span><Check size={16} aria-hidden="true" /> {monthlyPackageCount} hour-based monthly {monthlyPackageCount === 1 ? "plan" : "plans"}</span>
            <span><Check size={16} aria-hidden="true" /> Scope confirmed before work</span>
          </div>
        </div>
      </section>

      <PricingPackageOptions packages={packages} packageKind={packageKind} onPackageKindChange={setPackageKind} />

      <section className="pack-workflow pack-container neo-surface" aria-labelledby="workflow-title">
        <div className="pack-workflow-layout">
          <div className="pack-workflow-heading"><h2 id="workflow-title">Your footage in.<br />Your next cut out.</h2><p>Start with a single deliverable or a block of monthly editing time.</p></div>
          <ol className="pack-workflow-steps">
            <li><span className="pack-step-icon neo-inset"><Upload size={24} aria-hidden="true" /></span><h3>Share your footage</h3><p>After scope and payment are confirmed, send your links, references, brand assets, and brief.</p></li>
            <li><span className="pack-step-icon neo-inset"><Scissors size={24} aria-hidden="true" /></span><h3>We make the cut</h3><p>Your editor works to the limits of the single edit or the time reserved in your monthly package.</p></li>
            <li><span className="pack-step-icon neo-inset"><Clapperboard size={24} aria-hidden="true" /></span><h3>Review, then publish</h3><p>Share feedback within your included revision rounds or monthly editing hours.</p></li>
          </ol>
        </div>
      </section>

      {packs.length > 0 && <section id="pack-comparison" className="pack-comparison pack-container" aria-labelledby="comparison-title">
        <div className="pack-section-heading"><h2 id="comparison-title">Compare {isMonthly ? "monthly editing capacity" : "single-video scope"}.</h2><p>Pick the option that fits the work you have ready.</p></div>
        <p className="pack-table-hint">Scroll to compare all packages on smaller screens.</p>
        <div className="pack-table-scroll neo-surface" role="region" aria-label={`${isMonthly ? "Monthly packages" : "Single-video"} package comparison`} tabIndex={0}>
          <table><caption className="sr-only">{isMonthly ? "Monthly editing hours and prices" : "Single-video scope, turnaround, and prices"}</caption><thead><tr><th scope="col">Package details</th>{packs.map((pack) => <th key={pack.slug} scope="col"><span>{pack.name}</span><small>{formatPackagePrice(pack.basePrice)} {isMonthly ? "/ month" : "/ video"}</small></th>)}</tr></thead>
            <tbody>{comparisonRows(packs).map((row) => <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={packs[index]?.slug}>{value}</td>)}</tr>)}</tbody>
            <tfoot><tr><th scope="row">Choose a package</th>{packs.map((pack) => <td key={pack.slug}><Link to={getCheckoutUrl(pack)} className="pack-text-link">Choose {pack.name}<ArrowRight size={15} aria-hidden="true" /></Link></td>)}</tr></tfoot>
          </table>
        </div>
      </section>}

      <section className="pack-faq pack-container" aria-labelledby="faq-title">
        <div className="pack-faq-intro"><h2 id="faq-title">A few useful details.</h2><p>See how one-off edits and monthly editing hours work before you choose.</p><Link to="/faq" className="pack-text-link">Visit all FAQs <ArrowRight size={15} aria-hidden="true" /></Link></div>
        <div className="pack-questions">{questions.map(({ question, answer }) => <details key={question} className="neo-card"><summary>{question}<ChevronDown aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
      </section>

      <section className="pack-final pack-container neo-surface" aria-labelledby="final-title">
        <span className="pack-final-icon neo-inset"><Image size={28} aria-hidden="true" /></span>
        <h2 id="final-title">Ready for your next edit?</h2>
        <p>Choose a single video or reserve the monthly editing time your channel needs.</p>
        <a href="#editing-packs" className="neo-button pack-button">Compare packages <ArrowRight size={17} aria-hidden="true" /></a>
      </section>
    </div>
  );
}
