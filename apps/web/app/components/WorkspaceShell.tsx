import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useState } from "react";

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
  children: ReactNode;
};

export function WorkspaceShell({
  title,
  subtitle,
  navItems,
  account,
  accountAction,
  headerActions,
  children,
}: WorkspaceShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="neo-workspace min-h-screen">
      <aside className={`neo-workspace__sidebar fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 lg:flex lg:flex-col ${isCollapsed ? "w-[78px]" : "w-[238px]"}`}>
        <div className={`flex h-full flex-col py-5 ${isCollapsed ? "px-3" : "px-4"}`}>
          <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between gap-3"}`}>
            <Link to="/" className="flex min-w-0 items-center justify-center px-2" aria-label="EdiCut home" title="EdiCut home">
              {isCollapsed ? (
                <img src="/icons/edicut-logo.svg" alt="EdiCut" className="h-8 w-auto object-contain" />
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
        <header className="neo-workspace__header sticky top-0 z-30 px-4 py-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 lg:hidden">
                <img src="/icons/edicut-logo.svg" alt="EdiCut" className="h-8 w-auto object-contain" />
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
              {headerActions}
            </div>
          </div>
          <nav className="neo-workspace__mobile-nav mx-auto mt-3 flex max-w-[1500px] gap-2 overflow-x-auto pb-0.5 lg:hidden" aria-label="Mobile workspace navigation">
            {navItems.slice(0, 5).map((item) => (
              <WorkspaceNavLink key={`mobile-${item.label}-${item.to}`} item={item} compact />
            ))}
          </nav>
        </header>

        <div className="neo-workspace__content mx-auto max-w-[1500px] px-4 py-5 sm:px-7 sm:py-7 lg:px-9">{children}</div>
      </main>
    </div>
  );
}

function WorkspaceNavLink({ item, compact = false, collapsed = false }: { item: WorkspaceNavItem; compact?: boolean; collapsed?: boolean }) {
  const className = ({ isActive }: { isActive: boolean }) => navClassName(item.active ?? isActive, compact, collapsed);

  if (typeof item.active === "boolean" || item.to.startsWith("?")) {
    return (
      <Link to={item.to} className={navClassName(item.active === true, compact, collapsed)} title={collapsed ? item.label : undefined}>
        <NavIcon item={item} collapsed={collapsed} />
      </Link>
    );
  }

  return (
    <NavLink to={item.to} end={item.end} className={className} title={collapsed ? item.label : undefined}>
      <NavIcon item={item} collapsed={collapsed} />
    </NavLink>
  );
}

function NavIcon({ item, collapsed }: { item: WorkspaceNavItem; collapsed: boolean }) {
  return (
    <>
      <span className="material-symbols-outlined text-[19px]">{item.icon}</span>
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && item.badge ? <span className="rounded-full bg-[#5a43d5] px-1.5 py-0.5 text-[9px] font-black text-white">{item.badge}</span> : null}
    </>
  );
}

function navClassName(active: boolean, compact: boolean, collapsed: boolean) {
  return compact
    ? `neo-workspace__nav-item neo-workspace__nav-item--compact ${active ? "is-active" : ""}`
    : `neo-workspace__nav-item ${collapsed ? "is-collapsed" : ""} ${active ? "is-active" : ""}`;
}

export function Avatar({ name, imageUrl, size = "md" }: { name: string; imageUrl?: string | null; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "EC";

  return imageUrl ? (
    <img src={imageUrl} alt="" className={`neo-workspace__avatar ${size === "sm" ? "neo-workspace__avatar--sm" : ""} rounded-full object-cover`} />
  ) : (
    <span className={`neo-workspace__avatar ${size === "sm" ? "neo-workspace__avatar--sm" : ""}`}>
      {initials}
    </span>
  );
}
