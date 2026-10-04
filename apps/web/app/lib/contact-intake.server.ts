import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { contactIntakeSchema } from "@edicut/shared/contracts/operations";
import { contactMessages } from "@edicut/db/schema";
import { getDbFromContext } from "./db.server";
import { verifyRecaptchaToken } from "./recaptcha.server";
import { queueTelegramContactInquiryNotice } from "./telegram-notifications.server";
import { consumeUsageLimit, hashUsageLimitKey, requestBodyExceedsLimit } from "./usage-protection.server";

type ContactReturnPath = "/" | "/contact";

export async function submitContactInquiry({
  request,
  context,
  returnTo,
}: {
  request: Request;
  context: ActionFunctionArgs["context"];
  returnTo: ContactReturnPath;
}) {
  if (requestBodyExceedsLimit(request, 64 * 1024)) {
    return redirect(`${returnTo}?error=invalid#contact`);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirect(`${returnTo}?error=invalid#contact`);
  }
  const parsed = contactIntakeSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    projectType: formData.get("projectType") || undefined,
    monthlyVolume: formData.get("monthlyVolume") || undefined,
    brief: formData.get("brief"),
  });

  if (!parsed.success || parsed.data.email.length > 254) {
    return redirect(`${returnTo}?error=invalid#contact`);
  }

  const identityKey = await hashUsageLimitKey(parsed.data.email.trim().toLowerCase());
  const contactLimit = await consumeUsageLimit({
    context,
    request,
    bindingName: "AUTH_IDENTITY_LIMITER",
    key: `contact:${identityKey}`,
    localLimit: 3,
    localPeriodSeconds: 60,
  });
  if (contactLimit !== "allowed") {
    return redirect(`${returnTo}?error=security#contact`);
  }

  const captcha = await verifyRecaptchaToken({
    context,
    token: formData.get("g-recaptcha-response"),
  });

  if (!captcha.success) {
    return redirect(`${returnTo}?error=security#contact`);
  }

  let messageId: string;
  try {
    const db = getDbFromContext(context);
    const [savedMessage] = await db.insert(contactMessages).values({
      name: parsed.data.name,
      email: parsed.data.email,
      projectType: parsed.data.projectType || null,
      monthlyVolume: parsed.data.monthlyVolume || null,
      message: parsed.data.brief,
    }).returning();

    if (!savedMessage?.id) throw new Error("Contact inquiry insert returned no record.");
    messageId = savedMessage.id;
  } catch {
    console.error("Unable to save contact inquiry");
    return redirect(`${returnTo}?error=delivery#contact`);
  }

  queueTelegramContactInquiryNotice(context, { messageId });
  return redirect(`${returnTo}?sent=1#contact`);
}
