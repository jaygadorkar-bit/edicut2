import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ContactSection, PageShell } from "../components/site/Marketing.js";
import { getDbFromContext } from "../lib/db.server";
import { getPricingPackages, publicPricingPackages } from "../lib/pricing.server";
import { optimizeCloudinaryUrl } from "../lib/cloudinary";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.pkg ? `${data.pkg.name} Editing Package | EdiCut` : "Editing Package | EdiCut" },
  { name: "description", content: data?.pkg?.description || "EdiCut creator editing package details." },
];

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const packages = publicPricingPackages(await getPricingPackages(db));
  const pkg = packages.find((item) => item.slug === params.slug) || packages[0];

  if (!pkg) {
    throw new Response("Package not found", { status: 404 });
  }

  return { pkg, packages };
}

export default function PackagePage() {
  const { pkg, packages } = useLoaderData<typeof loader>();
  const featureCards = [
    ["schedule", pkg.turnaround || "Flexible turnaround"],
    ["rate_review", pkg.revisions || "Revision rounds included"],
    ["workspace_premium", pkg.badge || "Creator editing lane"],
    ["inventory_2", `${pkg.deliverables.length || pkg.features.length} core deliverables`],
  ];

  return (
    <PageShell active="Pricing">
      <section className="px-5 pb-16 pt-32 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_380px]">
          <div>
            {pkg.badge ? <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black uppercase text-primary">{pkg.badge}</span> : null}
            <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl">{pkg.name} Editing Package</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{pkg.description}</p>
            <div className="mt-8 flex flex-wrap gap-4 text-sm font-black text-muted-foreground">
              <span>{pkg.turnaround || "Custom"} turnaround</span>
              <span>{pkg.revisions || "Revisions included"}</span>
              <span>{pkg.features[0] || "Creator-ready edits"}</span>
            </div>
          </div>
          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-black/5 lg:sticky lg:top-24">
            <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">{pkg.name} plan</p>
            <p className="mt-3 text-5xl font-black">
              {pkg.price}<span className="text-sm text-muted-foreground">{pkg.interval}</span>
            </p>
            <ul className="mt-6 space-y-3 text-sm font-bold text-slate-800">
              {pkg.features.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">check</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link to="/contact" className="mt-7 inline-flex w-full justify-center rounded-2xl bg-primary px-5 py-4 text-sm font-black text-white">Start package</Link>
            <Link to="/pricing" className="mt-3 inline-flex w-full justify-center rounded-2xl border border-gray-200 px-5 py-4 text-sm font-black">Compare packages</Link>
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

      <section className="px-5 py-20 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Best for</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight">{pkg.bestFor || "Creators who need a predictable editing lane."}</h2>
            <p className="mt-5 leading-8 text-muted-foreground">
              This package keeps scope, delivery, and review expectations visible before a project starts, so your upload calendar stays predictable.
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-2xl font-black">Deliverables</h3>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {(pkg.deliverables.length ? pkg.deliverables : pkg.features).map((item) => (
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
            {packages.filter((item) => item.id !== pkg.id).map((item) => (
              <Link key={item.id} to={`/pricing/${item.slug}`} className="rounded-2xl border border-gray-200 bg-white p-6 ">
                <p className="text-xl font-black">{item.name}</p>
                <p className="mt-2 text-sm font-bold text-muted-foreground">{item.description}</p>
                <p className="mt-5 text-3xl font-black">{item.price}<span className="text-sm text-muted-foreground">{item.interval}</span></p>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <ContactSection compact />
    </PageShell>
  );
}
