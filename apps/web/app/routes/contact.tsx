import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { contactIntakeSchema } from "@edicut/shared/contracts/operations";
import { contactMessages } from "@edicut/db/schema";
import { ContactSection, FAQSection, PageShell } from "../components/site/Marketing.js";
import { getDbFromContext } from "../lib/db.server";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";

export const meta: MetaFunction = () => [{ title: "Contact EdiCut | Start a project" }];

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

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return {
    sent: url.searchParams.get("sent") === "1",
    error: url.searchParams.get("error"),
  };
}

export default function ContactPage() {
  const { sent, error } = useLoaderData<typeof loader>();

  return (
    <PageShell>
      <section className="px-5 pb-6 pt-32 text-center sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Start a project</p>
        <h1 className="mx-auto mt-4 max-w-4xl text-5xl font-black tracking-tight sm:text-6xl">Tell us what you are editing next.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Our team will review your channel and project details to match you with the right package.</p>
      </section>
      <ContactSection status={sent ? "sent" : error === "security" ? "security-error" : error === "invalid" ? "invalid-error" : undefined} />
      <section className="bg-secondary px-5 py-16 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
          {["Pricing questions", "Portfolio review", "Existing project support"].map((item) => <article key={item} className="rounded-2xl border border-gray-200 bg-white p-6 text-xl font-black">{item}</article>)}
        </div>
      </section>
      <FAQSection />
    </PageShell>
  );
}
