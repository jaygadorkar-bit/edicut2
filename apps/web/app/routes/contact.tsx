import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { contactIntakeSchema } from "@edicut/shared/contracts/operations";
import { contactMessages } from "@edicut/db/schema";
import { ContactSection, PageShell } from "../components/site/Marketing.js";
import { getDbFromContext } from "../lib/db.server";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";

export const meta: MetaFunction = () => [
  { title: "Contact EdiCut | Creator Post-Production" },
  { name: "description", content: "Tell EdiCut about your next video and get matched with the right editing lane." },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return {
    sent: url.searchParams.get("sent") === "1",
    error: url.searchParams.get("error"),
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const formData = await request.formData();
  const parsed = contactIntakeSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    projectType: formData.get("projectType") || undefined,
    monthlyVolume: formData.get("monthlyVolume") || undefined,
    brief: formData.get("brief"),
  });

  if (!parsed.success) {
    return redirect("/contact?error=invalid#contact");
  }

  const captcha = await verifyRecaptchaToken({
    context,
    token: formData.get("g-recaptcha-response"),
  });

  if (!captcha.success) {
    return redirect("/contact?error=security#contact");
  }

  const db = getDbFromContext(context);
  await db.insert(contactMessages).values({
    name: parsed.data.name,
    email: parsed.data.email,
    projectType: parsed.data.projectType || null,
    monthlyVolume: parsed.data.monthlyVolume || null,
    message: parsed.data.brief,
  });

  return redirect("/contact?sent=1#contact");
}

export default function ContactPage() {
  const { sent, error } = useLoaderData<typeof loader>();
  const contactStatus = sent ? "sent" : error === "security" ? "security-error" : error === "invalid" ? "invalid-error" : undefined;

  return (
    <PageShell>
      <section className="relative overflow-hidden border-b neo-line px-5 pb-16 pt-16 sm:px-6 lg:pb-20 lg:pt-24">
        <div className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full bg-[#e2c9ce]/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-[#cbdbe8]/60 blur-3xl" />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="yt-tag text-primary neo-section-label">Contact EdiCut</p>
          <h1 className="yt-display mt-5 neo-ink">
            Let&apos;s plan your next <span className="text-primary">edit.</span>
          </h1>
          <p className="yt-subtitle mx-auto mt-6 max-w-2xl leading-8 neo-muted">
            Share your format, publishing rhythm, and deadline. We&apos;ll recommend the cleanest editing lane for the work ahead.
          </p>
        </div>
      </section>
      <ContactSection action="/contact#contact" status={contactStatus} />
    </PageShell>
  );
}
