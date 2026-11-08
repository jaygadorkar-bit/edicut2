import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import type { ActionFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useNavigation, useSearchParams, useSubmit } from "react-router";
import { z } from "zod";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PageShell } from "../components/site/Marketing";
import { EditingArtwork } from "../components/site/EditingArtwork";
import { Select } from "../components/Select";
import { submitContactInquiry } from "../lib/contact-intake.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import "../styles/video-editor-partner.css";

const applicationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(64).regex(/^\+?[\d\s().-]+$/),
  address: z.string().trim().min(5).max(240),
  portfolioUrl: z.string().trim().min(1).max(300),
  experience: z.enum(["under-1", "1-3", "4-6", "7-plus"]),
  thumbnailDesign: z.enum(["yes", "no"]),
  thumbnailRate: z.string().trim().max(160),
  editingTurnaround: z.enum(["within-day", "1-2-days", "3-4-days", "5-7-days", "above-7-days"]),
  priceRange: z.enum(["below-5000", "5000-10000", "10001-15000", "15001-25000", "above-25000"]),
  referenceCapability: z.enum(["no", "yes", "better"]),
  storageMethods: z.array(z.enum(["computer", "portable-storage", "cloud-storage", "nas", "other"])).min(1).max(5),
  otherStorage: z.string().trim().max(120),
  aiTools: z.string().trim().max(240),
  workArrangement: z.enum(["agency", "freelancer", "job-holder"]),
}).refine((candidate) => candidate.thumbnailDesign !== "yes" || candidate.thumbnailRate.length >= 2, {
  path: ["thumbnailRate"],
  message: "Provide your typical thumbnail rate.",
});

export const meta: MetaFunction = () => [
  { title: "Video editing partner application | EdiCut" },
  { name: "description", content: "Apply to join EdiCut’s video editing partner network." },
  { name: "robots", content: "noindex, nofollow" },
];

export function headers() {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  const form = await readMutationForm(request, 64 * 1024);
  if (!form) return redirect("/video-editor-partner?error=invalid#application");

  const parsed = applicationSchema.safeParse({
    ...Object.fromEntries(form.entries()),
    storageMethods: form.getAll("storageMethods"),
    thumbnailRate: String(form.get("thumbnailRate") ?? ""),
  });
  if (!parsed.success) return redirect("/video-editor-partner?error=invalid#application");

  const candidate = parsed.data;
  const details = [
    "Video editor partner application",
    `Phone: ${candidate.phone}`,
    `Address: ${candidate.address}`,
    `Portfolio / reel: ${candidate.portfolioUrl}`,
    `Editing experience: ${experienceLabels[candidate.experience]}`,
    `Designs thumbnails: ${candidate.thumbnailDesign === "yes" ? "Yes" : "No"}`,
    `Typical thumbnail rate: ${candidate.thumbnailDesign === "yes" ? candidate.thumbnailRate : "Not applicable"}`,
    `Can create a video at the reference quality: ${referenceCapabilityLabels[candidate.referenceCapability]}`,
    `Editing turnaround for an 18:47 video: ${editingTurnaroundLabels[candidate.editingTurnaround]}`,
    `Price for an 18:47 video at the reference level: ${priceRangeLabels[candidate.priceRange]}`,
    `AI tools: ${candidate.aiTools || "Not provided"}`,
    `Previous client work storage: ${candidate.storageMethods.map((value) => storageMethodLabels[value]).join(", ")}${candidate.otherStorage ? `; other: ${candidate.otherStorage}` : ""}`,
    `Work arrangement: ${workArrangementLabels[candidate.workArrangement]}`,
  ].join("\n");

  const applicationForm = new URLSearchParams({
    name: candidate.name,
    email: candidate.email,
    projectType: "Video editor partner application",
    brief: details,
    "g-recaptcha-response": String(form.get("g-recaptcha-response") ?? ""),
  });
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
  const intakeRequest = new Request(request.url, { method: "POST", headers, body: applicationForm.toString() });

  return submitContactInquiry({
    request: intakeRequest,
    context,
    returnTo: "/video-editor-partner",
    briefMaxLength: 5000,
  });
}

const experienceLabels = { "under-1": "Under 1 year", "1-3": "1–3 years", "4-6": "4–6 years", "7-plus": "7+ years" };
const storageMethodLabels = { computer: "Computer", "portable-storage": "Portable storage", "cloud-storage": "Cloud storage", nas: "NAS", other: "Other" };
const workArrangementLabels = { agency: "Agency", freelancer: "Freelancer", "job-holder": "Job holder" };
const referenceCapabilityLabels = { no: "No", yes: "Yes", better: "I can create better-quality videos" };
const editingTurnaroundLabels = {
  "within-day": "Within a day",
  "1-2-days": "1–2 days",
  "3-4-days": "3–4 days",
  "5-7-days": "5–7 days",
  "above-7-days": "Above 7 days",
};
const priceRangeLabels = {
  "below-5000": "Below Tk 5,000",
  "5000-10000": "Tk 5,000–10,000",
  "10001-15000": "Tk 10,001–15,000",
  "15001-25000": "Tk 15,001–25,000",
  "above-25000": "Above Tk 25,000",
};

