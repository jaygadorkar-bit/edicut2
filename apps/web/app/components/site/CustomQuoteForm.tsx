import { useEffect, useRef, useState, type FormEvent } from "react";
import { Form, Link, useNavigation, useSubmit } from "react-router";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileText, Film, Layers, SlidersHorizontal, UserRound } from "lucide-react";
import { quoteBudgets, quoteCadences, quoteDurations, quoteFootage, quotePlatforms, quoteProjectTypes, quoteRatios, quoteRequestTypes, quoteRevisions, quoteServices, quoteStyles, quoteUrgencies, quoteOptionLabel, type CustomQuoteInput, type CustomQuoteOptions } from "@edicut/shared/contracts/custom-quotes";
import { PageShell } from "./Marketing";
import { executeInvisibleRecaptcha } from "../../lib/recaptcha.client";
import { validateQuoteDraft } from "../../lib/custom-quote-validation";
import type { QuoteActionResult } from "../../routes/custom-quote";
import type { MonthlyAddOnQuotePrefill } from "../../lib/package-addons";

type QuotePageData = { customer: { name: string; email: string; phone: string }; requestToken: string; today: string; submitted: { id: string; title: string; options: CustomQuoteOptions; status: string } | null; prefill?: MonthlyAddOnQuotePrefill | null };
type QuoteDraft = Omit<CustomQuoteInput, "requestToken" | "videoCount"> & { videoCount: string };
const fieldLabels: Record<string, string> = { title: "Project name", projectType: "Project type", requestType: "Request type", platforms: "Platforms", videoCount: "Number of videos", duration: "Finished video length", footage: "Raw footage", cadence: "Delivery schedule", aspectRatios: "Video formats", style: "Editing style", services: "Editing services", revisions: "Revisions", urgency: "Turnaround", budget: "Budget", deadline: "Delivery date", languages: "Languages", channelUrl: "Channel / brand link", footageUrl: "Footage link", referenceUrls: "Reference links", brief: "Your brief", phone: "Phone number", preferredContact: "Preferred contact", requestToken: "Request" };

export function CustomQuoteForm({ data, result }: { data: QuotePageData; result?: QuoteActionResult }) {
  return <PageShell className="custom-quote-page">
    {data.submitted ? <section className="quote-confirmation neo-surface" aria-labelledby="quote-confirmation-title">
      <span className="quote-confirmation-icon neo-icon-badge"><CheckCircle2 size={32} aria-hidden="true" /></span>
      <h1 id="quote-confirmation-title">Quote request received.</h1>
      <p className="quote-confirmation-message" role="status">We’ll contact you shortly.</p>
      <p>We’ll review the options for <strong>{data.submitted.title}</strong> and get in touch using your preferred contact method.</p>
      <div className="quote-confirmation-reference neo-inset"><FileText size={19} aria-hidden="true" /><span>Request reference <strong>{data.submitted.id.slice(0, 8).toUpperCase()}</strong></span></div>
      <p>We’ll confirm the scope, availability, and price with you before editing starts.</p>
      <div className="quote-confirmation-actions"><Link to="/custom-quote" className="neo-button">Request another quote</Link><Link to="/pricing" className="quote-text-link">Back to pricing <ArrowRight size={16} aria-hidden="true" /></Link></div>
    </section> : <QuoteBuilder data={data} result={result} />}
  </PageShell>;
}

