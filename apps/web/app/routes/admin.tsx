import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, data, redirect, useActionData, useLoaderData, useLocation, useNavigation, useSearchParams } from "react-router";
import bcrypt from "bcryptjs";
import { updateUserRole } from "@edicut/db/repositories/users";
import { findAdminUserById } from "@edicut/db/repositories/admin-users";
import { adminUsers as adminUsersTable, customerSubscriptions, marketingAffiliates, marketingCoupons, users as usersTable, workspaceProjectFiles, workspaceProjects } from "@edicut/db/schema";
import { getDbFromContext, hasReturnedRows } from "../lib/db.server";
import {
  destroyAdminSession,
  destroySession,
  commitAdminSession,
  getAdminSession,
  getSession,
  isAdminRole,
  requireAdminUser,
} from "../lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH, adminPath } from "../lib/admin-paths";
import { toPublicAdminUser } from "../lib/admin-public";
import { deleteSupabaseUsersByEmail } from "../integrations/supabase/client.server";
import { formatUserRole, isUserRole, normalizeUserRole, USER_ROLES, type UserRole } from "../lib/admin-user-roles";
import {
  createPackageId,
  getPricingPackages,
  packageSlug,
  savePricingPackages,
  type PricingPackage,
} from "../lib/pricing.server";
import { formatPackagePrice, getCatalogPackage, parsePackagePrice } from "../lib/subscriptions";
import { cloudinaryVideoThumbnailUrl, optimizeCloudinaryUrl } from "../lib/cloudinary";
import {
  deleteCloudinaryVideos,
  deleteCloudinaryImages,
  getCloudinaryVideoUsage,
  getCloudinaryUsage,
  listCloudinaryVideos,
  listCloudinaryImages,
  removeCloudinaryUrlsFromPortfolioSections,
  removeCloudinaryUrlsFromPackages,
  uploadPortfolioVideoToCloudinary,
  uploadPackageImageToCloudinary,
  type CloudinaryImageResource,
  type CloudinaryVideoResource,
  type CloudinaryUsage,
} from "../lib/cloudinary.server";
import {
  createPortfolioId,
  getPortfolioSections,
  savePortfolioSections,
  type PortfolioSection,
} from "../lib/portfolio.server";
import {
  saveAdminToolbarEnabled,
  savePromoBarSettings,
  saveMaintenanceModeEnabled,
  saveSearchCrawlingEnabled,
  getSiteSettingsSnapshot,
  getRoleFeatureAccessSettings,
  saveRoleFeatureAccessSettings,
} from "../lib/site-settings.server";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, count as drizzleCount } from "drizzle-orm";
import { useState, useEffect, type ReactNode } from "react";
import {
  DASHBOARD_FEATURES,
  DEFAULT_ROLE_FEATURE_ACCESS,
  roleFeatureAccessFromFormData,
  type RoleFeatureAccess,
} from "../lib/role-feature-access";
import { getAdminDataRequirements, getPageWithinRange, getPositivePage } from "../lib/admin-data-requirements";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { AdminAccountDialog } from "../components/AdminAccountDialog";
import { isMissingWorkspaceSchema, parseBillingAmountToCents, parseWorkspaceShareUrl, WORKSPACE_MIGRATION_NOTICE } from "../lib/workspace";
import { consumeUsageLimit, requestBodyExceedsLimit, type UsageLimitResult } from "../lib/usage-protection.server";
import {
  getAdminMarketingData,
  isMissingMarketingSchema,
  MARKETING_MIGRATION_NOTICE,
  normalizeMarketingCode,
  parseCommissionRateBps,
  parseCouponDate,
  type AdminMarketingData,
} from "../lib/marketing.server";
import { MarketingPanel } from "../components/admin/MarketingPanel";
import { AffiliateAdminPanel } from "../components/admin/AffiliateAdminPanel";
import { isMissingCustomerSubscriptionSchema } from "../lib/customer-subscriptions.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";

const PAGE_SIZE = 10;
const WORKSPACE_PROJECT_PAGE_SIZE = 20;
const MAX_ADMIN_ACTION_BODY_BYTES = 56 * 1024 * 1024;
const MAX_BULK_RECORDS = 100;
const MAX_IMAGE_UPLOAD_COUNT = 8;
const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BATCH_BYTES = 40 * 1024 * 1024;

type AdminUserActivity = {
  paidPurchases: number | null;
  activeProjects: number | null;
};
const MAX_VIDEO_FILE_BYTES = 50 * 1024 * 1024;

const adminPlaceholderConfigs = {
  projects: {
    title: "Projects workspace",
    icon: "video_library",
    description: "A central view for project intake, production status, assignments, and delivery health.",
    cards: [
      ["Project pipeline", "Monitor briefs as they move from intake to delivery."],
      ["Team assignments", "Balance editor capacity and keep ownership visible."],
      ["Delivery health", "Surface overdue work and projects waiting for review."],
    ],
  },
  payments: {
    title: "Payments workspace",
    icon: "payments",
    description: "A finance view for invoices, successful payments, refunds, and payout readiness.",
    cards: [
      ["Payment activity", "Review the latest successful and pending transactions."],
      ["Invoice queue", "Keep client billing records organized and easy to reconcile."],
      ["Payout readiness", "Track affiliate and production payouts before release."],
    ],
  },
  audit: {
    title: "Audit logs",
    icon: "history",
    description: "A security timeline for role changes, account actions, configuration updates, and system events.",
    cards: [
      ["Account activity", "See sign-ins, role updates, and account lifecycle events."],
      ["Configuration changes", "Review updates to packages, settings, and access rules."],
      ["Exportable history", "Prepare a filtered audit trail for operational review."],
    ],
  },
} as const;

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function usageLimitMessage(result: UsageLimitResult, limitedMessage: string) {
  return result === "limited"
    ? limitedMessage
    : "Usage protection is temporarily unavailable. Please try again shortly.";
}

async function removeUnreferencedPackageUploads(
  assets: CloudinaryImageResource[],
  context: Parameters<typeof uploadPackageImageToCloudinary>[1],
) {
  if (!assets.length) return true;
  try {
    await deleteCloudinaryImages(assets.map((asset) => asset.public_id), context);
    return true;
  } catch (error) {
    console.error("Cloudinary image cleanup failed:", error);
    return false;
  }
}

