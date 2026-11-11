import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { ContactSection, PageShell } from "../components/site/Marketing.js";
import { DEFAULT_CONTACT_EMAIL, getConfiguredContactEmail } from "../lib/contact-email";
import { submitContactInquiry } from "../lib/contact-intake.server";
import { createRouteMeta } from "../lib/seo";
import { MessageCircle } from "lucide-react";
import "../styles/contact.css";

export const meta: MetaFunction = (args) => createRouteMeta(args,
  "Contact a Video Editor for YouTube | EdiCut",
  "Tell EdiCut about your YouTube, podcast, Shorts, or gaming video. We will recommend a video editing service and package for your footage and schedule.",
);

export async function loader({ context }: LoaderFunctionArgs) {
  return {
    contactEmail: getConfiguredContactEmail(context) || DEFAULT_CONTACT_EMAIL,
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  return submitContactInquiry({ request, context, returnTo: "/contact" });
}

export default function ContactPage() {
  const { contactEmail } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const sent = searchParams.get("sent") === "1";
  const error = searchParams.get("error");
  const contactStatus = sent ? "sent"
    : error === "security" ? "security-error"
      : error === "invalid" ? "invalid-error"
        : error === "delivery" ? "delivery-error"
          : undefined;

  return (
    <PageShell className="contact-page">
      <section data-analytics-region="contact" className="contact-hero" aria-labelledby="contact-page-title">
        <p className="contact-kicker neo-section-label"><MessageCircle size={17} aria-hidden="true" /> Contact EdiCut</p>
        <h1 id="contact-page-title">Looking for a video editor<br />for YouTube?</h1>
        <p>Bring your ideas. We&apos;ll help you find the right editing plan.</p>
      </section>
      <ContactSection action="/contact#contact" status={contactStatus} contactEmail={contactEmail || DEFAULT_CONTACT_EMAIL} page />
    </PageShell>
  );
}
