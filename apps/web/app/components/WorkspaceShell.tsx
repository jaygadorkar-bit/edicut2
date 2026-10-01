import type { ReactNode } from "react";
import { Link, matchPath, NavLink, useLocation, useRouteLoaderData } from "react-router";
import { useEffect, useRef, useState } from "react";
import { ADMIN_BASE_PATH, adminAccessPath } from "../lib/admin-paths";

export type WorkspaceNavItem = {
  label: string;
  bottomLabel?: string;
  icon: string;
  to: string;
  active?: boolean;
  end?: boolean;
  badge?: string;
};

type WorkspaceShellProps = {
  title: string;
  subtitle?: string;
  navItems: WorkspaceNavItem[];
  account: {
    name: string;
    detail: string;
    imageUrl?: string | null;
  };
  accountAction?: ReactNode;
  headerActions?: ReactNode;
  mobileMenu?: boolean;
  hideMobileHeading?: boolean;
  hideMobileSubtitle?: boolean;
  mobileBottomNavItems?: WorkspaceNavItem[];
  mobileBottomMore?: boolean;
  mobileBottomNavLabel?: string;
  profileTo?: string;
  settingsTo?: string;
  helpTo?: string;
  notificationsTo?: string;
  notificationCount?: number;
  children: ReactNode;
};

