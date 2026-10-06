import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { customQuoteInputSchema } from "@edicut/shared/contracts/custom-quotes";
import { CustomQuoteForm } from "../components/site/CustomQuoteForm";
import { getCustomerQuote, quoteBusinessDate, requireQuoteCustomer, saveCustomQuote } from "../lib/custom-quotes.server";
import { isSameSiteMutation, readSubscriptionForm } from "../lib/customer-subscriptions.server";
import { verifyRecaptchaToken } from "../lib/recaptcha.server";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { isWorkspaceRecordId } from "../lib/workspace";
import "../styles/custom-quotes.css";

export const meta: MetaFunction = () => [{ title: "Request a custom quote | EdiCut" }, { name: "robots", content: "noindex,nofollow" }];
export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }; }
export type QuoteActionResult = { error: string; fieldErrors?: Record<string, string> };
// URL-encoded multilingual briefs use up to 9 bytes per character. Accommodate
// the allowed field lengths while keeping streamed bodies strictly bounded.
const MAX_QUOTE_BODY_BYTES = 128 * 1024;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { db, customer } = await requireQuoteCustomer(request, context);
  const submittedId = new URL(request.url).searchParams.get("submitted");
  const submitted = submittedId && isWorkspaceRecordId(submittedId) ? await getCustomerQuote(db, customer.id, submittedId) : null;
  if (submittedId && !submitted) throw new Response("Quote request not found", { status: 404 });
  return { customer, requestToken: crypto.randomUUID(), today: quoteBusinessDate(), submitted };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return data<QuoteActionResult>({ error: "Please submit your quote request from this site." }, { status: 403 });
  if (requestBodyExceedsLimit(request, MAX_QUOTE_BODY_BYTES)) return data<QuoteActionResult>({ error: "Your request is too large. Shorten your brief or reference links and try again." }, { status: 413 });
  const { db, customer } = await requireQuoteCustomer(request, context);
  const form = await readSubscriptionForm(request, MAX_QUOTE_BODY_BYTES);
  if (!form) return data<QuoteActionResult>({ error: "This form could not be read. Shorten your brief or reference links and try again." }, { status: 400 });
  const input = Object.fromEntries(form);
  const parsed = customQuoteInputSchema.safeParse({ ...input, platforms: form.getAll("platforms"), aspectRatios: form.getAll("aspectRatios"), services: form.getAll("services") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return data<QuoteActionResult>({ error: "Check the highlighted fields before requesting your quote.", fieldErrors }, { status: 400 });
  }
  if (parsed.data.deadline && parsed.data.deadline < quoteBusinessDate()) return data<QuoteActionResult>({ error: "Choose a delivery date from today onward.", fieldErrors: { deadline: "Choose a date from today onward." } }, { status: 400 });
  const limit = await consumeUsageLimit({ request, context, bindingName: "AUTH_IDENTITY_LIMITER", key: `quote:${customer.id}`, localLimit: 3, localPeriodSeconds: 60 });
  if (limit !== "allowed") return data<QuoteActionResult>({ error: "Please wait a minute before requesting another quote." }, { status: 429 });
  const captcha = await verifyRecaptchaToken({ context, token: form.get("g-recaptcha-response") });
  if (!captcha.success) return data<QuoteActionResult>({ error: captcha.error }, { status: 400 });
  try {
    const saved = await saveCustomQuote(db, customer, parsed.data);
    return redirect(`/custom-quote?submitted=${saved.id}`);
  } catch {
    console.error("Unable to save custom quote request");
    return data<QuoteActionResult>({ error: "We couldn’t save your request. Your options are still here; please try again." }, { status: 503 });
  }
}

export default function CustomQuotePage() {
  return <CustomQuoteForm data={useLoaderData<typeof loader>()} result={useActionData<typeof action>()} />;
}