function linesToList(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function packageFromForm(formData: FormData, existing?: PricingPackage): PricingPackage | { error: string } {
  const name = String(formData.get("name") || "").trim();
  const price = String(formData.get("price") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const slug = packageSlug(String(formData.get("slug") || ""), name);
  const catalogPackage = getCatalogPackage(slug);
  const rawFeatures = String(formData.get("features") || "");
  const rawDeliverables = String(formData.get("deliverables") || "");
  const rawGalleryImages = String(formData.get("galleryImages") || "");
  const bestFor = String(formData.get("bestFor") || "").trim();
  const turnaround = String(formData.get("turnaround") || "").trim();
  const revisions = String(formData.get("revisions") || "").trim();
  const badge = String(formData.get("badge") || "").trim();
  const rawSortOrder = String(formData.get("sortOrder") ?? "").trim();
  const sortOrder = rawSortOrder ? Number(rawSortOrder) : existing?.sortOrder ?? 0;
  const priceAmount = parsePackagePrice(price);

  if (!catalogPackage) return { error: "Pricing is managed through the six configured packages." };
  if (existing && existing.slug !== slug) return { error: "Package links are fixed so saved checkouts and referrals keep working." };
  if (priceAmount === null) return { error: "Enter a whole-dollar USD price between $1 and $999,999." };
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 999_999) {
    return { error: "Sort order must be a whole number from 0 to 999,999." };
  }

  if (rawFeatures.length > 12_000 || rawDeliverables.length > 12_000 || rawGalleryImages.length > 50_000) {
    return { error: "Package lists are too long. Shorten them before saving." };
  }

  const features = linesToList(rawFeatures);
  const deliverables = linesToList(rawDeliverables);
  const galleryImages = linesToList(rawGalleryImages);

  if (!name) return { error: "Package name is required." };
  if (!price) return { error: "Package price is required." };
  if (!description) return { error: "Package description is required." };
  if (!features.length) return { error: "Add at least one package feature." };
  if (name.length > 120 || description.length > 3_000 || slug.length > 120) {
    return { error: "Keep the name, description, and slug within their size limits." };
  }
  if (
    features.length > 50 || deliverables.length > 50 || galleryImages.length > 50 ||
    features.some((item) => item.length > 250) ||
    deliverables.some((item) => item.length > 250) ||
    galleryImages.some((item) => item.length > 2_048)
  ) {
    return { error: "Packages are limited to 50 list items, with shorter text and image URLs." };
  }
  if (bestFor.length > 1_000 || turnaround.length > 120 || revisions.length > 120 || badge.length > 80) {
    return { error: "Shorten the package summary, turnaround, revisions, or badge text." };
  }

  return {
    id: existing?.id || createPackageId(),
    name,
    slug,
    packageType: catalogPackage.packageType,
    editingHoursPerMonth: catalogPackage.packageType === "monthly" ? catalogPackage.editingHoursPerMonth : null,
    editingHoursPerWorkday: catalogPackage.packageType === "monthly" ? catalogPackage.editingHoursPerWorkday : null,
    price: formatPackagePrice(priceAmount),
    interval: catalogPackage.packageType === "monthly" ? "/month" : "one-time",
    description,
    features,
    deliverables,
    galleryImages,
    bestFor,
    turnaround,
    revisions,
    badge,
    popular: formData.get("popular") === "on",
    active: formData.get("active") === "on",
    sortOrder,
  };
}

function marketingCouponInput(formData: FormData) {
  const code = normalizeMarketingCode(String(formData.get("code") || ""));
  const discountType = String(formData.get("discountType") || "");
  const rawDiscountValue = String(formData.get("discountValue") || "").trim();
  const rawMinimum = String(formData.get("minimumSubtotal") || "").trim();
  const rawMaximum = String(formData.get("maxRedemptions") || "").trim();
  const startsAt = parseCouponDate(String(formData.get("startsOn") || ""));
  const expiresAt = parseCouponDate(String(formData.get("expiresOn") || ""), true);

  if (!code) return { error: "Use 3–32 letters, numbers, hyphens, or underscores for the coupon code." } as const;
  if (discountType !== "percent" && discountType !== "fixed") return { error: "Choose a valid discount type." } as const;
  if (startsAt === undefined || expiresAt === undefined) return { error: "Enter valid start and expiry dates." } as const;
  if (startsAt && expiresAt && startsAt >= expiresAt) return { error: "The expiry date must be after the start date." } as const;

  let discountValue: number;
  if (discountType === "percent") {
    discountValue = Number(rawDiscountValue);
    if (!/^\d{1,3}$/.test(rawDiscountValue) || !Number.isInteger(discountValue) || discountValue < 1 || discountValue > 100) {
      return { error: "Percentage discounts must be a whole number from 1 to 100." } as const;
    }
  } else {
    const cents = parseBillingAmountToCents(rawDiscountValue);
    if (cents === null) return { error: "Enter a fixed discount from $0.01 to $9,999,999.99." } as const;
    discountValue = cents;
  }

  const minimumSubtotalCents = rawMinimum ? parseBillingAmountToCents(rawMinimum) : null;
  if (rawMinimum && minimumSubtotalCents === null) return { error: "Enter a minimum package price from $0.01 to $9,999,999.99." } as const;

  let maxRedemptions: number | null = null;
  if (rawMaximum) {
    maxRedemptions = Number(rawMaximum);
    if (!/^[1-9]\d{0,6}$/.test(rawMaximum) || !Number.isSafeInteger(maxRedemptions) || maxRedemptions > 1_000_000) {
      return { error: "Maximum uses must be a whole number from 1 to 1,000,000." } as const;
    }
  }

  return { code, discountType, discountValue, minimumSubtotalCents, maxRedemptions, startsAt, expiresAt } as const;
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function readExpectedUpdatedAt(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) || date.toISOString() !== value ? null : date.toISOString();
}

export const meta: MetaFunction = () => {
  return [
    { title: "Admin Workspace - EdiCut" },
    { name: "robots", content: "noindex,nofollow" },
  ];
};

export function headers() {
  return {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const url = new URL(request.url);
  const adminUser = await requireAdminUser(request, db, context, `${url.pathname}${url.search}`);
  const tab = url.searchParams.get("tab") || "overview";
  if (tab === "payments" || tab === "subscriptions") throw redirect(adminPath("/subscriptions"));
  if (tab === "messages") throw redirect("/dashboard/messages");
  if (tab === "quotes" || tab === "infrastructure") throw redirect(adminPath(`/${tab}`));
  if (!["overview", "users", "roles", "packages", "marketing", "affiliates", "images", "videos", "projects", "audit", "settings"].includes(tab)) {
    throw redirect(ADMIN_BASE_PATH);
  }
  const q = url.searchParams.get("q") || "";
  const roleFilter = url.searchParams.get("role") || "";
  const requestedPage = getPositivePage(url.searchParams.get("page"));
  const requestedWorkspaceProjectPage = getPositivePage(url.searchParams.get("projectPage"));
  const sort = url.searchParams.get("sort") || "createdAt";
  const order = url.searchParams.get("order") || "desc";
  const view = url.searchParams.get("view") || "active"; // active or trash
  if (tab === "marketing" && view === "affiliates") {
    throw redirect(adminPath("?tab=affiliates"));
  }
  const adminDirectory = view === "admins";
  const requirements = getAdminDataRequirements(tab);

  // Build filters for users
  const filters = [];
  
  if (view === "trash") {
    filters.push(isNotNull(usersTable.deletedAt));
  } else {
    filters.push(isNull(usersTable.deletedAt));
  }

  if (q) {
    filters.push(or(ilike(usersTable.name, `%${q}%`), ilike(usersTable.email, `%${q}%`)));
  }
  if (roleFilter && isUserRole(roleFilter)) {
    filters.push(eq(usersTable.role, roleFilter));
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;
  const adminFilters = q
    ? or(ilike(adminUsersTable.name, `%${q}%`), ilike(adminUsersTable.email, `%${q}%`))
    : undefined;
  
  // Sorting
  const sortColumn = sort === "name" ? usersTable.name : sort === "role" ? usersTable.role : usersTable.createdAt;
  const orderBy = order === "asc" ? asc(sortColumn) : desc(sortColumn);
  const adminSortColumn = sort === "name" ? adminUsersTable.name : sort === "role" ? adminUsersTable.role : adminUsersTable.createdAt;
  const adminOrderBy = order === "asc" ? asc(adminSortColumn) : desc(adminSortColumn);

  // Clamp before calculating offsets, including empty directories and large URLs.
  const [totalResult, adminTotalResult] = await Promise.all([
    !requirements.userDirectory || adminDirectory ? Promise.resolve([{ count: 0 }]) : db.select({ count: drizzleCount() }).from(usersTable).where(whereClause),
    requirements.userDirectory && adminDirectory ? db.select({ count: drizzleCount() }).from(adminUsersTable).where(adminFilters) : Promise.resolve([{ count: 0 }]),
  ]);
  const totalUsersCount = Number(adminDirectory ? adminTotalResult[0]?.count ?? 0 : totalResult[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalUsersCount / PAGE_SIZE));
  const page = getPageWithinRange(requestedPage, totalPages);
  const [users, adminUsers] = await Promise.all([
    !requirements.userDirectory || adminDirectory ? Promise.resolve([]) : db.select().from(usersTable)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    requirements.userDirectory && adminDirectory ? db.select().from(adminUsersTable)
      .where(adminFilters)
      .orderBy(adminOrderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE) : Promise.resolve([]),
  ]);
  const userActivity: Record<string, AdminUserActivity> = {};
  if (requirements.userDirectory && !adminDirectory && users.length > 0) {
    const userIds = users.map((user) => user.id);
    const [subscriptionCounts, projectCounts] = await Promise.all([
      db.select({ ownerId: customerSubscriptions.ownerId, count: drizzleCount() })
        .from(customerSubscriptions)
        .where(and(
          inArray(customerSubscriptions.ownerId, userIds),
          eq(customerSubscriptions.status, "paid"),
          isNull(customerSubscriptions.deletedAt),
        ))
        .groupBy(customerSubscriptions.ownerId)
        .catch((error) => {
          if (!isMissingCustomerSubscriptionSchema(error)) throw error;
          return null;
        }),
      db.select({ ownerId: workspaceProjects.ownerId, count: drizzleCount() })
        .from(workspaceProjects)
        .where(and(
          inArray(workspaceProjects.ownerId, userIds),
          ne(workspaceProjects.status, "delivered"),
        ))
        .groupBy(workspaceProjects.ownerId)
        .catch((error) => {
          if (!isMissingWorkspaceSchema(error)) throw error;
          return null;
        }),
    ]);
    const subscriptionsByUser = subscriptionCounts === null
      ? null
      : new Map(subscriptionCounts.map(({ ownerId, count }) => [ownerId, count]));
    const projectsByUser = projectCounts === null
      ? null
      : new Map(projectCounts.map(({ ownerId, count }) => [ownerId, count]));
    for (const userId of userIds) {
      userActivity[userId] = {
        paidPurchases: subscriptionsByUser?.get(userId) ?? (subscriptionsByUser === null ? null : 0),
        activeProjects: projectsByUser?.get(userId) ?? (projectsByUser === null ? null : 0),
      };
    }
  }
  let workspaceProjectRows: Array<{
    project: Pick<
      typeof workspaceProjects.$inferSelect,
      "id" | "title" | "channelName" | "packageSlug" | "notes" | "status" | "billingStatus" | "finalAmountCents" | "invoiceUrl" | "updatedAt"
    >;
    ownerName: string | null;
    ownerEmail: string | null;
  }> = [];
  let workspaceFiles: Pick<
    typeof workspaceProjectFiles.$inferSelect,
    "id" | "projectId" | "kind" | "fileName" | "shareUrl"
  >[] = [];
  let workspaceProjectCount = 0;
  let workspaceProjectReviewCount = 0;
  let workspaceProjectPage = requestedWorkspaceProjectPage;
  let workspaceProjectPageCount = 1;
  let workspaceReady = true;
  if (tab === "projects") {
    try {
      const selectProjectsForPage = (pageNumber: number) => db.select({
          project: {
            id: workspaceProjects.id,
            title: workspaceProjects.title,
            channelName: workspaceProjects.channelName,
            packageSlug: workspaceProjects.packageSlug,
            notes: workspaceProjects.notes,
            status: workspaceProjects.status,
            billingStatus: workspaceProjects.billingStatus,
            finalAmountCents: workspaceProjects.finalAmountCents,
            invoiceUrl: workspaceProjects.invoiceUrl,
            updatedAt: workspaceProjects.updatedAt,
          },
          ownerName: usersTable.name,
          ownerEmail: usersTable.email,
        })
          .from(workspaceProjects)
          .leftJoin(usersTable, eq(workspaceProjects.ownerId, usersTable.id))
          .orderBy(desc(workspaceProjects.updatedAt))
          .limit(WORKSPACE_PROJECT_PAGE_SIZE)
          .offset((pageNumber - 1) * WORKSPACE_PROJECT_PAGE_SIZE);
      const projectStats = await db.select({
        total: drizzleCount(),
        awaitingReview: sql<number>`count(*) FILTER (WHERE ${inArray(workspaceProjects.status, ["review", "client_review"])})`.mapWith(Number),
      }).from(workspaceProjects);
      workspaceProjectCount = projectStats[0]?.total ?? 0;
      workspaceProjectReviewCount = projectStats[0]?.awaitingReview ?? 0;
      workspaceProjectPageCount = Math.max(1, Math.ceil(workspaceProjectCount / WORKSPACE_PROJECT_PAGE_SIZE));
      workspaceProjectPage = getPageWithinRange(requestedWorkspaceProjectPage, workspaceProjectPageCount);
      workspaceProjectRows = await selectProjectsForPage(workspaceProjectPage);

      const visibleProjectIds = workspaceProjectRows.map(({ project }) => project.id);
      if (visibleProjectIds.length) {
        workspaceFiles = await db.select({
          id: workspaceProjectFiles.id,
          projectId: workspaceProjectFiles.projectId,
          kind: workspaceProjectFiles.kind,
          fileName: workspaceProjectFiles.fileName,
          shareUrl: workspaceProjectFiles.shareUrl,
        }).from(workspaceProjectFiles)
          .where(inArray(workspaceProjectFiles.projectId, visibleProjectIds))
          .orderBy(desc(workspaceProjectFiles.createdAt));
      }
    } catch (error) {
      if (!isMissingWorkspaceSchema(error)) throw error;
      workspaceReady = false;
    }
  }

  // Aggregate user totals in one PostgreSQL pass; keep the separate admin
  // table count because privileged accounts live in a different table.
  const [
    userStatsResult,
    adminCount,
    pricingPackages,
    siteSettingsSnapshot,
    roleFeatureAccess,
    portfolioSections,
    imageListResult,
    cloudinaryUsage,
    videoListResult,
    cloudinaryVideoUsage,
  ] = await Promise.all([
    requirements.stats
      ? db.select({
          total: sql<number>`count(*) FILTER (WHERE ${isNull(usersTable.deletedAt)})`.mapWith(Number),
          managers: sql<number>`count(*) FILTER (WHERE ${and(eq(usersTable.role, "project_manager"), isNull(usersTable.deletedAt))})`.mapWith(Number),
          editors: sql<number>`count(*) FILTER (WHERE ${and(eq(usersTable.role, "editor"), isNull(usersTable.deletedAt))})`.mapWith(Number),
          customers: sql<number>`count(*) FILTER (WHERE ${and(eq(usersTable.role, "customer"), isNull(usersTable.deletedAt))})`.mapWith(Number),
          support: sql<number>`count(*) FILTER (WHERE ${and(eq(usersTable.role, "customer_support"), isNull(usersTable.deletedAt))})`.mapWith(Number),
          trash: sql<number>`count(*) FILTER (WHERE ${isNotNull(usersTable.deletedAt)})`.mapWith(Number),
        }).from(usersTable)
      : Promise.resolve([{ total: 0, managers: 0, editors: 0, customers: 0, support: 0, trash: 0 }]),
    requirements.stats ? db.select({ count: drizzleCount() }).from(adminUsersTable).where(eq(adminUsersTable.active, true)) : Promise.resolve([{ count: 0 }]),
    requirements.pricingPackages ? getPricingPackages(db) : Promise.resolve([]),
    requirements.siteSettings
      ? getSiteSettingsSnapshot(db, context, { includeAdminToolbar: true, includePromoBar: true })
      : Promise.resolve({
          adminToolbarEnabled: false,
          searchCrawlingEnabled: false,
          maintenanceModeEnabled: false,
          promoBarSettings: { enabled: false, message: "" },
        }),
    requirements.roleFeatureAccess ? getRoleFeatureAccessSettings(db, context) : Promise.resolve(DEFAULT_ROLE_FEATURE_ACCESS),
    requirements.portfolioSections ? getPortfolioSections(db, context) : Promise.resolve([]),
    requirements.images ? listCloudinaryImages(context).then(resources => ({ resources, error: null as string | null })).catch((error) => {
      console.error("Cloudinary image list error:", error);
      return { resources: [] as CloudinaryImageResource[], error: "The image library could not be loaded. Check the media connection and refresh." };
    }) : Promise.resolve({ resources: [] as CloudinaryImageResource[], error: null as string | null }),
    requirements.imageUsage ? getCloudinaryUsage(context).catch((error) => {
      console.error("Cloudinary usage error:", error);
      return null as CloudinaryUsage | null;
    }) : Promise.resolve(null as CloudinaryUsage | null),
    requirements.videos ? listCloudinaryVideos(context).then(resources => ({ resources, error: null as string | null })).catch((error) => {
      console.error("Cloudinary video list error:", error);
      return { resources: [] as CloudinaryVideoResource[], error: "The video library could not be loaded. Check the media connection and refresh." };
    }) : Promise.resolve({ resources: [] as CloudinaryVideoResource[], error: null as string | null }),
    requirements.videoUsage ? getCloudinaryVideoUsage(context).catch((error) => {
      console.error("Cloudinary video usage error:", error);
      return null as CloudinaryUsage | null;
    }) : Promise.resolve(null as CloudinaryUsage | null),
  ]);
  const { resources: cloudinaryImages, error: cloudinaryError } = imageListResult;
  const { resources: cloudinaryVideos, error: cloudinaryVideoError } = videoListResult;

  let marketingData: AdminMarketingData = {
    schemaReady: false,
    coupons: [],
    affiliates: [],
    affiliateCandidates: [],
  };
  if (requirements.marketingData) {
    try {
      marketingData = await getAdminMarketingData(db, url.origin);
    } catch (error) {
      if (!isMissingMarketingSchema(error)) throw error;
    }
  }

  const payload = {
    adminUser: toPublicAdminUser(adminUser),
    users: users.map(user => toPublicAdminUser(user)),
    userActivity,
    adminUsers: adminUsers.map(user => toPublicAdminUser(user)),
    totalUsersCount,
    totalPages,
    currentPage: page,
    tab,
    workspaceProjectRows,
    workspaceFiles,
    workspaceProjectCount,
    workspaceProjectReviewCount,
    workspaceProjectPage,
    workspaceProjectPageCount,
    workspaceReady,
    view,
    pricingPackages: tab === "packages" ? pricingPackages : [],
    pricingPackageCount: pricingPackages.length,
    adminToolbarEnabled: siteSettingsSnapshot.adminToolbarEnabled,
    searchCrawlingEnabled: siteSettingsSnapshot.searchCrawlingEnabled,
    maintenanceModeEnabled: siteSettingsSnapshot.maintenanceModeEnabled,
    promoBarSettings: siteSettingsSnapshot.promoBarSettings,
    roleFeatureAccess,
    portfolioSections,
    cloudinaryImages: tab === "images" ? cloudinaryImages : [],
    cloudinaryImageCount: cloudinaryImages.length,
    cloudinaryUsage,
    cloudinaryError,
    cloudinaryVideos,
    cloudinaryVideoUsage,
    cloudinaryVideoError,
    marketingData,
    stats: {
      total: Number(userStatsResult[0]?.total || 0),
      admins: Number(adminCount[0].count || 0),
      managers: Number(userStatsResult[0]?.managers || 0),
      editors: Number(userStatsResult[0]?.editors || 0),
      customers: Number(userStatsResult[0]?.customers || 0),
      support: Number(userStatsResult[0]?.support || 0),
      trash: Number(userStatsResult[0]?.trash || 0),
    }
  };

  const adminSession = await getAdminSession(request.headers.get("Cookie"), context);

  return data(payload, {
    headers: {
      "Set-Cookie": await commitAdminSession(adminSession, { maxAge: 60 * 60 * 2 }, context),
    },
  });
}

type AdminActionData = { error?: string; success?: string };

function adminSettingsSaveError(setting: string, error: unknown): AdminActionData {
  const errorCode =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32)
      : "";
  console.error(`Admin settings save failed for ${setting}${errorCode ? ` (${errorCode})` : ""}.`);
  return { error: `${setting} could not be saved. Check the database permissions and try again.` };
}

export async function action({ request, context }: ActionFunctionArgs): Promise<AdminActionData | Response> {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  const isMultipart = request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data") ?? false;
  const maximumBodyBytes = isMultipart ? MAX_ADMIN_ACTION_BODY_BYTES : 1024 * 1024;
  if (requestBodyExceedsLimit(request, maximumBodyBytes)) {
    return { error: "This admin request is too large. Media uploads are limited to 50 MB per video." };
  }

  const db = getDbFromContext(context);
  const session = await getAdminSession(request.headers.get("Cookie"), context);
  const sessionAdminId = session.get("adminUserId");
  if (typeof sessionAdminId !== "string" || !sessionAdminId) {
    throw redirect(ADMIN_LOGIN_PATH);
  }

  const activeSessionAdmin = await findAdminUserById(db, sessionAdminId);
  if (!activeSessionAdmin?.active || !isAdminRole(activeSessionAdmin.role)) {
    throw redirect(ADMIN_LOGIN_PATH);
  }

  const adminLimit = await consumeUsageLimit({
    context,
    request,
    bindingName: "USER_ACTION_LIMITER",
    key: `admin:${activeSessionAdmin.id}`,
    localLimit: 60,
    localPeriodSeconds: 60,
  });
  if (adminLimit !== "allowed") {
    return {
      error: adminLimit === "limited"
        ? "Several admin actions were submitted. Wait a minute and try again."
        : "Usage protection is temporarily unavailable. Please try again shortly.",
    };
  }

  if (isMultipart) {
    const multipartLimit = await consumeUsageLimit({
      context,
      request,
      bindingName: "ADMIN_MULTIPART_LIMITER",
      key: `admin:${activeSessionAdmin.id}`,
      localLimit: 5,
      localPeriodSeconds: 60,
    });
    if (multipartLimit !== "allowed") {
      return { error: usageLimitMessage(multipartLimit, "Multipart admin requests are limited to five per minute.") };
    }
  }

  const formData = await readMutationForm(request, maximumBodyBytes);
  if (!formData) return { error: "This admin form could not be read or exceeds the upload limit." };
  const intent = String(formData.get("intent") ?? "");

  if (intent === "logout") {
    const userSession = await getSession(request.headers.get("Cookie"), context);
    const [adminCookie, userCookie] = await Promise.all([
      destroyAdminSession(session, context),
      destroySession(userSession, context),
    ]);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", adminCookie);
    headers.append("Set-Cookie", userCookie);
    return redirect("/signin?mode=signin", { headers });
  }

  const adminUser = await requireAdminUser(request, db, context);

  if (!isAdminRole(adminUser.role)) {
    return { error: "Permission denied." };
  }

  const marketingIntents = new Set([
    "create-marketing-coupon",
    "update-marketing-coupon",
    "set-marketing-coupon-active",
    "create-marketing-affiliate",
    "update-marketing-affiliate",
    "set-marketing-affiliate-active",
  ]);
  if (marketingIntents.has(intent)) {
    try {
      if (intent === "create-marketing-coupon" || intent === "update-marketing-coupon") {
        const coupon = marketingCouponInput(formData);
        if ("error" in coupon) return coupon;
        const couponId = String(formData.get("couponId") || "");
        if (intent === "update-marketing-coupon") {
          if (!isUuid(couponId)) return { error: "Choose a valid coupon to update." };
          const [updated] = await db.update(marketingCoupons)
            .set({ ...coupon, updatedAt: new Date() })
            .where(eq(marketingCoupons.id, couponId))
            .returning();
          if (!updated) return { error: "Coupon not found." };
          return { success: "Coupon updated." };
        }
        await db.insert(marketingCoupons).values(coupon);
        return { success: "Coupon created." };
      }

      if (intent === "set-marketing-coupon-active") {
        const couponId = String(formData.get("couponId") || "");
        const activeValue = String(formData.get("active") || "");
        if (!isUuid(couponId) || (activeValue !== "true" && activeValue !== "false")) {
          return { error: "Choose a valid coupon status." };
        }
        const [updated] = await db.update(marketingCoupons)
          .set({ active: activeValue === "true", updatedAt: new Date() })
          .where(eq(marketingCoupons.id, couponId))
          .returning();
        if (!updated) return { error: "Coupon not found." };
        return { success: activeValue === "true" ? "Coupon activated." : "Coupon paused." };
      }

      if (intent === "create-marketing-affiliate") {
        const userId = String(formData.get("userId") || "");
        const code = normalizeMarketingCode(String(formData.get("code") || ""));
        const commissionRateBps = parseCommissionRateBps(String(formData.get("commissionRate") || ""));
        if (!isUuid(userId)) return { error: "Select an eligible affiliate account." };
        if (!code) return { error: "Use 3–32 letters, numbers, hyphens, or underscores for the referral code." };
        if (commissionRateBps === null) return { error: "Enter a commission rate from 0 to 100, with up to two decimal places." };
        const [candidate] = await db.select({ id: usersTable.id }).from(usersTable).where(and(
          eq(usersTable.id, userId),
          eq(usersTable.role, "affiliate"),
          eq(usersTable.active, true),
          isNull(usersTable.deletedAt),
        )).limit(1);
        if (!candidate) return { error: "That user is not an active affiliate. Update their role first." };
        await db.insert(marketingAffiliates).values({ userId, code, commissionRateBps });
        return { success: "Affiliate partner added." };
      }

      if (intent === "update-marketing-affiliate") {
        const affiliateId = String(formData.get("affiliateId") || "");
        const code = normalizeMarketingCode(String(formData.get("code") || ""));
        const commissionRateBps = parseCommissionRateBps(String(formData.get("commissionRate") || ""));
        if (!isUuid(affiliateId)) return { error: "Choose a valid affiliate partner to update." };
        if (!code) return { error: "Use 3–32 letters, numbers, hyphens, or underscores for the referral code." };
        if (commissionRateBps === null) return { error: "Enter a commission rate from 0 to 100, with up to two decimal places." };
        const [updated] = await db.update(marketingAffiliates)
          .set({ code, commissionRateBps, updatedAt: new Date() })
          .where(eq(marketingAffiliates.id, affiliateId))
          .returning();
        if (!updated) return { error: "Affiliate partner not found." };
        return { success: "Affiliate partner updated." };
      }

      if (intent === "set-marketing-affiliate-active") {
        const affiliateId = String(formData.get("affiliateId") || "");
        const activeValue = String(formData.get("active") || "");
        if (!isUuid(affiliateId) || (activeValue !== "true" && activeValue !== "false")) {
          return { error: "Choose a valid affiliate status." };
        }
        const [updated] = await db.update(marketingAffiliates)
          .set({ active: activeValue === "true", updatedAt: new Date() })
          .where(eq(marketingAffiliates.id, affiliateId))
          .returning();
        if (!updated) return { error: "Affiliate partner not found." };
        return { success: activeValue === "true" ? "Affiliate partner activated." : "Affiliate partner paused." };
      }
    } catch (error) {
      if (isMissingMarketingSchema(error)) return { error: MARKETING_MIGRATION_NOTICE };
      if (isUniqueConstraintError(error)) return { error: "That coupon or referral code is already in use." };
      console.error("Admin marketing update failed:", error);
      return { error: "The marketing change could not be saved. Please try again." };
    }
  }

  const hasUploadFiles = ["galleryImageFiles", "imageFiles", "videoFile"].some((field) =>
    formData.getAll(field).some((value) => value instanceof File && value.size > 0),
  );
  if (hasUploadFiles) {
    const uploadLimit = await consumeUsageLimit({
      context,
      request,
      bindingName: "CLOUDINARY_UPLOAD_LIMITER",
      key: `admin:${adminUser.id}`,
      localLimit: 2,
      localPeriodSeconds: 60,
    });
    if (uploadLimit !== "allowed") {
      return { error: usageLimitMessage(uploadLimit, "Media uploads are limited to two requests per minute.") };
    }
  }

  if (intent === "workspace-project-status") {
    const projectId = String(formData.get("projectId") || "");
    const status = String(formData.get("status") || "");
    const expectedUpdatedAt = readExpectedUpdatedAt(formData.get("expectedUpdatedAt"));
    const reviewUrl = parseWorkspaceShareUrl(String(formData.get("reviewUrl") || ""));
    if (!isUuid(projectId) || !["intake", "editing", "review", "revision", "delivered"].includes(status)) {
      return { error: "Choose a valid project and status." };
    }
    if (!expectedUpdatedAt) return { error: "This project changed while you were reviewing it. Refresh and try again." };
    if (status === "review" && !reviewUrl) return { error: "Add the HTTPS preview link before moving a project to customer review." };
    try {
      if (status === "review" && reviewUrl) {
        const result = await db.execute(sql`
          WITH updated AS (
            UPDATE workspace_projects
            SET status = ${status}, updated_at = now()
            WHERE id = ${projectId}
              AND date_trunc('milliseconds', updated_at) = ${expectedUpdatedAt}::timestamptz
            RETURNING id, owner_id
          )
          INSERT INTO workspace_project_files (owner_id, project_id, kind, file_name, share_url)
          SELECT owner_id, id, 'review', 'Review cut', ${reviewUrl}
          FROM updated
          RETURNING id
        `);
        if (!hasReturnedRows(result)) return { error: "This project changed while you were reviewing it. Refresh and try again." };
      } else {
        const [updated] = await db.update(workspaceProjects)
          .set({ status, updatedAt: new Date() })
          .where(and(
            eq(workspaceProjects.id, projectId),
            sql`date_trunc('milliseconds', ${workspaceProjects.updatedAt}) = ${expectedUpdatedAt}::timestamptz`,
          ))
          .returning();
        if (!updated) return { error: "This project changed while you were reviewing it. Refresh and try again." };
      }
      return { success: status === "review" ? "Project moved to customer review with a preview link." : "Project status updated." };
    } catch (error) {
      if (isMissingWorkspaceSchema(error)) return { error: WORKSPACE_MIGRATION_NOTICE };
      throw error;
    }
  }

  if (intent === "workspace-project-billing") {
    const projectId = String(formData.get("projectId") || "");
    const billingStatus = String(formData.get("billingStatus") || "");
    const expectedUpdatedAt = readExpectedUpdatedAt(formData.get("expectedUpdatedAt"));
    const rawFinalAmount = String(formData.get("finalAmount") || "").trim();
    const invoiceUrlValue = String(formData.get("invoiceUrl") || "").trim();
    const invoiceUrl = invoiceUrlValue ? parseWorkspaceShareUrl(invoiceUrlValue) : null;
    const finalAmountCents = billingStatus === "quote_requested" ? null : parseBillingAmountToCents(rawFinalAmount);

    if (!isUuid(projectId) || !["quote_requested", "quote_approved", "invoice_pending", "paid"].includes(billingStatus)) {
      return { error: "Choose a valid project and billing status." };
    }
    if (!expectedUpdatedAt) return { error: "This project changed while you were reviewing it. Refresh and try again." };
    if (billingStatus !== "quote_requested" && finalAmountCents === null) {
      return { error: "Enter a final amount greater than zero, using up to two decimal places." };
    }
    if (invoiceUrlValue && !invoiceUrl) return { error: "Enter a valid HTTPS invoice or payment link." };
    if (billingStatus === "invoice_pending" && !invoiceUrl) {
      return { error: "Add the HTTPS invoice or payment link before marking an invoice as sent." };
    }

    try {
      const [updated] = await db.update(workspaceProjects)
        .set({
          billingStatus,
          finalAmountCents,
          invoiceUrl,
          updatedAt: new Date(),
        })
        .where(and(
          eq(workspaceProjects.id, projectId),
          sql`date_trunc('milliseconds', ${workspaceProjects.updatedAt}) = ${expectedUpdatedAt}::timestamptz`,
        ))
        .returning();
      if (!updated) return { error: "This project changed while you were reviewing it. Refresh and try again." };
      const labels: Record<string, string> = {
        quote_requested: "Billing moved back to quote requested.",
        quote_approved: "Final quote saved for the customer.",
        invoice_pending: "Invoice link shared with the customer.",
        paid: "Payment marked as received.",
      };
      return { success: labels[billingStatus] };
    } catch (error) {
      if (isMissingWorkspaceSchema(error)) return { error: WORKSPACE_MIGRATION_NOTICE };
      throw error;
    }
  }

  if (intent === "create-user") {
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const role = String(formData.get("role") || "customer");

    if (!email || email.length > 254 || !isEmail(email)) return { error: "Enter a valid email address." };
    if (name.length > 120) return { error: "Names must be 120 characters or fewer." };
    if (!isUserRole(role)) return { error: "Choose a valid user role." };

    try {
      await db.insert(usersTable).values({
        name: name || null,
        email,
        role,
        createdAt: new Date(),
      });
      return { success: "User created successfully." };
    } catch (e: any) {
      console.error("Create user error:", e);
      if (e.message?.includes("unique") || e.code === "23505") {
        return { error: "A user with this email already exists." };
      }
      return { error: "Failed to create user." };
    }
  }

  if (intent === "create-admin") {
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (!email || email.length > 254 || !isEmail(email)) return { error: "Enter a valid admin email address." };
    if (name.length > 120) return { error: "Names must be 120 characters or fewer." };

    if (password.length < 12 || password.length > 128) {
      return { error: "Admin password must be between 12 and 128 characters." };
    }

    if (password !== confirmPassword) {
      return { error: "Admin passwords do not match." };
    }

    try {
      await db.insert(adminUsersTable).values({
        name: name || null,
        email,
        passwordHash: bcrypt.hashSync(password, 12),
        role: "admin",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { success: "Admin account created." };
    } catch (e: any) {
      console.error("Create admin error:", e);
      if (e.message?.includes("unique") || e.code === "23505") {
        return { error: "An admin with this email already exists." };
      }
      return { error: "Failed to create admin account." };
    }
  }

  if (intent === "update-role") {
    const userId = String(formData.get("userId") ?? "");
    const role = String(formData.get("role") ?? "");

    if (!isUuid(userId) || !isUserRole(role)) {
      return { error: "Invalid role." };
    }

    await updateUserRole(db, userId, role);
    return { success: "Role updated." };
  }

  if (intent === "bulk-update-role") {
    const userIds = Array.from(new Set(formData.getAll("userIds").map(String).filter(Boolean)));
    const role = String(formData.get("role") ?? "");

    if (!userIds.length || !userIds.every(isUuid) || !isUserRole(role)) {
      return { error: "Invalid input." };
    }
    if (userIds.length > MAX_BULK_RECORDS) return { error: `Update at most ${MAX_BULK_RECORDS} users at a time.` };

    await db.update(usersTable).set({ role }).where(inArray(usersTable.id, userIds));
    return { success: `Updated ${userIds.length} users.` };
  }

  if (intent === "bulk-delete") {
    const userIds = Array.from(new Set(formData.getAll("userIds").map(String).filter(Boolean)));
    if (!userIds.length) return { error: "No users selected." };
    if (!userIds.every(isUuid)) return { error: "Select valid user accounts." };
    if (userIds.length > MAX_BULK_RECORDS) return { error: `Delete at most ${MAX_BULK_RECORDS} users at a time.` };

    await db.update(usersTable).set({ deletedAt: new Date(), updatedAt: new Date() }).where(inArray(usersTable.id, userIds));
    return { success: `Moved ${userIds.length} users to trash.` };
  }

  if (intent === "bulk-restore") {
    const userIds = Array.from(new Set(formData.getAll("userIds").map(String).filter(Boolean)));
    if (!userIds.length) return { error: "No users selected." };
    if (!userIds.every(isUuid)) return { error: "Select valid user accounts." };
    if (userIds.length > MAX_BULK_RECORDS) return { error: `Restore at most ${MAX_BULK_RECORDS} users at a time.` };

    await db.update(usersTable).set({ deletedAt: null }).where(inArray(usersTable.id, userIds));
    return { success: `Restored ${userIds.length} users.` };
  }

  if (intent === "bulk-permanent-delete") {
    const userIds = Array.from(new Set(formData.getAll("userIds").map(String).filter(Boolean)));
    if (!userIds.length) return { error: "No users selected." };
    if (!userIds.every(isUuid)) return { error: "Select valid user accounts." };
    if (userIds.length > MAX_BULK_RECORDS) return { error: `Delete at most ${MAX_BULK_RECORDS} users at a time.` };

    try {
      const trashedUsers = await db.select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(and(inArray(usersTable.id, userIds), isNotNull(usersTable.deletedAt)));
      if (!trashedUsers.length) return { error: "None of the selected accounts are in trash." };

      const adminEmails = new Set((await db.select({ email: adminUsersTable.email }).from(adminUsersTable))
        .map(({ email }) => email.trim().toLowerCase()));
      if (trashedUsers.some(({ email }) => adminEmails.has(email.trim().toLowerCase()))) {
        return { error: "A selected email is also used by an admin account. Change that admin email before permanently deleting the customer profile." };
      }

      const trashedUserIds = trashedUsers.map(({ id }) => id);
      await deleteSupabaseUsersByEmail(context, trashedUsers.map(({ email }) => email));
      const deletedUsers = await db.delete(usersTable)
        .where(and(inArray(usersTable.id, trashedUserIds), isNotNull(usersTable.deletedAt)))
        .returning();
      return deletedUsers.length
        ? { success: `Permanently deleted ${deletedUsers.length} user${deletedUsers.length === 1 ? "" : "s"}.` }
        : { error: "The selected accounts changed while you were deleting them. Refresh and check the trash." };
    } catch (error) {
      console.error("Admin bulk account permanent delete error:", error);
      return { error: "Could not permanently delete the selected accounts. Their customer records remain in trash; refresh and retry after checking the authentication connection." };
    }
  }

  if (intent === "create-package" || intent === "update-package") {
    if (intent === "create-package") {
      return { error: "The public pricing catalog contains six fixed packages. Edit one of those packages instead." };
    }
    let packages: PricingPackage[];
    try {
      packages = await getPricingPackages(db, context, { failOnError: true });
    } catch (error) {
      console.error("Pricing settings read failed before package update:", error);
      return { error: "Pricing settings could not be read safely, so no changes were saved. Refresh and try again." };
    }
    const packageId = String(formData.get("packageId") || "");
    const existing = packages.find((pkg) => pkg.id === packageId);

    if (intent === "update-package" && !existing) {
      return { error: "Package not found." };
    }

    const nextPackage = packageFromForm(formData, existing);
    if ("error" in nextPackage) return nextPackage;

    const slugOwner = packages.find((pkg) => pkg.slug === nextPackage.slug && pkg.id !== nextPackage.id);
    if (slugOwner) {
      return { error: "Another package already uses this slug." };
    }

    const imageFiles = formData
      .getAll("galleryImageFiles")
      .filter((value): value is File => value instanceof File && value.size > 0);

    let uploadedImageAssets: CloudinaryImageResource[] = [];
    if (imageFiles.length) {
      if (imageFiles.length > MAX_IMAGE_UPLOAD_COUNT) {
        return { error: `Upload at most ${MAX_IMAGE_UPLOAD_COUNT} gallery images at a time.` };
      }
      if (imageFiles.some((file) => file.size > MAX_IMAGE_FILE_BYTES) || imageFiles.reduce((total, file) => total + file.size, 0) > MAX_IMAGE_BATCH_BYTES) {
        return { error: "Each image must be 10 MB or smaller, with at most 40 MB total per upload." };
      }
      const uploadResults = await Promise.allSettled(imageFiles.map((file) => uploadPackageImageToCloudinary(file, context)));
      uploadedImageAssets = uploadResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      if (uploadResults.some((result) => result.status === "rejected")) {
        const cleanedUp = await removeUnreferencedPackageUploads(uploadedImageAssets, context);
        return {
          error: cleanedUp
            ? "Some gallery images could not be uploaded. Successful uploads were removed; please try again."
            : "Some gallery images could not be uploaded, and Cloudinary could not remove every successful upload. Check the image library for unused files.",
        };
      }
      nextPackage.galleryImages = Array.from(new Set([...nextPackage.galleryImages, ...uploadedImageAssets.map((asset) => asset.secure_url)]));
    }

    const nextPackages = packages.map((pkg) => (pkg.id === nextPackage.id ? nextPackage : pkg));

    try {
      await savePricingPackages(db, nextPackages);
    } catch (error) {
      console.error("Package settings save failed:", error);
      const cleanedUp = await removeUnreferencedPackageUploads(uploadedImageAssets, context);
      return {
        error: cleanedUp
          ? "Package settings could not be saved. Newly uploaded gallery images were removed; please retry."
          : "Package settings could not be saved, and Cloudinary could not remove every new image. Check the image library for unused files.",
      };
    }
    return { success: "Package updated." };
  }

  if (intent === "delete-package") {
    const packageId = String(formData.get("packageId") || "");
    let packages: PricingPackage[];
    try {
      packages = await getPricingPackages(db, context, { failOnError: true });
    } catch (error) {
      console.error("Pricing settings read failed before package removal:", error);
      return { error: "Pricing settings could not be read safely, so no changes were saved. Refresh and try again." };
    }
    if (!packages.some((pkg) => pkg.id === packageId)) {
      return { error: "Package not found." };
    }

    const nextPackages = packages.map((pkg) => pkg.id === packageId ? { ...pkg, active: false } : pkg);
    await savePricingPackages(db, nextPackages);
    return { success: "Package hidden from the pricing page." };
  }

  if (intent === "upload-portfolio-video") {
    const title = String(formData.get("title") || "").trim();
    const sectionSlug = String(formData.get("sectionSlug") || "featured").trim();
    const videoFile = formData.get("videoFile");

    if (!title || title.length > 160) return { error: "Video title must be between 1 and 160 characters." };
    if (sectionSlug.length > 120) return { error: "Choose a valid portfolio section." };
    if (!(videoFile instanceof File) || videoFile.size === 0) return { error: "Choose a video to upload." };
    if (videoFile.size > MAX_VIDEO_FILE_BYTES) return { error: "Portfolio videos are limited to 50 MB." };
    if (
      String(formData.get("creatorName") || "").length > 160 ||
      String(formData.get("tag") || "").length > 100 ||
      String(formData.get("uniqueSellingPoint") || "").length > 240
    ) return { error: "Shorten the portfolio creator, tag, or outcome label." };

    let sections: Awaited<ReturnType<typeof getPortfolioSections>>;
    try {
      sections = await getPortfolioSections(db, context, { failOnError: true });
    } catch (error) {
      console.error("Portfolio sections read failed before video upload:", error);
      return { error: "Portfolio settings could not be read, so no video was uploaded. Refresh and try again." };
    }
    const targetSection = sections.find((section) => section.slug === sectionSlug);
    if (!sections.length) return { error: "Create a portfolio section before uploading a video." };
    if (!targetSection) return { error: "The selected portfolio section is no longer available. Refresh and choose it again." };

    let uploaded: CloudinaryVideoResource | null = null;
    try {
      uploaded = await uploadPortfolioVideoToCloudinary(videoFile, context);
      const nextVideo = {
        id: createPortfolioId("video"),
        title,
        creatorName: String(formData.get("creatorName") || "").trim(),
        tag: String(formData.get("tag") || "Portfolio").trim() || "Portfolio",
        uniqueSellingPoint: String(formData.get("uniqueSellingPoint") || "").trim(),
        videoUrl: uploaded.secure_url,
        youtubeId: "",
        videoProvider: "cloudinary" as const,
        thumbnailUrl: cloudinaryVideoThumbnailUrl(uploaded.secure_url),
        orientation: formData.get("orientation") === "vertical" ? "vertical" as const : "horizontal" as const,
        sortOrder: Math.max(0, ...targetSection.videos.map((video) => video.sortOrder)) + 1,
      };

      await savePortfolioSections(db, sections.map((section) => section.id === targetSection.id
        ? { ...section, videos: [...section.videos, nextVideo] }
        : section), context);
      return { success: `Uploaded “${title}” to ${targetSection.name}.` };
    } catch (error) {
      console.error("Portfolio video upload error:", error);
      if (uploaded) {
        try {
          await deleteCloudinaryVideos([uploaded.public_id], context);
          return { error: "Portfolio settings could not be saved. The uploaded video was removed; please retry." };
        } catch (cleanupError) {
          console.error("Cloudinary portfolio video cleanup failed:", cleanupError);
          return { error: "Portfolio settings could not be saved, and Cloudinary could not remove the new video. Check the video library for an unused file." };
        }
      }
      return { error: error instanceof Error ? error.message : "Failed to upload portfolio video." };
    }
  }

  if (intent === "delete-portfolio-videos") {
    const publicIds = Array.from(new Set(formData.getAll("publicIds").map(String).filter(Boolean)));

    if (!publicIds.length) return { error: "Choose at least one portfolio video to delete." };
    if (publicIds.length > MAX_BULK_RECORDS) {
      return { error: `Delete at most ${MAX_BULK_RECORDS} portfolio videos at a time.` };
    }

    try {
      const availableVideos = await listCloudinaryVideos(context);
      const selectedVideos = publicIds.map((publicId) => availableVideos.find((video) => video.public_id === publicId));
      if (selectedVideos.some((video) => !video)) {
        return { error: "Some selected videos are no longer in the Cloudinary library. Refresh and choose them again." };
      }
      const videoUrls = selectedVideos.map((video) => video!.secure_url);
      const sections = await getPortfolioSections(db, context, { failOnError: true });
      await savePortfolioSections(db, removeCloudinaryUrlsFromPortfolioSections(sections, videoUrls), context);
      try {
        await deleteCloudinaryVideos(publicIds, context);
        return { success: `Deleted ${publicIds.length} portfolio video${publicIds.length === 1 ? "" : "s"}.` };
      } catch (error) {
        console.error("Cloudinary video delete error:", error);
        return { success: `Removed ${publicIds.length} video${publicIds.length === 1 ? "" : "s"} from the portfolio, but Cloudinary could not delete the file${publicIds.length === 1 ? "" : "s"}. Retry from the video library.` };
      }
    } catch (error) {
      console.error("Portfolio video removal error:", error);
      return { error: "Could not verify the selected videos or update the portfolio, so no files were deleted. Refresh and try again." };
    }
  }

  if (intent === "update-admin-toolbar") {
    try {
      await saveAdminToolbarEnabled(db, formData.get("adminToolbarEnabled") === "on", context);
      return { success: "Admin toolbar settings saved." };
    } catch (error) {
      return adminSettingsSaveError("Admin toolbar", error);
    }
  }

  if (intent === "update-search-crawling") {
    try {
      await saveSearchCrawlingEnabled(db, formData.get("searchCrawlingEnabled") === "on", context);
      return { success: "Search visibility settings saved." };
    } catch (error) {
      return adminSettingsSaveError("Search visibility", error);
    }
  }

  if (intent === "update-maintenance-mode") {
    try {
      await saveMaintenanceModeEnabled(db, formData.get("maintenanceModeEnabled") === "on", context);
      return { success: "Maintenance mode settings saved." };
    } catch (error) {
      return adminSettingsSaveError("Maintenance mode", error);
    }
  }

  if (intent === "update-promo-bar") {
    const enabled = formData.get("promoBarEnabled") === "on";
    const message = String(formData.get("promoBarMessage") || "");
    if (message.length > 500) return { error: "Promo bar messages are limited to 500 characters." };
    try {
      await savePromoBarSettings(db, enabled, message, context);
      return { success: "Promo bar settings saved." };
    } catch (error) {
      return adminSettingsSaveError("Promo bar", error);
    }
  }

  if (intent === "update-role-access") {
    try {
      const nextAccess = roleFeatureAccessFromFormData(formData);
      await saveRoleFeatureAccessSettings(db, nextAccess, context);
      return { success: "Role access settings saved." };
    } catch (error) {
      return adminSettingsSaveError("Role access", error);
    }
  }

  if (intent === "upload-images") {
    const imageFiles = formData
      .getAll("imageFiles")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!imageFiles.length) {
      return { error: "Choose at least one image to upload." };
    }
    if (imageFiles.length > MAX_IMAGE_UPLOAD_COUNT) {
      return { error: `Upload at most ${MAX_IMAGE_UPLOAD_COUNT} images at a time.` };
    }
    if (imageFiles.some((file) => file.size > MAX_IMAGE_FILE_BYTES) || imageFiles.reduce((total, file) => total + file.size, 0) > MAX_IMAGE_BATCH_BYTES) {
      return { error: "Each image must be 10 MB or smaller, with at most 40 MB total per upload." };
    }

    const uploadResults = await Promise.allSettled(imageFiles.map((file) => uploadPackageImageToCloudinary(file, context)));
    const uploadedAssets = uploadResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (uploadResults.some((result) => result.status === "rejected")) {
      const cleanedUp = await removeUnreferencedPackageUploads(uploadedAssets, context);
      return {
        error: cleanedUp
          ? "Some images could not be uploaded. Successful uploads were removed; please try again."
          : "Some images could not be uploaded, and Cloudinary could not remove every successful upload. Check the image library for unused files.",
      };
    }
    return { success: `Uploaded ${uploadedAssets.length} image${uploadedAssets.length === 1 ? "" : "s"}.` };
  }

  if (intent === "delete-images") {
    const publicIds = Array.from(new Set(formData.getAll("publicIds").map(String).filter(Boolean)));

    if (!publicIds.length) {
      return { error: "Choose at least one image to delete." };
    }
    if (publicIds.length > MAX_BULK_RECORDS) {
      return { error: `Delete at most ${MAX_BULK_RECORDS} images at a time.` };
    }

    try {
      const availableImages = await listCloudinaryImages(context);
      const selectedImages = publicIds.map((publicId) => availableImages.find((image) => image.public_id === publicId));
      if (selectedImages.some((image) => !image)) {
        return { error: "Some selected images are no longer in the Cloudinary library. Refresh and choose them again." };
      }
      const imageUrls = selectedImages.map((image) => image!.secure_url);
      const packages = await getPricingPackages(db, context, { failOnError: true });
      await savePricingPackages(db, removeCloudinaryUrlsFromPackages(packages, imageUrls));
      try {
        await deleteCloudinaryImages(publicIds, context);
        return { success: `Deleted ${publicIds.length} image${publicIds.length === 1 ? "" : "s"}.` };
      } catch (error) {
        console.error("Cloudinary image delete error:", error);
        return { success: `Removed ${publicIds.length} image${publicIds.length === 1 ? "" : "s"} from package galleries, but Cloudinary could not delete the file${publicIds.length === 1 ? "" : "s"}. Retry from the image library.` };
      }
    } catch (error) {
      console.error("Package gallery image removal error:", error);
      return { error: "Could not verify the selected images or update package galleries, so no files were deleted. Refresh and try again." };
    }
  }

  return { error: "Unknown action." };
}

export default function AdminRoute() {
  const { tab } = useLoaderData<typeof loader>();
  if (tab === "overview") return <AdminOverview />;
  if (tab === "projects") return <AdminProjects />;
  if (tab === "payments" || tab === "audit") return <AdminPlaceholder tab={tab} />;
  return <LegacyAdminRoute />;
}

function AdminProjects() {
  const {
    adminUser,
    workspaceProjectRows,
    workspaceFiles,
    workspaceProjectCount,
    workspaceProjectReviewCount,
    workspaceProjectPage,
    workspaceProjectPageCount,
    workspaceReady,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const filesByProject = new Map<string, typeof workspaceFiles>();
  for (const file of workspaceFiles) {
    const projectFiles = filesByProject.get(file.projectId);
    if (projectFiles) projectFiles.push(file);
    else filesByProject.set(file.projectId, [file]);
  }

  return (
    <AdminPanelShell
      title="Customer projects"
      activeTab="projects"
      account={{ name: adminUser.name || "Admin", detail: adminUser.email }}
      notificationCount={workspaceProjectReviewCount}
      headerActions={(
        <Link to="?tab=overview" className="hidden h-10 items-center gap-2 rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(109,85,232,0.22)] transition hover:bg-[#5b44d3] md:inline-flex">
          <span className="material-symbols-outlined text-[17px]" aria-hidden="true">dashboard_customize</span>
          Dashboard
        </Link>
      )}
    >
      <section className="neo-workspace__panel rounded-[24px] p-5 sm:p-7" aria-labelledby="customer-projects-title">
        <p className="neo-workspace__eyebrow">Production queue</p>
        <h2 id="customer-projects-title" className="neo-workspace__module-title mt-1">Customer project requests</h2>
        <p className="neo-workspace__module-copy mt-2">Review submitted briefs and move each project to editing or customer review. Customers can approve a review cut or request revisions in their workspace.</p>
        <p className="mt-2 text-xs font-bold text-[#687583]" role="status">Showing {workspaceProjectRows.length} of {workspaceProjectCount} projects</p>
        {actionData?.error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700" role="alert">{actionData.error}</p> : null}
        {actionData?.success ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700" role="status">{actionData.success}</p> : null}
        {!workspaceReady ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900" role="status">{WORKSPACE_MIGRATION_NOTICE}</p> : null}
        {workspaceProjectRows.length ? (
          <div className="mt-5 grid gap-3">
            {workspaceProjectRows.map(({ project, ownerName, ownerEmail }) => {
              const projectFiles = filesByProject.get(project.id) ?? [];
              return (
              <article key={project.id} className="rounded-2xl border border-[#edf0f2] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="truncate text-base font-black text-[#17202a]">{project.title}</h3><p className="mt-1 text-xs text-[#687583]">{project.channelName} · {project.packageSlug}</p><p className="mt-1 text-xs font-bold text-[#536779]">{ownerName || "Customer"} · {ownerEmail}</p></div>
                  <span className="rounded-full bg-[#f0ecfb] px-3 py-1 text-[10px] font-black text-[#6550c7]">{project.status.replace(/[_-]/g, " ")}</span>
                </div>
                {project.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-[#536779]">{project.notes}</p> : null}
                {projectFiles.length ? (
                  <ul className="mt-3 flex flex-wrap gap-2" aria-label="Project shared links">
                    {projectFiles.map((file) => (
                      <li key={file.id}><a href={file.shareUrl} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-full bg-[#f5f6fa] px-3 py-2 text-xs font-bold text-[#536779] underline">{file.kind === "review" ? "Review cut" : "Source"}: {file.fileName}</a></li>
                    ))}
                  </ul>
                ) : null}
                <Form method="post" className="admin-project-billing mt-4 grid gap-3 rounded-xl bg-[#f8f8fb] p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end [&>label]:min-w-0 [&_input]:min-w-0 [&_select]:min-w-0">
                  <input type="hidden" name="intent" value="workspace-project-billing" />
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="expectedUpdatedAt" value={new Date(project.updatedAt).toISOString()} />
                  <label className="grid gap-2 text-xs font-black text-[#536779]">Billing status<select name="billingStatus" defaultValue={project.billingStatus} className="neo-workspace__profile-input h-11 rounded-xl px-3 text-sm font-bold" disabled={isSubmitting}><option value="quote_requested">Quote requested</option><option value="quote_approved">Quote confirmed</option><option value="invoice_pending">Invoice sent</option><option value="paid">Paid</option></select></label>
                  <label className="grid gap-2 text-xs font-black text-[#536779]">Final amount (USD)<input name="finalAmount" type="number" min="0.01" max="9999999.99" step="0.01" defaultValue={project.finalAmountCents == null ? "" : (project.finalAmountCents / 100).toFixed(2)} placeholder="80.00" className="neo-workspace__profile-input h-11 rounded-xl px-3 text-sm font-medium" disabled={isSubmitting} /></label>
                  <label className="grid gap-2 text-xs font-black text-[#536779]">Invoice or payment link<input name="invoiceUrl" type="url" maxLength={2048} defaultValue={project.invoiceUrl || ""} placeholder="https://…" className="neo-workspace__profile-input h-11 rounded-xl px-3 text-sm font-medium" disabled={isSubmitting} /></label>
                  <button type="submit" disabled={isSubmitting} className="neo-workspace__secondary-action h-11 rounded-xl px-4 text-xs font-black disabled:opacity-60">{isSubmitting ? "Saving…" : "Save billing"}</button>
                </Form>
                <Form method="post" className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="intent" value="workspace-project-status" />
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="expectedUpdatedAt" value={new Date(project.updatedAt).toISOString()} />
                  <label className="grid min-w-0 flex-1 basis-48 gap-2 text-xs font-black text-[#536779]">Move project to<select name="status" defaultValue={project.status} className="neo-workspace__profile-input h-11 min-w-0 rounded-xl px-3 text-sm font-bold" disabled={isSubmitting}><option value="intake">Intake</option><option value="editing">Editing</option><option value="review">Customer review</option><option value="revision">Revision</option><option value="delivered">Delivered</option></select></label>
                  <label className="grid min-w-0 flex-1 basis-56 gap-2 text-xs font-black text-[#536779]">Preview link <input type="url" name="reviewUrl" placeholder="Required for customer review" className="neo-workspace__profile-input h-11 min-w-0 rounded-xl px-3 text-sm font-medium" disabled={isSubmitting} /></label>
                  <button type="submit" disabled={isSubmitting} className="neo-workspace__profile-submit h-11 rounded-xl px-4 text-xs font-black disabled:opacity-60">{isSubmitting ? "Saving…" : "Update status"}</button>
                </Form>
              </article>
              );
            })}
          </div>
        ) : <div className="mt-5 rounded-2xl bg-[#f5f6fa] p-5"><h3 className="text-sm font-black text-[#17202a]">No customer requests yet</h3><p className="mt-1 text-sm text-[#687583]">New requests will appear here when customers submit an editing brief.</p></div>}
        {workspaceReady && workspaceProjectPageCount > 1 ? (
          <nav className="mt-5 flex items-center justify-between gap-3 border-t border-[#edf0f2] pt-4" aria-label="Customer project pages">
            {workspaceProjectPage > 1 ? (
              <Link to={`?tab=projects&projectPage=${workspaceProjectPage - 1}`} className="neo-workspace__secondary-action inline-flex h-10 items-center rounded-xl px-4 text-xs font-black">Previous</Link>
            ) : <span className="neo-workspace__secondary-action inline-flex h-10 items-center rounded-xl px-4 text-xs font-black opacity-45" aria-disabled="true">Previous</span>}
            <p className="text-xs font-bold text-[#687583]">Page {workspaceProjectPage} of {workspaceProjectPageCount}</p>
            {workspaceProjectPage < workspaceProjectPageCount ? (
              <Link to={`?tab=projects&projectPage=${workspaceProjectPage + 1}`} className="neo-workspace__secondary-action inline-flex h-10 items-center rounded-xl px-4 text-xs font-black">Next</Link>
            ) : <span className="neo-workspace__secondary-action inline-flex h-10 items-center rounded-xl px-4 text-xs font-black opacity-45" aria-disabled="true">Next</span>}
          </nav>
        ) : null}
      </section>
    </AdminPanelShell>
  );
}

function AdminOverview() {
  const { adminUser, stats, cloudinaryImageCount, cloudinaryError, pricingPackageCount } = useLoaderData<typeof loader>();

  return (
    <AdminPanelShell
      title="Admin overview"
      activeTab="overview"
      account={{ name: adminUser.name || "Admin", detail: adminUser.email }}
      headerActions={(
        <Link to="?tab=users" className="hidden h-10 items-center gap-2 rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(109,85,232,0.22)] transition hover:bg-[#5b44d3] md:inline-flex">
          <span className="material-symbols-outlined text-[17px]">manage_accounts</span>
          Manage users
        </Link>
      )}
    >
      <section className="mb-6" aria-labelledby="admin-overview-heading">
        <p className="neo-workspace__eyebrow">Your workspace</p>
        <h2 id="admin-overview-heading" className="neo-workspace__title mt-1">Admin overview</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687583]">Review incoming work, manage your team, and keep the public site current.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Admin metrics">
        {[
          ["Total users", String(stats.total), "Accounts outside trash", "group"],
          ["Admin team", String(stats.admins), "Privileged accounts", "admin_panel_settings"],
          ["Editors", String(stats.editors), "Production capacity", "movie_edit"],
          ["Media assets", cloudinaryError ? "—" : String(cloudinaryImageCount), cloudinaryError ? "Media connection unavailable" : `${pricingPackageCount} packages published`, "perm_media"],
        ].map(([label, value, hint, icon]) => {
          return (
            <article key={label} className="neo-workspace__stat-card rounded-[17px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="neo-workspace__eyebrow">{label}</p>
                  <p className="neo-workspace__stat-value mt-2">{value}</p>
                </div>
                <span className="neo-icon-badge neo-workspace__stat-icon flex h-9 w-9 items-center justify-center rounded-xl"><span className="material-symbols-outlined text-[19px]">{icon}</span></span>
              </div>
              <p className="neo-workspace__stat-hint mt-3">{hint}</p>
            </article>
          );
        })}
      </section>

      <section className="mt-7" aria-labelledby="admin-shortcuts-heading">
        <div className="mb-3">
          <p className="neo-workspace__eyebrow">Shortcuts</p>
          <h2 id="admin-shortcuts-heading" className="mt-1 text-lg font-black tracking-[-0.035em]">Admin tools</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            { title: "Manage users", description: "Accounts, roles, and access", icon: "group", to: adminPath("?tab=users") },
            { title: "Review projects", description: "Production status and billing", icon: "video_library", to: adminPath("?tab=projects") },
            { title: "Open enquiries", description: "Contact form messages and replies", icon: "mail", to: "/dashboard/messages" },
            { title: "Pricing packages", description: "Edit published packages", icon: "sell", to: adminPath("?tab=packages") },
            { title: "Portfolio media", description: "Manage images and videos", icon: "perm_media", to: adminPath("?tab=videos") },
            { title: "Site settings", description: "Roles, visibility, and site controls", icon: "settings", to: adminPath("?tab=settings") },
          ].map((shortcut) => (
            <Link key={shortcut.title} to={shortcut.to} className="neo-workspace__panel group flex min-h-24 items-center gap-4 rounded-2xl p-4 transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]">
              <span className="neo-icon-badge flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" aria-hidden="true">
                <span className="material-symbols-outlined text-[21px]">{shortcut.icon}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-[#17202a]">{shortcut.title}</span>
                <span className="mt-1 block text-xs leading-5 text-[#687583]">{shortcut.description}</span>
              </span>
              <span className="material-symbols-outlined shrink-0 text-[19px] text-[#687583] transition-transform group-hover:translate-x-0.5" aria-hidden="true">arrow_forward</span>
            </Link>
          ))}
        </div>
      </section>
    </AdminPanelShell>
  );
}

function AdminPlaceholder({ tab }: { tab: keyof typeof adminPlaceholderConfigs }) {
  const { adminUser } = useLoaderData<typeof loader>();
  const config = adminPlaceholderConfigs[tab];

  return (
    <AdminPanelShell
      title={config.title}
      activeTab={tab}
      account={{ name: adminUser.name || "Admin", detail: adminUser.email }}
      headerActions={(
        <Link to="?tab=overview" className="hidden h-10 items-center gap-2 rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(109,85,232,0.22)] transition hover:bg-[#5b44d3] md:inline-flex">
          <span className="material-symbols-outlined text-[17px]">dashboard_customize</span>
          Dashboard
        </Link>
      )}
    >
      <section className="neo-workspace__panel rounded-[24px] p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="neo-icon-badge neo-workspace__module-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
              <span className="material-symbols-outlined text-[24px]">{config.icon}</span>
            </span>
            <div>
              <p className="neo-workspace__eyebrow">Admin module</p>
              <h2 className="neo-workspace__module-title mt-1">{config.title}</h2>
              <p className="neo-workspace__module-copy mt-2 max-w-2xl">{config.description}</p>
            </div>
          </div>
          <span className="neo-workspace__status inline-flex w-fit items-center gap-2 rounded-full px-3 py-2">
            <span className="neo-workspace__status-dot h-1.5 w-1.5 rounded-full" />
            Coming soon
          </span>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {config.cards.map(([title, copy]) => (
            <article key={title} className="neo-workspace__subpanel rounded-2xl p-4">
              <span className="neo-workspace__accent-icon material-symbols-outlined text-[20px]">auto_awesome</span>
              <h3 className="neo-workspace__subpanel-title mt-4 text-sm">{title}</h3>
              <p className="neo-workspace__subpanel-copy mt-2">{copy}</p>
            </article>
          ))}
        </div>

        <div className="neo-workspace__callout mt-8 flex flex-col gap-3 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="neo-workspace__callout-title text-sm">This admin module is being prepared.</p>
            <p className="neo-workspace__callout-copy mt-1 text-xs">Navigation, access control, and the workspace shell are ready for the full workflow.</p>
          </div>
          <Link to="?tab=overview" className="neo-workspace__secondary-action inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-xs">
            <span className="material-symbols-outlined text-[17px]">arrow_back</span>
            Back to dashboard
          </Link>
        </div>
      </section>
    </AdminPanelShell>
  );
}

function LegacyAdminRoute() {
  const {
    adminUser,
    users,
    userActivity,
    adminUsers,
    totalPages,
    currentPage,
    stats,
    tab,
    view,
    pricingPackages,
    portfolioSections,
    adminToolbarEnabled,
    searchCrawlingEnabled,
    maintenanceModeEnabled,
    promoBarSettings,
    roleFeatureAccess,
    cloudinaryImages,
    cloudinaryUsage,
    cloudinaryError,
    cloudinaryVideos,
    cloudinaryVideoUsage,
    cloudinaryVideoError,
    marketingData,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const actionError = actionData && "error" in actionData ? actionData.error : null;
  const actionSuccess = actionData && "success" in actionData ? actionData.success : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigation = useNavigation();
  
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateAdminModal, setShowCreateAdminModal] = useState(false);

  const isAdminDirectory = view === "admins";
  const isAllSelected = users.length > 0 && selectedUsers.length === users.length;

  useEffect(() => {
    setSelectedUsers([]);
  }, [searchParams]);

  const toggleSelectAll = () => {
    if (isAllSelected) setSelectedUsers([]);
    else setSelectedUsers(users.map(u => u.id));
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSort = (field: string) => {
    const newParams = new URLSearchParams(searchParams);
    const currentSort = searchParams.get("sort") || "createdAt";
    const currentOrder = searchParams.get("order") || "desc";
    
    if (currentSort === field) {
      newParams.set("order", currentOrder === "asc" ? "desc" : "asc");
    } else {
      newParams.set("sort", field);
      newParams.set("order", "asc");
    }
    setSearchParams(newParams);
  };

  const getUserEditUrl = (userId: string) => {
    const returnTo = `${location.pathname}${location.search || "?tab=users"}`;
    return `${adminPath(`/users/${userId}`)}?returnTo=${encodeURIComponent(returnTo)}`;
  };
  const pageTitle = tab === "packages"
    ? "Pricing Packages"
    : tab === "images"
    ? "Images"
      : tab === "videos"
        ? "Portfolio Videos"
      : tab === "roles"
        ? "Role Management"
      : tab === "settings"
          ? "Settings"
          : tab === "marketing"
            ? "Coupons"
          : tab === "affiliates"
            ? "Affiliates"
          : tab === "users"
            ? "User Management"
            : `${tab.charAt(0).toUpperCase()}${tab.slice(1)} Module`;

  return (
    <>
      <AdminPanelShell
        title={pageTitle}
        activeTab={tab}
        account={{ name: adminUser.name || "Admin", detail: adminUser.email }}
        headerActions={(
          <>
            {tab === "images" || tab === "videos" ? (
              <Link
                reloadDocument
                to={`?tab=${tab}`}
                className="hidden h-10 items-center gap-2 rounded-full border border-[#e5e7f2] bg-white px-4 text-xs font-black text-[#5f6378] transition hover:border-[#c8cbe0] sm:inline-flex"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                Refresh
              </Link>
            ) : null}
            {tab === "users" ? (
              <>
                <button
                  onClick={event => { event.currentTarget.focus(); setShowCreateAdminModal(true); }}
                  className="hidden h-10 items-center gap-2 rounded-full border border-[#e5e7f2] bg-white px-4 text-xs font-black text-[#5f6378] transition hover:border-[#c8cbe0] sm:inline-flex"
                >
                  <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                  Add Admin
                </button>
                <button
                  onClick={event => { event.currentTarget.focus(); setShowCreateModal(true); }}
                  className="hidden h-10 items-center gap-2 rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(109,85,232,0.22)] transition hover:bg-[#5b44d3] sm:inline-flex"
                >
                  <span className="material-symbols-outlined text-[18px]">person_add</span>
                  Add User
                </button>
              </>
            ) : null}
          </>
        )}
      >
        <div className="space-y-8">
          {tab === "users" && actionError ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-600">{actionError}</div>
          ) : null}
          {tab === "users" && actionSuccess ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">{actionSuccess}</div>
          ) : null}
          {tab === "users" ? (
            <>
              <div className="flex flex-wrap gap-3 sm:hidden">
                <button type="button" onClick={event => { event.currentTarget.focus(); setShowCreateModal(true); }} className="neo-workspace__secondary-action inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold"><span className="material-symbols-outlined" aria-hidden="true">person_add</span>Add User</button>
                <button type="button" onClick={event => { event.currentTarget.focus(); setShowCreateAdminModal(true); }} className="neo-workspace__secondary-action inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold"><span className="material-symbols-outlined" aria-hidden="true">admin_panel_settings</span>Add Admin</button>
              </div>
              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCard compact label="All Users" value={stats.total} icon="group" color="blue" to="?tab=users&view=active" active={!isAdminDirectory && view !== "trash" && !searchParams.get("role")} />
                <MetricCard compact label="Admins" value={stats.admins} icon="admin_panel_settings" color="red" to="?tab=users&view=admins" active={isAdminDirectory} />
                <MetricCard compact label="Managers" value={stats.managers} icon="manage_accounts" color="indigo" to="?tab=users&view=active&role=project_manager" active={!isAdminDirectory && searchParams.get("role") === "project_manager"} />
                <MetricCard compact label="Support" value={stats.support} icon="support_agent" color="slate" to="?tab=users&view=active&role=customer_support" active={!isAdminDirectory && searchParams.get("role") === "customer_support"} />
                <MetricCard compact label="Trash" value={stats.trash} icon="delete" color="amber" to="?tab=users&view=trash" active={view === "trash"} />
              </div>

              {/* User List Card */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {/* View Switcher */}
                <div className="flex border-b border-slate-100">
                  <button 
                    onClick={() => { const p = new URLSearchParams(searchParams); p.set("view", "active"); setSearchParams(p); }}
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest -colors ${!isAdminDirectory && searchParams.get("view") !== "trash" ? "bg-white text-black border-b-2 border-black" : "bg-slate-50 text-slate-400 "}`}
                  >
                    All Users
                  </button>
                  <button 
                    onClick={() => { const p = new URLSearchParams(searchParams); p.set("view", "admins"); p.delete("role"); setSearchParams(p); }}
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest -colors ${isAdminDirectory ? "bg-white text-black border-b-2 border-black" : "bg-slate-50 text-slate-400 "}`}
                  >
                    Admins ({stats.admins})
                  </button>
                  <button 
                    onClick={() => { const p = new URLSearchParams(searchParams); p.set("view", "trash"); p.delete("role"); setSearchParams(p); }}
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest -colors ${searchParams.get("view") === "trash" ? "bg-white text-black border-b-2 border-black" : "bg-slate-50 text-slate-400 "}`}
                  >
                    Trash ({stats.trash})
                  </button>
                </div>

                {/* Search Header */}
                <div className="border-b border-slate-100 bg-slate-50/50 p-4">
                  <Form method="get" className="flex flex-col gap-4 md:flex-row md:items-center">
                    <input type="hidden" name="tab" value="users" />
                    <input type="hidden" name="view" value={searchParams.get("view") || "active"} />
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <span className="material-symbols-outlined text-[20px]">search</span>
                      </span>
                      <input
                        name="q"
                        aria-label="Search users by name or email"
                        type="text"
                        defaultValue={searchParams.get("q") || ""}
                        placeholder="Search users..."
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:border-black focus:ring-4 focus:ring-black/5"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {!isAdminDirectory ? (
                        <select
                          name="role"
                          aria-label="Filter by account role"
                          defaultValue={searchParams.get("role") || ""}
                          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-black"
                        >
                          <option value="">All Roles</option>
                          {USER_ROLES.map(r => <option key={r} value={r}>{formatUserRole(r)}</option>)}
                        </select>
                      ) : null}
                      <button 
                        type="submit"
                        className="flex h-11 items-center justify-center rounded-xl bg-black px-6 text-sm font-black text-white "
                      >
                        Search
                      </button>
                      <Link 
                        to={`?tab=users&view=${searchParams.get("view") || "active"}`}
                        className="flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 "
                      >
                        Reset
                      </Link>
                    </div>
                  </Form>

                  {!isAdminDirectory && selectedUsers.length > 0 && (
                    <div className="mt-4 flex items-center justify-between rounded-xl bg-black p-3 text-white animate-in slide-in-from-top-2">
                      <span className="text-sm font-bold pl-2">{selectedUsers.length} selected</span>
                    <div className="flex flex-wrap items-center gap-2">
                        {searchParams.get("view") === "trash" ? (
                          <>
                            <Form method="post" reloadDocument>
                              <input type="hidden" name="intent" value="bulk-restore" />
                              {selectedUsers.map(id => <input key={id} type="hidden" name="userIds" value={id} />)}
                              <button type="submit" className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-black text-white ">Restore</button>
                            </Form>
                            <Form method="post" reloadDocument onSubmit={e => !confirm("Permanently delete selected users? This cannot be undone.") && e.preventDefault()}>
                              <input type="hidden" name="intent" value="bulk-permanent-delete" />
                              {selectedUsers.map(id => <input key={id} type="hidden" name="userIds" value={id} />)}
                              <button type="submit" className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-black text-white ">Delete Permanently</button>
                            </Form>
                          </>
                        ) : (
                          <>
                            <Form method="post" reloadDocument className="flex items-center gap-2">
                              <input type="hidden" name="intent" value="bulk-update-role" />
                              {selectedUsers.map(id => <input key={id} type="hidden" name="userIds" value={id} />)}
                              <select name="role" defaultValue="customer" className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold outline-none">
                                {USER_ROLES.map(r => <option key={r} value={r}>{formatUserRole(r)}</option>)}
                              </select>
                              <button type="submit" className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-black ">Update Role</button>
                            </Form>
                            <Form method="post" reloadDocument onSubmit={e => !confirm("Move selected users to trash?") && e.preventDefault()}>
                              <input type="hidden" name="intent" value="bulk-delete" />
                              {selectedUsers.map(id => <input key={id} type="hidden" name="userIds" value={id} />)}
                              <button type="submit" className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-black text-white ">Move to Trash</button>
                            </Form>
                          </>
                        )}
                        <button type="button" onClick={() => setSelectedUsers([])} aria-label="Clear selected users" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span></button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  {isAdminDirectory ? (
                    <AdminUsersTable adminUsers={adminUsers} searchParams={searchParams} />
                  ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                        <th scope="col" className="w-12 px-3 py-2">
                          <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                            <span className="sr-only">Select all users on this page</span>
                            <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-slate-300 accent-black" />
                          </label>
                        </th>
                        <th scope="col" aria-sort={getAriaSort(searchParams, "name")} className="px-6 py-2">
                          <button type="button" onClick={() => handleSort("name")} className="inline-flex min-h-11 items-center gap-1 text-left">
                            User {getSortIcon(searchParams, "name")}
                          </button>
                        </th>
                        <th scope="col" aria-sort={getAriaSort(searchParams, "role")} className="px-6 py-2">
                          <button type="button" onClick={() => handleSort("role")} className="inline-flex min-h-11 items-center gap-1 text-left">
                            Role {getSortIcon(searchParams, "role")}
                          </button>
                        </th>
                        <th scope="col" className="min-w-[250px] px-6 py-4">Activity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {users.length === 0 ? (
                        <tr><td colSpan={4} className="py-20 text-center text-slate-400">No users found in {searchParams.get("view") === "trash" ? "trash" : "active list"}.</td></tr>
                      ) : (
                        users.map(user => (
                          <tr
                            key={user.id}
                            className="group transition-colors hover:bg-slate-50"
                          >
                            <td className="px-6 py-4">
                              <input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={() => toggleSelectUser(user.id)} aria-label={`Select ${user.name || user.email}`} className="h-4 w-4 rounded border-slate-300 accent-black" />
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase">
                                  {user.name?.[0] || user.email[0]}
                                </div>
                                <div>
                                  <Link to={getUserEditUrl(user.id)} aria-label={`Edit ${user.name || user.email}'s account`} className="text-sm font-black text-slate-900 underline-offset-4">
                                    {user.name || "User"}
                                  </Link>
                                  <p className="text-xs font-medium text-slate-500">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4"><RoleBadge role={user.role} /></td>
                            <td className="px-6 py-4">
                              <UserActivitySummary activity={userActivity[user.id] ?? { paidPurchases: null, activeProjects: null }} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-6 py-4">
                    <p className="text-xs font-bold text-slate-500">Page {currentPage} of {totalPages}</p>
                    <div className="flex gap-2">
                      <PaginationButton disabled={currentPage <= 1} onClick={() => { const p = new URLSearchParams(searchParams); p.set("page", String(currentPage - 1)); setSearchParams(p); }} icon="chevron_left" />
                      <PaginationButton disabled={currentPage >= totalPages} onClick={() => { const p = new URLSearchParams(searchParams); p.set("page", String(currentPage + 1)); setSearchParams(p); }} icon="chevron_right" />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : tab === "packages" ? (
            <PricingPackagesPanel packages={pricingPackages} actionData={actionData} navigationState={navigation.state} />
          ) : tab === "images" ? (
            <ImagesPanel images={cloudinaryImages} usage={cloudinaryUsage} error={cloudinaryError} actionData={actionData} navigationState={navigation.state} />
          ) : tab === "videos" ? (
            <VideoLibraryPanel
              videos={cloudinaryVideos}
              usage={cloudinaryVideoUsage}
              error={cloudinaryVideoError}
              sections={portfolioSections}
              actionData={actionData}
              navigationState={navigation.state}
            />
          ) : tab === "roles" ? (
            <RoleManagementPanel roleFeatureAccess={roleFeatureAccess} actionData={actionData} navigationState={navigation.state} />
          ) : tab === "settings" ? (
            <SettingsPanel
              adminToolbarEnabled={adminToolbarEnabled}
              searchCrawlingEnabled={searchCrawlingEnabled}
              maintenanceModeEnabled={maintenanceModeEnabled}
              promoBarSettings={promoBarSettings}
              actionData={actionData}
              navigationState={navigation.state}
            />
          ) : tab === "marketing" ? (
            <MarketingPanel data={marketingData} actionData={actionData} isSubmitting={navigation.state !== "idle"} />
          ) : tab === "affiliates" ? (
            <AffiliateAdminPanel data={marketingData} actionData={actionData} isSubmitting={navigation.state !== "idle"} />
          ) : (
            <div className="flex flex-col items-center justify-center py-32 rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
              <span className="material-symbols-outlined text-[64px] mb-4">construction</span>
              <h2 className="text-xl font-black text-slate-900">{tab.charAt(0).toUpperCase() + tab.slice(1)} Module</h2>
              <p className="text-sm font-medium mt-2">This module is currently being implemented to meet the new security and management requirements.</p>
              <Link to="?tab=users" className="mt-6 text-sm font-black text-black underline underline-offset-4">Return to User Management</Link>
            </div>
          )}
        </div>
      </AdminPanelShell>

      {/* Create User Modal */}
      {showCreateModal && (
        <AdminAccountDialog labelledBy="create-user-title" onDismiss={() => setShowCreateModal(false)}>
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 id="create-user-title" className="text-2xl font-black text-slate-900">Add New User</h3>
              <button aria-label="Close new user form" onClick={() => setShowCreateModal(false)} className="h-11 w-11 rounded-full flex items-center justify-center text-slate-500 ">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <Form method="post" reloadDocument className="space-y-4">
              <input type="hidden" name="intent" value="create-user" />
              <div>
                <label htmlFor="new-user-name" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
                <input id="new-user-name" name="name" type="text" placeholder="John Doe" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              <div>
                <label htmlFor="new-user-email" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
                <input id="new-user-email" name="email" type="email" required placeholder="john@example.com" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              <div>
                <label htmlFor="new-user-role" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">System Role</label>
                <select id="new-user-role" name="role" required defaultValue="customer" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black">
                  {USER_ROLES.map(r => <option key={r} value={r}>{formatUserRole(r)}</option>)}
                </select>
              </div>
              {actionError && <div className="rounded-xl bg-red-50 p-3 text-center border border-red-100 text-xs font-bold text-red-600">{actionError}</div>}
              <div className="pt-4 flex gap-3">
                <button type="button" disabled={navigation.state === "submitting"} onClick={() => setShowCreateModal(false)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-900 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={navigation.state === "submitting"} className="flex-1 rounded-xl bg-black py-3 text-sm font-black text-white shadow-lg disabled:opacity-50">
                  {navigation.state === "submitting" ? "Creating..." : "Create User"}
                </button>
              </div>
            </Form>
          </div>
        </AdminAccountDialog>
      )}

      {showCreateAdminModal && (
        <AdminAccountDialog labelledBy="create-admin-title" onDismiss={() => setShowCreateAdminModal(false)}>
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 id="create-admin-title" className="text-2xl font-black text-slate-900">Create Admin</h3>
              <button aria-label="Close new admin form" onClick={() => setShowCreateAdminModal(false)} className="h-11 w-11 rounded-full flex items-center justify-center text-slate-500 ">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <Form method="post" reloadDocument className="space-y-4">
              <input type="hidden" name="intent" value="create-admin" />
              <div>
                <label htmlFor="new-admin-name" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
                <input id="new-admin-name" name="name" type="text" placeholder="Jane Admin" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              <div>
                <label htmlFor="new-admin-email" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Admin Email</label>
                <input id="new-admin-email" name="email" type="email" required placeholder="admin@example.com" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              <div>
                <label htmlFor="new-admin-password" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Password</label>
                <input id="new-admin-password" name="password" type="password" required minLength={12} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              <div>
                <label htmlFor="new-admin-confirmPassword" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Confirm Password</label>
                <input id="new-admin-confirmPassword" name="confirmPassword" type="password" required minLength={12} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              {actionError && <div className="rounded-xl bg-red-50 p-3 text-center border border-red-100 text-xs font-bold text-red-600">{actionError}</div>}
              <div className="pt-4 flex gap-3">
                <button type="button" disabled={navigation.state === "submitting"} onClick={() => setShowCreateAdminModal(false)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-900 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={navigation.state === "submitting"} className="flex-1 rounded-xl bg-black py-3 text-sm font-black text-white shadow-lg disabled:opacity-50">
                  {navigation.state === "submitting" ? "Creating..." : "Create Admin"}
                </button>
              </div>
            </Form>
          </div>
        </AdminAccountDialog>
      )}

    </>
  );
}

function PricingPackagesPanel({
  packages,
  actionData,
  navigationState,
}: {
  packages: PricingPackage[];
  actionData: { error?: string; success?: string } | undefined;
  navigationState: "idle" | "submitting" | "loading";
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPackageId = searchParams.get("packageId") || packages[0]?.id || "";
  const [editingPackageId, setEditingPackageId] = useState(selectedPackageId);
  const editingPackage = packages.find((pkg) => pkg.id === editingPackageId) || packages[0];
  const activeCount = packages.filter((pkg) => pkg.active).length;

  useEffect(() => {
    if (selectedPackageId && selectedPackageId !== editingPackageId) {
      setEditingPackageId(selectedPackageId);
    } else if (!editingPackageId && packages[0]) {
      setEditingPackageId(packages[0].id);
    }
  }, [editingPackageId, packages, selectedPackageId]);

  const selectPackage = (packageId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", "packages");
    nextParams.set("packageId", packageId);
    setSearchParams(nextParams);
    setEditingPackageId(packageId);
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Packages" value={packages.length} icon="sell" color="blue" />
          <MetricCard label="Published" value={activeCount} icon="visibility" color="indigo" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Package library</p>
          </div>
          <div className="divide-y divide-slate-100">
            {packages.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                onClick={() => selectPackage(pkg.id)}
                className={`block w-full p-4 text-left ${editingPackage?.id === pkg.id ? "bg-slate-900 text-white" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 break-words">
                    <p className="font-black">{pkg.name}</p>
                    <p className={`mt-1 text-xs font-bold ${editingPackage?.id === pkg.id ? "text-slate-300" : "text-slate-500"}`}>{pkg.price}{pkg.interval} · /pricing/{pkg.slug}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${pkg.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {pkg.active ? "Published" : "Hidden"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Edit package</p>
            <h3 className="mt-1 text-2xl font-black text-slate-900">{editingPackage?.name || "Select a package"}</h3>
          </div>
          {editingPackage ? (
            <div className="flex flex-wrap gap-2">
              <Link to={`/pricing/${editingPackage.slug}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 ">
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                Preview
              </Link>
              <Form method="post" reloadDocument onSubmit={(event) => !confirm("Hide this package from customers?") && event.preventDefault()}>
                <input type="hidden" name="intent" value="delete-package" />
                <input type="hidden" name="packageId" value={editingPackage.id} />
                <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-100 px-4 text-sm font-black text-red-600 ">
                  <span className="material-symbols-outlined text-[18px]">visibility_off</span>
                  Hide package
                </button>
              </Form>
            </div>
          ) : null}
        </div>

        {actionData?.error ? <div className="mb-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-600">{actionData.error}</div> : null}
        {actionData?.success ? <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{actionData.success}</div> : null}

        {editingPackage ? (
          <PackageForm pkg={editingPackage} intent="update-package" navigationState={navigationState} />
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center text-slate-400">No packages available.</div>
        )}
      </div>
    </div>
  );
}

function ImagesPanel({
  images,
  usage,
  error,
  actionData,
  navigationState,
}: {
  images: CloudinaryImageResource[];
  usage: CloudinaryUsage | null;
  error: string | null;
  actionData: { error?: string; success?: string } | undefined;
  navigationState: "idle" | "submitting" | "loading";
}) {
  const isSubmitting = navigationState === "submitting";
  const actionError = actionData && "error" in actionData ? actionData.error : null;
  const actionSuccess = actionData && "success" in actionData ? actionData.success : null;
  const totalBytes = images.reduce((sum, image) => sum + (image.bytes || 0), 0);

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700">{error}</div> : null}
      {actionError ? <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-600">{actionError}</div> : null}
      {actionSuccess ? <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">{actionSuccess}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <UsageCard label="Images" value={String(images.length)} icon="image" />
        <UsageCard label="Listed Storage" value={formatBytes(totalBytes)} icon="sd_storage" />
        <UsageCard label="Cloud Storage" value={usage?.storage ? formatUsage(usage.storage, "bytes") : "Unavailable"} icon="cloud" />
        <UsageCard label="Credits" value={usage?.credits ? formatUsage(usage.credits, "number") : "Unavailable"} icon="speed" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Cloudinary upload</p>
            <h3 className="mt-1 text-2xl font-black text-slate-900">Upload images</h3>
            <p className="mt-2 text-sm font-medium text-slate-500">Images are uploaded to the <span className="font-black">edicut/packages</span> folder.</p>
          </div>
          <Form method="post" reloadDocument encType="multipart/form-data" className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 md:w-[360px]">
            <input type="hidden" name="intent" value="upload-images" />
            <input name="imageFiles" type="file" accept="image/*" multiple className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold" />
            <button type="submit" disabled={isSubmitting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-black text-white disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
              {isSubmitting ? "Uploading..." : "Upload"}
            </button>
          </Form>
        </div>
      </section>

      <Form method="post" reloadDocument className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <input type="hidden" name="intent" value="delete-images" />
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Library</p>
            <h3 className="mt-1 text-xl font-black text-slate-900">Uploaded images</h3>
          </div>
          <button type="submit" disabled={isSubmitting || images.length === 0} onClick={(event) => !confirm("Delete selected Cloudinary images? This will also remove them from package galleries.") && event.preventDefault()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white disabled:opacity-50">
            <span className="material-symbols-outlined text-[18px]">delete</span>
            Delete Selected
          </button>
        </div>

        {images.length === 0 ? (
          <div className="py-20 text-center text-sm font-bold text-slate-400">No Cloudinary images found in the edicut folder.</div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image) => (
              <label key={image.public_id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative">
                  <img src={optimizeCloudinaryUrl(image.secure_url)} alt={image.public_id} loading="lazy" decoding="async" width={image.width || undefined} height={image.height || undefined} className="aspect-video w-full bg-slate-100 object-cover" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/80 px-2 py-1 text-[10px] font-black uppercase text-white">{image.format || "image"}</span>
                  <input name="publicIds" value={image.public_id} type="checkbox" className="absolute right-3 top-3 h-5 w-5 accent-black" />
                </div>
                <div className="space-y-2 p-4">
                  <p className="truncate text-sm font-black text-slate-900" title={image.public_id}>{image.public_id}</p>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>{formatBytes(image.bytes || 0)}</span>
                    <span>{image.width && image.height ? `${image.width}x${image.height}` : "Size unknown"}</span>
                  </div>
                  <a href={image.secure_url} target="_blank" rel="noreferrer" className="inline-flex text-xs font-black text-slate-900 underline underline-offset-4">Open image</a>
                </div>
              </label>
            ))}
          </div>
        )}
      </Form>
    </div>
  );
}

function VideoLibraryPanel({
  videos,
  usage,
  error,
  sections,
  actionData,
  navigationState,
}: {
  videos: CloudinaryVideoResource[];
  usage: CloudinaryUsage | null;
  error: string | null;
  sections: PortfolioSection[];
  actionData: { error?: string; success?: string } | undefined;
  navigationState: "idle" | "submitting" | "loading";
}) {
  const isSubmitting = navigationState === "submitting";
  const actionError = actionData && "error" in actionData ? actionData.error : null;
  const actionSuccess = actionData && "success" in actionData ? actionData.success : null;
  const totalBytes = videos.reduce((sum, video) => sum + (video.bytes || 0), 0);

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700">{error}</div> : null}
      {actionError ? <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-600">{actionError}</div> : null}
      {actionSuccess ? <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">{actionSuccess}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <UsageCard label="Portfolio videos" value={String(videos.length)} icon="movie" />
        <UsageCard label="Listed storage" value={formatBytes(totalBytes)} icon="sd_storage" />
        <UsageCard label="Video cloud storage" value={usage?.storage ? formatUsage(usage.storage, "bytes") : "Unavailable"} icon="cloud" />
        <UsageCard label="Video credits" value={usage?.credits ? formatUsage(usage.credits, "number") : "Unavailable"} icon="speed" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Separate video storage</p>
            <h3 className="mt-1 text-2xl font-black text-slate-900">Add a portfolio video</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
              Videos use the dedicated Cloudinary video account and are saved to <span className="font-black">edicut/portfolio</span>. Images continue using the existing image account.
            </p>
          </div>
          <Form method="post" reloadDocument encType="multipart/form-data" className="grid w-full gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 xl:max-w-3xl">
            <input type="hidden" name="intent" value="upload-portfolio-video" />
            <label className="sm:col-span-2">
              <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Title</span>
              <input name="title" type="text" required placeholder="The story behind the edit" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
            </label>
            <label>
              <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Portfolio section</span>
              <select name="sectionSlug" defaultValue={sections[0]?.slug || "featured"} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-black">
                {sections.map((section) => <option key={section.id} value={section.slug}>{section.name}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Orientation</span>
              <select name="orientation" defaultValue="horizontal" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-black">
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical / reel</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Creator / client</span>
              <input name="creatorName" type="text" placeholder="Creator or brand name" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
            </label>
            <label>
              <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Tag</span>
              <input name="tag" type="text" placeholder="Gaming, podcast, review" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Outcome label</span>
              <input name="uniqueSellingPoint" type="text" placeholder="+18% retention, 620K views" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Video file</span>
              <input name="videoFile" type="file" accept="video/*,.mp4,.webm,.mov" required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold" />
            </label>
            <button type="submit" disabled={isSubmitting || sections.length === 0} className="sm:col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-black text-white disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
              {isSubmitting ? "Uploading video..." : "Upload portfolio video"}
            </button>
          </Form>
        </div>
      </section>

      <Form method="post" reloadDocument className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <input type="hidden" name="intent" value="delete-portfolio-videos" />
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Library</p>
            <h3 className="mt-1 text-xl font-black text-slate-900">Uploaded portfolio videos</h3>
          </div>
          <button type="submit" disabled={isSubmitting || videos.length === 0} onClick={(event) => !confirm("Delete selected videos and remove them from the portfolio?") && event.preventDefault()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-black text-white disabled:opacity-50">
            <span className="material-symbols-outlined text-[18px]">delete</span>
            Delete selected
          </button>
        </div>

        {videos.length === 0 ? (
          <div className="py-20 text-center text-sm font-bold text-slate-400">No Cloudinary videos found in the edicut/portfolio folder.</div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <article key={video.public_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative bg-slate-950">
                  <video src={video.secure_url} poster={cloudinaryVideoThumbnailUrl(video.secure_url)} controls preload="none" className="aspect-video w-full object-contain" />
                  <input name="publicIds" value={video.public_id} type="checkbox" className="absolute right-3 top-3 h-5 w-5 accent-black" />
                </div>
                <div className="space-y-2 p-4">
                  <p className="truncate text-sm font-black text-slate-900" title={video.public_id}>{video.public_id}</p>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>{formatBytes(video.bytes || 0)}</span>
                    <span>{video.duration ? `${Math.round(video.duration)} sec` : video.format || "video"}</span>
                  </div>
                  <a href={video.secure_url} target="_blank" rel="noreferrer" className="inline-flex text-xs font-black text-slate-900 underline underline-offset-4">Open video</a>
                </div>
              </article>
            ))}
          </div>
        )}
      </Form>
    </div>
  );
}

function UsageCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="material-symbols-outlined text-slate-500">{icon}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Realtime</span>
      </div>
      <p className="mt-4 text-2xl font-black tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">{label}</p>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUsage(value: { usage?: number; limit?: number; used_percent?: number }, type: "bytes" | "number") {
  const usage = typeof value.usage === "number" ? value.usage : null;
  const limit = typeof value.limit === "number" ? value.limit : null;
  const percent = typeof value.used_percent === "number" ? `${value.used_percent.toFixed(1)}%` : null;
  const formatValue = (amount: number) => type === "bytes" ? formatBytes(amount) : amount.toLocaleString();

  if (usage !== null && limit !== null) return `${formatValue(usage)} / ${formatValue(limit)}`;
  if (usage !== null && percent) return `${formatValue(usage)} (${percent})`;
  if (usage !== null) return formatValue(usage);
  return "Unavailable";
}

function RoleManagementPanel({
  roleFeatureAccess,
  actionData,
  navigationState,
}: {
  roleFeatureAccess: RoleFeatureAccess;
  actionData: { error?: string; success?: string } | undefined;
  navigationState: "idle" | "submitting" | "loading";
}) {
  const isSubmitting = navigationState === "submitting";
  const actionError = actionData && "error" in actionData ? actionData.error : null;
  const actionSuccess = actionData && "success" in actionData ? actionData.success : null;
  const roleLabels: Record<Exclude<UserRole, "user">, string> = {
    customer: "Customer",
    customer_support: "Customer Support",
    affiliate: "Affiliate Partner",
    editor: "Editor",
    project_manager: "Project Manager",
  };
  const matrixRoles = USER_ROLES.filter(
    (role): role is Exclude<UserRole, "user"> => role !== "user",
  );

  return (
    <div className="neo-role-access-page max-w-6xl">
      <section className="neo-role-access-card">
        <header className="neo-role-access-header">
          <div className="neo-role-access-heading">
            <span className="neo-icon-badge neo-role-access-icon" aria-hidden="true">
              <span className="material-symbols-outlined">shield_person</span>
            </span>
            <div className="min-w-0">
              <p className="neo-workspace__eyebrow">Access control</p>
              <h2 className="neo-role-access-title">Role permissions</h2>
              <p className="neo-role-access-description">
                Choose which customer dashboard pages each role can open. Customer accounts use a separate session and cannot open the admin panel.
              </p>
            </div>
          </div>
          <div className="neo-role-access-summary" aria-label={`${matrixRoles.length} roles and ${DASHBOARD_FEATURES.length} dashboard pages`}>
            <div className="neo-role-access-summary-item">
              <span className="neo-role-access-summary-value">{matrixRoles.length}</span>
              <span className="neo-role-access-summary-label">Roles</span>
            </div>
            <div className="neo-role-access-summary-item">
              <span className="neo-role-access-summary-value">{DASHBOARD_FEATURES.length}</span>
              <span className="neo-role-access-summary-label">Pages</span>
            </div>
          </div>
        </header>

        {actionError ? <p className="neo-role-access-feedback neo-role-access-feedback--error" role="alert">{actionError}</p> : null}
        {actionSuccess ? <p className="neo-role-access-feedback neo-role-access-feedback--success" role="status" aria-live="polite">{actionSuccess}</p> : null}

        <Form method="post" className="neo-role-access-form" aria-busy={isSubmitting}>
          <input type="hidden" name="intent" value="update-role-access" />
          <div className="neo-role-access-table-heading">
            <div>
              <h3>Customer dashboard pages</h3>
              <p>Select the pages available to each role.</p>
            </div>
            <span className="neo-role-access-hint">
              On smaller screens, permissions are shown as role-by-role checklists.
            </span>
          </div>

          <div className="neo-role-access-matrix" role="table" aria-label="Dashboard page access by role">
            <div className="neo-role-access-table-head" role="rowgroup">
              <div className="neo-role-access-grid-row neo-role-access-grid-row--heading" role="row">
                <span className="neo-role-access-column-heading neo-role-access-row-heading" role="columnheader">Page</span>
                {matrixRoles.map((role) => (
                  <span key={role} className="neo-role-access-column-heading" role="columnheader">{roleLabels[role]}</span>
                ))}
              </div>
            </div>
            <div className="neo-role-access-table-body" role="rowgroup">
              {DASHBOARD_FEATURES.map((feature) => (
                <div key={feature.key} className="neo-role-access-grid-row neo-role-access-grid-row--page" role="row">
                  <div className="neo-role-access-row-heading" role="rowheader">{feature.label}</div>
                  {matrixRoles.map((role) => {
                    const access = roleFeatureAccess[role] || [];
                    const staffOnly = role === "customer" && feature.key === "support";

                    return (
                      <div key={`${feature.key}-${role}`} className="neo-role-access-cell" role="cell">
                        {staffOnly ? (
                          <span className="neo-role-access-restricted" aria-label="Contact Inbox is staff-only for Customer accounts">
                            <span className="material-symbols-outlined" aria-hidden="true">lock</span>
                            <span>Staff only</span>
                          </span>
                        ) : (
                          <label className="neo-role-access-option">
                            <span className="neo-role-access-option-label">{roleLabels[role]}</span>
                            <input
                              type="checkbox"
                              name={`access__${role}__${feature.key}`}
                              value="on"
                              defaultChecked={access.includes(feature.key)}
                              aria-label={`${roleLabels[role]} access to ${feature.label}`}
                              className="neo-role-access-checkbox"
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <footer className="neo-role-access-footer">
            <p>Changes take effect after you save them.</p>
            <button type="submit" disabled={isSubmitting} className="neo-role-access-save">
              <span className="material-symbols-outlined" aria-hidden="true">{isSubmitting ? "progress_activity" : "save"}</span>
              {isSubmitting ? "Saving permissions…" : "Save permissions"}
            </button>
          </footer>
        </Form>
      </section>
    </div>
  );
}

function SettingsPanel({
  adminToolbarEnabled,
  searchCrawlingEnabled,
  maintenanceModeEnabled,
  promoBarSettings,
  actionData,
  navigationState,
}: {
  adminToolbarEnabled: boolean;
  searchCrawlingEnabled: boolean;
  maintenanceModeEnabled: boolean;
  promoBarSettings: { enabled: boolean; message: string };
  actionData: { error?: string; success?: string } | undefined;
  navigationState: "idle" | "submitting" | "loading";
}) {
  const isSubmitting = navigationState === "submitting";
  const actionError = actionData && "error" in actionData ? actionData.error : null;
  const actionSuccess = actionData && "success" in actionData ? actionData.success : null;

  return (
    <div className="max-w-4xl space-y-6">
      {actionError ? <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-600" role="alert">{actionError}</div> : null}
      {actionSuccess ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-700" role="status" aria-live="polite">{actionSuccess}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
              <span className="material-symbols-outlined text-[22px]">admin_panel_settings</span>
            </div>
            <p className="mt-5 text-xs font-black uppercase tracking-widest text-slate-500">Frontend admin access</p>
            <h3 className="mt-2 text-2xl font-black text-slate-900">Admin toolbar</h3>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-500">
              Show the floating admin shortcut on public frontend pages while an admin is signed in. Turn it off if you want the frontend to stay visually clean during reviews or recordings.
            </p>
          </div>

          <Form method="post" className="w-full rounded-2xl bg-slate-50 p-5 md:w-72">
            <input type="hidden" name="intent" value="update-admin-toolbar" />
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-black text-slate-900">Show toolbar</span>
                <span className="mt-1 block text-xs font-bold text-slate-500">{adminToolbarEnabled ? "Currently visible" : "Currently hidden"}</span>
              </span>
              <input name="adminToolbarEnabled" type="checkbox" defaultChecked={adminToolbarEnabled} className="h-5 w-5 accent-black" />
            </label>
            <button type="submit" disabled={isSubmitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-black text-white disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">save</span>
              {isSubmitting ? "Saving..." : "Save Settings"}
            </button>
          </Form>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#efeaff] text-[#5b44d3]">
              <span className="material-symbols-outlined text-[22px]">travel_explore</span>
            </div>
            <p className="mt-5 text-xs font-black uppercase tracking-widest text-slate-500">Search visibility</p>
            <h3 className="mt-2 text-2xl font-black text-slate-900">Google crawling</h3>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-500">
              Disable search engine indexing while EdiCut is still being built. This adds noindex and nofollow signals to the site responses and page metadata.
            </p>
          </div>

          <Form method="post" className="w-full rounded-2xl bg-slate-50 p-5 md:w-80">
            <input type="hidden" name="intent" value="update-search-crawling" />
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-black text-slate-900">Allow crawling</span>
                <span className="mt-1 block text-xs font-bold text-slate-500">{searchCrawlingEnabled ? "Currently allowed" : "Currently disabled"}</span>
              </span>
              <input name="searchCrawlingEnabled" type="checkbox" defaultChecked={searchCrawlingEnabled} className="h-5 w-5 accent-[#6d55e8]" />
            </label>
            <button type="submit" disabled={isSubmitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-black text-white disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">save</span>
              {isSubmitting ? "Saving..." : "Save Search Visibility"}
            </button>
          </Form>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <span className="material-symbols-outlined text-[22px]">construction</span>
            </div>
            <p className="mt-5 text-xs font-black uppercase tracking-widest text-amber-700">Site availability</p>
            <h3 className="mt-2 text-2xl font-black text-slate-900">Maintenance mode</h3>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-500">
              When enabled, public visitors and regular users see the maintenance page. Administrators can still sign in and use the admin workspace.
            </p>
          </div>

          <Form method="post" className="w-full rounded-2xl bg-amber-50 p-5 md:w-80">
            <input type="hidden" name="intent" value="update-maintenance-mode" />
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-black text-slate-900">Enable maintenance mode</span>
                <span className="mt-1 block text-xs font-bold text-slate-500">{maintenanceModeEnabled ? "Currently active" : "Currently off"}</span>
              </span>
              <input name="maintenanceModeEnabled" type="checkbox" defaultChecked={maintenanceModeEnabled} className="h-5 w-5 accent-amber-600" />
            </label>
            <button type="submit" disabled={isSubmitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">save</span>
              {isSubmitting ? "Saving..." : "Save Maintenance Mode"}
            </button>
          </Form>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
              <span className="material-symbols-outlined text-[22px]">campaign</span>
            </div>
            <p className="mt-5 text-xs font-black uppercase tracking-widest text-slate-500">Site Header</p>
            <h3 className="mt-2 text-2xl font-black text-slate-900">Promo Bar</h3>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-500">
              Display a slim black bar above the main navigation to share important announcements, discounts, or updates with your visitors.
            </p>
          </div>

          <Form method="post" className="w-full rounded-2xl bg-slate-50 p-5 md:w-96">
            <input type="hidden" name="intent" value="update-promo-bar" />
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-black text-slate-900">Enable</span>
                <span className="mt-1 block text-xs font-bold text-slate-500">{promoBarSettings.enabled ? "Currently visible" : "Currently hidden"}</span>
              </span>
              <input name="promoBarEnabled" type="checkbox" defaultChecked={promoBarSettings.enabled} className="h-5 w-5 accent-black" />
            </label>
            <div className="mt-4">
               <label className="block text-sm font-black text-slate-900 mb-2">Message</label>
               <input type="text" name="promoBarMessage" defaultValue={promoBarSettings.message} placeholder="Enter your promo message..." className="flex w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-900 shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
            </div>
            <button type="submit" disabled={isSubmitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-black text-white disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">save</span>
              {isSubmitting ? "Saving..." : "Save Promo Bar"}
            </button>
          </Form>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Quick links</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/" reloadDocument className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 ">
            <span className="material-symbols-outlined text-[18px]">home</span>
            Frontend homepage
          </Link>
          <Link to="/pricing" reloadDocument className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 ">
            <span className="material-symbols-outlined text-[18px]">sell</span>
            Frontend pricing
          </Link>
        </div>
      </section>
    </div>
  );
}

function AdminUsersTable({
  adminUsers,
  searchParams,
}: {
  adminUsers: Array<{
    id: string;
    name: string | null;
    email: string;
    role: string;
    active: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
  }>;
  searchParams: URLSearchParams;
}) {
  const sortLink = (field: string) => {
    const params = new URLSearchParams(searchParams);
    const currentSort = params.get("sort") || "createdAt";
    const currentOrder = params.get("order") || "desc";

    params.set("tab", "users");
    params.set("view", "admins");
    params.delete("role");
    params.set("sort", field);
    params.set("order", currentSort === field && currentOrder === "asc" ? "desc" : "asc");

    return `?${params.toString()}`;
  };

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-black uppercase tracking-wider text-slate-500">
          <th scope="col" aria-sort={getAriaSort(searchParams, "name")} className="px-6 py-2">
            <Link to={sortLink("name")} reloadDocument className="inline-flex items-center gap-1 ">
              Admin {getSortIcon(searchParams, "name")}
            </Link>
          </th>
          <th scope="col" aria-sort={getAriaSort(searchParams, "role")} className="px-6 py-2">
            <Link to={sortLink("role")} reloadDocument className="inline-flex items-center gap-1 ">
              Role {getSortIcon(searchParams, "role")}
            </Link>
          </th>
          <th scope="col" aria-sort={getAriaSort(searchParams, "createdAt")} className="px-6 py-2">
            <Link to={sortLink("createdAt")} reloadDocument className="inline-flex items-center gap-1 ">
              Created {getSortIcon(searchParams, "createdAt")}
            </Link>
          </th>
          <th scope="col" className="px-6 py-4 text-right">Last Updated</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {adminUsers.length === 0 ? (
          <tr><td colSpan={4} className="py-20 text-center text-slate-400">No admin accounts found.</td></tr>
        ) : (
          adminUsers.map((admin) => (
            <tr key={admin.id} className="-colors">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold uppercase text-white">
                    {admin.name?.[0] || admin.email[0]}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{admin.name || "Admin"}</p>
                    <p className="text-xs font-medium text-slate-500">{admin.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-red-700 ring-1 ring-inset ring-red-600/10">
                  {admin.role}
                </span>
              </td>
              <td className="px-6 py-4 text-xs font-bold text-slate-500">{new Date(admin.createdAt).toLocaleDateString()}</td>
              <td className="px-6 py-4 text-right text-xs font-bold text-slate-500">{new Date(admin.updatedAt).toLocaleDateString()}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function PackageForm({
  pkg,
  intent,
  navigationState,
  onCancel,
}: {
  pkg?: PricingPackage;
  intent: "create-package" | "update-package";
  navigationState: "idle" | "submitting" | "loading";
  onCancel?: () => void;
}) {
  const isSubmitting = navigationState === "submitting";
  const [selectedImageNames, setSelectedImageNames] = useState<string[]>([]);
  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-black focus:ring-4 focus:ring-black/5";

  return (
    <Form method="post" reloadDocument encType="multipart/form-data" className="space-y-5">
      <input type="hidden" name="intent" value={intent} />
      {pkg ? <input type="hidden" name="packageId" value={pkg.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <input name="name" required defaultValue={pkg?.name || ""} className={inputClass} placeholder="Medium" />
        </Field>
        <Field label="Slug">
          <input name="slug" defaultValue={pkg?.slug || ""} readOnly className={inputClass} placeholder="medium" />
        </Field>
        <Field label="Price">
          <input name="price" required inputMode="numeric" defaultValue={pkg?.price || ""} className={inputClass} placeholder="$999" aria-describedby="package-price-help" />
          <span id="package-price-help" className="mt-1 block text-xs font-medium text-slate-500">Whole-dollar USD price. This is the price used at checkout.</span>
        </Field>
        <Field label="Purchase type">
          <input value={pkg?.packageType === "single" ? "Single video · one-time" : "Monthly editing hours"} readOnly className={inputClass} />
        </Field>
        {pkg?.packageType === "monthly" ? <>
          <Field label="Editing hours per month"><input value={`${pkg.editingHoursPerMonth} hours`} readOnly className={inputClass} /></Field>
          <Field label="Editing hours per workday"><input value={`${pkg.editingHoursPerWorkday} ${pkg.editingHoursPerWorkday === 1 ? "hour" : "hours"}`} readOnly className={inputClass} /></Field>
        </> : null}
        <Field label="Sort order">
          <input name="sortOrder" type="number" min={0} max={999999} step={1} defaultValue={pkg?.sortOrder ?? 10} className={inputClass} />
        </Field>
        <Field label="Badge">
          <input name="badge" defaultValue={pkg?.badge || ""} className={inputClass} placeholder="Most popular" />
        </Field>
        <Field label="Turnaround">
          <input name="turnaround" defaultValue={pkg?.turnaround || ""} className={inputClass} placeholder="48 hours" />
        </Field>
        <Field label="Revisions">
          <input name="revisions" defaultValue={pkg?.revisions || ""} className={inputClass} placeholder="2 revision rounds" />
        </Field>
      </div>

      <Field label="Description">
        <textarea name="description" required defaultValue={pkg?.description || ""} className={`${inputClass} min-h-24`} placeholder="For weekly channels that need retention polish." />
      </Field>

      <Field label="Best for">
        <textarea name="bestFor" defaultValue={pkg?.bestFor || ""} className={`${inputClass} min-h-20`} placeholder="Weekly creators who need reliable polish." />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Features">
          <textarea name="features" required defaultValue={(pkg?.features || []).join("\n")} className={`${inputClass} min-h-40`} placeholder={pkg?.packageType === "monthly" ? "Editing hours per month\nHours available per workday\nRevision allowance" : "Finished video length\nFirst-cut turnaround\nIncluded revision rounds"} />
        </Field>
        <Field label="Deliverables">
          <textarea name="deliverables" defaultValue={(pkg?.deliverables || []).join("\n")} className={`${inputClass} min-h-40`} placeholder={"Long-form edits\nShorts repurposing\nUpload-ready exports"} />
        </Field>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-black text-slate-900">Product page gallery</p>
            <p className="mt-1 text-xs font-bold text-slate-500">Choose images, then click Save Changes to upload them to Cloudinary.</p>
          </div>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-black px-4 text-sm font-black text-white ">
            <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
            Choose Images
            <input
              name="galleryImageFiles"
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => setSelectedImageNames(Array.from(event.currentTarget.files || []).map((file) => file.name))}
            />
          </label>
        </div>
        {selectedImageNames.length ? (
          <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">
            Selected for upload: {selectedImageNames.join(", ")}
          </div>
        ) : null}
        {pkg?.galleryImages?.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {pkg.galleryImages.map((imageUrl) => (
              <img key={imageUrl} src={optimizeCloudinaryUrl(imageUrl)} alt="" loading="lazy" decoding="async" className="aspect-video w-full rounded-xl border border-slate-200 bg-white object-cover" />
            ))}
          </div>
        ) : null}
        <Field label="Gallery image URLs">
          <textarea name="galleryImages" defaultValue={(pkg?.galleryImages || []).join("\n")} className={`${inputClass} mt-3 min-h-28`} placeholder={"https://res.cloudinary.com/.../image/upload/...jpg"} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-slate-50 p-4">
        <label className="inline-flex items-center gap-2 text-sm font-black text-slate-700">
          <input name="active" type="checkbox" defaultChecked={pkg?.active ?? true} className="h-4 w-4 accent-black" />
          Publish on frontend
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-black text-slate-700">
          <input name="popular" type="checkbox" defaultChecked={pkg?.popular ?? false} className="h-4 w-4 accent-black" />
          Mark popular
        </label>
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
        {onCancel ? (
          <button type="button" disabled={isSubmitting} onClick={onCancel} className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-900 disabled:opacity-50">Cancel</button>
        ) : null}
        <button type="submit" disabled={isSubmitting} className="rounded-xl bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-50">
          {isSubmitting ? "Saving..." : intent === "create-package" ? "Create Package" : "Save Changes"}
        </button>
      </div>
    </Form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-black text-slate-700">
      {label}
      {children}
    </label>
  );
}

function MetricCard({ label, value, icon, color, to, active = false, compact = false }: { label: string; value: number; icon: string; color: string; to?: string; active?: boolean; compact?: boolean }) {
  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`neo-icon-badge neo-workspace__metric-icon flex shrink-0 items-center justify-center ${compact ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"}`}><span aria-hidden="true" className={`material-symbols-outlined ${compact ? "text-[17px]" : "text-[20px]"}`}>{icon}</span></div>
        <span className={`neo-workspace__metric-state whitespace-nowrap text-[10px] font-black uppercase tracking-widest ${compact ? "text-[9px] tracking-[0.12em]" : ""} ${active ? "is-active" : ""}`}>{active ? "Selected" : "Realtime"}</span>
      </div>
      <div className={compact ? "mt-2 min-w-0" : "mt-4"}><p className={`neo-workspace__metric-value ${compact ? "text-2xl leading-tight" : ""}`}>{value}</p><p className={`neo-workspace__metric-label ${compact ? "truncate text-xs" : ""}`}>{label}</p></div>
    </>
  );

  if (to) {
    return (
      <Link reloadDocument to={to} data-tone={color} className={`neo-workspace__metric-card rounded-2xl ${compact ? "p-3 sm:p-4" : "p-5"} text-left ${active ? "is-active" : ""}`}>
        {content}
      </Link>
    );
  }

  return (
    <div data-tone={color} className="neo-workspace__metric-card min-w-0 rounded-2xl p-5">
      {content}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (!isUserRole(role)) {
    return <span className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider text-red-700 ring-1 ring-inset ring-red-600/10 bg-red-50">Legacy {formatUserRole(role)}</span>;
  }

  const normalizedRole = normalizeUserRole(role);
  const styles: Record<UserRole, string> = {
    user: "bg-slate-50 text-slate-700 ring-slate-600/10",
    customer: "bg-slate-50 text-slate-700 ring-slate-600/10",
    customer_support: "bg-cyan-50 text-cyan-700 ring-cyan-600/10",
    affiliate: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    editor: "bg-amber-50 text-amber-700 ring-amber-600/10",
    project_manager: "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
  };

  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ring-inset ${styles[normalizedRole]}`}>{formatUserRole(normalizedRole)}</span>;
}

function UserActivitySummary({ activity }: { activity: AdminUserActivity }) {
  const purchaseCount = activity.paidPurchases;
  const projectCount = activity.activeProjects;
  const hasPurchases = purchaseCount !== null && purchaseCount > 0;
  const projectActive = projectCount !== null && projectCount > 0;
  const unavailable = "bg-amber-50 text-amber-700";
  const inactive = "bg-slate-100 text-slate-600";

  return (
    <div className="neo-user-activity flex min-w-[230px] flex-col items-start gap-1.5 text-[11px] font-bold">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${purchaseCount === null ? unavailable : hasPurchases ? "bg-emerald-50 text-emerald-700" : inactive}`}>
        <span aria-hidden="true" className="material-symbols-outlined">{purchaseCount === null ? "help" : hasPurchases ? "check_circle" : "remove_circle"}</span>
        {purchaseCount === null
          ? "Purchase data unavailable"
          : hasPurchases
            ? `${purchaseCount} paid purchase${purchaseCount === 1 ? "" : "s"}`
            : "No paid purchases"}
      </span>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${projectCount === null ? unavailable : projectActive ? "bg-indigo-50 text-indigo-700" : inactive}`}>
        <span aria-hidden="true" className="material-symbols-outlined">{projectCount === null ? "help" : projectActive ? "folder_open" : "folder_off"}</span>
        {projectCount === null
          ? "Project data unavailable"
          : projectActive
            ? `${projectCount} active project${projectCount === 1 ? "" : "s"}`
            : "No active projects"}
      </span>
    </div>
  );
}

function PaginationButton({ icon, disabled, onClick }: { icon: string, disabled: boolean, onClick: () => void }) {
  return <button aria-label={icon === "chevron_left" ? "Previous page" : "Next page"} disabled={disabled} onClick={onClick} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"><span aria-hidden="true" className="material-symbols-outlined text-[18px]">{icon}</span></button>;
}

function getSortIcon(params: URLSearchParams, field: string) {
  const sort = params.get("sort") || "createdAt";
  const order = params.get("order") || "desc";
  if (sort !== field) return <span className="material-symbols-outlined text-[14px] opacity-20">unfold_more</span>;
  return order === "asc" ? <span className="material-symbols-outlined text-[14px]">expand_less</span> : <span className="material-symbols-outlined text-[14px]">expand_more</span>;
}

function getAriaSort(params: URLSearchParams, field: string): "none" | "ascending" | "descending" {
  const sort = params.get("sort") || "createdAt";
  if (sort !== field) return "none";
  return (params.get("order") || "desc") === "asc" ? "ascending" : "descending";
}
