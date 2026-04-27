import {
  pgTable,
  text,
  timestamp,
  varchar,
  pgEnum,
  integer,
  boolean,
  jsonb,
  uuid,
  decimal,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";

// ——————————————————————————— Enums ———————————————————————————————————————————

export const userRoleEnum = pgEnum("user_role", [
  "customer",
  "affiliate",
  "editor",
  "project_manager",
  "admin",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "pending_payment",
  "payment_review",
  "in_queue",
  "in_progress",
  "in_review",
  "revision_requested",
  "completed",
  "cancelled",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "failed",
  "refunded",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "bank_transfer",
  "sslcommerz",
]);

// ——————————————————————————— Auth.js / NextAuth Tables ———————————————————————

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  password: text("password"),
  role: userRoleEnum("role").default("customer").notNull(),
  phone: varchar("phone", { length: 20 }),
  failedAttempts: integer("failed_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  ip: varchar("ip", { length: 45 }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const signupOtps = pgTable("signup_otps", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  otpHash: text("otp_hash").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

// ——————————————————————————— Packages ————————————————————————————————————————

export const packages = pgTable("packages", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  description: text("description"),
  tier: varchar("tier", { length: 50 }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  features: jsonb("features").$type<string[]>().default([]),
  maxRawFootageGB: integer("max_raw_footage_gb"),
  maxVideoLengthMin: integer("max_video_length_min"),
  revisions: integer("revisions").default(2),
  deliveryDays: integer("delivery_days").default(7),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ——————————————————————————— Projects ————————————————————————————————————————

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  brief: text("brief"),
  status: projectStatusEnum("status").default("pending_payment").notNull(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => users.id),
  editorId: uuid("editor_id").references(() => users.id),
  managerId: uuid("manager_id").references(() => users.id),
  packageId: uuid("package_id")
    .notNull()
    .references(() => packages.id),
  rawFootageUrl: text("raw_footage_url"),
  deliverableUrl: text("deliverable_url"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }),
});

// ——————————————————————————— Orders ——————————————————————————————————————————

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => users.id),
  packageId: uuid("package_id")
    .notNull()
    .references(() => packages.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("BDT").notNull(),
  status: orderStatusEnum("status").default("pending").notNull(),
  paymentMethod: paymentMethodEnum("payment_method"),
  bankTransferReceipt: text("bank_transfer_receipt"),
  transactionId: varchar("transaction_id", { length: 255 }),
  notes: text("notes"),
  paidAt: timestamp("paid_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ——————————————————————————— Portfolio ———————————————————————————————————————

export const portfolio = pgTable("portfolio", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  category: varchar("category", { length: 100 }),
  clientName: varchar("client_name", { length: 255 }),
  isFeatured: boolean("is_featured").default(false).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ——————————————————————————— System Settings —————————————————————————————————

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 255 }).unique().notNull(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ——————————————————————————— Password Reset ——————————————————————————————————

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  token: text("token").unique().notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ——————————————————————————— Type Exports ————————————————————————————————————

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type PortfolioItem = typeof portfolio.$inferSelect;
export type NewPortfolioItem = typeof portfolio.$inferInsert;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
export type SignupOtp = typeof signupOtps.$inferSelect;
export type NewSignupOtp = typeof signupOtps.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
