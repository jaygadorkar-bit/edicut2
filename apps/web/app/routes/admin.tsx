import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useLocation, useNavigation, useSearchParams, useSubmit } from "react-router";
import bcrypt from "bcryptjs";
import { updateUserRole } from "@edicut/db/repositories/users";
import { adminUsers as adminUsersTable, users as usersTable } from "@edicut/db/schema";
import { getDbFromContext } from "../lib/db.server";
import {
  destroyAdminSession,
  getAdminSession,
  isAdminRole,
  requireAdminUser,
} from "../lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH, adminPath } from "../lib/admin-paths";
import { toPublicAdminUser } from "../lib/admin-public";
import { formatUserRole, isUserRole, normalizeUserRole, USER_ROLES, type UserRole } from "../lib/admin-user-roles";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, count as drizzleCount } from "drizzle-orm";
import { useState, useEffect } from "react";

const PAGE_SIZE = 10;

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  
  // Sorting
  const sortColumn = sort === "role" ? usersTable.role : usersTable.createdAt;
  const orderBy = order === "asc" ? asc(sortColumn) : desc(sortColumn);

  // Fetch users with pagination
  const [users, totalResult] = await Promise.all([
    db.select().from(usersTable)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ count: drizzleCount() }).from(usersTable).where(whereClause)
  ]);

  const totalUsersCount = totalResult[0]?.count ?? 0;
  const totalPages = Math.ceil(totalUsersCount / PAGE_SIZE);

  // Global Stats (Using separate queries for maximum compatibility)
  const [
    totalCount,
    adminCount,
    managerCount,
    editorCount,
    customerCount,
    trashCount
  ] = await Promise.all([
    db.select({ count: drizzleCount() }).from(usersTable).where(isNull(usersTable.deletedAt)),
    db.select({ count: drizzleCount() }).from(adminUsersTable).where(eq(adminUsersTable.active, true)),
    db.select({ count: drizzleCount() }).from(usersTable).where(and(eq(usersTable.role, "project_manager"), isNull(usersTable.deletedAt))),
    db.select({ count: drizzleCount() }).from(usersTable).where(and(eq(usersTable.role, "editor"), isNull(usersTable.deletedAt))),
    db.select({ count: drizzleCount() }).from(usersTable).where(and(eq(usersTable.role, "customer"), isNull(usersTable.deletedAt))),
    db.select({ count: drizzleCount() }).from(usersTable).where(isNotNull(usersTable.deletedAt)),
  ]);

  return {
    adminUser: toPublicAdminUser(adminUser),
    users,
    totalUsersCount,
    totalPages,
    currentPage: page,
    tab,
    view,
    stats: {
      total: Number(totalCount[0].count || 0),
      admins: Number(adminCount[0].count || 0),
      managers: Number(managerCount[0].count || 0),
      editors: Number(editorCount[0].count || 0),
      customers: Number(customerCount[0].count || 0),
      trash: Number(trashCount[0].count || 0),
    }
  };
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

  return { error: "Unknown action." };
}

