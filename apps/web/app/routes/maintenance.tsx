import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { ADMIN_LOGIN_PATH } from "../lib/admin-paths";

export const meta: MetaFunction = () => [
  { title: "EdiCut is under maintenance" },
  { name: "robots", content: "noindex, nofollow, noarchive" },
];

export default function MaintenancePage() {
  return (
    <main className="min-h-screen neo-home flex items-center justify-center px-5 py-16 text-foreground">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-center">
        <section className="neo-surface w-full rounded-[2.5rem] p-8 text-center sm:p-14 shadow-2xl">
          <div className="neo-icon-badge mx-auto flex h-16 w-16 items-center justify-center rounded-2xl neo-red-glow">
            <span className="material-symbols-outlined text-[32px]">build</span>
          </div>

          <div className="mt-8">
            <span className="neo-pill inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider neo-section-label">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Scheduled Maintenance
            </span>
          </div>

          <h1 className="yt-title mt-5 text-4xl font-black neo-ink sm:text-5xl">
            We’re tuning up the render pipeline.
          </h1>

          <p className="mx-auto mt-4 max-w-lg yt-subtitle leading-relaxed neo-muted">
            EdiCut is temporarily undergoing system upgrades to boost rendering speed and asset processing. We will be back online shortly.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="neo-button neo-button--primary text-xs uppercase tracking-wider font-black"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              Check Status
            </button>
            <Link
              to={ADMIN_LOGIN_PATH}
              className="neo-card inline-flex h-11 items-center gap-2 rounded-xl px-5 text-xs font-black neo-ink transition hover:border-primary/40"
            >
              <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
              Staff Portal
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
