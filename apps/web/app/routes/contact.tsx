import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ContactSection, PageShell } from "../components/site/Marketing.js";
import { DEFAULT_CONTACT_EMAIL, getConfiguredContactEmail } from "../lib/contact-email";
import { submitContactInquiry } from "../lib/contact-intake.server";
import { createRouteMeta } from "../lib/seo";
import { MessageCircle } from "lucide-react";
import "../styles/contact.css";

export const meta: MetaFunction = (args) => createRouteMeta(args,
  "Contact EdiCut | Video Editing for YouTube Creators",
  "Tell EdiCut about your YouTube, podcast, or short-form video project and get matched with an editing plan for your workflow.",
);

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return {
    sent: url.searchParams.get("sent") === "1",
    error: url.searchParams.get("error"),
    contactEmail: getConfiguredContactEmail(context) || DEFAULT_CONTACT_EMAIL,
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  return submitContactInquiry({ request, context, returnTo: "/contact" });
}

export default function ContactPage() {
  const { sent, error, contactEmail } = useLoaderData<typeof loader>();
  const contactStatus = sent ? "sent"
    : error === "security" ? "security-error"
      : error === "invalid" ? "invalid-error"
        : error === "delivery" ? "delivery-error"
          : undefined;

  return (
    <PageShell className="contact-page">
      <section className="contact-hero" aria-labelledby="contact-page-title">
        <p className="contact-kicker neo-section-label"><MessageCircle size={17} aria-hidden="true" /> Contact EdiCut</p>
        <h1 id="contact-page-title">Let&apos;s talk about<br />your next video.</h1>
        <p>Bring your ideas. We&apos;ll help you find the right editing plan.</p>
      </section>
      <ContactSection action="/contact#contact" status={contactStatus} contactEmail={contactEmail || DEFAULT_CONTACT_EMAIL} page />
    </PageShell>
  );
}
