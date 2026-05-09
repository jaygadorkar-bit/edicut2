import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, data, redirect, useActionData, useLoaderData, useLocation, useNavigation, useSearchParams } from "react-router";
import bcrypt from "bcryptjs";
import { updateUserRole } from "@edicut/db/repositories/users";
import { adminUsers as adminUsersTable, users as usersTable } from "@edicut/db/schema";
import { getDbFromContext } from "../lib/db.server";
import {
  destroyAdminSession,
  commitAdminSession,
  getAdminSession,
  isAdminRole,
  requireAdminUser,
} from "../lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH, adminPath } from "../lib/admin-paths";
import { toPublicAdminUser } from "../lib/admin-public";
import { formatUserRole, isUserRole, normalizeUserRole, USER_ROLES, type UserRole } from "../lib/admin-user-roles";
import {
  createPackageId,
  getPricingPackages,
  packageSlug,
  savePricingPackages,
  type PricingPackage,
} from "../lib/pricing.server";
import { optimizeCloudinaryUrl } from "../lib/cloudinary";
import {
  deleteCloudinaryImages,
  getCloudinaryUsage,
  listCloudinaryImages,
  removeCloudinaryUrlsFromPackages,
  uploadPackageImageToCloudinary,
  type CloudinaryImageResource,
  type CloudinaryUsage,
} from "../lib/cloudinary.server";
import {
  getAdminToolbarEnabled,
  saveAdminToolbarEnabled,
  getPromoBarSettings,
  savePromoBarSettings,
  getRoleFeatureAccessSettings,
  saveRoleFeatureAccessSettings,
} from "../lib/site-settings.server";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, count as drizzleCount } from "drizzle-orm";
import { useState, useEffect, type ReactNode } from "react";
import { DASHBOARD_FEATURES, type RoleFeatureAccess } from "../lib/role-feature-access";

const PAGE_SIZE = 10;

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  const features = linesToList(formData.get("features"));
  const deliverables = linesToList(formData.get("deliverables"));
  const galleryImages = linesToList(formData.get("galleryImages"));

  if (!name) return { error: "Package name is required." };
  if (!price) return { error: "Package price is required." };
  if (!description) return { error: "Package description is required." };
  if (!features.length) return { error: "Add at least one package feature." };

  return {
    id: existing?.id || createPackageId(),
    name,
    slug,
    price,
    interval: String(formData.get("interval") || "/mo").trim() || "/mo",
    description,
    features,
    deliverables,
    galleryImages,
    bestFor: String(formData.get("bestFor") || "").trim(),
    turnaround: String(formData.get("turnaround") || "").trim(),
    revisions: String(formData.get("revisions") || "").trim(),
    badge: String(formData.get("badge") || "").trim(),
    popular: formData.get("popular") === "on",
    active: formData.get("active") === "on",
    sortOrder: Number(formData.get("sortOrder") || existing?.sortOrder || 0),
  };
}

