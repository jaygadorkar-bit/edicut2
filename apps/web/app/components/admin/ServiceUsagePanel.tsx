import { useEffect, useRef, useState } from "react";
import type { getProviderUsageOverview } from "../../lib/provider-usage.server";

type ProviderUsage = Awaited<ReturnType<typeof getProviderUsageOverview>>;

const statusStyles = {
  connected: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-800",
  "not-configured": "bg-slate-100 text-slate-600",
  error: "bg-rose-50 text-rose-700",
} as const;

export function ServiceUsagePanel({ providers }: { providers: ProviderUsage }) {
  const [openHelpId, setOpenHelpId] = useState<string | null>(null);
  const openHelpRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openHelpId) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!openHelpRef.current?.contains(event.target as Node)) {
        setOpenHelpId(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenHelpId(null);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openHelpId]);

  return (
    <section aria-labelledby="service-usage-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="neo-workspace__eyebrow">Infrastructure</p>
          <h2 id="service-usage-heading" className="mt-1 text-lg font-black text-[#17202a]">Service usage</h2>
        </div>
        <p className="max-w-xl text-xs font-medium text-slate-500">Provider data may be delayed. Free-tier allowances are references unless the provider reports the exact limit; unmetered counters are labeled.</p>
      </div>

      {providers.length ? (
        <div className="grid items-start gap-3 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <article key={provider.id} className="neo-workspace__panel min-w-0 rounded-[20px] p-4" aria-label={`${provider.name} usage`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="neo-icon-badge flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" aria-hidden="true">
                    <span className="material-symbols-outlined text-[19px]">{provider.id === "cloudflare" ? "shield" : provider.id === "neon" ? "database" : provider.id === "supabase" ? "api" : "cloud"}</span>
                  </span>
                  <h3 className="neo-workspace__subpanel-title truncate text-sm">{provider.name}</h3>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyles[provider.status]}`}>
                  {provider.statusLabel}
                </span>
              </div>

              <dl className="mt-3 grid gap-1.5">
                {provider.cards.map((card) => {
                  const helpId = `usage-help-${provider.id}-${card.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                  const isHelpOpen = openHelpId === helpId;

                  return (
                    <div
                      key={card.label}
                      ref={isHelpOpen ? openHelpRef : null}
                      className={`relative grid min-w-0 gap-1 border-b border-slate-200/60 py-2 last:border-0 ${isHelpOpen ? "z-20" : ""}`}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <dt className="min-w-0 text-[10px] font-bold uppercase leading-4 tracking-wide text-slate-500">{card.label}</dt>
                        <dd className="max-w-[58%] shrink-0 whitespace-normal text-right text-xs font-black leading-5 text-slate-900" title={card.value}>
                          {card.help ? (
                            <button
                              type="button"
                              aria-label={`${card.label}: ${card.value}`}
                              aria-controls={helpId}
                              aria-expanded={isHelpOpen}
                              aria-describedby={isHelpOpen ? helpId : undefined}
                              onClick={() => setOpenHelpId(isHelpOpen ? null : helpId)}
                              className="cursor-help rounded-sm underline decoration-dotted decoration-slate-400 underline-offset-2 transition-colors hover:text-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                            >
                              {card.value}
                            </button>
                          ) : card.value}
                        </dd>
                      </div>
                      {card.help ? (
                        <dd
                          id={helpId}
                          role="tooltip"
                          hidden={!isHelpOpen}
                          className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-slate-200 bg-white p-3 text-[11px] font-medium leading-4 text-slate-600 shadow-xl"
                        >
                          {card.help}
                        </dd>
                      ) : null}
                      {typeof card.meterPercent === "number" && Number.isFinite(card.meterPercent) ? (
                        <dd className="flex items-center gap-2">
                          <div
                            role="meter"
                            aria-label={`${card.label} quota used`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.min(100, Math.max(0, card.meterPercent))}
                            aria-valuetext={`${card.meterPercent.toFixed(1)}% of allowance used`}
                            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200"
                          >
                            <span
                              aria-hidden="true"
                              className={`block h-full rounded-full ${card.meterPercent >= 90 ? "bg-rose-500" : card.meterPercent >= 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{ width: `${Math.min(100, Math.max(0, card.meterPercent))}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[10px] font-semibold text-slate-500">{card.meterPercent.toFixed(1)}%</span>
                        </dd>
                      ) : null}
                    </div>
                  );
                })}
              </dl>

            </article>
          ))}
        </div>
      ) : (
        <p className="neo-workspace__panel rounded-[20px] p-4 text-sm text-slate-600" role="status">
          Usage data is temporarily unavailable. Refresh this page to try again.
        </p>
      )}
    </section>
  );
}