export default function AdminRoute() {
  const { adminUser, users, totalPages, currentPage, stats, tab } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigation = useNavigation();
  const submit = useSubmit();
  
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateAdminModal, setShowCreateAdminModal] = useState(false);

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

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center border-b border-slate-100 px-6">
          <Link to={ADMIN_BASE_PATH} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white shadow-lg">
              <span className="material-symbols-outlined text-[20px]">bolt</span>
            </div>
            <span className="text-xl font-black tracking-tighter text-slate-900">EDICUT</span>
          </Link>
        </div>
        
        <nav className="p-4 space-y-1">
          <SidebarLink icon="dashboard" label="Overview" active={tab === "overview"} to="?tab=overview" />
          <SidebarLink icon="group" label="User Management" active={tab === "users"} to="?tab=users" />
          <SidebarLink icon="video_library" label="Projects" active={tab === "projects"} to="?tab=projects" />
          <SidebarLink icon="payments" label="Payments" active={tab === "payments"} to="?tab=payments" />
          <SidebarLink icon="history" label="Audit Logs" active={tab === "audit"} to="?tab=audit" />
          <SidebarLink icon="settings" label="Settings" active={tab === "settings"} to="?tab=settings" />
        </nav>

        <div className="absolute bottom-0 w-full border-t border-slate-100 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <Link to={adminAccountUrl} className="h-8 w-8 rounded-full bg-black flex items-center justify-center text-[10px] text-white font-bold transition hover:bg-slate-700" title="Edit admin account">
              {adminUser.email[0].toUpperCase()}
            </Link>
            <Link to={adminAccountUrl} className="min-w-0 flex-1 overflow-hidden" title="Edit admin account">
              <p className="truncate text-xs font-bold text-slate-900 hover:underline underline-offset-4">{adminUser.name || "Admin"}</p>
              <p className="truncate text-[10px] font-medium text-slate-500">{adminUser.email}</p>
            </Link>
            <Form method="post" action={ADMIN_BASE_PATH} reloadDocument className="ml-auto">
              <input type="hidden" name="intent" value="logout" />
              <button type="submit" className="text-slate-400 hover:text-red-500 transition-colors">
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
              User Management
            </h2>
            <div className="flex items-center gap-3">
              {tab === "users" && (
                <>
                  <button
                    onClick={() => setShowCreateAdminModal(true)}
                    className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 hover:bg-slate-50 transition"
                  >
                    <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                    Add Admin
                  </button>
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="flex h-10 items-center gap-2 rounded-xl bg-black px-4 text-sm font-black text-white hover:bg-slate-800 transition shadow-lg shadow-black/10"
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
          {tab === "users" ? (
            <>
              {/* Metrics */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Total Users" value={stats.total} icon="group" color="blue" />
                <MetricCard label="Admins" value={stats.admins} icon="admin_panel_settings" color="red" />
                <MetricCard label="Managers" value={stats.managers} icon="manage_accounts" color="indigo" />
                <MetricCard label="Trash" value={stats.trash} icon="delete" color="amber" />
              </div>

              {/* User List Card */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {/* View Switcher */}
                <div className="flex border-b border-slate-100">
                  <button 
                    onClick={() => { const p = new URLSearchParams(searchParams); p.set("view", "active"); setSearchParams(p); }}
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors ${searchParams.get("view") !== "trash" ? "bg-white text-black border-b-2 border-black" : "bg-slate-50 text-slate-400 hover:text-slate-600"}`}
                  >
                    Active Users
                  </button>
                  <button 
                    onClick={() => { const p = new URLSearchParams(searchParams); p.set("view", "trash"); setSearchParams(p); }}
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors ${searchParams.get("view") === "trash" ? "bg-white text-black border-b-2 border-black" : "bg-slate-50 text-slate-400 hover:text-slate-600"}`}
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
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium outline-none transition focus:border-black focus:ring-4 focus:ring-black/5"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        name="role"
                        defaultValue={searchParams.get("role") || ""}
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-black"
                      >
                        <option value="">All Roles</option>
                        {USER_ROLES.map(r => <option key={r} value={r}>{formatUserRole(r)}</option>)}
                      </select>
                      <button 
                        type="submit"
                        className="flex h-11 items-center justify-center rounded-xl bg-black px-6 text-sm font-black text-white hover:bg-slate-800 transition"
                      >
                        Search
                      </button>
                      <Link 
                        to={`?tab=users&view=${searchParams.get("view") || "active"}`}
                        className="flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
                      >
                        Reset
                      </Link>
                    </div>
                  </Form>

                  {selectedUsers.length > 0 && (
                    <div className="mt-4 flex items-center justify-between rounded-xl bg-black p-3 text-white animate-in slide-in-from-top-2">
                      <span className="text-sm font-bold pl-2">{selectedUsers.length} selected</span>
                      <div className="flex items-center gap-2">
                        {searchParams.get("view") === "trash" ? (
                          <>
                            <Form method="post">
                              <input type="hidden" name="intent" value="bulk-restore" />
                              {selectedUsers.map(id => <input key={id} type="hidden" name="userIds" value={id} />)}
                              <button type="submit" className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-600">Restore</button>
                            </Form>
                            <Form method="post" onSubmit={e => !confirm("Permanently delete selected users? This cannot be undone.") && e.preventDefault()}>
                              <input type="hidden" name="intent" value="bulk-permanent-delete" />
                              {selectedUsers.map(id => <input key={id} type="hidden" name="userIds" value={id} />)}
                              <button type="submit" className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-black text-white hover:bg-red-600">Delete Permanently</button>
                            </Form>
                          </>
                        ) : (
                          <>
                            <Form method="post" className="flex items-center gap-2">
                              <input type="hidden" name="intent" value="bulk-update-role" />
                              {selectedUsers.map(id => <input key={id} type="hidden" name="userIds" value={id} />)}
                              <select name="role" defaultValue="customer" className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold outline-none">
                                {USER_ROLES.map(r => <option key={r} value={r}>{formatUserRole(r)}</option>)}
                              </select>
                              <button type="submit" className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-black hover:bg-slate-100">Update Role</button>
                            </Form>
                            <Form method="post" onSubmit={e => !confirm("Move selected users to trash?") && e.preventDefault()}>
                              <input type="hidden" name="intent" value="bulk-delete" />
                              {selectedUsers.map(id => <input key={id} type="hidden" name="userIds" value={id} />)}
                              <button type="submit" className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-black text-white hover:bg-red-600">Move to Trash</button>
                            </Form>
                          </>
                        )}
                        <button onClick={() => setSelectedUsers([])} className="p-1 text-slate-400 hover:text-white"><span className="material-symbols-outlined text-[18px]">close</span></button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                        <th className="px-6 py-4 w-12">
                          <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-slate-300 accent-black" />
                        </th>
                        <th className="cursor-pointer px-6 py-4 hover:text-black transition" onClick={() => handleSort("name")}>
                          User {getSortIcon(searchParams, "name")}
                        </th>
                        <th className="cursor-pointer px-6 py-4 hover:text-black transition" onClick={() => handleSort("role")}>
                          Role {getSortIcon(searchParams, "role")}
                        </th>
                        <th className="px-6 py-4">{searchParams.get("view") === "trash" ? "Deleted" : "Status"}</th>
                        <th className="cursor-pointer px-6 py-4 hover:text-black transition" onClick={() => handleSort("createdAt")}>
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
                          <tr key={user.id} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={() => toggleSelectUser(user.id)} className="h-4 w-4 rounded border-slate-300 accent-black" />
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase">
                                  {user.name?.[0] || user.email[0]}
                                </div>
                                <div>
                                  <Link to={getUserEditUrl(user.id)} className="text-sm font-black text-slate-900 hover:underline underline-offset-4">
                                    {user.name || "User"}
                                  </Link>
                                  <Link to={getUserEditUrl(user.id)} className="block text-xs font-medium text-slate-500 hover:text-slate-900">
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
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Link to={getUserEditUrl(user.id)} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors" title="Edit Account">
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </Link>
                                {user.deletedAt ? (
                                  <>
                                    <Form method="post">
                                      <input type="hidden" name="intent" value="bulk-restore" />
                                      <input type="hidden" name="userIds" value={user.id} />
                                      <button type="submit" className="h-8 w-8 flex items-center justify-center rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors" title="Restore User">
                                        <span className="material-symbols-outlined text-[18px]">restore_from_trash</span>
                                      </button>
                                    </Form>
                                    <Form method="post" onSubmit={e => !confirm("Permanently delete user?") && e.preventDefault()}>
                                      <input type="hidden" name="intent" value="bulk-permanent-delete" />
                                      <input type="hidden" name="userIds" value={user.id} />
                                      <button type="submit" className="h-8 w-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors" title="Delete Permanently">
                                        <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                                      </button>
                                    </Form>
                                  </>
                                ) : (
                                  <>
                                    <Form method="post" className="flex items-center gap-1">
                                      <input type="hidden" name="intent" value="update-role" />
                                      <input type="hidden" name="userId" value={user.id} />
                                      <select name="role" defaultValue={normalizeUserRole(user.role)} onChange={e => submit(e.currentTarget.form)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-black outline-none focus:border-black">
                                        {USER_ROLES.map(r => <option key={r} value={r}>{formatUserRole(r)}</option>)}
                                      </select>
                                    </Form>
                                    <Form method="post" onSubmit={e => !confirm("Move user to trash?") && e.preventDefault()}>
                                      <input type="hidden" name="intent" value="bulk-delete" />
                                      <input type="hidden" name="userIds" value={user.id} />
                                      <button type="submit" className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Move to Trash">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-black text-slate-900">Add New User</h3>
              <button onClick={() => setShowCreateModal(false)} className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-black transition">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <Form method="post" className="space-y-4">
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
              {actionData?.error && <div className="rounded-xl bg-red-50 p-3 text-center border border-red-100 text-xs font-bold text-red-600">{actionData.error}</div>}
              <div className="pt-4 flex gap-3">
                <button type="button" disabled={navigation.state === "submitting"} onClick={() => setShowCreateModal(false)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-900 hover:bg-slate-200 transition disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={navigation.state === "submitting"} className="flex-1 rounded-xl bg-black py-3 text-sm font-black text-white hover:bg-slate-800 transition shadow-lg disabled:opacity-50">
                  {navigation.state === "submitting" ? "Creating..." : "Create User"}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}

      {showCreateAdminModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-black text-slate-900">Create Admin</h3>
              <button onClick={() => setShowCreateAdminModal(false)} className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-black transition">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <Form method="post" className="space-y-4">
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
              {actionData?.error && <div className="rounded-xl bg-red-50 p-3 text-center border border-red-100 text-xs font-bold text-red-600">{actionData.error}</div>}
              <div className="pt-4 flex gap-3">
                <button type="button" disabled={navigation.state === "submitting"} onClick={() => setShowCreateAdminModal(false)} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-900 hover:bg-slate-200 transition disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={navigation.state === "submitting"} className="flex-1 rounded-xl bg-black py-3 text-sm font-black text-white hover:bg-slate-800 transition shadow-lg disabled:opacity-50">
                  {navigation.state === "submitting" ? "Creating..." : "Create Admin"}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarLink({ icon, label, to, active }: { icon: string; label: string; to: string; active?: boolean }) {
  return (
    <Link to={to} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${active ? "bg-slate-900 text-white shadow-lg" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
      <span className="material-symbols-outlined text-[20px]">{icon}</span> {label}
    </Link>
  );
}

function MetricCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  const colorMap: Record<string, string> = { blue: "bg-blue-50 text-blue-600", red: "bg-red-50 text-red-600", indigo: "bg-indigo-50 text-indigo-600", amber: "bg-amber-50 text-amber-600" };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-transform hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorMap[color]}`}><span className="material-symbols-outlined text-[20px]">{icon}</span></div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Realtime</span>
      </div>
      <div className="mt-4"><p className="text-3xl font-black tracking-tight text-slate-900">{value}</p><p className="text-xs font-bold text-slate-500">{label}</p></div>
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
    affiliate: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    editor: "bg-amber-50 text-amber-700 ring-amber-600/10",
    project_manager: "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
  };

  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ring-inset ${styles[normalizedRole]}`}>{formatUserRole(normalizedRole)}</span>;
}

function PaginationButton({ icon, disabled, onClick }: { icon: string, disabled: boolean, onClick: () => void }) {
  return <button disabled={disabled} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"><span className="material-symbols-outlined text-[18px]">{icon}</span></button>;
}

function getSortIcon(params: URLSearchParams, field: string) {
  const sort = params.get("sort") || "createdAt";
  const order = params.get("order") || "desc";
  if (sort !== field) return <span className="material-symbols-outlined text-[14px] opacity-20">unfold_more</span>;
  return order === "asc" ? <span className="material-symbols-outlined text-[14px]">expand_less</span> : <span className="material-symbols-outlined text-[14px]">expand_more</span>;
}