export const meta: MetaFunction = () => {
  return [
    { title: "User Management - EdiCut" },
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
  const tab = url.searchParams.get("tab") || "users";
  const q = url.searchParams.get("q") || "";
  const roleFilter = url.searchParams.get("role") || "";
  const page = Math.max(Number(url.searchParams.get("page") || "1"), 1);
  const sort = url.searchParams.get("sort") || "createdAt";
  const order = url.searchParams.get("order") || "desc";
  const view = url.searchParams.get("view") || "active"; // active or trash
  const adminDirectory = view === "admins";

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

  // Fetch users with pagination
  const [users, totalResult, adminUsers, adminTotalResult] = await Promise.all([
    adminDirectory ? Promise.resolve([]) : db.select().from(usersTable)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    adminDirectory ? Promise.resolve([{ count: 0 }]) : db.select({ count: drizzleCount() }).from(usersTable).where(whereClause),
    adminDirectory ? db.select().from(adminUsersTable)
      .where(adminFilters)
      .orderBy(adminOrderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE) : Promise.resolve([]),
    adminDirectory ? db.select({ count: drizzleCount() }).from(adminUsersTable).where(adminFilters) : Promise.resolve([{ count: 0 }])
  ]);

  const totalUsersCount = adminDirectory ? adminTotalResult[0]?.count ?? 0 : totalResult[0]?.count ?? 0;
  const totalPages = Math.ceil(totalUsersCount / PAGE_SIZE);

  // Global Stats (Using separate queries for maximum compatibility)
  const [
    totalCount,
    adminCount,
    managerCount,
    editorCount,
    customerCount,
    supportCount,
    trashCount,
    pricingPackages,
    adminToolbarEnabled,
    promoBarSettings,
    roleFeatureAccess,
    cloudinaryImages,
    cloudinaryUsage,
    cloudinaryError
  ] = await Promise.all([
    db.select({ count: drizzleCount() }).from(usersTable).where(isNull(usersTable.deletedAt)),
    db.select({ count: drizzleCount() }).from(adminUsersTable).where(eq(adminUsersTable.active, true)),
    db.select({ count: drizzleCount() }).from(usersTable).where(and(eq(usersTable.role, "project_manager"), isNull(usersTable.deletedAt))),
    db.select({ count: drizzleCount() }).from(usersTable).where(and(eq(usersTable.role, "editor"), isNull(usersTable.deletedAt))),
    db.select({ count: drizzleCount() }).from(usersTable).where(and(eq(usersTable.role, "customer"), isNull(usersTable.deletedAt))),
    db.select({ count: drizzleCount() }).from(usersTable).where(and(eq(usersTable.role, "customer_support"), isNull(usersTable.deletedAt))),
    db.select({ count: drizzleCount() }).from(usersTable).where(isNotNull(usersTable.deletedAt)),
    getPricingPackages(db),
    getAdminToolbarEnabled(db),
    getPromoBarSettings(db),
    getRoleFeatureAccessSettings(db),
    listCloudinaryImages(context).catch((error) => {
      console.error("Cloudinary image list error:", error);
      return [] as CloudinaryImageResource[];
    }),
    getCloudinaryUsage(context).catch((error) => {
      console.error("Cloudinary usage error:", error);
      return null as CloudinaryUsage | null;
    }),
    Promise.resolve(null as string | null),
  ]);

  const payload = {
    adminUser: toPublicAdminUser(adminUser),
    users,
    adminUsers,
    totalUsersCount,
    totalPages,
    currentPage: page,
    tab,
    view,
    pricingPackages,
    adminToolbarEnabled,
    promoBarSettings,
    roleFeatureAccess,
    cloudinaryImages,
    cloudinaryUsage,
    cloudinaryError,
    stats: {
      total: Number(totalCount[0].count || 0),
      admins: Number(adminCount[0].count || 0),
      managers: Number(managerCount[0].count || 0),
      editors: Number(editorCount[0].count || 0),
      customers: Number(customerCount[0].count || 0),
      support: Number(supportCount[0].count || 0),
      trash: Number(trashCount[0].count || 0),
    }
  };

  const adminSession = await getAdminSession(request.headers.get("Cookie"), context);

  return data(payload, {
    headers: {
      "Set-Cookie": await commitAdminSession(adminSession, { maxAge: 60 * 60 * 2 }, context),
    },
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDbFromContext(context);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "logout") {
    const session = await getAdminSession(request.headers.get("Cookie"), context);
    return redirect(ADMIN_LOGIN_PATH, {
      headers: {
        "Set-Cookie": await destroyAdminSession(session, context),
      },
    });
  }

  const adminUser = await requireAdminUser(request, db, context);

  if (!isAdminRole(adminUser.role)) {
    return { error: "Permission denied." };
  }

  if (intent === "create-user") {
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const role = String(formData.get("role") || "customer");

    if (!email || !isEmail(email)) return { error: "Enter a valid email address." };
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

    if (!email || !isEmail(email)) return { error: "Enter a valid admin email address." };

    if (password.length < 12) {
      return { error: "Admin password must be at least 12 characters." };
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

    if (!userId || !isUserRole(role)) {
      return { error: "Invalid role." };
    }

    await updateUserRole(db, userId, role);
    return { success: "Role updated." };
  }

  if (intent === "bulk-update-role") {
    const userIds = formData.getAll("userIds") as string[];
    const role = String(formData.get("role") ?? "");

    if (!userIds.length || !isUserRole(role)) {
      return { error: "Invalid input." };
    }

    await db.update(usersTable).set({ role }).where(inArray(usersTable.id, userIds));
    return { success: `Updated ${userIds.length} users.` };
  }

  if (intent === "bulk-delete") {
    const userIds = formData.getAll("userIds") as string[];
    if (!userIds.length) return { error: "No users selected." };

    await db.update(usersTable).set({ deletedAt: new Date(), updatedAt: new Date() }).where(inArray(usersTable.id, userIds));
    return { success: `Moved ${userIds.length} users to trash.` };
  }

  if (intent === "bulk-restore") {
    const userIds = formData.getAll("userIds") as string[];
    if (!userIds.length) return { error: "No users selected." };

    await db.update(usersTable).set({ deletedAt: null }).where(inArray(usersTable.id, userIds));
    return { success: `Restored ${userIds.length} users.` };
  }

  if (intent === "bulk-permanent-delete") {
    const userIds = formData.getAll("userIds") as string[];
    if (!userIds.length) return { error: "No users selected." };

    await db.delete(usersTable).where(and(inArray(usersTable.id, userIds), isNotNull(usersTable.deletedAt)));
    return { success: `Permanently deleted ${userIds.length} users.` };
  }

  if (intent === "create-package" || intent === "update-package") {
    const packages = await getPricingPackages(db);
    const packageId = String(formData.get("packageId") || "");
    const existing = packages.find((pkg) => pkg.id === packageId);

    if (intent === "update-package" && !existing) {
      return { error: "Package not found." };
    }

    const nextPackage = packageFromForm(formData, existing);
    if ("error" in nextPackage) return nextPackage;

    const imageFiles = formData
      .getAll("galleryImageFiles")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (imageFiles.length) {
      try {
        const uploadedImages = await Promise.all(imageFiles.map((file) => uploadPackageImageToCloudinary(file, context)));
        nextPackage.galleryImages = Array.from(new Set([...nextPackage.galleryImages, ...uploadedImages]));
      } catch (error) {
        console.error("Package gallery upload error:", error);
        return { error: error instanceof Error ? error.message : "Failed to upload package images." };
      }
    }

    const slugOwner = packages.find((pkg) => pkg.slug === nextPackage.slug && pkg.id !== nextPackage.id);
    if (slugOwner) {
      return { error: "Another package already uses this slug." };
    }

    const nextPackages = intent === "create-package"
      ? [...packages, nextPackage]
      : packages.map((pkg) => (pkg.id === nextPackage.id ? nextPackage : pkg));

    await savePricingPackages(db, nextPackages);
    return { success: intent === "create-package" ? "Package created." : "Package updated." };
  }

  if (intent === "delete-package") {
    const packageId = String(formData.get("packageId") || "");
    const packages = await getPricingPackages(db);
    const nextPackages = packages.filter((pkg) => pkg.id !== packageId);

    if (nextPackages.length === packages.length) {
      return { error: "Package not found." };
    }

    await savePricingPackages(db, nextPackages);
    return { success: "Package deleted." };
  }

  if (intent === "update-admin-toolbar") {
    await saveAdminToolbarEnabled(db, formData.get("adminToolbarEnabled") === "on");
    return { success: "Settings updated." };
  }

  if (intent === "update-promo-bar") {
    const enabled = formData.get("promoBarEnabled") === "on";
    const message = String(formData.get("promoBarMessage") || "");
    await savePromoBarSettings(db, enabled, message);
    return { success: "Promo bar settings updated." };
  }

  if (intent === "update-role-access") {
    const nextAccess = USER_ROLES.reduce<RoleFeatureAccess>((accumulator, role) => {
      accumulator[role] = DASHBOARD_FEATURES
        .filter((feature) => formData.get(`access__${role}__${feature.key}`) === "on")
        .map((feature) => feature.key);

      return accumulator;
    }, {} as RoleFeatureAccess);

    await saveRoleFeatureAccessSettings(db, nextAccess);
    return { success: "Role access settings updated." };
  }

  if (intent === "upload-images") {
    const imageFiles = formData
      .getAll("imageFiles")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!imageFiles.length) {
      return { error: "Choose at least one image to upload." };
    }

    try {
      await Promise.all(imageFiles.map((file) => uploadPackageImageToCloudinary(file, context)));
      return { success: `Uploaded ${imageFiles.length} image${imageFiles.length === 1 ? "" : "s"}.` };
    } catch (error) {
      console.error("Cloudinary images upload error:", error);
      return { error: error instanceof Error ? error.message : "Failed to upload images." };
    }
  }

  if (intent === "delete-images") {
    const publicIds = formData.getAll("publicIds").map(String).filter(Boolean);
    const imageUrls = formData.getAll("imageUrls").map(String).filter(Boolean);

    if (!publicIds.length) {
      return { error: "Choose at least one image to delete." };
    }

    try {
      await deleteCloudinaryImages(publicIds, context);
      const packages = await getPricingPackages(db);
      await savePricingPackages(db, removeCloudinaryUrlsFromPackages(packages, imageUrls));
      return { success: `Deleted ${publicIds.length} image${publicIds.length === 1 ? "" : "s"}.` };
    } catch (error) {
      console.error("Cloudinary images delete error:", error);
      return { error: error instanceof Error ? error.message : "Failed to delete images." };
    }
  }

  return { error: "Unknown action." };
}

export default function AdminRoute() {
  const {
    adminUser,
    users,
    adminUsers,
    totalPages,
    currentPage,
    stats,
    tab,
    view,
    pricingPackages,
    adminToolbarEnabled,
    promoBarSettings,
    roleFeatureAccess,
    cloudinaryImages,
    cloudinaryUsage,
    cloudinaryError,
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
  const [showCreatePackageModal, setShowCreatePackageModal] = useState(false);

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
  const adminAccountUrl = `${adminPath("/account")}?returnTo=${encodeURIComponent(`${location.pathname}${location.search || ""}`)}`;
  const pageTitle = tab === "packages" ? "Pricing Packages" : tab === "images" ? "Images" : tab === "settings" ? "Settings" : tab === "users" ? "User Management" : `${tab.charAt(0).toUpperCase()}${tab.slice(1)} Module`;

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center border-b border-slate-100 px-6">
          <Link to="/" reloadDocument className="flex items-center gap-2" title="Visit frontend homepage">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white shadow-lg">
              <span className="material-symbols-outlined text-[20px]">bolt</span>
            </div>
            <span className="text-xl font-black tracking-tighter text-slate-900">EDICUT</span>
          </Link>
        </div>
        
        <nav className="p-4 space-y-1">
          <SidebarLink icon="home" label="Home" active={false} to="/" />
          <SidebarLink icon="dashboard" label="Overview" active={tab === "overview"} to="?tab=overview" />
          <SidebarLink icon="group" label="User Management" active={tab === "users"} to="?tab=users" />
          <SidebarLink icon="sell" label="Pricing Packages" active={tab === "packages"} to="?tab=packages" />
          <SidebarLink icon="image" label="Images" active={tab === "images"} to="?tab=images" />
          <SidebarLink icon="video_library" label="Projects" active={tab === "projects"} to="?tab=projects" />
          <SidebarLink icon="payments" label="Payments" active={tab === "payments"} to="?tab=payments" />
          <SidebarLink icon="history" label="Audit Logs" active={tab === "audit"} to="?tab=audit" />
          <SidebarLink icon="settings" label="Settings" active={tab === "settings"} to="?tab=settings" />
        </nav>

        <div className="absolute bottom-0 w-full border-t border-slate-100 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <Link to={adminAccountUrl} className="h-8 w-8 rounded-full bg-black flex items-center justify-center text-[10px] text-white font-bold " title="Edit admin account">
              {adminUser.email[0].toUpperCase()}
            </Link>
            <Link to={adminAccountUrl} className="min-w-0 flex-1 overflow-hidden" title="Edit admin account">
              <p className="truncate text-xs font-bold text-slate-900 underline-offset-4">{adminUser.name || "Admin"}</p>
              <p className="truncate text-[10px] font-medium text-slate-500">{adminUser.email}</p>
            </Link>
            <Form method="post" action={ADMIN_BASE_PATH} reloadDocument className="ml-auto">
              <input type="hidden" name="intent" value="logout" />
              <button type="submit" className="text-slate-400 -colors">
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </Form>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pl-64">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 px-8 py-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-900">
              {pageTitle}
            </h2>
            <div className="flex items-center gap-3">
              {tab === "packages" && (
                <button
                  onClick={() => setShowCreatePackageModal(true)}
                  className="flex h-10 items-center gap-2 rounded-xl bg-black px-4 text-sm font-black text-white shadow-lg shadow-black/10"
                >
                  <span className="material-symbols-outlined text-[18px]">add_card</span>
                  Add Package
                </button>
              )}
              {tab === "images" && (
                <Link
                  reloadDocument
                  to="?tab=images"
                  className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 "
                >
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                  Refresh
                </Link>
              )}
              {tab === "users" && (
                <>
                  <button
                    onClick={() => setShowCreateAdminModal(true)}
                    className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 "
                  >
                    <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                    Add Admin
                  </button>
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="flex h-10 items-center gap-2 rounded-xl bg-black px-4 text-sm font-black text-white shadow-lg shadow-black/10"
                  >
                    <span className="material-symbols-outlined text-[18px]">person_add</span>
                    Add User
                  </button>
                </>
              )}
              <div className="h-6 w-px bg-slate-200 mx-2" />
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live</span>
            </div>
          </div>
        </header>

        <div className="p-8 space-y-8">
          {tab === "users" && actionError ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-600">{actionError}</div>
          ) : null}
          {tab === "users" && actionSuccess ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">{actionSuccess}</div>
          ) : null}
          {tab === "users" ? (
            <>
              {/* Metrics */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <MetricCard label="All Users" value={stats.total} icon="group" color="blue" to="?tab=users&view=active" active={!isAdminDirectory && view !== "trash" && !searchParams.get("role")} />
                <MetricCard label="Admins" value={stats.admins} icon="admin_panel_settings" color="red" to="?tab=users&view=admins" active={isAdminDirectory} />
                <MetricCard label="Managers" value={stats.managers} icon="manage_accounts" color="indigo" to="?tab=users&view=active&role=project_manager" active={!isAdminDirectory && searchParams.get("role") === "project_manager"} />
                <MetricCard label="Support" value={stats.support} icon="support_agent" color="slate" to="?tab=users&view=active&role=customer_support" active={!isAdminDirectory && searchParams.get("role") === "customer_support"} />
                <MetricCard label="Trash" value={stats.trash} icon="delete" color="amber" to="?tab=users&view=trash" active={view === "trash"} />
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
                      <div className="flex items-center gap-2">
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
                        <button onClick={() => setSelectedUsers([])} className="p-1 text-slate-400 "><span className="material-symbols-outlined text-[18px]">close</span></button>
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
                        <th className="px-6 py-4 w-12">
                          <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-slate-300 accent-black" />
                        </th>
                        <th className="cursor-pointer px-6 py-4 " onClick={() => handleSort("name")}>
                          User {getSortIcon(searchParams, "name")}
                        </th>
                        <th className="cursor-pointer px-6 py-4 " onClick={() => handleSort("role")}>
                          Role {getSortIcon(searchParams, "role")}
                        </th>
                        <th className="px-6 py-4">{searchParams.get("view") === "trash" ? "Deleted" : "Status"}</th>
                        <th className="cursor-pointer px-6 py-4 " onClick={() => handleSort("createdAt")}>
                          Joined {getSortIcon(searchParams, "createdAt")}
                        </th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {users.length === 0 ? (
                        <tr><td colSpan={6} className="py-20 text-center text-slate-400">No users found in {searchParams.get("view") === "trash" ? "trash" : "active list"}.</td></tr>
                      ) : (
                        users.map(user => (
                          <tr key={user.id} className="group -colors">
                            <td className="px-6 py-4">
                              <input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={() => toggleSelectUser(user.id)} className="h-4 w-4 rounded border-slate-300 accent-black" />
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase">
                                  {user.name?.[0] || user.email[0]}
                                </div>
                                <div>
                                  <Link to={getUserEditUrl(user.id)} className="text-sm font-black text-slate-900 underline-offset-4">
                                    {user.name || "User"}
                                  </Link>
                                  <Link to={getUserEditUrl(user.id)} className="block text-xs font-medium text-slate-500 ">
                                    {user.email}
                                  </Link>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4"><RoleBadge role={user.role} /></td>
                            <td className="px-6 py-4">
                              {user.deletedAt ? (
                                <span className="text-[10px] font-bold text-red-500">{new Date(user.deletedAt).toLocaleDateString()}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 uppercase">
                                  <span className="h-1 w-1 rounded-full bg-emerald-500" /> Active
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Link to={getUserEditUrl(user.id)} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 -colors" title="Edit Account">
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </Link>
                                {user.deletedAt ? (
                                  <>
                                    <Form method="post" reloadDocument>
                                      <input type="hidden" name="intent" value="bulk-restore" />
                                      <input type="hidden" name="userIds" value={user.id} />
                                      <button type="submit" className="h-8 w-8 flex items-center justify-center rounded-lg text-emerald-500 -colors" title="Restore User">
                                        <span className="material-symbols-outlined text-[18px]">restore_from_trash</span>
                                      </button>
                                    </Form>
                                    <Form method="post" reloadDocument onSubmit={e => !confirm("Permanently delete user?") && e.preventDefault()}>
                                      <input type="hidden" name="intent" value="bulk-permanent-delete" />
                                      <input type="hidden" name="userIds" value={user.id} />
                                      <button type="submit" className="h-8 w-8 flex items-center justify-center rounded-lg text-red-500 -colors" title="Delete Permanently">
                                        <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                                      </button>
                                    </Form>
                                  </>
                                ) : (
                                  <>
                                    <Form method="post" reloadDocument className="flex items-center gap-1">
                                      <input type="hidden" name="intent" value="update-role" />
                                      <input type="hidden" name="userId" value={user.id} />
                                      <select name="role" defaultValue={normalizeUserRole(user.role)} onChange={e => e.currentTarget.form?.requestSubmit()} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-black outline-none focus:border-black">
                                        {USER_ROLES.map(r => <option key={r} value={r}>{formatUserRole(r)}</option>)}
                                      </select>
                                    </Form>
                                    <Form method="post" reloadDocument onSubmit={e => !confirm("Move user to trash?") && e.preventDefault()}>
                                      <input type="hidden" name="intent" value="bulk-delete" />
                                      <input type="hidden" name="userIds" value={user.id} />
                                      <button type="submit" className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 -colors" title="Move to Trash">
                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                      </button>
                                    </Form>
                                  </>
                                )}
                              </div>
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
          ) : tab === "settings" ? (
            <SettingsPanel
              adminToolbarEnabled={adminToolbarEnabled}
              promoBarSettings={promoBarSettings}
              roleFeatureAccess={roleFeatureAccess}
              actionData={actionData}
              navigationState={navigation.state}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-32 rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
              <span className="material-symbols-outlined text-[64px] mb-4">construction</span>
              <h2 className="text-xl font-black text-slate-900">{tab.charAt(0).toUpperCase() + tab.slice(1)} Module</h2>
              <p className="text-sm font-medium mt-2">This module is currently being implemented to meet the new security and management requirements.</p>
              <Link to="?tab=users" className="mt-6 text-sm font-black text-black underline underline-offset-4">Return to User Management</Link>
            </div>
          )}
        </div>
      </main>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in ">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 ">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-black text-slate-900">Add New User</h3>
              <button onClick={() => setShowCreateModal(false)} className="h-8 w-8 rounded-full flex items-center justify-center text-slate-400 ">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <Form method="post" reloadDocument className="space-y-4">
              <input type="hidden" name="intent" value="create-user" />
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
                <input name="name" type="text" placeholder="John Doe" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
                <input name="email" type="email" required placeholder="john@example.com" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">System Role</label>
                <select name="role" required defaultValue="customer" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black">
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
        </div>
      )}

      {showCreateAdminModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in ">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 ">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-black text-slate-900">Create Admin</h3>
              <button onClick={() => setShowCreateAdminModal(false)} className="h-8 w-8 rounded-full flex items-center justify-center text-slate-400 ">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <Form method="post" reloadDocument className="space-y-4">
              <input type="hidden" name="intent" value="create-admin" />
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
                <input name="name" type="text" placeholder="Jane Admin" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Admin Email</label>
                <input name="email" type="email" required placeholder="admin@example.com" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Password</label>
                <input name="password" type="password" required minLength={12} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Confirm Password</label>
                <input name="confirmPassword" type="password" required minLength={12} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
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
        </div>
      )}

      {showCreatePackageModal && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 pt-10 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-black text-slate-900">Create Package</h3>
              <button onClick={() => setShowCreatePackageModal(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 ">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <PackageForm intent="create-package" navigationState={navigation.state} onCancel={() => setShowCreatePackageModal(false)} />
          </div>
        </div>
      )}
    </div>
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
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4">
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
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{pkg.name}</p>
                    <p className={`mt-1 text-xs font-bold ${editingPackage?.id === pkg.id ? "text-slate-300" : "text-slate-500"}`}>{pkg.price}{pkg.interval} · /pricing/{pkg.slug}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${pkg.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {pkg.active ? "Live" : "Hidden"}
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
            <div className="flex gap-2">
              <Link to={`/pricing/${editingPackage.slug}`} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 ">
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                Preview
              </Link>
              <Form method="post" reloadDocument onSubmit={(event) => !confirm("Delete this package?") && event.preventDefault()}>
                <input type="hidden" name="intent" value="delete-package" />
                <input type="hidden" name="packageId" value={editingPackage.id} />
                <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-100 px-4 text-sm font-black text-red-600 ">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  Delete
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
                  <img src={optimizeCloudinaryUrl(image.secure_url)} alt={image.public_id} className="aspect-video w-full bg-slate-100 object-cover" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/80 px-2 py-1 text-[10px] font-black uppercase text-white">{image.format || "image"}</span>
                  <input name="publicIds" value={image.public_id} type="checkbox" className="absolute right-3 top-3 h-5 w-5 accent-black" />
                  <input name="imageUrls" value={image.secure_url} type="hidden" />
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

function SettingsPanel({
  adminToolbarEnabled,
  promoBarSettings,
  roleFeatureAccess,
  actionData,
  navigationState,
}: {
  adminToolbarEnabled: boolean;
  promoBarSettings: { enabled: boolean; message: string };
  roleFeatureAccess: RoleFeatureAccess;
  actionData: { error?: string; success?: string } | undefined;
  navigationState: "idle" | "submitting" | "loading";
}) {
  const isSubmitting = navigationState === "submitting";
  const actionError = actionData && "error" in actionData ? actionData.error : null;
  const actionSuccess = actionData && "success" in actionData ? actionData.success : null;

  return (
    <div className="max-w-4xl space-y-6">
      {actionError ? <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-600">{actionError}</div> : null}
      {actionSuccess ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{actionSuccess}</div> : null}

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

          <Form method="post" reloadDocument className="w-full rounded-2xl bg-slate-50 p-5 md:w-72">
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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
              <span className="material-symbols-outlined text-[22px]">campaign</span>
            </div>
            <p className="mt-5 text-xs font-black uppercase tracking-widest text-slate-500">Site Header</p>
            <h3 className="mt-2 text-2xl font-black text-slate-900">Promo Bar</h3>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-500">
              Display a slim black bar above the main navigation to share important announcements, discounts, or updates with your visitors.
            </p>
          </div>

          <Form method="post" reloadDocument className="w-full rounded-2xl bg-slate-50 p-5 md:w-96">
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
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
              <span className="material-symbols-outlined text-[22px]">shield_person</span>
            </div>
            <p className="mt-5 text-xs font-black uppercase tracking-widest text-slate-500">RBAC</p>
            <h3 className="mt-2 text-2xl font-black text-slate-900">Role management</h3>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-500">
              Choose which dashboard features each role can access. This controls navigation visibility and route-level access checks.
            </p>
          </div>

          <Form method="post" reloadDocument className="w-full md:w-[720px]">
            <input type="hidden" name="intent" value="update-role-access" />
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[680px] text-left">
                <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Role</th>
                    {DASHBOARD_FEATURES.map((feature) => (
                      <th key={feature.key} className="px-3 py-3 text-center">{feature.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {USER_ROLES.map((role) => {
                    const access = new Set(roleFeatureAccess[role] || []);

                    return (
                      <tr key={role}>
                        <td className="px-4 py-3 text-sm font-black text-slate-900">{formatUserRole(role)}</td>
                        {DASHBOARD_FEATURES.map((feature) => (
                          <td key={`${role}-${feature.key}`} className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              name={`access__${role}__${feature.key}`}
                              defaultChecked={access.has(feature.key)}
                              className="h-4 w-4 accent-black"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button type="submit" disabled={isSubmitting} className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-black text-white disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">save</span>
              {isSubmitting ? "Saving..." : "Save Role Access"}
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
          <th className="px-6 py-4">
            <Link to={sortLink("name")} reloadDocument className="inline-flex items-center gap-1 ">
              Admin {getSortIcon(searchParams, "name")}
            </Link>
          </th>
          <th className="px-6 py-4">
            <Link to={sortLink("role")} reloadDocument className="inline-flex items-center gap-1 ">
              Role {getSortIcon(searchParams, "role")}
            </Link>
          </th>
          <th className="px-6 py-4">Status</th>
          <th className="px-6 py-4">
            <Link to={sortLink("createdAt")} reloadDocument className="inline-flex items-center gap-1 ">
              Created {getSortIcon(searchParams, "createdAt")}
            </Link>
          </th>
          <th className="px-6 py-4 text-right">Last Updated</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {adminUsers.length === 0 ? (
          <tr><td colSpan={5} className="py-20 text-center text-slate-400">No admin accounts found.</td></tr>
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
              <td className="px-6 py-4">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${admin.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  <span className={`h-1 w-1 rounded-full ${admin.active ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {admin.active ? "Active" : "Disabled"}
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
          <input name="slug" defaultValue={pkg?.slug || ""} className={inputClass} placeholder="medium" />
        </Field>
        <Field label="Price">
          <input name="price" required defaultValue={pkg?.price || ""} className={inputClass} placeholder="$999" />
        </Field>
        <Field label="Interval">
          <input name="interval" defaultValue={pkg?.interval || "/mo"} className={inputClass} placeholder="/mo" />
        </Field>
        <Field label="Sort order">
          <input name="sortOrder" type="number" defaultValue={pkg?.sortOrder || 10} className={inputClass} />
        </Field>
        <Field label="Badge">
          <input name="badge" defaultValue={pkg?.badge || ""} className={inputClass} placeholder="Most popular" />
        </Field>
        <Field label="Turnaround">
          <input name="turnaround" defaultValue={pkg?.turnaround || ""} className={inputClass} placeholder="24-36h" />
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
          <textarea name="features" required defaultValue={(pkg?.features || []).join("\n")} className={`${inputClass} min-h-40`} placeholder={"8 videos monthly\n24-36h turnaround\nMotion graphics"} />
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
              <img key={imageUrl} src={optimizeCloudinaryUrl(imageUrl)} alt="" className="aspect-video w-full rounded-xl border border-slate-200 bg-white object-cover" />
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

function SidebarLink({ icon, label, to, active }: { icon: string; label: string; to: string; active?: boolean }) {
  return (
    <Link reloadDocument to={to} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold -all ${active ? "bg-slate-900 text-white shadow-lg" : "text-slate-500 "}`}>
      <span className="material-symbols-outlined text-[20px]">{icon}</span> {label}
    </Link>
  );
}

function MetricCard({ label, value, icon, color, to, active = false }: { label: string; value: number; icon: string; color: string; to?: string; active?: boolean }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    red: "bg-red-50 text-red-600",
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-700",
  };
  const content = (
    <>
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorMap[color]}`}><span className="material-symbols-outlined text-[20px]">{icon}</span></div>
        <span className={`text-[10px] font-black uppercase tracking-widest ${active ? "text-slate-900" : "text-slate-400"}`}>{active ? "Selected" : "Realtime"}</span>
      </div>
      <div className="mt-4"><p className="text-3xl font-black tracking-tight text-slate-900">{value}</p><p className="text-xs font-bold text-slate-500">{label}</p></div>
    </>
  );

  if (to) {
    return (
      <Link reloadDocument to={to} className={`rounded-2xl border bg-white p-5 text-left shadow-sm ${active ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200"}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm -transform ">
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

function PaginationButton({ icon, disabled, onClick }: { icon: string, disabled: boolean, onClick: () => void }) {
  return <button disabled={disabled} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"><span className="material-symbols-outlined text-[18px]">{icon}</span></button>;
}

function getSortIcon(params: URLSearchParams, field: string) {
  const sort = params.get("sort") || "createdAt";
  const order = params.get("order") || "desc";
  if (sort !== field) return <span className="material-symbols-outlined text-[14px] opacity-20">unfold_more</span>;
  return order === "asc" ? <span className="material-symbols-outlined text-[14px]">expand_less</span> : <span className="material-symbols-outlined text-[14px]">expand_more</span>;
}