function QuoteBuilder({ data, result }: { data: QuotePageData; result?: QuoteActionResult }) {
  const [values, setValues] = useState<QuoteDraft>({ title: "", phone: data.customer.phone, preferredContact: "email", projectType: "youtube", requestType: "single", platforms: ["youtube"], videoCount: "1", duration: "5to15", footage: "unsure", cadence: "once", aspectRatios: ["landscape"], style: "recommend", services: ["cuts", "audio"], revisions: "recommend", urgency: "flexible", budget: "discuss", deadline: "", languages: "", channelUrl: "", footageUrl: "", referenceUrls: "", brief: "", ...data.prefill });
  const [securityError, setSecurityError] = useState("");
  const [clientResult, setClientResult] = useState<QuoteActionResult>();
  const [checking, setChecking] = useState(false);
  const locked = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const navigation = useNavigation();
  const submit = useSubmit();
  const busy = checking || navigation.state !== "idle";
  const visibleResult = clientResult || result;
  const errors = visibleResult?.fieldErrors || {};
  const error = securityError || visibleResult?.error;
  const update = (name: keyof QuoteDraft, value: string | string[]) => setValues(current => ({ ...current, [name]: value }));
  useEffect(() => { if (navigation.state === "idle") { locked.current = false; setChecking(false); } }, [navigation.state]);
  useEffect(() => { if (error) alertRef.current?.focus(); }, [error, result, clientResult]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    setSecurityError("");
    const validation = validateQuoteDraft({ ...values, requestToken: data.requestToken }, data.today);
    setClientResult(validation);
    if (validation) return;
    locked.current = true;
    setChecking(true);
    const form = event.currentTarget;
    try { await executeInvisibleRecaptcha(form, "custom_quote"); await submit(form, { method: "post", action: "/custom-quote" }); }
    catch (cause) { setSecurityError(cause instanceof Error ? cause.message : "Your request could not be sent. Please try again."); }
    finally { locked.current = false; setChecking(false); }
  }

  const select = (name: keyof QuoteDraft, options: Record<string, string>) => <label className="quote-field" htmlFor={name}>
    <span>{fieldLabels[name]}</span><select id={name} name={name} value={String(values[name])} onChange={event => update(name, event.target.value)} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-error` : undefined} className="neo-inset">
      {Object.entries(options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select><FieldError name={name} error={errors[name]} />
  </label>;
  const choices = (name: "platforms" | "aspectRatios" | "services", options: Record<string, string>) => <fieldset className={`quote-choices${name === "services" ? " quote-choices--services" : ""}`} id={name} tabIndex={-1} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-error` : undefined}>
    <legend>{fieldLabels[name]} <span>Choose all that apply</span></legend>
    <div>{Object.entries(options).map(([value, label]) => <label key={value} className={`quote-option neo-inset${(values[name] as readonly string[]).includes(value) ? " is-selected" : ""}`}><input type="checkbox" name={name} value={value} checked={(values[name] as readonly string[]).includes(value)} onChange={event => update(name, event.target.checked ? [...values[name], value] : values[name].filter(item => item !== value))} /><span>{label}</span></label>)}</div>
    <FieldError name={name} error={errors[name]} />
  </fieldset>;
  const text = (name: "title" | "phone" | "languages" | "channelUrl" | "footageUrl" | "deadline" | "videoCount", type = "text", help?: string) => <label className="quote-field" htmlFor={name}>
    <span>{fieldLabels[name]}{["title", "videoCount"].includes(name) || (name === "phone" && values.preferredContact === "whatsapp") ? <span className="quote-required"> *</span> : <span className="quote-optional"> (optional)</span>}</span>
    <input id={name} name={name} type={type} value={values[name]} onChange={event => update(name, event.target.value)} className="neo-inset" required={name === "title" || name === "videoCount" || (name === "phone" && values.preferredContact === "whatsapp")} min={name === "videoCount" ? "1" : name === "deadline" ? data.today : undefined} max={name === "videoCount" ? "1000" : undefined} step={name === "videoCount" ? "1" : undefined} minLength={name === "title" ? 3 : undefined} maxLength={name === "title" ? 120 : name === "phone" ? 32 : name === "languages" ? 200 : type === "url" ? 1000 : undefined} autoComplete={name === "phone" ? "tel" : "off"} placeholder={name === "title" ? "e.g. Our next YouTube series" : name === "phone" ? "+880 …" : name === "languages" ? "e.g. English audio, Bengali subtitles" : type === "url" ? "https://" : undefined} aria-invalid={!!errors[name]} aria-describedby={[help ? `${name}-help` : "", errors[name] ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined} />
    {help ? <small id={`${name}-help`}>{help}</small> : null}<FieldError name={name} error={errors[name]} />
  </label>;
  const button = <button type="submit" disabled={busy} className="neo-button quote-submit">{busy ? "Sending your request…" : "Request my custom quote"}<ArrowRight size={18} aria-hidden="true" /></button>;

  return <div className="quote-page-container">
    <Link to="/pricing" className="quote-text-link quote-back"><ArrowLeft size={16} aria-hidden="true" />All packages</Link>
    <header className="quote-hero"><p className="neo-section-label"><SlidersHorizontal size={16} aria-hidden="true" />Custom quote</p><h1>An edit built around your project.</h1><p>Choose what you need. We’ll put together a scope and price that fit.</p><span className="quote-hero-note">No payment required. We’ll contact you shortly.</span></header>
    <Form id="custom-quote-form" method="post" action="/custom-quote" onSubmit={handleSubmit} className="quote-builder-layout" aria-busy={busy}>
        <input type="hidden" name="requestToken" value={data.requestToken} /><input type="hidden" name="g-recaptcha-response" defaultValue="" />
      <div className="quote-builder neo-surface">
        {error ? <div ref={alertRef} role="alert" tabIndex={-1} className="quote-error-summary"><h2>Check your request</h2><p>{error}</p>{Object.keys(errors).length ? <ul>{Object.entries(errors).map(([name, message]) => <li key={name}><a href={`#${name}`} onClick={event => { event.preventDefault(); const target = document.getElementById(name); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "start" }); }}>{fieldLabels[name] || name}: {message}</a></li>)}</ul> : null}</div> : null}
        <section className="quote-form-section" aria-labelledby="quote-project-heading"><h2 id="quote-project-heading"><Film size={22} aria-hidden="true" />Your project</h2><p>The format and volume help us plan the right editing capacity.</p>
          {text("title")}<div className="quote-field-grid">{select("projectType", quoteProjectTypes)}{select("requestType", quoteRequestTypes)}{text("videoCount", "number", values.requestType === "recurring" ? "Videos per delivery cycle." : "Total videos for this project.")}{select("cadence", quoteCadences)}{select("duration", quoteDurations)}{select("footage", quoteFootage)}</div>
          {choices("platforms", quotePlatforms)}{choices("aspectRatios", quoteRatios)}
        </section>
        <section className="quote-form-section" aria-labelledby="quote-editing-heading"><h2 id="quote-editing-heading"><Layers size={22} aria-hidden="true" />Shape the edit</h2><p>Choose the services you want us to include in your quote.</p>{choices("services", quoteServices)}<div className="quote-field-grid">{select("style", quoteStyles)}{select("revisions", quoteRevisions)}</div>{text("languages")}</section>
        <section className="quote-form-section" aria-labelledby="quote-timing-heading"><h2 id="quote-timing-heading"><SlidersHorizontal size={22} aria-hidden="true" />Timing and budget</h2><p>A preferred deadline helps us check availability. Budget ranges are in USD.</p><div className="quote-field-grid">{select("urgency", quoteUrgencies)}{text("deadline", "date")}{select("budget", quoteBudgets)}</div></section>
        <section className="quote-form-section" aria-labelledby="quote-brief-heading"><h2 id="quote-brief-heading"><FileText size={22} aria-hidden="true" />Bring us into the brief</h2><p>Tell us your goals, audience, brand requirements, and anything else we should consider.</p>
          <label className="quote-field" htmlFor="brief"><span>Your brief <span className="quote-required">*</span></span><textarea id="brief" name="brief" rows={6} required minLength={20} maxLength={6000} className="neo-inset" value={values.brief} onChange={event => update("brief", event.target.value)} placeholder="What are you creating, and what should the finished video feel like? Include any requirements that weren’t covered above." aria-invalid={!!errors.brief} aria-describedby="brief-help brief-error" /><small id="brief-help">20–6,000 characters. Share links to files rather than passwords or access codes.</small><FieldError name="brief" error={errors.brief} /></label>
          <div className="quote-field-grid">{text("channelUrl", "url")}{text("footageUrl", "url", "A shared Drive, Dropbox, or similar link. Footage can be shared later.")}</div>
          <label className="quote-field" htmlFor="referenceUrls"><span>Reference links <span className="quote-optional">(optional)</span></span><textarea id="referenceUrls" name="referenceUrls" rows={3} className="neo-inset" maxLength={2500} value={values.referenceUrls} onChange={event => update("referenceUrls", event.target.value)} placeholder="https://…" aria-invalid={!!errors.referenceUrls} aria-describedby="references-help referenceUrls-error" /><small id="references-help">Up to five links to edits or styles you like, one per line.</small><FieldError name="referenceUrls" error={errors.referenceUrls} /></label>
          <div className="quote-field-grid">{select("preferredContact", { email: "Email", whatsapp: "WhatsApp" })}{text("phone", "tel", values.preferredContact === "whatsapp" ? "Required for WhatsApp. Include your country code if outside Bangladesh." : "Optional contact number.")}</div>
        </section>
      </div>
      <aside className="quote-summary neo-surface" aria-labelledby="quote-summary-heading"><div className="quote-summary-heading"><FileText size={20} aria-hidden="true" /><h2 id="quote-summary-heading">Your quote request</h2></div>
        <p className="quote-summary-title">{values.title || "Your next project"}</p><dl><div><dt>Project</dt><dd>{quoteOptionLabel(quoteProjectTypes, values.projectType)}</dd></div><div><dt>Volume</dt><dd>{values.videoCount || "—"} {values.videoCount === "1" ? "video" : "videos"}{values.requestType === "recurring" ? " per cycle" : ""}</dd></div><div><dt>Finished length</dt><dd>{quoteOptionLabel(quoteDurations, values.duration)}</dd></div><div><dt>Schedule</dt><dd>{quoteOptionLabel(quoteCadences, values.cadence)}</dd></div><div><dt>Budget</dt><dd>{quoteOptionLabel(quoteBudgets, values.budget)}</dd></div></dl>
        <div className="quote-summary-service-heading">{values.services.length} editing {values.services.length === 1 ? "service" : "services"}</div><ul className="quote-summary-services">{values.services.slice(0, 6).map(value => <li key={value}><Check size={14} aria-hidden="true" />{quoteOptionLabel(quoteServices, value)}</li>)}</ul>{values.services.length > 6 ? <p className="quote-summary-more">+{values.services.length - 6} more selected</p> : null}
        <div className="quote-summary-account neo-inset"><UserRound size={18} aria-hidden="true" /><div><strong>{data.customer.name}</strong><span>{data.customer.email}</span></div></div>
        <p className="quote-summary-note">We’ll confirm the scope, price, and delivery plan with you before production starts.</p>
      </aside>
      <div className="quote-form-footer"><p>Ready for a tailored quote?</p>{button}<span>We’ll review your brief and contact you shortly. No payment is required.</span></div>
    </Form>
  </div>;
}

function FieldError({ name, error }: { name: string; error?: string }) { return <span id={`${name}-error`} className="quote-field-error">{error || ""}</span>; }
