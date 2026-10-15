import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Form } from "react-router";
import { FormSelect, type FormSelectOption } from "./FormSelect";
import { earliestProjectDeliveryDate, validateProjectBrief } from "../lib/client-intake";
import type { ClientPurchase } from "../lib/client-workspace.server";

export type BriefResult = { error?: string; errors?: Record<string, string>; values?: Record<string, string> };
export const BRIEF_STEPS = [
  { title: "Your video", description: "Start with the idea. A few sentences are enough.", fields: ["title", "objective", "finishedMinutes"] },
  { title: "Footage & editing", description: "Share your files and tell your editor how you want the video to feel.", fields: ["footageUrl", "instructions", "scriptUrl", "referenceUrl"] },
  { title: "Delivery", description: "Choose how you want your finished video delivered.", fields: ["aspectRatio", "resolution", "captions", "deadline", "subscriptionId"] },
] as const;
export function briefErrorStep(errors: Record<string, string>) {
  return Math.max(0, BRIEF_STEPS.findIndex(step => step.fields.some(field => field in errors)));
}
export function creditLabel(purchase: ClientPurchase) {
  return purchase.type === "monthly" ? `${purchase.remaining / 60} editing hours available` : `${purchase.remaining} video credit available`;
}

export function ProjectBriefForm({ purchases, token, result, minimumDeliveryDate }: { purchases: ClientPurchase[]; token: string; result?: BriefResult; minimumDeliveryDate?: string }) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    aspectRatio: "16:9", resolution: "1080p", captions: "Burned-in",
    subscriptionId: purchases[0]?.id ?? "", ...result?.values,
  }));
  const [minimumDate, setMinimumDate] = useState(minimumDeliveryDate ?? earliestProjectDeliveryDate());
  const [step, setStep] = useState(() => briefErrorStep(result?.errors ?? {}));
  const [visited, setVisited] = useState(step);
  const [enhanced, setEnhanced] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>(result?.errors ?? {});
  const [submitting, setSubmitting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<string | null>(null);
  const purchase = purchases.find(p => p.id === values.subscriptionId);

  useEffect(() => {
    setEnhanced(true);
    const refreshDate = () => setMinimumDate(earliestProjectDeliveryDate());
    refreshDate();
    const interval = window.setInterval(refreshDate, 60_000);
    window.addEventListener("focus", refreshDate);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refreshDate); };
  }, []);
  useEffect(() => {
    if (!result) return;
    setSubmitting(false);
    if (result.values) setValues(current => ({ ...current, ...result.values }));
    setErrors(result.errors ?? {});
    if (result.errors) setStep(briefErrorStep(result.errors));
    focusTarget.current = "summary";
  }, [result]);
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    if (target === "summary") summary.current?.focus();
    else if (target === "heading") heading.current?.focus();
    else document.getElementById(`brief-${target}`)?.focus();
    focusTarget.current = null;
  }, [step, errors, result]);

  function change(name: string, value: string) {
    setValues(current => ({ ...current, [name]: value }));
    setErrors(current => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }
  function validate() {
    const form = new FormData();
    Object.entries(values).forEach(([key, value]) => form.set(key, value));
    const nextErrors = { ...validateProjectBrief(form).errors };
    if (!purchase) nextErrors.subscriptionId = "Choose a package with available editing balance.";
    return nextErrors;
  }
  function move(next: number) {
    focusTarget.current = "heading";
    setStep(next);
    setVisited(current => Math.max(current, next));
  }
  function advance() {
    const all = validate();
    const current = Object.fromEntries(Object.entries(all).filter(([field]) => (BRIEF_STEPS[step].fields as readonly string[]).includes(field)));
    setErrors(current);
    if (Object.keys(current).length) { focusTarget.current = "summary"; return; }
    move(step + 1);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    if (submitting) { event.preventDefault(); return; }
    if (enhanced && step < 2) { event.preventDefault(); advance(); return; }
    const all = validate();
    setErrors(all);
    if (Object.keys(all).length) {
      event.preventDefault();
      setStep(briefErrorStep(all));
      focusTarget.current = "summary";
      return;
    }
    setSubmitting(true);
  }
  function field(name: string, label: string, options: { hint?: string; placeholder?: string; type?: string; required?: boolean; multiline?: boolean; maxLength?: number; min?: number | string; max?: number; step?: number; choices?: FormSelectOption[] } = {}) {
    const { hint, multiline, choices, required = true, ...attributes } = options;
    const props = {
      id: `brief-${name}`, name, value: values[name] ?? "", onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(name, event.target.value),
      required, autoComplete: "off", "aria-invalid": Boolean(errors[name]), "aria-describedby": `brief-${name}-help`,
      className: "neo-workspace__profile-input min-h-12 w-full min-w-0 rounded-xl px-4 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[#7157ed]",
    };
    return <div className="min-w-0">
      <label id={`${props.id}-label`} htmlFor={props.id} className="mb-2 block text-sm font-bold text-slate-800">{label}{!required ? <span className="ml-2 font-normal text-slate-500">Optional</span> : null}</label>
      {choices ? <FormSelect id={props.id} name={name} value={values[name] ?? ""} onChange={value => change(name, value)} options={choices} required={required} invalid={Boolean(errors[name])} describedBy={props["aria-describedby"]} className={props.className} /> : multiline ? <textarea {...props} rows={3} maxLength={options.maxLength ?? 2000} placeholder={options.placeholder} /> : <input {...props} {...attributes} inputMode={options.type === "number" ? "decimal" : undefined} />}
      {hint || errors[name] ? <p id={`brief-${name}-help`} className={`mt-2 text-sm leading-6 ${errors[name] ? "text-red-700" : "text-slate-600"}`}>{errors[name] || hint}</p> : <span id={`brief-${name}-help`} />}
    </div>;
  }
  const hasErrors = Object.keys(errors).length > 0;
  return <Form method="post" noValidate onSubmit={submit} autoComplete="off" className="project-brief mt-6">
    <input type="hidden" name="intent" value="create-project" />
    <input type="hidden" name="requestToken" value={result?.values?.requestToken || token} />
    {enhanced ? <nav aria-label="Project brief progress" className="mb-7">
      <ol className="grid grid-cols-3 gap-2 sm:gap-4">{BRIEF_STEPS.map((item, index) => <li key={item.title}>
        <button type="button" disabled={submitting || index > visited} onClick={() => move(index)} aria-current={step === index ? "step" : undefined} className={`flex h-full min-h-14 w-full flex-col items-start gap-2 border-b-2 px-1 pb-3 text-left text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-[#7157ed] disabled:cursor-default sm:flex-row sm:items-center sm:text-sm ${step === index ? "border-[#7157ed] text-[#5141a9]" : "border-slate-200 text-slate-600"}`}>
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${step === index ? "bg-[#7157ed] text-white" : "bg-white/70"}`}>{index < step ? <Check size={16} aria-hidden="true" /> : index + 1}</span>
          {item.title}
        </button>
      </li>)}</ol>
    </nav> : null}
    {hasErrors || result?.error ? <div ref={summary} role="alert" tabIndex={-1} className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800 outline-none focus-visible:ring-2 focus-visible:ring-red-700">
      <p className="font-bold">{hasErrors ? "A few details need your attention" : result?.error}</p>
      {hasErrors ? <ul className="mt-2 list-inside list-disc">{Object.entries(errors).map(([name, message]) => <li key={name}><button type="button" className="min-h-11 text-left underline" onClick={() => { focusTarget.current = name; setStep(briefErrorStep({ [name]: message })); setErrors(current => ({ ...current })); }}>{message}</button></li>)}</ul> : null}
    </div> : null}
    {enhanced ? <div className="mb-6">
      <p className="text-sm font-semibold text-[#5141a9]">Step {step + 1} of 3</p>
      <h3 ref={heading} tabIndex={-1} className="mt-1 text-2xl font-bold tracking-tight outline-none">{BRIEF_STEPS[step].title}</h3>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{BRIEF_STEPS[step].description}</p>
    </div> : null}
    <fieldset disabled={submitting} hidden={enhanced && step !== 0} className="min-w-0 space-y-5">
      <legend className={enhanced ? "sr-only" : "mb-5 text-xl font-bold"}>Your video</legend>
      {field("title", "Give your project a name", { maxLength: 120, placeholder: "e.g. October product launch" })}
      {field("finishedMinutes", "Finished length (minutes)", { type: "number", min: 0.01, max: 600, step: 0.01, placeholder: "e.g. 8", hint: "An approximate length is fine." })}
      {field("objective", "What is the video about?", { multiline: true, placeholder: "Introduce our new product to first-time customers and show why it helps.", hint: "Share the main message, who it’s for, and what viewers should do next." })}
    </fieldset>
    <fieldset disabled={submitting} hidden={enhanced && step !== 1} className={`min-w-0 space-y-5 ${!enhanced ? "mt-8" : ""}`}>
      <legend className={enhanced ? "sr-only" : "mb-5 text-xl font-bold"}>Footage & editing</legend>
      {field("footageUrl", "Link to your footage folder", { type: "url", placeholder: "https://drive.google.com/…", hint: "Share an HTTPS folder link with editor access. Include footage, audio, and any logos or music we should use." })}
      {field("instructions", "How would you like it edited?", { multiline: true, maxLength: 8000, placeholder: "Keep it upbeat, remove long pauses, and show the product close-ups. Use our brand colours for text.", hint: "Mention pacing, must-keep moments, cuts, music, on-screen text, and anything to avoid. Include the caption language if needed." })}
      <details open={Boolean(errors.scriptUrl || errors.referenceUrl) || undefined} className="border-t border-[var(--workspace-line)] pt-2">
        <summary className="min-h-12 cursor-pointer py-3 text-sm font-bold text-slate-700">Add a script or example video <span className="font-normal text-slate-500">(optional)</span></summary>
        <div className="mt-3 space-y-5">
          {field("scriptUrl", "Script, outline, or timestamps", { type: "url", required: false, hint: "A shared document helps us follow your story." })}
          {field("referenceUrl", "Example video you like", { type: "url", required: false, hint: "Tell us what you like about it in your editing notes above." })}
        </div>
      </details>
      <p className="text-xs leading-5 text-slate-600">Keep files in your storage. Share access instructions here, never passwords.</p>
    </fieldset>
    <fieldset disabled={submitting} hidden={enhanced && step !== 2} className={`min-w-0 space-y-5 ${!enhanced ? "mt-8" : ""}`}>
      <legend className={enhanced ? "sr-only" : "mb-5 text-xl font-bold"}>Delivery</legend>
      <div className="grid gap-5 sm:grid-cols-2">
        {field("aspectRatio", "Video shape", { choices: [["16:9", "Landscape (16:9)"], ["9:16", "Vertical (9:16)"], ["1:1", "Square (1:1)"], ["4:5", "Portrait (4:5)"]].map(([value, label]) => ({ value, label })) })}
        {field("resolution", "Video quality", { choices: ["1080p", "4K"].map(value => ({ value, label: value })), hint: "1080p works well for most videos." })}
        {field("captions", "Captions", { choices: [["None", "No captions"], ["Burned-in", "Visible on the video"], ["Subtitle file", "Separate subtitle file"], ["Both", "Video captions + subtitle file"]].map(([value, label]) => ({ value, label })) })}
        {field("deadline", "Preferred delivery date", { type: "date", min: minimumDate, hint: "Allow at least 48 hours (Bangladesh time). We’ll confirm the date after reviewing your files." })}
      </div>
      <div className="border-t border-[var(--workspace-line)] pt-5">
        {field("subscriptionId", "Use your editing balance", { choices: purchases.map(p => ({ value: p.id, label: `${p.name} · ${creditLabel(p)}` })) })}
        <p className="mt-3 text-sm leading-6 text-slate-600">{purchase?.type === "monthly" ? `No hours are deducted when you send this brief. Your editor will confirm the hours after reviewing it.${purchase.expiresAt ? ` Your monthly allowance ends ${new Date(purchase.expiresAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" })}.` : ""}` : "Sending this brief uses one video credit. Your purchased add-ons are included."} We’ll check your footage against the package allowance.</p>
      </div>
      <div className="rounded-xl bg-white/50 p-4 text-sm leading-6 text-slate-600"><strong className="text-slate-800">Ready for your editor</strong><p className="mt-1">{values.title || "Your video"}{values.finishedMinutes ? ` · about ${values.finishedMinutes} minutes` : ""}. You can go back to change any answer before sending.</p></div>
    </fieldset>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--workspace-line)] pt-5">
      {enhanced && step > 0 ? <button type="button" disabled={submitting} onClick={() => move(step - 1)} className="inline-flex min-h-12 items-center gap-2 rounded-full px-3 text-sm font-bold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-[#7157ed]"><ArrowLeft size={17} aria-hidden="true" />Back</button> : <p className="max-w-64 text-xs leading-5 text-slate-600">Your creator profile is already saved. Just add the details for this video.</p>}
      {enhanced && step < 2 ? <button key="continue" type="button" onClick={(event) => { event.preventDefault(); advance(); }} className="neo-workspace__setup-cta ml-auto">Continue<ArrowRight size={18} aria-hidden="true" /></button> : <button key="send" type="submit" disabled={submitting || !purchase} className="neo-workspace__setup-cta ml-auto disabled:opacity-60">{submitting ? "Sending your brief…" : "Send project brief"}{!submitting ? <ArrowRight size={18} aria-hidden="true" /> : null}</button>}
    </div>
    {(!enhanced || step === 2) ? <p className="mt-3 text-xs leading-5 text-slate-600">We’ll review your brief and confirm scope and timing. No additional payment is collected here.</p> : null}
  </Form>;
}
