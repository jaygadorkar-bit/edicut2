import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { ADMIN_LOGIN_PATH } from "../lib/admin-paths";

export const meta: MetaFunction = () => [
  { title: "EdiCut is under maintenance" },
  { name: "robots", content: "noindex, nofollow, noarchive" },
];

export default function MaintenancePage() {
  return (
    <main className="min-h-screen bg-[#f4f5ff] px-6 py-16 text-[#15152a]">
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-[2rem] border border-[#dfe3f4] bg-white p-8 text-center shadow-[0_25px_80px_rgba(53,56,112,0.12)] sm:p-14">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#6d55e8] text-white shadow-lg shadow-[#6d55e8]/25">
            <span className="material-symbols-outlined text-[32px]">build</span>
          </div>
          <p className="mt-8 text-xs font-black uppercase tracking-[0.28em] text-[#6d55e8]">EdiCut</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] sm:text-5xl">We’re tuning things up.</h1>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium leading-7 text-[#6e728c]">
            EdiCut is temporarily unavailable while we finish improvements. Please check back soon.
          </p>
          <Link
            to={ADMIN_LOGIN_PATH}
            className="mt-9 inline-flex h-11 items-center gap-2 rounded-full border border-[#dfe3f4] px-5 text-sm font-black text-[#4d506b] transition hover:border-[#6d55e8] hover:text-[#6d55e8]"
          >
            <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
            Staff sign in
          </Link>
        </section>
      </div>
    </main>
  );
}
