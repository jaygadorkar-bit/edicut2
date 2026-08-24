import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useMemo, useState } from "react";
import { ButtonLink, ComparisonTable, ContactSection, PageShell, TrustStrip } from "../components/site/Marketing.js";
import { getDbFromContext } from "../lib/db.server";
import { getPricingPackages, publicPricingPackages } from "../lib/pricing.server";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { optimizeCloudinaryUrl } from "../lib/cloudinary";
import {
  SUBSCRIPTION_PACKAGES,
  getCheckoutTotal,
  getCheckoutUrl,
  getPackageIndex,
  getSubscriptionPackage,
  type SubscriptionPackage,
} from "../lib/subscriptions";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.subscription ? `${data.subscription.name} Subscription | EdiCut` : "Editing Package | EdiCut" },
  { name: "description", content: data?.subscription?.description || "EdiCut creator editing package details." },
];

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context);
  const packages = publicPricingPackages(await getPricingPackages(db, context));
  const packageIndex = getPackageIndex(params.slug || "", packages);
  const pkg = packages[packageIndex] || packages[0];

  if (!pkg) {
    throw new Response("Package not found", { status: 404 });
  }

  return { pkg, packages, packageIndex, subscription: getSubscriptionPackage(pkg.name, params.slug || pkg.slug, packageIndex) };
}

