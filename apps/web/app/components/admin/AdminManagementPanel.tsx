import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation, useSearchParams } from "react-router";
import type { action, loader } from "../../routes/admin";
import { AdminPanelShell } from "../AdminPanelShell";
import { AdminAccountDialog } from "../AdminAccountDialog";
import { adminPath } from "../../lib/admin-paths";
import { formatUserRole, isUserRole, normalizeUserRole, USER_ROLES, type UserRole } from "../../lib/admin-user-roles";
import { cloudinaryVideoThumbnailUrl, optimizeCloudinaryUrl } from "../../lib/cloudinary";
import type { CloudinaryImageResource, CloudinaryVideoResource, CloudinaryUsage } from "../../lib/cloudinary.server";
import type { PricingPackage } from "../../lib/pricing.server";
import type { PortfolioSection } from "../../lib/portfolio.server";
import { DASHBOARD_FEATURES, type RoleFeatureAccess } from "../../lib/role-feature-access";

const MarketingPanel = lazy(() => import("./MarketingPanel").then(module => ({ default: module.MarketingPanel })));
const AffiliateAdminPanel = lazy(() => import("./AffiliateAdminPanel").then(module => ({ default: module.AffiliateAdminPanel })));
type AdminUserActivity = { paidPurchases: number | null; activeProjects: number | null };

export default function AdminManagementPanel() {
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
            ? "Discounts"
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
            <Suspense fallback={<p role="status">Loading discounts…</p>}>
              <MarketingPanel data={marketingData} actionData={actionData} isSubmitting={navigation.state !== "idle"} />
            </Suspense>
          ) : tab === "affiliates" ? (
            <Suspense fallback={<p role="status">Loading affiliates…</p>}>
              <AffiliateAdminPanel data={marketingData} actionData={actionData} isSubmitting={navigation.state !== "idle"} />
            </Suspense>
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
                <input id="new-admin-password" name="password" type="password" required minLength={12} maxLength={72} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
              </div>
              <div>
                <label htmlFor="new-admin-confirmPassword" className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Confirm Password</label>
                <input id="new-admin-confirmPassword" name="confirmPassword" type="password" required minLength={12} maxLength={72} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-black focus:ring-4 focus:ring-black/5" />
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

export function AdminUsersTable({
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
  const returnTo = adminPath(`?${searchParams.toString()}`);
  const rowLinkClass = "flex min-h-[72px] items-center px-6 py-4 after:absolute after:inset-0 after:content-['']";
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
          adminUsers.map((admin) => {
            const editUrl = `${adminPath(`/admins/${admin.id}`)}?returnTo=${encodeURIComponent(returnTo)}`;
            return (
            <tr key={admin.id} className="transition-colors hover:bg-slate-50 focus-within:bg-slate-50">
              <td className="relative p-0">
                <Link to={editUrl} aria-label={`Edit ${admin.name || admin.email}'s admin account`} className={`${rowLinkClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#6750dc]`}>
                  <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold uppercase text-white">
                    {admin.name?.[0] || admin.email[0]}
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{admin.name || "Admin"}</p>
                    <p className="text-xs font-medium text-slate-500">{admin.email}</p>
                  </div>
                  </div>
                </Link>
              </td>
              <td className="relative p-0">
                <Link tabIndex={-1} to={editUrl} className={rowLinkClass}>
                <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-red-700 ring-1 ring-inset ring-red-600/10">
                  {admin.role}
                </span>
                </Link>
              </td>
              <td className="relative p-0 text-xs font-bold text-slate-500"><Link tabIndex={-1} to={editUrl} className={rowLinkClass}>{new Date(admin.createdAt).toLocaleDateString()}</Link></td>
              <td className="relative p-0 text-right text-xs font-bold text-slate-500"><Link tabIndex={-1} to={editUrl} className={`${rowLinkClass} justify-end`}>{new Date(admin.updatedAt).toLocaleDateString()}</Link></td>
            </tr>
          ); })
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