const experienceOptions = Object.entries(experienceLabels).map(([value, label]) => ({ value, label }));
const storageMethodOptions = Object.entries(storageMethodLabels).map(([value, label]) => ({ value, label }));
const editingTurnaroundOptions = Object.entries(editingTurnaroundLabels).map(([value, label]) => ({ value, label }));
const priceRangeOptions = Object.entries(priceRangeLabels).map(([value, label]) => ({ value, label }));

export default function VideoEditorPartnerPage() {
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const submit = useSubmit();
  const alertRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const [clientError, setClientError] = useState("");
  const [thumbnailDesign, setThumbnailDesign] = useState<"yes" | "no" | "">("");
  const sent = searchParams.get("sent") === "1";
  const errorCode = searchParams.get("error");
  const formError = clientError || (errorCode === "security"
    ? "The security check could not be verified. Please try again."
    : errorCode === "delivery"
      ? "We couldn’t save your application. Please try again or contact us for help."
      : errorCode === "invalid"
        ? "Check the required answers and try again."
        : "");
  const busy = navigation.state !== "idle";

  useEffect(() => {
    if (navigation.state === "idle") submittingRef.current = false;
  }, [navigation.state]);

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setClientError("");
    const form = event.currentTarget;
    try {
      if (!form.querySelector('input[name="storageMethods"]:checked')) {
        setClientError("Choose at least one storage option before sending your application.");
        submittingRef.current = false;
        return;
      }
      const { executeInvisibleRecaptcha } = await import("../lib/recaptcha.client");
      await executeInvisibleRecaptcha(form, "partner_application");
      await submit(form, { method: "post", action: "/video-editor-partner" });
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "The security check failed. Please try again.");
      submittingRef.current = false;
    }
  }

  return (
    <PageShell className="video-editor-partner-page">
      {sent ? (
        <section id="application" className="partner-success" aria-labelledby="partner-success-title">
          <div className="partner-success__copy">
            <p className="partner-success__status"><CheckCircle2 size={19} aria-hidden="true" /> Application received</p>
            <h1 id="partner-success-title">Application submitted</h1>
            <p className="partner-success__message" role="status">Thank you for applying. We’ll review your details and contact you shortly.</p>
            <Link to="/" className="partner-text-link">Back to EdiCut <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className="partner-success__art">
            <EditingArtwork stage="review" timelineScene />
          </div>
        </section>
      ) : (
        <section id="application" className="partner-application" aria-labelledby="application-title">
          <h1 id="application-title" className="sr-only">Video editor partner application</h1>

          {formError ? <div ref={alertRef} className="partner-alert" role="alert" tabIndex={-1}>{formError}</div> : null}

          <Form method="post" action="/video-editor-partner" className="partner-form" onSubmit={handleSubmit} aria-busy={busy || undefined} aria-label="Video editor partner application">
            <input type="hidden" name="g-recaptcha-response" value="" />

            <FormSection number="01" title="Your details" description="A few basics so we know who we’re speaking with.">
              <TextField id="name" name="name" label="Full name" autoComplete="name" required maxLength={120} />
              <TextField id="email" name="email" label="Email address" type="email" autoComplete="email" required maxLength={254} />
              <TextField id="phone" name="phone" label="Phone number" type="tel" inputMode="tel" pattern="[+0-9(). -]{7,64}" autoComplete="tel" placeholder="Include your country code" help="Enter a phone number with its country code." required maxLength={64} />
              <TextField id="address" name="address" label="Address" autoComplete="street-address" placeholder="Street, city, country" help="Your current mailing address." required maxLength={240} wide />
            </FormSection>

            <FormSection number="02" title="Your editing work" description="Show us what you enjoy editing and where we can see it.">
              <TextField id="portfolioUrl" name="portfolioUrl" label="Portfolio or showreel link" placeholder="Paste your portfolio or showreel link" help="Share a link where we can review your work." required maxLength={300} />
              <SelectField id="experience" name="experience" label="Years of video editing experience" options={experienceOptions} required />
              <RadioGroup id="thumbnailDesign" label="Do you design thumbnails?" options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]} required onChange={(event) => setThumbnailDesign(event.currentTarget.value as "yes" | "no")} />
              {thumbnailDesign === "yes" ? <TextField id="thumbnailRate" name="thumbnailRate" label="What is your typical rate per thumbnail?" help="Include your currency." required maxLength={160} /> : null}
              <TextField id="aiTools" name="aiTools" label="Which AI tools do you use?" optional placeholder="e.g. Descript, Runway, Adobe Enhance" help="Share how you use them in your workflow, if relevant." maxLength={240} />
              <ChoiceGroup id="storageMethods" label="Where do you store previous client work?" help="Choose all that apply." options={storageMethodOptions} required />
              <TextField id="otherStorage" name="otherStorage" label="Other storage details" optional placeholder="Describe your storage setup" maxLength={120} />
            </FormSection>

            <FormSection number="03" title="Your work arrangement" description="Tell us how you work with clients and your preferred arrangement.">
              <RadioGroup id="workArrangement" label="Which best describes you?" options={[
                { value: "agency", label: "Agency" },
                { value: "freelancer", label: "Freelancer" },
                { value: "job-holder", label: "Job holder" },
              ]} required />
            </FormSection>

            <FormSection number="04" title="Pricing" description="Review the reference video, then share your turnaround, rate, and how your work compares.">
              <figure className="partner-video-reference partner-field--wide">
                <div className="partner-video-reference__frame">
                  <iframe
                    src="https://www.youtube-nocookie.com/embed/FVR8zz8ci2k?rel=0"
                    title="StudioBinder: 6 Ways to Edit Any Scene (18 minutes 47 seconds)"
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
                <figcaption className="partner-field__help">StudioBinder’s editing techniques breakdown · 18:47. <a href="https://www.youtube.com/watch?v=FVR8zz8ci2k" target="_blank" rel="noreferrer noopener">Open on YouTube</a></figcaption>
              </figure>
              <RadioGroup id="referenceCapability" label="Can you create a video at the same quality as this reference?" help="Choose the option closest to your current work." options={[
                { value: "no", label: "No" },
                { value: "yes", label: "Yes" },
                { value: "better", label: "I can create better-quality videos" },
              ]} required wide />
              <RadioGroup id="editingTurnaround" label="How long would you take to edit an 18:47 video to this standard?" help="Choose your typical turnaround after receiving the footage and brief." options={editingTurnaroundOptions} required wide />
              <RadioGroup id="priceRange" label="How much would you charge to edit an 18:47 video to this standard?" help="Choose the price range that includes your typical rate in Bangladeshi taka." options={priceRangeOptions} required wide />
            </FormSection>

            <div className="partner-form__footer">
              <button className="partner-submit" type="submit" disabled={busy}>
                {busy ? "Sending application…" : "Send my application"}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
          </Form>
        </section>
      )}
    </PageShell>
  );
}

