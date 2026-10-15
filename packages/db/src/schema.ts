import { relations, sql } from "drizzle-orm";
import type { CustomQuoteOptions } from "@edicut/shared/contracts/custom-quotes";
import {
  boolean,
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  sessionVersion: uuid("session_version").defaultRandom().notNull(),
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  phone: varchar("phone", { length: 32 }),
  country: varchar("country", { length: 120 }),
  profileImageUrl: text("profile_image_url"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("user"),
  active: boolean("active").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const adminUsers = pgTable("admin_users", {
  sessionVersion: uuid("session_version").defaultRandom().notNull(),
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  phone: varchar("phone", { length: 32 }),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  title: text("title").notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  summary: text("summary").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  featured: boolean("featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const siteSettings = pgTable("site_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 120 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatRooms = pgTable("chat_rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 16 }).notNull(),
  managerId: uuid("manager_id").references(() => users.id, { onDelete: "set null" }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true, precision: 3 }),
  lastMessagePreview: varchar("last_message_preview", { length: 180 }),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
}, table => [
  uniqueIndex("chat_rooms_manager_client_idx").on(table.clientId).where(sql`${table.kind} = 'manager'`),
  index("chat_rooms_client_updated_idx").on(table.clientId, table.updatedAt),
  index("chat_rooms_manager_updated_idx").on(table.managerId, table.updatedAt),
  index("chat_rooms_updated_idx").on(table.updatedAt),
  check("chat_rooms_kind_check", sql`${table.kind} IN ('manager', 'support') AND (${table.kind} = 'manager' OR ${table.managerId} IS NULL)`),
]);

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").notNull().references(() => chatRooms.id, { onDelete: "cascade" }),
  actorKey: varchar("actor_key", { length: 48 }).notNull(),
  senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
  senderAdminId: uuid("sender_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
  senderName: text("sender_name").notNull(),
  senderRole: varchar("sender_role", { length: 32 }).notNull(),
  body: text("body").notNull(),
  attachment: jsonb("attachment").$type<{ publicId: string; name: string; mime: string; bytes: number }>(),
  editedAt: timestamp("edited_at", { withTimezone: true, precision: 3 }),
  deletedAt: timestamp("deleted_at", { withTimezone: true, precision: 3 }),
  clientNonce: uuid("client_nonce").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
}, table => [
  uniqueIndex("chat_messages_actor_nonce_idx").on(table.actorKey, table.clientNonce),
  index("chat_messages_room_created_idx").on(table.roomId, table.createdAt, table.id),
  check("chat_messages_body_check", sql`char_length(${table.body}) <= 4000 AND (char_length(btrim(${table.body})) > 0 OR ${table.attachment} IS NOT NULL OR ${table.deletedAt} IS NOT NULL)`),
]);

export const chatReads = pgTable("chat_reads", {
  roomId: uuid("room_id").notNull().references(() => chatRooms.id, { onDelete: "cascade" }),
  actorKey: varchar("actor_key", { length: 48 }).notNull(),
  lastReadAt: timestamp("last_read_at", { withTimezone: true, precision: 3 }).notNull(),
  lastReadId: uuid("last_read_id"),
}, table => [uniqueIndex("chat_reads_room_actor_idx").on(table.roomId, table.actorKey)]);

export const supportTickets = pgTable("support_tickets", {
  roomId: uuid("room_id").primaryKey().references(() => chatRooms.id, { onDelete: "cascade" }),
  number: serial("ticket_number").notNull().unique(),
  subject: varchar("subject", { length: 160 }).notNull(),
  category: varchar("category", { length: 32 }).notNull(),
  priority: varchar("priority", { length: 16 }).notNull().default("normal"),
  status: varchar("status", { length: 24 }).notNull().default("waiting_support"),
  closedAt: timestamp("closed_at", { withTimezone: true, precision: 3 }),
  closedBy: varchar("closed_by", { length: 48 }),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
}, table => [
  index("support_tickets_status_updated_idx").on(table.status, table.updatedAt),
  check("support_tickets_subject_check", sql`char_length(btrim(${table.subject})) BETWEEN 3 AND 160`),
  check("support_tickets_category_check", sql`${table.category} IN ('billing', 'subscription', 'project', 'technical', 'account', 'other')`),
  check("support_tickets_priority_check", sql`${table.priority} IN ('low', 'normal', 'high')`),
  check("support_tickets_status_check", sql`${table.status} IN ('waiting_support', 'waiting_customer', 'closed')`),
  check("support_tickets_closed_check", sql`(${table.status} = 'closed' AND ${table.closedAt} IS NOT NULL AND ${table.closedBy} IS NOT NULL) OR (${table.status} <> 'closed' AND ${table.closedAt} IS NULL AND ${table.closedBy} IS NULL)`),
]).enableRLS();

export const marketingAffiliates = pgTable("marketing_affiliates", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 32 }).notNull().unique(),
  commissionRateBps: integer("commission_rate_bps").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("marketing_affiliates_commission_rate_check", sql`${table.commissionRateBps} BETWEEN 0 AND 10000`),
  index("marketing_affiliates_active_code_idx").on(table.active, table.code),
]);

