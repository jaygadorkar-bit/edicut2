import type { LinksFunction, MetaFunction } from "react-router";
import { Link } from "react-router";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Clock,
  Columns2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { FaqSection } from "../components/site/FaqSection";
import { WhyHireUsFilm } from "../components/site/WhyHireUsFilm";
import { PageShell } from "../components/site/Marketing.js";
import { TeamArtwork, QualityArtwork, DeliveryArtwork } from "../components/site/WhyHireUsSection";
import { createRouteMeta } from "../lib/seo";
import whyHireStyles from "../styles/why-hire-us.css?url";
import whyHirePageStyles from "../styles/why-hire-us-page.css?url";
import filmStyles from "../styles/why-hire-us-film.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: whyHireStyles },
  { rel: "stylesheet", href: whyHirePageStyles },
  { rel: "stylesheet", href: filmStyles },
];

export const meta: MetaFunction = (args) =>
  createRouteMeta(
    args,
    "Why Hire EdiCut: Studio Reliability vs. Freelancer Risk | YouTube Video Editing",
    "Meet your dedicated editor and project manager, get studio-reviewed edits, and manage projects, feedback, and downloads in one EdiCut dashboard.",
  );

const comparisonRows = [
  { category: "Your editor", solo: "One person, with limited backup", studio: "A dedicated editor, backed by a full team" },
  { category: "First cut", solo: "Depends on individual availability", studio: "A 48-hour target from your confirmed brief" },
  { category: "Quality control", solo: "You review every detail yourself", studio: "Editor review + creative director sign-off" },
  { category: "Project management", solo: "Files and feedback across different chats", studio: "One workspace for briefs, files, and feedback" },
  { category: "Pricing", solo: "Hourly rates and changing estimates", studio: "Clear packages, revision rounds, and add-ons" },
  { category: "Room to grow", solo: "Limited by one editor's capacity", studio: "Long-form, Shorts, podcasts, and thumbnails" },
];

const benefits = [
  { artwork: TeamArtwork, title: "An editor who knows your channel.", copy: "Your dedicated editor learns your pacing, references, and personality. A shared style guide keeps your videos consistent, even when a backup editor steps in.", note: "Dedicated editor + replacement coverage", icon: UsersRound },
  { artwork: QualityArtwork, title: "A second pair of expert eyes.", copy: "Your creative director checks the story, sound, captions, and brand details before a draft reaches you. Spend your review time on the creative decisions.", note: "Two stages of internal review", icon: ShieldCheck },
  { artwork: DeliveryArtwork, title: "An upload schedule you can keep.", copy: "A clear first-cut timeline and one place for your footage and feedback keep production moving. Add Shorts, podcast edits, or thumbnails as your channel grows.", note: "48-hour first-cut target", icon: Clock },
];

const faqs = [
  { q: "Will I work with the same editor?", a: "Yes. You have a primary editor who learns your channel's rhythm, humor, and pacing. Your shared style guide also helps our backup editors maintain the same approach when coverage is needed." },
  { q: "What if my editor is unavailable?", a: "A studio editor or creative lead can step in using your channel's style guide, timeline templates, and assets. Your project continues with the studio team behind it." },
  { q: "Can I start with just one video?", a: "Yes. Choose a single-video package to experience the editing and review process before deciding on a monthly plan. You can find both options on our pricing page." },
  { q: "How do you learn my channel's style?", a: "During onboarding, we collect your favorite videos, pacing references, typography, colors, and audio preferences. Your editor works from that profile, and the creative director checks each draft against it." },
  { q: "How do revisions work?", a: "Each package includes revision rounds. Leave timestamped feedback in your workspace or linked video player, and your editor works through the notes. Minor adjustments typically take around 24 hours." },
];

