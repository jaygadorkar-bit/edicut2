import { and, eq } from "drizzle-orm";
import { customQuotes } from "@edicut/db/schema";
import { findUserById } from "@edicut/db/repositories/users";
import { customQuoteOptionsSchema, type CustomQuoteInput } from "@edicut/shared/contracts/custom-quotes";
import { requireUserId } from "./session.server";
import { getDbFromContext } from "./db.server";
import type { LoaderContext } from "../types";
import type { DatabaseClient } from "@edicut/db/client";

export async function requireQuoteCustomer(request: Request, context: LoaderContext) {
  const userId = await requireUserId(request, context, "/custom-quote");
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);
  if (!user?.active || user.deletedAt) throw new Response("Your account is unavailable. Contact support to request access.", { status: 403 });
  return { db, customer: { id: user.id, name: user.name || user.email.split("@")[0], email: user.email, phone: user.phone || "" } };
}

export async function saveCustomQuote(db: DatabaseClient, customer: { id: string; name: string; email: string }, input: CustomQuoteInput) {
  const [saved] = await db.insert(customQuotes).values({
    ownerId: customer.id, requestToken: input.requestToken, title: input.title,
    customerName: customer.name.slice(0, 120), customerEmail: customer.email,
    phone: input.phone || null, preferredContact: input.preferredContact,
    options: customQuoteOptionsSchema.parse(input),
  }).onConflictDoNothing({ target: [customQuotes.ownerId, customQuotes.requestToken] }).returning();
  if (saved) return { id: saved.id };
  const [existing] = await db.select({ id: customQuotes.id }).from(customQuotes)
    .where(and(eq(customQuotes.ownerId, customer.id), eq(customQuotes.requestToken, input.requestToken))).limit(1);
  if (!existing) throw new Error("Quote request could not be saved.");
  return existing;
}

export async function getCustomerQuote(db: DatabaseClient, ownerId: string, id: string) {
  const [quote] = await db.select({ id: customQuotes.id, title: customQuotes.title, options: customQuotes.options, status: customQuotes.status, createdAt: customQuotes.createdAt })
    .from(customQuotes).where(and(eq(customQuotes.id, id), eq(customQuotes.ownerId, ownerId))).limit(1);
  return quote || null;
}

export function quoteBusinessDate() {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
