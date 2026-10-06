import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { creatorProfiles, customerSubscriptions, projectIntakes, purchaseEntitlements } from "@edicut/db/schema";
import type { DatabaseClient } from "@edicut/db/client";
import { getCatalogPackage } from "./subscriptions";
import { hasReturnedRows } from "./db.server";
import { projectBriefNotes, type CreatorProfile, type ProjectBrief } from "./client-intake";

export type ClientPurchase = {
  id: string; name: string; slug: string; type: "monthly" | "single";
  granted: number; used: number; remaining: number; paidAt: string; expiresAt: string | null; active: boolean;
};
export function purchaseAllowance(slug: string, type: string) {
  const pack = getCatalogPackage(slug);
  return pack?.packageType === type ? pack.packageType === "monthly" ? pack.editingHoursPerMonth * 60 : 1 : 0;
}
export function purchaseExpiry(paidAt: Date, type: string) {
  if (type !== "monthly") return null;
  // A calendar month, clamped to the last day of the following month.
  const end = new Date(paidAt);
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(paidAt.getUTCDate(), lastDay));
  return end;
}
export function isMissingClientWorkspaceSchema(error: unknown) {
  const seen = new Set<object>();
  let current = error;
  let context = false;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const item = current as { message?: string; code?: string; cause?: unknown };
    context ||= /creator_profiles|project_intakes|purchase_entitlements|customer_subscriptions/.test(item.message ?? "");
    if (context && (item.code === "42P01" || item.code === "42703" || /does not exist/.test(item.message ?? ""))) return true;
    current = item.cause;
  }
  return false;
}
export async function loadClientWorkspace(db: DatabaseClient, ownerId: string, now = new Date()) {
  const [profiles, purchases] = await Promise.all([
    db.select().from(creatorProfiles).where(eq(creatorProfiles.ownerId, ownerId)).limit(1),
    db.select({ subscription: customerSubscriptions, entitlement: purchaseEntitlements }).from(customerSubscriptions)
      .leftJoin(purchaseEntitlements, eq(customerSubscriptions.id, purchaseEntitlements.subscriptionId))
      .where(and(eq(customerSubscriptions.ownerId, ownerId), eq(customerSubscriptions.status, "paid"), isNull(customerSubscriptions.deletedAt)))
      .orderBy(desc(customerSubscriptions.paidAt)),
  ]);
  const credits: ClientPurchase[] = purchases.filter(row => row.subscription.paidAt).map(({ subscription: s, entitlement: e }) => {
    const expiresAt = purchaseExpiry(s.paidAt!, s.purchaseType);
    const granted = e?.grantedUnits ?? purchaseAllowance(s.packageSlug, s.purchaseType);
    const used = e?.usedUnits ?? 0;
    const active = s.paidAt! <= now && (!expiresAt || expiresAt > now);
    return { id: s.id, name: s.planName, slug: s.packageSlug, type: s.purchaseType as "monthly" | "single", granted, used,
      remaining: active ? Math.max(0, granted - used) : 0, paidAt: s.paidAt!.toISOString(), expiresAt: expiresAt?.toISOString() ?? null, active };
  });
  return { profile: (profiles[0]?.details as CreatorProfile | undefined) ?? null, purchases: credits };
}
export async function saveCreatorProfile(db: DatabaseClient, ownerId: string, profile: CreatorProfile) {
  // Both the GET and POST gate profiles on at least one confirmed purchase.
  const result = await db.execute(sql`
    INSERT INTO creator_profiles (owner_id, details)
    SELECT ${ownerId}::uuid, ${JSON.stringify(profile)}::jsonb
    WHERE EXISTS (SELECT 1 FROM customer_subscriptions WHERE owner_id = ${ownerId} AND status = 'paid' AND deleted_at IS NULL)
    ON CONFLICT (owner_id) DO UPDATE SET details = creator_profiles.details || EXCLUDED.details, updated_at = now()
    RETURNING owner_id
  `);
  return hasReturnedRows(result);
}
export async function createPurchasedProject(db: DatabaseClient, ownerId: string, subscriptionId: string, token: string, brief: ProjectBrief) {
  const state = await loadClientWorkspace(db, ownerId);
  if (!state.profile) return { error: "Complete your channel profile before starting a project." };
  const existing = await db.select({ id: projectIntakes.projectId }).from(projectIntakes)
    .where(and(eq(projectIntakes.ownerId, ownerId), eq(projectIntakes.requestToken, token))).limit(1);
  if (existing[0]) return { id: existing[0].id };
  const purchase = state.purchases.find(p => p.id === subscriptionId);
  if (!purchase?.active || !purchase.remaining) return { error: "Choose a paid package with an available balance." };
  const pack = getCatalogPackage(purchase.slug);
  if (!pack) return { error: "Contact us to confirm the allowance for this package." };
  if (pack.packageType === "single") {
    const maxFinished = Number(pack.finishedLength.match(/\d+/)?.[0]);
    const maxRaw = Number(pack.rawFootageLimit.match(/\d+/)?.[0]);
    if (brief.finishedMinutes > maxFinished || brief.rawMinutes > maxRaw) return { error: `This package allows ${maxFinished} finished minutes and ${maxRaw} raw minutes. Choose a larger package or request a custom quote.` };
  }
  if (purchase.type === "single") brief = { ...brief, editingMinutes: 0 };
  const units = purchase.type === "monthly" ? brief.editingMinutes : 1;
  if (!units || units > purchase.remaining) return { error: "Reserve editing hours within the available package balance." };
  // Initialize once. Concurrent requests converge on this same balance row.
  await db.execute(sql`INSERT INTO purchase_entitlements (subscription_id, granted_units)
    SELECT id, ${purchase.granted} FROM customer_subscriptions
    WHERE id = ${subscriptionId} AND owner_id = ${ownerId} AND status = 'paid' AND deleted_at IS NULL
    ON CONFLICT (subscription_id) DO NOTHING`);
  const id = crypto.randomUUID();
  try {
    const result = await db.execute(sql`
      WITH eligible AS MATERIALIZED (
        SELECT s.id, s.owner_id, s.package_slug FROM customer_subscriptions s
        JOIN creator_profiles c ON c.owner_id = s.owner_id
        WHERE s.id = ${subscriptionId} AND s.owner_id = ${ownerId} AND s.status = 'paid' AND s.deleted_at IS NULL
          AND s.paid_at <= now()
          AND (s.purchase_type = 'single' OR (s.paid_at AT TIME ZONE 'UTC' + interval '1 month') AT TIME ZONE 'UTC' > now())
        FOR UPDATE OF s
      ), charged AS (
        UPDATE purchase_entitlements e SET used_units = used_units + ${units}
        FROM eligible s
        WHERE e.subscription_id = s.id
          AND e.used_units + ${units} <= e.granted_units
        RETURNING s.package_slug
      ), project AS (
        INSERT INTO workspace_projects (id, owner_id, title, channel_name, package_slug, category, cadence, deadline, notes, billing_status)
        SELECT ${id}::uuid, ${ownerId}::uuid, ${brief.title}, ${state.profile.channelName}, package_slug,
        NULL::varchar, NULL::varchar, ${brief.deadline}, ${`Purchase: ${subscriptionId}\n\n${projectBriefNotes(state.profile, brief)}`}, 'paid'
        FROM charged RETURNING id
      ), intake AS (
        INSERT INTO project_intakes (project_id, owner_id, subscription_id, request_token, reserved_units, brief, channel_snapshot)
        SELECT id, ${ownerId}::uuid, ${subscriptionId}::uuid, ${token}::uuid, ${units}, ${JSON.stringify(brief)}::jsonb, ${JSON.stringify(state.profile)}::jsonb
        FROM project RETURNING project_id
      ) INSERT INTO workspace_project_files (owner_id, project_id, kind, file_name, share_url)
        SELECT ${ownerId}::uuid, project_id, 'source', 'Project footage', ${brief.footageUrl} FROM intake RETURNING project_id
    `);
    return hasReturnedRows(result) ? { id } : { error: "This package balance changed or expired. Refresh and choose an available package." };
  } catch (error) {
    // The unique token aborts the entire statement, rolling back any debit.
    let cause: unknown = error;
    const seen = new Set<object>();
    while (cause && typeof cause === "object" && !seen.has(cause)) {
      seen.add(cause);
      if ((cause as { code?: string }).code === "23505") {
        const replay = await db.select({ id: projectIntakes.projectId }).from(projectIntakes)
          .where(and(eq(projectIntakes.ownerId, ownerId), eq(projectIntakes.requestToken, token))).limit(1);
        if (replay[0]) return { id: replay[0].id };
        break;
      }
      cause = (cause as { cause?: unknown }).cause;
    }
    throw error;
  }
}