export default function WhyHireUsPage() {
  return (
    <PageShell className="studio-page">
      <section className="studio-opening studio-container" aria-label="Why hire the EdiCut studio">
        <WhyHireUsFilm />
        <div className="studio-intro">
          <div><p className="studio-kicker neo-section-label"><UsersRound size={15} aria-hidden="true" />Your team</p><h1>You create.<br />We handle the edit.</h1></div>
          <div className="studio-intro__copy">
            <p>A dedicated editor who gets your vision. A whole studio keeping it on track. Make better videos without making post-production your full-time job.</p>
          </div>
        </div>
        <ul className="studio-proof" aria-label="What comes with the studio">
          <li className="neo-card"><span className="studio-proof__icon neo-icon-badge"><Clock aria-hidden="true" /></span><div><strong>48-hour</strong><span>First-cut target</span></div></li>
          <li className="neo-card"><span className="studio-proof__icon neo-icon-badge"><UsersRound aria-hidden="true" /></span><div><strong>Your editor</strong><span>With a full team behind them</span></div></li>
          <li className="neo-card"><span className="studio-proof__icon neo-icon-badge"><BriefcaseBusiness aria-hidden="true" /></span><div><strong>Your manager</strong><span>Dedicated to your projects</span></div></li>
          <li className="neo-card"><span className="studio-proof__icon neo-icon-badge"><Check aria-hidden="true" /></span><div><strong>Clear pricing</strong><span>Know your scope from day one</span></div></li>
        </ul>
      </section>

      <section className="studio-benefits studio-container" aria-labelledby="studio-benefits-title">
        <div className="studio-section-heading"><h2 id="studio-benefits-title">Personal attention.<br />Studio-level support.</h2><p>Keep the creative connection of a dedicated editor, with the people and process to make it dependable.</p></div>
        <div className="studio-benefits__grid">{benefits.map(({ artwork: Artwork, title, copy, note, icon: Icon }) => (
          <article className="studio-benefit neo-surface group" key={title}><div className="studio-benefit__artwork"><Artwork /></div><h3>{title}</h3><p>{copy}</p><span className="studio-benefit__note neo-icon-badge"><Icon size={16} aria-hidden="true" />{note}</span></article>
        ))}</div>
      </section>

      <section className="studio-comparison" aria-labelledby="studio-comparison-title">
        <div className="studio-container">
          <div className="studio-section-heading"><div><p className="studio-kicker neo-section-label"><Columns2 size={15} aria-hidden="true" />Studio advantage</p><h2 id="studio-comparison-title">More support.<br />Less to manage.</h2></div><p>Great editing is only part of the job. Here’s how the studio model supports everything around it.</p></div>
          <div className="studio-comparison__table-wrap neo-surface"><table className="studio-comparison__table"><caption className="studio-sr-only">Working with a solo freelancer compared with the EdiCut studio</caption>
            <thead><tr><th scope="col"><span className="studio-sr-only">Service</span></th><th scope="col">Solo freelancer<span>An individual approach</span></th><th scope="col"><span className="studio-comparison__brand">EdiCut studio <ShieldCheck size={18} aria-hidden="true" /></span><span>A team in your corner</span></th></tr></thead>
            <tbody>{comparisonRows.map((row) => <tr key={row.category}><th scope="row">{row.category}</th><td>{row.solo}</td><td><span className="studio-comparison__answer"><Check size={17} aria-hidden="true" />{row.studio}</span></td></tr>)}</tbody>
          </table></div>
          <div className="studio-comparison__mobile">
            <dl>
              {comparisonRows.map((row) => (
                <div key={row.category}>
                  <dt>{row.category}</dt>
                  <dd><span className="studio-comparison__option-label">Solo freelancer</span><span>{row.solo}</span></dd>
                  <dd><span className="studio-comparison__option-label"><Check size={16} aria-hidden="true" />EdiCut studio</span><span>{row.studio}</span></dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="studio-comparison__footnote">Your first-cut timeline starts when your brief and footage are confirmed. Your chosen package defines deliverables and revision rounds.</p>
        </div>
      </section>

      <FaqSection items={faqs.map(({ q, a }) => ({ question: q, answer: a }))} />

      <section className="studio-closing studio-container" aria-labelledby="studio-closing-title">
        <div className="studio-closing__panel neo-surface group"><div><h2 id="studio-closing-title">Your next video.<br />Our next great edit.</h2><p>Start with one video, or find a monthly plan that fits your publishing rhythm.</p></div><div className="studio-closing__actions"><Link to="/pricing" className="studio-button neo-button neo-button--primary">See plans and pricing <ArrowRight size={17} aria-hidden="true" /></Link><Link to="/contact" className="studio-button neo-button neo-button--secondary">Let’s talk about your channel</Link><span>Single videos and monthly plans available.</span></div></div>
      </section>
    </PageShell>
  );
}
