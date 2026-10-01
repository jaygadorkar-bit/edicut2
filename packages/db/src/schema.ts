import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
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

// Customer work is intentionally separate from `projects`, which stores the
// public portfolio entries shown on the marketing site.
export const workspaceProjects = pgTable("workspace_projects", {
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
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  billingStatus: varchar("billing_status", { length: 32 }).notNull().default("quote_requested"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("workspace_projects_owner_updated_idx").on(table.ownerId, table.updatedAt),
  index("workspace_projects_owner_status_idx").on(table.ownerId, table.status),
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

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
}));