// Checkout records are separate from editing orders. Payment is recorded manually
// until a gateway is available; customer deletion only hides an unpaid selection.
export const customerSubscriptions = pgTable("customer_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purchaseType: varchar("purchase_type", { length: 16 }).notNull().default("monthly"),
  packageSlug: varchar("package_slug", { length: 120 }).notNull(),
  planName: varchar("plan_name", { length: 120 }).notNull(),
  addOns: jsonb("add_ons").$type<{ id: "thumbnail" | "short-form"; label: string; amountCents: number }[]>().notNull().default(sql`'[]'::jsonb`),
  country: varchar("country", { length: 2 }).notNull(),
  phone: varchar("phone", { length: 16 }).notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  couponCode: varchar("coupon_code", { length: 32 }),
  affiliateId: uuid("affiliate_id").references(() => marketingAffiliates.id, { onDelete: "set null" }),
  affiliateCode: varchar("affiliate_code", { length: 32 }),
  affiliateCommissionBps: integer("affiliate_commission_bps").notNull().default(0),
  status: varchar("status", { length: 16 }).notNull().default("unpaid"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paidBy: uuid("paid_by").references(() => adminUsers.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("customer_subscriptions_owner_created_idx").on(table.ownerId, table.createdAt),
  index("customer_subscriptions_created_idx").on(table.createdAt),
  index("customer_subscriptions_affiliate_status_idx").on(table.affiliateId, table.status),
  uniqueIndex("customer_subscriptions_unpaid_plan_idx").on(table.ownerId, table.packageSlug)
    .where(sql`${table.status} = 'unpaid' AND ${table.deletedAt} IS NULL`),
  uniqueIndex("customer_subscriptions_paid_coupon_idx").on(table.ownerId, table.couponCode)
    .where(sql`${table.status} = 'paid' AND ${table.couponCode} IS NOT NULL`),
  check("customer_subscriptions_amount_check", sql`${table.subtotalCents} > 0 AND ${table.discountCents} >= 0 AND ${table.amountCents} >= 0 AND ${table.amountCents} = ${table.subtotalCents} - ${table.discountCents}`),
  check("customer_subscriptions_purchase_type_check", sql`${table.purchaseType} IN ('single', 'monthly')`),
  check("customer_subscriptions_add_ons_check", sql`jsonb_typeof(${table.addOns}) = 'array' AND jsonb_array_length(${table.addOns}) <= 2`),
  check("customer_subscriptions_status_check", sql`(${table.status} = 'unpaid' AND ${table.paidAt} IS NULL AND ${table.paidBy} IS NULL) OR (${table.status} = 'paid' AND ${table.paidAt} IS NOT NULL AND ${table.paidBy} IS NOT NULL AND ${table.deletedAt} IS NULL)`),
]);

export const contactMessages = pgTable("contact_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  projectType: varchar("project_type", { length: 120 }),
  monthlyVolume: varchar("monthly_volume", { length: 120 }),
  message: text("message").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("new"),
  lastReply: text("last_reply"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Quote requests have their own lifecycle and are accessible only through the
// authenticated server routes, separate from contact enquiries and purchases.
export const customQuotes = pgTable("custom_quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestToken: uuid("request_token").notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  customerName: varchar("customer_name", { length: 120 }).notNull(),
  customerEmail: varchar("customer_email", { length: 254 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  preferredContact: varchar("preferred_contact", { length: 16 }).notNull().default("email"),
  options: jsonb("options").$type<CustomQuoteOptions>().notNull(),
  status: varchar("status", { length: 16 }).notNull().default("new"),
  internalNotes: text("internal_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("custom_quotes_owner_token_idx").on(table.ownerId, table.requestToken),
  index("custom_quotes_owner_created_idx").on(table.ownerId, table.createdAt, table.id),
  index("custom_quotes_status_created_idx").on(table.status, table.createdAt, table.id),
  index("custom_quotes_created_idx").on(table.createdAt, table.id),
  check("custom_quotes_status_check", sql`${table.status} IN ('new', 'reviewing', 'contacted', 'closed')`),
  check("custom_quotes_contact_check", sql`${table.preferredContact} IN ('email', 'whatsapp') AND (${table.preferredContact} <> 'whatsapp' OR coalesce(length(${table.phone}), 0) > 0)`),
  check("custom_quotes_options_check", sql`jsonb_typeof(${table.options}) = 'object'`),
]).enableRLS();

export const marketingCoupons = pgTable("marketing_coupons", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  discountType: varchar("discount_type", { length: 16 }).notNull(),
  // Percent coupons store whole percentage points; fixed coupons store USD cents.
  discountValue: integer("discount_value").notNull(),
  minimumSubtotalCents: integer("minimum_subtotal_cents"),
  maxRedemptions: integer("max_redemptions"),
  redemptionCount: integer("redemption_count").notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("marketing_coupons_discount_type_check", sql`${table.discountType} IN ('percent', 'fixed')`),
  check("marketing_coupons_discount_value_check", sql`(${table.discountType} = 'percent' AND ${table.discountValue} BETWEEN 1 AND 100) OR (${table.discountType} = 'fixed' AND ${table.discountValue} > 0)`),
  check("marketing_coupons_redemption_count_check", sql`${table.redemptionCount} >= 0`),
  check("marketing_coupons_max_redemptions_check", sql`${table.maxRedemptions} IS NULL OR ${table.maxRedemptions} > 0`),
  check("marketing_coupons_minimum_subtotal_check", sql`${table.minimumSubtotalCents} IS NULL OR ${table.minimumSubtotalCents} > 0`),
  index("marketing_coupons_active_expiry_idx").on(table.active, table.expiresAt),
]);

// Customer work is intentionally separate from `projects`, which stores the
// public portfolio entries shown on the marketing site.
export const creatorProfiles = pgTable("creator_profiles", {
  ownerId: uuid("owner_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  details: jsonb("details").$type<Record<string, string>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Balances are initialized only from a verified paid purchase. Each debit and
// project creation share one statement, including the unique replay token.
export const purchaseEntitlements = pgTable("purchase_entitlements", {
  subscriptionId: uuid("subscription_id").primaryKey().references(() => customerSubscriptions.id, { onDelete: "restrict" }),
  grantedUnits: integer("granted_units").notNull(),
  usedUnits: integer("used_units").notNull().default(0),
}, table => [check("purchase_entitlements_balance_check", sql`${table.grantedUnits} > 0 AND ${table.usedUnits} >= 0 AND ${table.usedUnits} <= ${table.grantedUnits}`)]);

export const workspaceProjects = pgTable("workspace_projects", {
  reviewRevision: integer("review_revision").notNull().default(0),
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 120 }).notNull(),
  channelName: varchar("channel_name", { length: 120 }).notNull(),
  packageSlug: varchar("package_slug", { length: 120 }).notNull(),
  category: varchar("category", { length: 80 }),
  cadence: varchar("cadence", { length: 120 }),
  deadline: varchar("deadline", { length: 10 }),
  notes: text("notes"),
  status: varchar("status", { length: 32 }).notNull().default("intake"),
  billingName: varchar("billing_name", { length: 120 }),
  billingEmail: varchar("billing_email", { length: 254 }),
  billingCompany: varchar("billing_company", { length: 120 }),
  billingCountry: varchar("billing_country", { length: 120 }),
  finalAmountCents: integer("final_amount_cents"),
  invoiceUrl: text("invoice_url"),
  estimatedAmountCents: integer("estimated_amount_cents").notNull().default(0),
  couponId: uuid("coupon_id").references(() => marketingCoupons.id, { onDelete: "set null" }),
  couponCode: varchar("coupon_code", { length: 32 }),
  discountAmountCents: integer("discount_amount_cents").notNull().default(0),
  affiliateId: uuid("affiliate_id").references(() => marketingAffiliates.id, { onDelete: "set null" }),
  affiliateCode: varchar("affiliate_code", { length: 32 }),
  affiliateCommissionBps: integer("affiliate_commission_bps").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  billingStatus: varchar("billing_status", { length: 32 }).notNull().default("quote_requested"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("workspace_projects_owner_updated_idx").on(table.ownerId, table.updatedAt),
  index("workspace_projects_owner_status_idx").on(table.ownerId, table.status),
  uniqueIndex("workspace_projects_owner_coupon_unique_idx").on(table.ownerId, table.couponId).where(sql`${table.couponId} IS NOT NULL`),
  index("workspace_projects_affiliate_status_idx").on(table.affiliateId, table.billingStatus),
]);

export const projectIntakes = pgTable("project_intakes", {
  projectId: uuid("project_id").primaryKey().references(() => workspaceProjects.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => customerSubscriptions.id, { onDelete: "restrict" }),
  requestToken: uuid("request_token").notNull(),
  reservedUnits: integer("reserved_units").notNull(),
  brief: jsonb("brief").$type<Record<string, string | number>>().notNull(),
  channelSnapshot: jsonb("channel_snapshot").$type<Record<string, string>>().notNull(),
}, table => [
  uniqueIndex("project_intakes_owner_token_idx").on(table.ownerId, table.requestToken),
  index("project_intakes_subscription_idx").on(table.subscriptionId),
  check("project_intakes_reserved_check", sql`${table.reservedUnits} >= 0`),
]);

export const workspaceProjectFiles = pgTable("workspace_project_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => workspaceProjects.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 16 }).notNull().default("source"),
  fileName: varchar("file_name", { length: 160 }).notNull(),
  shareUrl: text("share_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("workspace_project_files_owner_project_idx").on(table.ownerId, table.projectId, table.createdAt),
]);

export const workspaceProjectReviews = pgTable("workspace_project_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => workspaceProjects.id, { onDelete: "cascade" }),
  decision: varchar("decision", { length: 32 }).notNull(),
  feedback: text("feedback"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("workspace_project_reviews_owner_project_idx").on(table.ownerId, table.projectId, table.createdAt),
]);

export const projectReviewMembers = pgTable("project_review_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => workspaceProjects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("project_review_members_project_user_idx").on(table.projectId, table.userId), index("project_review_members_user_idx").on(table.userId)]).enableRLS();

export const projectReviewVersions = pgTable("project_review_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => workspaceProjects.id, { onDelete: "cascade" }),
  actorKey: varchar("actor_key", { length: 64 }).notNull(),
  authorName: varchar("author_name", { length: 120 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  note: text("note").notNull().default(""),
  publicId: varchar("public_id", { length: 240 }).notNull(),
  mime: varchar("mime", { length: 40 }).notNull(),
  bytes: bigint("bytes", {mode:"number"}).notNull(),
  provider: varchar("provider",{length:20}).notNull().default("cloudinary"),
  youtubeId: varchar("youtube_id",{length:11}),
  driveFileId: varchar("drive_file_id",{length:240}),
  durationMs: integer("duration_ms").notNull(),
  decision: varchar("decision", { length: 24 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("project_review_versions_project_created_idx").on(table.projectId, table.createdAt, table.id),
  uniqueIndex("project_review_versions_public_id_idx").on(table.publicId),
  check("project_review_versions_media_check", sql`${table.mime} IN ('video/mp4', 'video/webm') AND ${table.bytes} BETWEEN 1 AND 10737418240 AND ${table.durationMs} BETWEEN 1 AND 21600000`),
  check("project_review_versions_provider_check",sql`(${table.provider}='cloudinary' AND ${table.youtubeId} IS NULL AND ${table.driveFileId} IS NULL AND ${table.bytes}<=52428800) OR (${table.provider}='youtube' AND ${table.youtubeId} IS NOT NULL AND ${table.driveFileId} IS NULL AND ${table.youtubeId} ~ '^[A-Za-z0-9_-]{11}$') OR (${table.provider}='google_drive' AND ${table.youtubeId} IS NULL AND ${table.driveFileId} ~ '^[A-Za-z0-9_-]{10,240}$')`),
  check("project_review_versions_decision_check", sql`${table.decision} IN ('pending', 'approved', 'changes_requested')`),
]).enableRLS();

export const videoStorageConnections = pgTable("video_storage_connections",{
  provider:varchar("provider",{length:20}).primaryKey(),
  channelId:varchar("channel_id",{length:32}).notNull(),
  channelName:varchar("channel_name",{length:160}).notNull(),
  refreshToken:text("refresh_token").notNull(),
  connectedBy:uuid("connected_by").references(()=>adminUsers.id,{onDelete:"set null"}),
  connectedAt:timestamp("connected_at",{withTimezone:true}).defaultNow().notNull(),
},table=>[check("video_storage_connections_provider_check",sql`${table.provider} IN ('youtube','google_drive')`)]).enableRLS();

export const projectReviewUploads = pgTable("project_review_uploads",{
  id:uuid("id").primaryKey(),projectId:uuid("project_id").notNull().references(()=>workspaceProjects.id,{onDelete:"cascade"}),
  actorKey:varchar("actor_key",{length:64}).notNull(),title:varchar("title",{length:100}).notNull(),note:text("note").notNull().default(""),
  mime:varchar("mime",{length:40}).notNull(),bytes:bigint("bytes",{mode:"number"}).notNull(),durationMs:integer("duration_ms").notNull(),
  channelId:varchar("channel_id",{length:32}),sessionUri:text("session_uri"),videoId:varchar("video_id",{length:11}),
  provider:varchar("provider",{length:20}).notNull().default("youtube"),driveFileId:varchar("drive_file_id",{length:240}),
  receivedBytes:bigint("received_bytes",{mode:"number"}).notNull().default(0),status:varchar("status",{length:16}).notNull().default("starting"),
  leaseUntil:timestamp("lease_until",{withTimezone:true}),expiresAt:timestamp("expires_at",{withTimezone:true}).notNull().default(sql`now()+interval '1 day'`),
  createdAt:timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
},table=>[index("project_review_uploads_actor_expiry_idx").on(table.actorKey,table.expiresAt),index("project_review_uploads_project_idx").on(table.projectId),
  check("project_review_uploads_media_check",sql`${table.mime} IN ('video/mp4','video/webm') AND ${table.bytes} BETWEEN 16 AND 10737418240 AND ${table.durationMs} BETWEEN 1 AND 21600000 AND ${table.receivedBytes} BETWEEN 0 AND ${table.bytes}`),
  check("project_review_uploads_status_check",sql`${table.status} IN ('starting','uploading','uploaded','saved','failed')`),
  check("project_review_uploads_provider_check",sql`${table.provider} IN ('youtube','google_drive')`),
]).enableRLS();

export const projectReviewComments = pgTable("project_review_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  versionId: uuid("version_id").notNull().references(() => projectReviewVersions.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  actorKey: varchar("actor_key", { length: 64 }).notNull(),
  authorName: varchar("author_name", { length: 120 }).notNull(),
  authorRole: varchar("author_role", { length: 24 }).notNull(),
  body: text("body").notNull(),
  timestampMs: integer("timestamp_ms"),
  endMs: integer("end_ms"),
  annotation: jsonb("annotation").$type<{ x: number; y: number; width: number; height: number } | null>(),
  category: varchar("category", { length: 16 }).notNull().default("change"),
  priority: varchar("priority", { length: 16 }).notNull().default("normal"),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("project_review_comments_version_created_idx").on(table.versionId, table.createdAt, table.id),
  index("project_review_comments_parent_idx").on(table.parentId),
  check("project_review_comments_body_check", sql`length(${table.body}) BETWEEN 1 AND 4000`),
  check("project_review_comments_time_check", sql`(${table.timestampMs} IS NULL AND ${table.endMs} IS NULL AND ${table.annotation} IS NULL) OR (${table.timestampMs} IS NOT NULL AND ${table.timestampMs} BETWEEN 0 AND 21600000 AND (${table.endMs} IS NULL OR ${table.endMs} BETWEEN ${table.timestampMs} AND 21600000))`),
  check("project_review_comments_category_check", sql`${table.category} IN ('change', 'question', 'praise') AND ${table.priority} IN ('normal', 'high')`),
]).enableRLS();

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
}));
