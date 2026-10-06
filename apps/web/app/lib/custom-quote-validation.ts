import { customQuoteInputSchema } from "@edicut/shared/contracts/custom-quotes";

export type QuoteValidationResult = { error: string; fieldErrors: Record<string, string> };

/** Use the server's contract before CAPTCHA, including checkbox group rules. */
export function validateQuoteDraft(input: unknown, today: string): QuoteValidationResult | undefined {
  const parsed = customQuoteInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { error: "Check the highlighted fields before requesting your quote.", fieldErrors };
  }
  if (parsed.data.deadline && parsed.data.deadline < today) {
    return { error: "Choose a delivery date from today onward.", fieldErrors: { deadline: "Choose a date from today onward." } };
  }
}
