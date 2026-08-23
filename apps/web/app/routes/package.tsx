import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useMemo, useState } from "react";
import { ComparisonTable, ContactSection, PageShell } from "../components/site/Marketing.js";
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
    ["paid", `Base starts at $${subscription.basePrice}`],
    ["podcasts", `60 min podcast $${subscription.finishedRuntimePrice}`],
    ["video_file", `600 min raw footage $${subscription.rawFootagePrice}`],
    ["workspace_premium", subscription.badge],
  ];

  return (
    <PageShell>
      <section className="px-5 pb-16 pt-32 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_380px]">
          <div>
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black uppercase text-primary">{subscription.badge}</span>
            <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl">{subscription.name} Subscription</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{subscription.description}</p>
            <div className="mt-8 flex flex-wrap gap-4 text-sm font-black text-muted-foreground">
              <span>Base package ${subscription.basePrice}</span>
              <span>60 min podcast ${subscription.finishedRuntimePrice}</span>
              <span>600 min raw vlog ${subscription.rawFootagePrice}</span>
            </div>
          </div>
          <aside className="h-fit lg:sticky lg:top-24">
            <SubscriptionBuilder subscription={subscription} />
            <Link to="/pricing" className="mt-3 inline-flex w-full justify-center rounded-lg border border-gray-200 bg-white px-5 py-4 text-sm font-black">Compare packages</Link>
          </aside>
        </div>
      </section>

      {pkg.galleryImages.length ? (
        <section className="bg-secondary px-5 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Gallery</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight">Package preview</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {pkg.galleryImages.map((imageUrl, index) => (
                <img
                  key={imageUrl}
                  src={optimizeCloudinaryUrl(imageUrl)}
                  alt={`${pkg.name} package gallery image ${index + 1}`}
                  className={`aspect-video w-full rounded-2xl border border-gray-200 bg-white object-cover shadow-sm ${index === 0 ? "md:col-span-2 md:row-span-2 md:aspect-[16/10]" : ""}`}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="bg-secondary px-5 py-20 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-4">
          {featureCards.map(([icon, text]) => (
            <article key={text} className="rounded-2xl border border-gray-200 bg-white p-6">
              <span className="material-symbols-outlined text-primary">{icon}</span>
              <p className="mt-4 text-xl font-black">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <ComparisonTable />
        </div>
      </section>

      <section className="px-5 py-20 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Best for</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight">{subscription.bestFor}</h2>
            <p className="mt-5 leading-8 text-muted-foreground">
              Select the base subscription, add finished runtime coverage, add extra raw footage coverage, or combine both before sending the request.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-2xl font-black">Deliverables</h3>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {subscription.deliverables.map((item) => (
                <li key={item} className="flex gap-2 rounded-xl bg-secondary p-3 text-sm font-bold">
                  <span className="material-symbols-outlined text-[18px] text-primary">check</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-secondary px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-black tracking-tight">Other packages</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {SUBSCRIPTION_PACKAGES.filter((_, index) => index !== packageIndex).map((item) => (
              <Link key={item.slug} to={`/pricing/${item.slug}`} className="rounded-2xl border border-gray-200 bg-white p-6 ">
                <p className="text-xl font-black">{item.name}</p>
                <p className="mt-2 text-sm font-bold text-muted-foreground">{item.description}</p>
                <p className="mt-5 text-3xl font-black">${item.basePrice}<span className="text-sm text-muted-foreground"> base</span></p>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <ContactSection compact />
    </PageShell>
  );
}

function SubscriptionBuilder({ subscription }: { subscription: SubscriptionPackage }) {
  const [includeFinishedRuntime, setIncludeFinishedRuntime] = useState(false);
  const [includeRawFootage, setIncludeRawFootage] = useState(false);
  const total = useMemo(() => getCheckoutTotal(subscription, {
    runtime: includeFinishedRuntime,
    raw: includeRawFootage,
  }), [includeFinishedRuntime, includeRawFootage, subscription]);
  const checkoutHref = getCheckoutUrl(subscription, {
    runtime: includeFinishedRuntime,
    raw: includeRawFootage,
  });

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-xl shadow-black/5">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Choose subscription</p>
      <h2 className="mt-2 text-2xl font-black">{subscription.name}</h2>

      <div className="mt-5 rounded-lg border border-gray-200 bg-secondary p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black">Base package</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">Core creator editing subscription.</p>
          </div>
          <p className="text-xl font-black">${subscription.basePrice}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        <OptionCheckbox
          checked={includeFinishedRuntime}
          icon="podcasts"
          label="Finished video duration"
          description="Add 60 min finished podcast/runtime coverage."
          price={subscription.finishedRuntimePrice}
          onChange={setIncludeFinishedRuntime}
        />
        <OptionCheckbox
          checked={includeRawFootage}
          icon="video_file"
          label="Extra raw video"
          description="Add 600 min raw vlog footage coverage."
          price={subscription.rawFootagePrice}
          onChange={setIncludeRawFootage}
        />
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Estimated total</p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">Final quote may vary after footage review.</p>
          </div>
          <p className="text-4xl font-black">${total}</p>
        </div>
      </div>

      <Link to={checkoutHref} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-sm font-black text-white">
        Continue with subscription
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </Link>
      <p className="mt-3 text-center text-xs font-bold text-muted-foreground">Sign in opens first if you are not already logged in.</p>
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
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${checked ? "border-primary bg-red-50" : "border-gray-200 bg-white"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-1 h-4 w-4 accent-red-600"
      />
      <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black">{label}</span>
        <span className="mt-1 block text-xs font-bold leading-5 text-muted-foreground">{description}</span>
      </span>
      <span className="text-sm font-black">+${price}</span>
    </label>
  );
}
