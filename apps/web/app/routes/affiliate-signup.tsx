import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { findUserById } from "@edicut/db/repositories/users";
import { getDbFromContext } from "../lib/db.server";
import { isMissingAffiliateSchema, loadPartnerProgram, saveApplication } from "../lib/affiliate-program.server";
import { destroySession, getSession, requireUserId } from "../lib/session.server";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { ArrowRight, ArrowUpRight, BadgeCheck, Handshake, TicketPercent } from "lucide-react";
import { AffiliateProgramFilm } from "../components/site/AffiliateProgramFilm";
import "../styles/affiliate-signup.css";

const SIGNUP_PATH = "/affiliate-signup";

export const meta: MetaFunction = () => [
  { title: "Apply to the EdiCut affiliate program" },
  { name: "robots", content: "noindex, nofollow, noarchive" },
];

export function headers() {
  return { "Cache-Control": "no-store, private", "Referrer-Policy": "same-origin" };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await getSession(request.headers.get("Cookie"), context);
  if (typeof session.get("userId") !== "string") {
    return { program: null, requiresSignIn: true };
  }
  const userId = await requireUserId(request, context, SIGNUP_PATH);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);

  if (!user?.active || user.deletedAt) {
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect(`/signin?redirectTo=${encodeURIComponent(SIGNUP_PATH)}`, {
      headers: { "Set-Cookie": await destroySession(session, context) },
    });
  }

  try {
    const program = await loadPartnerProgram(db, userId, new URL(request.url).origin);
    return { program, requiresSignIn: false };
  } catch (error) {
    if (isMissingAffiliateSchema(error)) return { program: null, requiresSignIn: false };
    throw error;
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  if (requestBodyExceedsLimit(request, 16 * 1024)) {
    return { error: "Your application is too large. Please shorten the details and try again." };
  }

  const formData = await readMutationForm(request, 16 * 1024);
  if (!formData) return { error: "Submit a valid application under 16 KB." };
  if (formData.get("intent") !== "affiliate-apply") return { error: "Choose a valid application action." };

  const userId = await requireUserId(request, context, SIGNUP_PATH);
  const limit = await consumeUsageLimit({
    context,
    request,
    bindingName: "USER_ACTION_LIMITER",
    key: `user:${userId}`,
    localLimit: 12,
    localPeriodSeconds: 60 * 60,
  });
  if (limit !== "allowed") {
    return {
      error: limit === "limited"
        ? "You have sent several applications recently. Please try again later."
        : "Application protection is temporarily unavailable. Please try again shortly.",
    };
  }

  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);
  if (!user?.active || user.deletedAt) {
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect(`/signin?redirectTo=${encodeURIComponent(SIGNUP_PATH)}`, {
      headers: { "Set-Cookie": await destroySession(session, context) },
    });
  }

  try {
    return await saveApplication(db, userId, {
      whatsappPhone: readText(formData, "whatsappPhone"),
      socialMedia: readText(formData, "socialMedia"),
      promotionPlan: readText(formData, "promotionPlan"),
    });
  } catch (error) {
    if (isMissingAffiliateSchema(error)) {
      return { error: "Applications are temporarily unavailable while the affiliate program is being updated." };
    }
    throw error;
  }
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export default function AffiliateSignupPage() {
  const { program, requiresSignIn } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const application = program?.application;
  const approved = application?.status === "approved" || Boolean(program?.active && program.code);
  const pending = application?.status === "pending";
  const closed = program?.settings.applicationsOpen === false;

  return (
    <main className="affiliate-page">
      <div className="affiliate-container">
        <header className="affiliate-brandbar">
          <Link to="/" aria-label="EdiCut home" className="affiliate-brand"><img src="/icons/edicut-logo.svg" alt="EdiCut" width="1162" height="506" /></Link>
          <span className="affiliate-brandbar__label"><Handshake size={17} aria-hidden="true" />Creator partnerships</span>
          <a href="#affiliate-application" className="affiliate-brandbar__apply">{approved ? "Your account" : pending ? "Your application" : "Apply to partner"}<ArrowUpRight size={16} aria-hidden="true" /></a>
        </header>
        <div className="affiliate-layout">
        <section className="affiliate-story" aria-labelledby="affiliate-signup-title">
          <header className="affiliate-intro">
            <h1 id="affiliate-signup-title">Share great editing.<br />Grow with EdiCut.</h1>
            <p>Introduce creators to their next editing partner. Give your audience a saving, and earn from the work you bring our way.</p>
          </header>
          <AffiliateProgramFilm />
          <section className="affiliate-terms" aria-label="Default affiliate program rates">
            <Term value="10%" title="For you" copy="Commission on eligible paid orders." icon="commission" />
            <Term value="10%" title="For your audience" copy="Discount when they use your coupon." icon="discount" />
            <p className="affiliate-terms__note">Default rates shown. Your commission, discount, attribution, and payout terms are confirmed after review.</p>
          </section>
        </section>

        <section id="affiliate-application" className="affiliate-application" aria-labelledby="affiliate-application-title">
          <div className="affiliate-application__heading"><span className="affiliate-application__symbol"><Handshake size={22} aria-hidden="true" /></span><p>Partner application</p></div>
          <h2 id="affiliate-application-title">{approved ? "Welcome to the partnership." : pending ? "You’re on our list." : "Let’s grow together."}</h2>
          {!approved && !pending ? <p className="affiliate-application__intro">Tell us how to reach you and how you’d introduce EdiCut to your community.</p> : null}

          {actionData?.error ? <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-800" role="alert">{actionData.error}</p> : null}
          {actionData?.success ? <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-900" role="status">{actionData.success}</p> : null}

          {requiresSignIn ? (
            <div className="mt-5 rounded-2xl bg-[#e6edf3] p-5 text-sm leading-6 text-[#536779]" role="status">
              <p>Sign in to your EdiCut account to submit an application and check your partner status. You can share this page with a creator who wants to apply.</p>
              <Link to={`/signin?redirectTo=${encodeURIComponent(SIGNUP_PATH)}`} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#c91d37] px-4 text-sm font-black text-white transition hover:bg-[#a91b31] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a91b31]">Sign in to apply</Link>
            </div>
          ) : program === null || !program.schemaReady ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="status">
              Affiliate applications are temporarily unavailable while the program setup is completed. Please check back later.
            </div>
          ) : approved ? (
            <div className="mt-5 rounded-2xl bg-[#e6edf3] p-5 shadow-[inset_4px_4px_12px_rgba(132,148,163,.18),inset_-4px_-4px_12px_rgba(255,255,255,.9)]">
              <p className="text-sm font-bold leading-6 text-[#405160]">{program?.active ? "Your affiliate account is active. Open your dashboard to get your referral link, coupon code, and payment tracking." : "Your application was approved. Open your dashboard to check your partner account and current status."}</p>
              <Link to="/dashboard/affiliates" className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#c91d37] px-5 text-sm font-black text-white shadow-[0_8px_18px_rgba(201,29,55,.18)] transition hover:bg-[#a91b31] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a91b31] sm:w-auto">
                Open affiliate dashboard <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
              </Link>
            </div>
          ) : pending ? (
            <div className="mt-5 rounded-2xl bg-[#e6edf3] p-5 shadow-[inset_4px_4px_12px_rgba(132,148,163,.18),inset_-4px_-4px_12px_rgba(255,255,255,.9)]" role="status">
              <p className="inline-flex min-h-8 items-center rounded-full bg-[#fff0d0] px-3 text-xs font-black text-[#714b0a]">Awaiting review</p>
              <p className="mt-3 text-sm leading-6 text-[#536779]">Your application was received. Referral links and coupon codes become available only after approval.</p>
              {application?.reviewNote ? <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm leading-6 text-[#536779]">Team note: {application.reviewNote}</p> : null}
              <p className="mt-3 text-xs text-[#536779]">Submitted {new Date(application!.createdAt).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" })}</p>
            </div>
          ) : closed ? (
            <div className="mt-5 rounded-2xl bg-[#e6edf3] p-5 text-sm leading-6 text-[#536779]" role="status">
              Applications are closed right now. Please check back later for the next application window.
            </div>
          ) : (
            <>
              {application?.status === "rejected" ? (
                <div className="mt-5 rounded-2xl bg-[#e6edf3] p-4 text-sm leading-6 text-[#536779]" role="status">
                  <p className="font-black text-[#17202a]">You can submit an updated application.</p>
                  {application.reviewNote ? <p className="mt-2">Team note: {application.reviewNote}</p> : <p className="mt-2">Your previous application was not approved. Please update your contact details and promotion plan before applying again.</p>}
                </div>
              ) : null}
              <Form method="post" className="mt-5 grid gap-4">
              <input type="hidden" name="intent" value="affiliate-apply" />
              <label className="grid min-w-0 gap-2 text-xs font-black text-[#536779]">
                WhatsApp phone number
                <input name="whatsappPhone" type="tel" required maxLength={28} autoComplete="tel" inputMode="tel" pattern="\+[1-9][0-9 .()\-]{6,22}" aria-describedby="affiliate-whatsapp-help" placeholder="+44 20 7946 0123" className="min-h-12 w-full min-w-0 rounded-xl border border-white bg-[#f7f9fb] px-4 text-sm font-semibold text-[#17202a] shadow-[inset_3px_3px_8px_rgba(132,148,163,.12),inset_-3px_-3px_8px_rgba(255,255,255,.86)] outline-none focus-visible:ring-2 focus-visible:ring-[#c91d37]" disabled={submitting} />
                <span id="affiliate-whatsapp-help" className="text-[11px] font-medium leading-5 text-[#536779]">Include your country code, for example +44. We’ll use it only if we need to contact you about your application.</span>
              </label>
              <label className="grid min-w-0 gap-2 text-xs font-black text-[#536779]">
                <span className="affiliate-field-label">Social media profile links <span className="affiliate-optional">Optional</span></span>
                <textarea name="socialMedia" maxLength={2000} rows={3} aria-describedby="affiliate-social-help" placeholder={"https://youtube.com/@yourchannel\nhttps://instagram.com/yourname"} className="w-full min-w-0 resize-y rounded-xl border border-white bg-[#f7f9fb] px-4 py-3 text-sm font-medium leading-6 text-[#17202a] shadow-[inset_3px_3px_8px_rgba(132,148,163,.12),inset_-3px_-3px_8px_rgba(255,255,255,.86)] outline-none focus-visible:ring-2 focus-visible:ring-[#c91d37]" disabled={submitting} />
                <span id="affiliate-social-help" className="text-[11px] font-medium leading-5 text-[#536779]">Add up to five public HTTPS profile links, one per line.</span>
              </label>
              <label className="grid min-w-0 gap-2 text-xs font-black text-[#536779]">
                How would you promote EdiCut?
                <textarea name="promotionPlan" required minLength={2} maxLength={4000} rows={4} placeholder="For example: a tutorial, a creator resource page, or a recommendation to your community." className="w-full min-w-0 resize-y rounded-xl border border-white bg-[#f7f9fb] px-4 py-3 text-sm font-medium leading-6 text-[#17202a] shadow-[inset_3px_3px_8px_rgba(132,148,163,.12),inset_-3px_-3px_8px_rgba(255,255,255,.86)] outline-none focus-visible:ring-2 focus-visible:ring-[#c91d37]" disabled={submitting} />
              </label>
              <p className="text-xs leading-5 text-[#536779]">Submitting an application does not activate a referral code or guarantee acceptance. We will confirm your commission, discount, and payout terms after review.</p>
              <button type="submit" disabled={submitting || !program?.schemaReady} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#c91d37] px-5 text-sm font-black text-white shadow-[0_8px_18px_rgba(201,29,55,.18)] transition hover:bg-[#a91b31] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a91b31] disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? "Sending application…" : "Submit for review"}
                {!submitting ? <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span> : null}
              </button>
              </Form>
            </>
          )}

          <p className="affiliate-application__note"><BadgeCheck size={16} aria-hidden="true" /><span>Your application stays with your EdiCut account. Check your status here any time.</span></p>
        </section>
        </div>
        <footer className="affiliate-footer"><p>Good editing. Thoughtful partnerships.</p><Link to="/">Explore EdiCut<ArrowUpRight size={14} aria-hidden="true" /></Link></footer>
      </div>
    </main>
  );
}

function Term({ value, title, copy, icon }: { value: string; title: string; copy: string; icon: "commission" | "discount" }) {
  return (
    <div className="affiliate-term">
      <div className="affiliate-term__heading">{icon === "commission" ? <ArrowRight size={16} aria-hidden="true" /> : <TicketPercent size={17} aria-hidden="true" />}<span>{title}</span></div>
      <strong>{value}</strong><p>{copy}</p>
    </div>
  );
}