export function WorkspaceShell({
  title,
  subtitle,
  navItems,
  account,
  accountAction,
  headerActions,
  mobileMenu = false,
  hideMobileHeading = false,
  hideMobileSubtitle = false,
  mobileBottomNavItems,
  mobileBottomMore,
  mobileBottomNavLabel = "Primary workspace navigation",
  profileTo,
  settingsTo,
  helpTo = "/contact",
  notificationsTo = "/dashboard/reviews",
  notificationCount = 0,
  children,
}: WorkspaceShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const bottomControlsRef = useRef<HTMLDivElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileDrawerCloseRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const rootData = useRouteLoaderData("root") as {
    isAdminSignedIn?: boolean;
    adminToolbarEnabled?: boolean;
  } | undefined;
  const isCustomerWorkspacePage = location.pathname.startsWith("/dashboard") && location.pathname !== "/dashboard/messages";
  const canShowAdminLink = isCustomerWorkspacePage && rootData?.isAdminSignedIn === true && rootData.adminToolbarEnabled === true;
  const adminNavItem: WorkspaceNavItem = {
    label: "Admin",
    icon: "admin_panel_settings",
    to: adminAccessPath(ADMIN_BASE_PATH),
  };
  const dashboardNavIndex = navItems.findIndex((item) => item.label === "Dashboard" || item.to === "/dashboard");
  const workspaceNavItems = canShowAdminLink
    ? [
        ...navItems.slice(0, dashboardNavIndex >= 0 ? dashboardNavIndex + 1 : 0),
        adminNavItem,
        ...navItems.slice(dashboardNavIndex >= 0 ? dashboardNavIndex + 1 : 0),
      ]
    : navItems;
  const primaryMobileItems = mobileBottomNavItems ?? navItems.slice(0, 4);
  const primaryMobileTo = new Set(primaryMobileItems.map((item) => item.to));
  const moreMobileItems = workspaceNavItems.filter((item) => !primaryMobileTo.has(item.to));
  const showMobileMore = mobileBottomMore ?? moreMobileItems.length > 0;
  const isProfileActive = profileTo ? Boolean(matchPath({ path: profileTo, end: true }, location.pathname)) : false;

  useEffect(() => {
    if (!isMoreOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!headerRef.current?.contains(target) && !bottomControlsRef.current?.contains(target)) setIsMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMoreOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMoreOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => mobileDrawerCloseRef.current?.focus());
    const desktopViewport = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktopResize = (event: MediaQueryListEvent) => {
      if (event.matches) setIsMobileMenuOpen(false);
    };
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !mobileDrawerRef.current) return;

      const focusable = Array.from(mobileDrawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnKeyDown);
    desktopViewport.addEventListener("change", closeOnDesktopResize);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnKeyDown);
      desktopViewport.removeEventListener("change", closeOnDesktopResize);
      window.requestAnimationFrame(() => mobileMenuTriggerRef.current?.focus());
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsMoreOpen(false);
  }, [location.pathname, location.search]);

  return (
    <div className={`neo-workspace min-h-screen ${mobileMenu ? "neo-workspace--bottom-nav-enabled" : ""} ${hideMobileHeading ? "neo-workspace--hide-mobile-heading" : ""}`}>
      <aside className={`neo-workspace__sidebar fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 lg:flex lg:flex-col ${isCollapsed ? "w-[78px]" : "w-[238px]"}`}>
        <div className={`flex h-full flex-col py-5 ${isCollapsed ? "px-3" : "px-4"}`}>
          <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between gap-3"}`}>
            <Link to="/" className="flex min-w-0 items-center justify-center px-2" aria-label="EdiCut home" title="EdiCut home">
              {isCollapsed ? (
                <img src="/icons/edicut-logo.svg" alt="EdiCut" className="h-auto w-9 object-contain" />
              ) : (
                <img src="/icons/edicut-logo.svg" alt="EdiCut" className="h-10 w-auto object-contain" />
              )}
            </Link>
            <button
              type="button"
              onClick={() => setIsCollapsed((value) => !value)}
              className={`neo-workspace__collapse-button ${isCollapsed ? "absolute left-[50px] top-5" : ""}`}
              aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
              aria-pressed={isCollapsed}
              title={isCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              <span className="material-symbols-outlined text-[19px]">{isCollapsed ? "chevron_right" : "chevron_left"}</span>
            </button>
          </div>

          {!isCollapsed ? <p className="neo-workspace__eyebrow mt-10 px-3">Workspace</p> : null}
          <nav className={`${isCollapsed ? "mt-10" : "mt-3"} grid gap-1.5`} aria-label="Workspace navigation">
            {workspaceNavItems.map((item) => (
              <WorkspaceNavLink key={`${item.label}-${item.to}`} item={item} collapsed={isCollapsed} />
            ))}
          </nav>

          <div className="neo-workspace__account mt-auto border-t pt-4">
            <div className={`flex items-center rounded-2xl py-2 ${isCollapsed ? "justify-center gap-2 px-0" : "gap-3 px-2"}`}>
              <Avatar name={account.name} imageUrl={account.imageUrl} />
              {!isCollapsed ? (
                <div className="min-w-0 flex-1">
                  <p className="neo-workspace__account-name truncate">{account.name}</p>
                  <p className="neo-workspace__account-detail mt-0.5 truncate">{account.detail}</p>
                </div>
              ) : null}
              {accountAction}
            </div>
          </div>
        </div>
      </aside>

      <main className={`neo-workspace__main transition-[padding] duration-200 ${isCollapsed ? "lg:pl-[78px]" : "lg:pl-[238px]"}`}>
        <header ref={headerRef} className="neo-workspace__header sticky top-0 z-30 px-4 py-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="neo-workspace__header-inner mx-auto flex max-w-[1500px] items-center justify-between gap-4">
            {hideMobileSubtitle ? (
              <>
                <div className="neo-workspace__mobile-heading lg:hidden">
                  <Link to="/" className="neo-workspace__mobile-logo" aria-label="Go to EdiCut home" title="EdiCut home">
                    <img src="/icons/edicut-logo.svg" alt="EdiCut" className="h-8 w-auto object-contain" />
                  </Link>
                  <span className="neo-workspace__mobile-heading-divider" aria-hidden="true" />
                  <h1 className="neo-workspace__title m-0 min-w-0 truncate text-base leading-tight">{title}</h1>
                </div>
                <div className="hidden min-w-0 lg:block">
                  <p className="neo-workspace__eyebrow mt-1">{subtitle || "Your creative workspace"}</p>
                  <h1 className="neo-workspace__title mt-1 truncate">{title}</h1>
                </div>
              </>
            ) : (
              <div className="min-w-0">
                <div className="flex items-center gap-2 lg:hidden">
                  <Link to="/" className="neo-workspace__mobile-logo" aria-label="Go to EdiCut home" title="EdiCut home">
                    <img src="/icons/edicut-logo.svg" alt="EdiCut" className="h-8 w-auto object-contain" />
                  </Link>
                </div>
                <p className="neo-workspace__eyebrow mt-1">{subtitle || "Your creative workspace"}</p>
                <h1 className="neo-workspace__title mt-1 truncate">{title}</h1>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Link to={settingsTo || profileTo || "/dashboard/profile"} className="neo-workspace__icon-button hidden sm:inline-flex" aria-label="Settings" title="Settings">
                <span className="material-symbols-outlined text-[19px]">settings</span>
              </Link>
              <Link to={helpTo} className="neo-workspace__icon-button hidden sm:inline-flex" aria-label="Help and contact" title="Help and contact">
                <span className="material-symbols-outlined text-[19px]">help</span>
              </Link>
              <Link to={notificationsTo} className="neo-workspace__icon-button relative" aria-label={notificationCount > 0 ? `${notificationCount} cuts waiting for review` : "Open review queue"} title={notificationCount > 0 ? `${notificationCount} cuts waiting for review` : "Open review queue"}>
                <span className="material-symbols-outlined text-[19px]">notifications</span>
                {notificationCount > 0 ? <span className="neo-workspace__notification-dot absolute right-2.5 top-2" aria-hidden="true" /> : null}
              </Link>
              {mobileMenu ? (
                <button
                  ref={mobileMenuTriggerRef}
                  type="button"
                  className="neo-workspace__menu-toggle neo-workspace__icon-button lg:hidden"
                  aria-label={isMobileMenuOpen ? "Close workspace menu" : "Open workspace menu"}
                  aria-controls="neo-workspace-mobile-menu"
                  aria-expanded={isMobileMenuOpen}
                  onClick={() => {
                    setIsMobileMenuOpen((open) => !open);
                    setIsMoreOpen(false);
                  }}
                >
                  <span className="material-symbols-outlined text-[21px]">{isMobileMenuOpen ? "close" : "menu"}</span>
                </button>
              ) : null}
              {headerActions}
            </div>
          </div>
          {mobileMenu ? null : (
            <nav className="neo-workspace__mobile-nav mx-auto mt-3 flex max-w-[1500px] gap-2 overflow-x-auto pb-0.5 lg:hidden" aria-label="Mobile workspace navigation">
              {navItems.slice(0, 5).map((item) => (
                <WorkspaceNavLink key={`mobile-${item.label}-${item.to}`} item={item} compact />
              ))}
            </nav>
          )}
        </header>

        <div className="neo-workspace__content mx-auto max-w-[1500px] px-4 py-5 sm:px-7 sm:py-7 lg:px-9">{children}</div>
      </main>
      {mobileMenu ? (
        <div
          className={`neo-workspace__mobile-drawer-shell lg:hidden ${isMobileMenuOpen ? "is-open" : ""}`}
          aria-hidden={!isMobileMenuOpen}
          inert={!isMobileMenuOpen}
        >
          <button
            type="button"
            className="neo-workspace__mobile-drawer-backdrop"
            aria-label="Close workspace navigation"
            tabIndex={-1}
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <aside
            ref={mobileDrawerRef}
            id="neo-workspace-mobile-menu"
            className="neo-header-drawer neo-workspace__mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="neo-workspace-mobile-drawer-title"
          >
            <div className="neo-header-drawer-head neo-workspace__mobile-drawer-head">
              <button
                ref={mobileDrawerCloseRef}
                type="button"
                className="neo-header-menu neo-workspace__mobile-drawer-close"
                aria-label="Close workspace navigation"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="material-symbols-outlined text-[22px]" aria-hidden="true">close</span>
              </button>
            </div>
            <div className="neo-workspace__mobile-drawer-content">
              <p id="neo-workspace-mobile-drawer-title" className="neo-workspace__mobile-drawer-title">Your workspace</p>
              <nav className="neo-workspace__mobile-drawer-nav" aria-label="Workspace navigation">
                {workspaceNavItems.map((item) => (
                  <WorkspaceNavLink
                    key={`drawer-${item.label}-${item.to}`}
                    item={item}
                    drawer
                    onNavigate={() => {
                      setIsMobileMenuOpen(false);
                      setIsMoreOpen(false);
                    }}
                  />
                ))}
              </nav>
            </div>
            <div className="neo-workspace__mobile-account neo-workspace__mobile-drawer-footer">
              <Link
                to={profileTo || location.pathname}
                className="neo-workspace__mobile-drawer-profile"
                aria-label={`Open profile settings for ${account.name}`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Avatar name={account.name} imageUrl={account.imageUrl} />
                <span className="min-w-0 flex-1">
                  <span className="neo-workspace__account-name block truncate">{account.name}</span>
                  <span className="neo-workspace__account-detail mt-0.5 block truncate">{account.detail}</span>
                </span>
              </Link>
              {accountAction}
            </div>
          </aside>
        </div>
      ) : null}
      {mobileMenu ? (
        <div ref={bottomControlsRef} className="neo-workspace__bottom-controls">
          {showMobileMore && moreMobileItems.length > 0 ? (
            <div
              id="neo-workspace-more-menu"
              className="neo-workspace__bottom-more"
              aria-labelledby="neo-workspace-more-title"
              hidden={!isMoreOpen}
            >
              <p id="neo-workspace-more-title" className="neo-workspace__bottom-more-title">More workspace</p>
              <nav className="neo-workspace__bottom-more-nav" aria-label="More workspace destinations">
                {moreMobileItems.map((item) => (
                  <WorkspaceNavLink
                    key={`more-${item.label}-${item.to}`}
                    item={item}
                    onNavigate={() => {
                      setIsMoreOpen(false);
                      setIsMobileMenuOpen(false);
                    }}
                  />
                ))}
              </nav>
            </div>
          ) : null}
          <nav
            className="neo-workspace__bottom-nav"
            aria-label={mobileBottomNavLabel}
            style={{ gridTemplateColumns: `repeat(${primaryMobileItems.length + (showMobileMore && moreMobileItems.length ? 1 : 0) + (profileTo ? 1 : 0)}, minmax(0, 1fr))` }}
          >
            {primaryMobileItems.map((item) => (
              <WorkspaceNavLink
                key={`bottom-${item.label}-${item.to}`}
                item={item}
                bottom
                onNavigate={() => {
                  setIsMoreOpen(false);
                  setIsMobileMenuOpen(false);
                }}
              />
            ))}
            {showMobileMore && moreMobileItems.length > 0 ? (
              <button
                type="button"
                className={`neo-workspace__bottom-nav-item ${isMoreOpen || (!isProfileActive && moreMobileItems.some((item) => isNavItemActive(item, location.pathname, location.search))) ? "is-active" : ""}`}
                aria-label="More workspace destinations"
                aria-controls="neo-workspace-more-menu"
                aria-expanded={isMoreOpen}
                onClick={() => {
                  setIsMoreOpen((open) => !open);
                  setIsMobileMenuOpen(false);
                }}
              >
                <span className="material-symbols-outlined neo-workspace__bottom-nav-icon" aria-hidden="true">more_horiz</span>
                <span className="neo-workspace__bottom-nav-label">More</span>
              </button>
            ) : null}
            {profileTo ? (
              <Link
                to={profileTo}
                className={`neo-workspace__bottom-nav-item ${isProfileActive ? "is-active" : ""}`}
                aria-label={`Open profile settings for ${account.name}`}
                aria-current={isProfileActive ? "page" : undefined}
              >
                <span className="neo-workspace__profile-nav-initials" aria-hidden="true">{getInitials(account.name)}</span>
                <span className="neo-workspace__bottom-nav-label">Profile</span>
              </Link>
            ) : null}
          </nav>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceNavLink({
  item,
  compact = false,
  collapsed = false,
  bottom = false,
  drawer = false,
  onNavigate,
}: {
  item: WorkspaceNavItem;
  compact?: boolean;
  collapsed?: boolean;
  bottom?: boolean;
  drawer?: boolean;
  onNavigate?: () => void;
}) {
  const getClassName = (active: boolean) => drawer
    ? `neo-header-link neo-workspace__mobile-drawer-link ${active ? "neo-header-active" : ""}`
    : navClassName(active, compact, collapsed, bottom);
  const className = ({ isActive }: { isActive: boolean }) => getClassName(item.active ?? isActive);
  const contents = (
    <>
      <NavIcon item={item} collapsed={collapsed} bottom={bottom} drawer={drawer} />
      {drawer ? <span className="material-symbols-outlined neo-workspace__mobile-drawer-arrow" aria-hidden="true">arrow_forward</span> : null}
    </>
  );

  if (typeof item.active === "boolean" || item.to.startsWith("?")) {
    return (
      <Link
        to={item.to}
        onClick={onNavigate}
        className={getClassName(item.active === true)}
        title={collapsed ? item.label : undefined}
        aria-current={item.active === true ? "page" : undefined}
      >
        {contents}
      </Link>
    );
  }

  return (
    <NavLink to={item.to} end={item.end} onClick={onNavigate} className={className} title={collapsed ? item.label : undefined}>
      {contents}
    </NavLink>
  );
}

function NavIcon({ item, collapsed, bottom, drawer }: { item: WorkspaceNavItem; collapsed: boolean; bottom: boolean; drawer: boolean }) {
  const label = bottom ? item.bottomLabel ?? item.label : item.label;

  return (
    <>
      <span aria-hidden={bottom || drawer || undefined} className={`material-symbols-outlined ${bottom ? "neo-workspace__bottom-nav-icon" : "text-[19px]"}`}>{item.icon}</span>
      {collapsed ? <span className="sr-only">{label}</span> : <span className={bottom ? "neo-workspace__bottom-nav-label" : "min-w-0 flex-1 truncate"}>{label}</span>}
      {!collapsed && !bottom && item.badge ? <span className="rounded-full bg-[#5a43d5] px-1.5 py-0.5 text-[9px] font-black text-white">{item.badge}</span> : null}
    </>
  );
}

function navClassName(active: boolean, compact: boolean, collapsed: boolean, bottom: boolean) {
  if (bottom) return `neo-workspace__bottom-nav-item ${active ? "is-active" : ""}`;
  return compact
    ? `neo-workspace__nav-item neo-workspace__nav-item--compact ${active ? "is-active" : ""}`
    : `neo-workspace__nav-item ${collapsed ? "is-collapsed" : ""} ${active ? "is-active" : ""}`;
}

function isNavItemActive(item: WorkspaceNavItem, pathname: string, search: string) {
  if (typeof item.active === "boolean") return item.active;
  if (item.to.startsWith("?")) return search === item.to;
  return Boolean(matchPath({ path: item.to, end: item.end ?? false }, pathname));
}

export function Avatar({ name, imageUrl, size = "md" }: { name: string; imageUrl?: string | null; size?: "sm" | "md" }) {
  const initials = getInitials(name);

  return imageUrl ? (
    <img src={imageUrl} alt="" loading="lazy" decoding="async" className={`neo-workspace__avatar ${size === "sm" ? "neo-workspace__avatar--sm" : ""} rounded-full object-cover`} />
  ) : (
    <span className={`neo-workspace__avatar ${size === "sm" ? "neo-workspace__avatar--sm" : ""}`}>
      {initials}
    </span>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1 && parts[0].includes("@")) return parts[0].slice(0, 2).toUpperCase();
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "EC";
}
