import type { ReactNode } from "react";
import { Link, matchPath, NavLink, useLocation } from "react-router";
import { useEffect, useRef, useState } from "react";

export type WorkspaceNavItem = {
  label: string;
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
  profileTo?: string;
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
  profileTo,
  children,
}: WorkspaceShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const bottomControlsRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const primaryMobileItems = navItems.slice(0, 4);
  const moreMobileItems = navItems.slice(4);
  const isProfileActive = profileTo ? Boolean(matchPath({ path: profileTo, end: true }, location.pathname)) : false;

  useEffect(() => {
    if (!isMobileMenuOpen && !isMoreOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!headerRef.current?.contains(target) && !bottomControlsRef.current?.contains(target)) {
        setIsMobileMenuOpen(false);
        setIsMoreOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        setIsMoreOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMobileMenuOpen, isMoreOpen]);

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
            {navItems.map((item) => (
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
            <div className="min-w-0">
              <div className="flex items-center gap-2 lg:hidden">
                <Link to="/" className="neo-workspace__mobile-logo" aria-label="Go to EdiCut home" title="EdiCut home">
                  <img src="/icons/edicut-logo.svg" alt="EdiCut" className="h-8 w-auto object-contain" />
                </Link>
              </div>
              <p className="neo-workspace__eyebrow mt-1">{subtitle || "Your creative workspace"}</p>
              <h1 className="neo-workspace__title mt-1 truncate">{title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <button type="button" className="neo-workspace__icon-button hidden sm:inline-flex" aria-label="Settings">
                <span className="material-symbols-outlined text-[19px]">settings</span>
              </button>
              <button type="button" className="neo-workspace__icon-button hidden sm:inline-flex" aria-label="Help">
                <span className="material-symbols-outlined text-[19px]">help</span>
              </button>
              <button type="button" className="neo-workspace__icon-button relative" aria-label="Notifications">
                <span className="material-symbols-outlined text-[19px]">notifications</span>
                <span className="neo-workspace__notification-dot absolute right-2.5 top-2" />
              </button>
              {mobileMenu ? (
                <button
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
          {mobileMenu ? (
            <div id="neo-workspace-mobile-menu" className="neo-workspace__mobile-menu" hidden={!isMobileMenuOpen}>
              <nav className="neo-workspace__mobile-menu-nav" aria-label="Workspace navigation">
                {navItems.map((item) => (
                  <WorkspaceNavLink
                    key={`mobile-${item.label}-${item.to}`}
                    item={item}
                    onNavigate={() => {
                      setIsMobileMenuOpen(false);
                      setIsMoreOpen(false);
                    }}
                  />
                ))}
              </nav>
              <div className="neo-workspace__mobile-account">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={account.name} imageUrl={account.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="neo-workspace__account-name truncate">{account.name}</p>
                    <p className="neo-workspace__account-detail mt-0.5 truncate">{account.detail}</p>
                  </div>
                  {accountAction}
                </div>
              </div>
            </div>
          ) : (
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
        <div ref={bottomControlsRef} className="neo-workspace__bottom-controls">
          {moreMobileItems.length > 0 ? (
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
            aria-label="Primary workspace navigation"
            style={{ gridTemplateColumns: `repeat(${primaryMobileItems.length + (moreMobileItems.length ? 1 : 0) + (profileTo ? 1 : 0)}, minmax(0, 1fr))` }}
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
            {moreMobileItems.length > 0 ? (
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
  onNavigate,
}: {
  item: WorkspaceNavItem;
  compact?: boolean;
  collapsed?: boolean;
  bottom?: boolean;
  onNavigate?: () => void;
}) {
  const className = ({ isActive }: { isActive: boolean }) => navClassName(item.active ?? isActive, compact, collapsed, bottom);

  if (typeof item.active === "boolean" || item.to.startsWith("?")) {
    return (
      <Link to={item.to} onClick={onNavigate} className={navClassName(item.active === true, compact, collapsed, bottom)} title={collapsed ? item.label : undefined}>
        <NavIcon item={item} collapsed={collapsed} bottom={bottom} />
      </Link>
    );
  }

  return (
    <NavLink to={item.to} end={item.end} onClick={onNavigate} className={className} title={collapsed ? item.label : undefined}>
      <NavIcon item={item} collapsed={collapsed} bottom={bottom} />
    </NavLink>
  );
}

function NavIcon({ item, collapsed, bottom }: { item: WorkspaceNavItem; collapsed: boolean; bottom: boolean }) {
  return (
    <>
      <span aria-hidden={bottom || undefined} className={`material-symbols-outlined ${bottom ? "neo-workspace__bottom-nav-icon" : "text-[19px]"}`}>{item.icon}</span>
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className={bottom ? "neo-workspace__bottom-nav-label" : "min-w-0 flex-1 truncate"}>{item.label}</span>}
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
    <img src={imageUrl} alt="" className={`neo-workspace__avatar ${size === "sm" ? "neo-workspace__avatar--sm" : ""} rounded-full object-cover`} />
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
