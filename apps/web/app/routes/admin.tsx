import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Await, Form, Link, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import bcrypt from "bcryptjs";
import { AdminRecentEvents } from "../components/WorkspaceNotifications";
import { updateUserRole } from "@edicut/db/repositories/users";
import { chatAccessRecipients, notifyChatAccessChange } from "../lib/chat-realtime.server";
import { removeD1ChatUsers } from "../lib/chat-cleanup.server";
import { chatMigrationPaused } from "../lib/chat-store.server";
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
  revokeAuthenticatedSessions,
} from "../lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH, adminPath } from "../lib/admin-paths";
import { toPublicAdminUser } from "../lib/admin-public";
import { deleteSupabaseUsersByEmail } from "../integrations/supabase/client.server";
import { isUserRole, type UserRole } from "../lib/admin-user-roles";
import {
  createPackageId,
  getPricingPackages,
  packageSlug,
  savePricingPackages,
  type PricingPackage,
} from "../lib/pricing.server";
import { formatPackagePrice, getCatalogPackage, parsePackagePrice } from "../lib/subscriptions";
import { cloudinaryVideoThumbnailUrl } from "../lib/cloudinary";
import {
  deleteCloudinaryVideos,
  deleteCloudinaryImages,
  getCloudinaryVideoUsage,
  getCloudinaryUsage,
  countCloudinaryImages,
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
import { lazy, Suspense } from "react";
import {
  DEFAULT_ROLE_FEATURE_ACCESS,
  roleFeatureAccessFromFormData,
} from "../lib/role-feature-access";
import { getAdminDataRequirements, getPageWithinRange, getPositivePage } from "../lib/admin-data-requirements";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { WorkspaceLoadingOverlay } from "../components/WorkspaceLoadingOverlay";
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
import { isMissingCustomerSubscriptionSchema } from "../lib/customer-subscriptions.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";

const AdminManagementPanel = lazy(() => import("../components/admin/AdminManagementPanel"));

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

  const directoryPromise = (async () => {
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
      !requirements.userDirectory || adminDirectory ? Promise.resolve([]) : db.select({
        id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, active: usersTable.active,
        profileImageUrl: usersTable.profileImageUrl, deletedAt: usersTable.deletedAt, createdAt: usersTable.createdAt, updatedAt: usersTable.updatedAt,
      }).from(usersTable)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      requirements.userDirectory && adminDirectory ? db.select({
        id: adminUsersTable.id, name: adminUsersTable.name, email: adminUsersTable.email, role: adminUsersTable.role,
        active: adminUsersTable.active, createdAt: adminUsersTable.createdAt, updatedAt: adminUsersTable.updatedAt,
      }).from(adminUsersTable)
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
    return { users, adminUsers, userActivity, totalUsersCount, totalPages, page };
  })();
  const workspacePromise = (async () => {
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

    return { workspaceProjectRows, workspaceFiles, workspaceProjectCount, workspaceProjectReviewCount, workspaceProjectPage, workspaceProjectPageCount, workspaceReady };
  })();
  const marketingPromise = (async () => {
    const empty: AdminMarketingData = { schemaReady: false, coupons: [], affiliates: [], affiliateCandidates: [] };
    if (!requirements.marketingData) return empty;
    try { return await getAdminMarketingData(db, url.origin, tab === "marketing" ? "coupons" : "affiliates"); }
    catch (error) { if (!isMissingMarketingSchema(error)) throw error; return empty; }
  })();

  // This live provider read is non-critical; stream it without blocking the dashboard.
  const overviewMedia = requirements.imageCount
    ? countCloudinaryImages(context)
      .then(count => ({ count, error: null as string | null }))
      .catch(() => ({ count: 0, error: "The image count could not be loaded. Check the media connection and refresh." }))
    : null;

  // Aggregate user totals in one PostgreSQL pass; keep the separate admin
  // table count because privileged accounts live in a different table.
  const [
    { users, adminUsers, userActivity, totalUsersCount, totalPages, page },
    { workspaceProjectRows, workspaceFiles, workspaceProjectCount, workspaceProjectReviewCount, workspaceProjectPage, workspaceProjectPageCount, workspaceReady },
    marketingData,
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
    directoryPromise,
    workspacePromise,
    marketingPromise,
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
  const { resources: cloudinaryImages } = imageListResult;
  const cloudinaryError = imageListResult.error;
  const { resources: cloudinaryVideos, error: cloudinaryVideoError } = videoListResult;

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
    overviewMedia,
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
  // Verify the full session, including credential revocation, before parsing uploads.
  const activeSessionAdmin = await requireAdminUser(request, db, context);
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
    try {
      await revokeAuthenticatedSessions(userSession, session, context);
    } catch {
      return { error: "Sign-out could not be completed. Please try again." };
    }
    const [adminCookie, userCookie] = await Promise.all([
      destroyAdminSession(session, context),
      destroySession(userSession, context),
    ]);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", adminCookie);
    headers.append("Set-Cookie", userCookie);
    return redirect("/signin?mode=signin", { headers });
  }

  const adminUser = activeSessionAdmin;

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

    if (password.length < 12 || new TextEncoder().encode(password).byteLength > 72) {
      return { error: "Admin password must be at least 12 characters and no more than 72 bytes." };
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
    await notifyChatAccessChange(db, context, { userIds: [userId] });
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
    await notifyChatAccessChange(db, context, { userIds });
    return { success: `Updated ${userIds.length} users.` };
  }

  if (intent === "bulk-delete") {
    const userIds = Array.from(new Set(formData.getAll("userIds").map(String).filter(Boolean)));
    if (!userIds.length) return { error: "No users selected." };
    if (!userIds.every(isUuid)) return { error: "Select valid user accounts." };
    if (userIds.length > MAX_BULK_RECORDS) return { error: `Delete at most ${MAX_BULK_RECORDS} users at a time.` };

    await db.update(usersTable).set({ deletedAt: new Date(), updatedAt: new Date() }).where(inArray(usersTable.id, userIds));
    await notifyChatAccessChange(db, context, { userIds });
    return { success: `Moved ${userIds.length} users to trash.` };
  }

  if (intent === "bulk-restore") {
    const userIds = Array.from(new Set(formData.getAll("userIds").map(String).filter(Boolean)));
    if (!userIds.length) return { error: "No users selected." };
    if (!userIds.every(isUuid)) return { error: "Select valid user accounts." };
    if (userIds.length > MAX_BULK_RECORDS) return { error: `Restore at most ${MAX_BULK_RECORDS} users at a time.` };

    await db.update(usersTable).set({ deletedAt: null }).where(inArray(usersTable.id, userIds));
    await notifyChatAccessChange(db, context, { userIds });
    return { success: `Restored ${userIds.length} users.` };
  }

  if (intent === "bulk-permanent-delete") {
    if (chatMigrationPaused(context)) return { error: "Chat migration is in progress. Please retry permanent deletion after the upgrade finishes." };
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
      const chatRecipientKeys = await chatAccessRecipients(db, trashedUserIds, undefined, context).catch(() => trashedUserIds.map(id => `user:${id}`));
      await deleteSupabaseUsersByEmail(context, trashedUsers.map(({ email }) => email));
      await removeD1ChatUsers(context, trashedUserIds);
      const deletedUsers = await db.delete(usersTable)
        .where(and(inArray(usersTable.id, trashedUserIds), isNotNull(usersTable.deletedAt)))
        .returning();
      if (deletedUsers.length) await notifyChatAccessChange(db, context, { recipientKeys: chatRecipientKeys });
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
  return (
    <Suspense fallback={<WorkspaceLoadingOverlay />}>
      <AdminManagementPanel />
    </Suspense>
  );
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
                  <Link to={`/site/node-logmin/projects/${project.id}`} className="neo-workspace__secondary-action inline-flex min-h-11 items-center rounded-xl px-4 text-xs font-bold">Open video review</Link>
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

function AdminOverviewMetric({ label, value, hint, icon, pending = false }: {
  label: string; value: string; hint: string; icon: string; pending?: boolean;
}) {
  return (
    <article className="neo-workspace__stat-card h-full rounded-[17px] p-4" aria-busy={pending || undefined}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="neo-workspace__eyebrow">{label}</p>
          <p className="neo-workspace__stat-value mt-2">{value}</p>
        </div>
        <span className="neo-icon-badge neo-workspace__stat-icon flex h-9 w-9 items-center justify-center rounded-xl" aria-hidden="true"><span className="material-symbols-outlined text-[19px]">{icon}</span></span>
      </div>
      <p className="neo-workspace__stat-hint mt-3">{hint}</p>
    </article>
  );
}

function AdminOverview() {
  const { adminUser, stats, overviewMedia, pricingPackageCount } = useLoaderData<typeof loader>();
  const mediaUnavailable = <AdminOverviewMetric label="Media assets" value="—" hint="Media connection unavailable" icon="perm_media" />;

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
        ].map(([label, value, hint, icon]) => <AdminOverviewMetric key={label} label={label} value={value} hint={hint} icon={icon} />)}
        <div aria-live="polite" aria-atomic="true">
          <Suspense fallback={<AdminOverviewMetric label="Media assets" value="…" hint="Loading live media count…" icon="perm_media" pending />}>
            <Await resolve={overviewMedia} errorElement={mediaUnavailable}>
              {(media: Awaited<typeof overviewMedia>) => media && !media.error
                ? <AdminOverviewMetric label="Media assets" value={String(media.count)} hint={`${pricingPackageCount} packages published`} icon="perm_media" />
                : mediaUnavailable}
            </Await>
          </Suspense>
        </div>
      </section>

      <AdminRecentEvents />

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