export default function PackagePage() {
  const { pkg, packageIndex, subscription } = useLoaderData<typeof loader>();
  const featureCards = [
    ["paid", "Base Subscription", `Starts at $${subscription.basePrice}/mo`],
    ["podcasts", "Finished Video Coverage", `Up to 60 min for +$${subscription.finishedRuntimePrice}`],
    ["video_file", "Raw Footage Capacity", `Up to 600 min for +$${subscription.rawFootagePrice}`],
    ["workspace_premium", "Channel Tier", subscription.badge],
  ];

  return (
    <PageShell>
      {/* Hero & Subscription Builder Section */}
      <section className="relative overflow-hidden border-b neo-line px-5 pb-16 pt-16 sm:px-6 lg:pb-24 lg:pt-20">
        <div className="pointer-events-none absolute -right-24 top-16 h-72 w-72 rounded-full bg-[#e2c9ce]/35 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-[#cbdbe8]/60 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_400px]">
          <div>
            <div className="neo-pill inline-flex items-center gap-2 rounded-full px-4 py-2 yt-tag tracking-[0.16em] neo-section-label">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {subscription.badge} Package
            </div>

            <h1 className="yt-display mt-7 neo-ink">{subscription.name} Plan</h1>
            <p className="yt-subtitle mt-6 max-w-2xl leading-8 neo-muted">{subscription.description}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              {[
                ["Base Plan", `$${subscription.basePrice}/mo`],
                ["Podcast Coverage", `+$${subscription.finishedRuntimePrice}`],
                ["Raw Vlog Coverage", `+$${subscription.rawFootagePrice}`],
              ].map(([label, val]) => (
                <div key={label} className="neo-pill rounded-2xl px-4 py-2.5">
                  <p className="text-xs font-black uppercase tracking-wider neo-muted">{label}</p>
                  <p className="mt-0.5 text-base font-black neo-ink">{val}</p>
                </div>
              ))}
            </div>

            {/* Quick Benefits */}
            <div className="neo-surface mt-10 rounded-[2rem] p-6 sm:p-8">
              <p className="yt-tag neo-section-label">Best suited for</p>
              <h3 className="mt-2 text-2xl font-black neo-ink">{subscription.bestFor}</h3>
              <p className="mt-3 yt-small leading-relaxed neo-muted">
                Select your base subscription, customize footage and runtime coverage on the right, and proceed directly to onboarding.
              </p>
            </div>
          </div>

          {/* Sticky Builder Sidebar */}
          <aside className="h-fit lg:sticky lg:top-24">
            <SubscriptionBuilder subscription={subscription} />
            <Link
              to="/pricing"
              className="neo-card mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl p-4 text-sm font-black neo-ink transition hover:border-primary/40"
            >
              <span className="material-symbols-outlined text-[18px]">compare_arrows</span>
              Compare All Editing Plans
            </Link>
          </aside>
        </div>
      </section>

      {/* Gallery Section */}
      {pkg.galleryImages.length ? (
        <section className="border-b neo-line px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <p className="yt-tag neo-section-label">Visual Showcase</p>
            <h2 className="mt-3 yt-title font-black neo-ink">Package style previews</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {pkg.galleryImages.map((imageUrl, index) => (
                <div
                  key={imageUrl}
                  className={`neo-card overflow-hidden rounded-2xl p-2 ${index === 0 ? "md:col-span-2 md:row-span-2" : ""}`}
                >
                  <img
                    src={optimizeCloudinaryUrl(imageUrl)}
                    alt={`${pkg.name} package gallery image ${index + 1}`}
                    className="aspect-video w-full rounded-xl object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Feature Specs Cards */}
      <section className="border-b neo-line px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map(([icon, title, desc]) => (
              <article key={title} className="neo-card rounded-2xl p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[22px]">{icon}</span>
                </span>
                <p className="mt-5 text-base font-black neo-ink">{title}</p>
                <p className="mt-1 text-sm font-medium neo-muted">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Deliverables Matrix */}
      <section className="border-b neo-line px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="neo-surface rounded-[2rem] p-6 sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="yt-tag neo-section-label">Included in every cut</p>
                <h2 className="mt-2 yt-title font-black neo-ink">Package deliverables</h2>
              </div>
              <ButtonLink to={getCheckoutUrl(subscription)}>Get started with {subscription.name}</ButtonLink>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subscription.deliverables.map((item) => (
                <div key={item} className="neo-inset flex items-center gap-3 rounded-xl p-3.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                    <span className="material-symbols-outlined text-[14px]">check</span>
                  </span>
                  <span className="text-sm font-bold neo-ink">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Full Comparison Table */}
      <section className="border-b neo-line px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <ComparisonTable />
        </div>
      </section>

      {/* Other Packages */}
      <section className="border-b neo-line px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="yt-tag neo-section-label">Alternative Tiers</p>
            <h2 className="mt-3 yt-title font-black neo-ink">Explore other packages</h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {SUBSCRIPTION_PACKAGES.filter((_, index) => index !== packageIndex).map((item) => (
              <Link
                key={item.slug}
                to={`/pricing/${item.slug}`}
                className="neo-card flex flex-col justify-between rounded-2xl p-6 transition hover:border-primary/40"
              >
                <div>
                  <span className="neo-pill rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider neo-muted">
                    {item.badge}
                  </span>
                  <p className="mt-4 text-xl font-black neo-ink">{item.name}</p>
                  <p className="mt-2 text-sm font-medium leading-relaxed neo-muted">{item.description}</p>
                </div>
                <div className="mt-6 border-t neo-line pt-4 flex items-baseline gap-1">
                  <span className="yt-title font-black neo-ink">${item.basePrice}</span>
                  <span className="yt-small font-bold neo-muted">/month</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <TrustStrip />
      <ContactSection compact />
    </PageShell>
  );
}

function SubscriptionBuilder({ subscription }: { subscription: SubscriptionPackage }) {
  const [includeFinishedRuntime, setIncludeFinishedRuntime] = useState(false);
  const [includeRawFootage, setIncludeRawFootage] = useState(false);
  const total = useMemo(
    () =>
      getCheckoutTotal(subscription, {
        runtime: includeFinishedRuntime,
        raw: includeRawFootage,
      }),
    [includeFinishedRuntime, includeRawFootage, subscription]
  );
  const checkoutHref = getCheckoutUrl(subscription, {
    runtime: includeFinishedRuntime,
    raw: includeRawFootage,
  });

  return (
    <section className="neo-surface rounded-[2rem] p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <p className="yt-tag neo-section-label">Configure plan</p>
        <span className="neo-pill rounded-full px-2.5 py-1 text-[11px] font-black uppercase neo-muted">
          Instant Setup
        </span>
      </div>
      <h2 className="mt-2 text-2xl font-black neo-ink">{subscription.name}</h2>

      <div className="neo-inset mt-5 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black neo-ink">Base monthly package</p>
            <p className="mt-0.5 text-xs font-medium neo-muted">Core editing pipeline & sound design.</p>
          </div>
          <p className="text-xl font-black neo-ink">${subscription.basePrice}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <OptionCheckbox
          checked={includeFinishedRuntime}
          icon="podcasts"
          label="Finished duration booster"
          description="Add 60 min finished podcast/episode coverage."
          price={subscription.finishedRuntimePrice}
          onChange={setIncludeFinishedRuntime}
        />
        <OptionCheckbox
          checked={includeRawFootage}
          icon="video_file"
          label="Extra raw footage booster"
          description="Add 600 min raw vlog/stream footage coverage."
          price={subscription.rawFootagePrice}
          onChange={setIncludeRawFootage}
        />
      </div>

      <div className="mt-6 border-t neo-line pt-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="yt-tag font-black uppercase tracking-[0.14em] neo-muted">Estimated monthly total</p>
            <p className="mt-0.5 text-xs font-medium neo-muted">Includes revisions & thumbnail</p>
          </div>
          <p className="text-4xl font-black tracking-tight neo-ink">${total}</p>
        </div>
      </div>

      <Link
        to={checkoutHref}
        className="neo-button neo-button--primary mt-6 w-full justify-center text-sm font-black uppercase tracking-wider"
      >
        <span>Proceed to checkout</span>
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </Link>
      <p className="mt-3 text-center text-xs font-medium neo-muted">Sign in or create an account at next step.</p>
    </section>
  );
}

function OptionCheckbox({
  checked,
  icon,
  label,
  description,
  price,
  onChange,
}: {
  checked: boolean;
  icon: string;
  label: string;
  description: string;
  price: number;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`neo-card flex cursor-pointer items-start gap-3 rounded-xl p-3.5 transition ${
        checked ? "ring-2 ring-primary bg-[#fdf2f4]" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-1 h-4 w-4 accent-red-600"
      />
      <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black neo-ink">{label}</span>
        <span className="mt-0.5 block text-xs font-medium leading-relaxed neo-muted">{description}</span>
      </span>
      <span className="text-sm font-black neo-ink">+${price}</span>
    </label>
  );
}