function FormSection({ number, title, description, children }: { number: string; title: string; description: string; children: ReactNode }) {
  return (
    <section className="partner-form-section" aria-labelledby={`partner-section-${number}`}>
      <div className="partner-form-section__heading">
        <span aria-hidden="true">{number}</span>
        <div><h3 id={`partner-section-${number}`}>{title}</h3><p>{description}</p></div>
      </div>
      <div className="partner-fields">{children}</div>
    </section>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> & { id: string; name: string; label: string; help?: string; optional?: boolean; wide?: boolean };
function TextField({ id, name, label, help, optional, required, wide, ...inputProps }: TextFieldProps) {
  return (
    <label className={`partner-field${wide ? " partner-field--wide" : ""}`} htmlFor={id}>
      <span className="partner-field__label">{label}{optional ? <span className="partner-optional">Optional</span> : required ? <span className="partner-required"> *</span> : null}</span>
      <input className="partner-control" id={id} name={name} required={required} aria-describedby={help ? `${id}-help` : undefined} {...inputProps} />
      {help ? <span className="partner-field__help" id={`${id}-help`}>{help}</span> : null}
    </label>
  );
}

type Option = { value: string; label: string };
function SelectField({ id, name, label, options, required }: { id: string; name: string; label: string; options: Option[]; required?: boolean }) {
  return (
    <label className="partner-field" htmlFor={id}>
      <span className="partner-field__label">{label}{required ? <span className="partner-required"> *</span> : null}</span>
      <Select className="partner-control" id={id} name={name} required={required} defaultValue="">
        <option value="" disabled>Select an option</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </label>
  );
}

function ChoiceGroup({ id, label, help, options, required }: { id: string; label: string; help?: string; options: Option[]; required?: boolean }) {
  return (
    <fieldset id={id} tabIndex={-1} className="partner-choice-group partner-field--wide" aria-describedby={help ? `${id}-help` : undefined}>
      <legend className="partner-field__label">{label}{required ? <span className="partner-required"> *</span> : null}</legend>
      {help ? <p className="partner-field__help" id={`${id}-help`}>{help}</p> : null}
      <div className="partner-choice-grid">
        {options.map((option) => (
          <label className="partner-choice" key={option.value}>
            <input type="checkbox" name={id} value={option.value} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RadioGroup({ id, label, help, options, required, onChange, wide }: { id: string; label: string; help?: string; options: Option[]; required?: boolean; onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"]; wide?: boolean }) {
  return (
    <fieldset className={`partner-choice-group${wide ? " partner-field--wide" : ""}`} aria-describedby={help ? `${id}-help` : undefined}>
      <legend className="partner-field__label">{label}{required ? <span className="partner-required"> *</span> : null}</legend>
      {help ? <p className="partner-field__help" id={`${id}-help`}>{help}</p> : null}
      <div className={`partner-choice-grid${wide ? "" : " partner-choice-grid--compact"}`}>
        {options.map((option) => (
          <label className="partner-choice" key={option.value}>
            <input type="radio" name={id} value={option.value} required={required} onChange={onChange} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
