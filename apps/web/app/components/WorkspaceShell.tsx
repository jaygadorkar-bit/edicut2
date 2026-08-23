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
    <div className="min-h-screen bg-[#f3f5ff] text-[#17172a]">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-[#e6e9f5] bg-white transition-[width] duration-200 lg:flex lg:flex-col ${isCollapsed ? "w-[78px]" : "w-[238px]"}`}>
        <div className={`flex h-full flex-col py-5 ${isCollapsed ? "px-3" : "px-4"}`}>
          <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between gap-3"}`}>
            <Link to="/" className="flex min-w-0 items-center justify-center px-2" aria-label="EdiCut home" title="EdiCut home">
              {isCollapsed ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6d55e8] text-sm font-black text-white shadow-[0_7px_18px_rgba(109,85,232,0.28)]">E</span>
              ) : (
                <span className="text-[15px] font-black tracking-[-0.04em]">EdiCut</span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setIsCollapsed((value) => !value)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9699ac] transition hover:bg-[#f3f1ff] hover:text-[#5a43d5] ${isCollapsed ? "absolute left-[50px] top-5" : ""}`}
              aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
              aria-pressed={isCollapsed}
              title={isCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              <span className="material-symbols-outlined text-[19px]">{isCollapsed ? "chevron_right" : "chevron_left"}</span>
            </button>
          </div>

          {!isCollapsed ? <p className="mt-10 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#a4a7b8]">Workspace</p> : null}
          <nav className={`${isCollapsed ? "mt-10" : "mt-3"} grid gap-1.5`} aria-label="Workspace navigation">
            {navItems.map((item) => (
              <WorkspaceNavLink key={`${item.label}-${item.to}`} item={item} collapsed={isCollapsed} />
            ))}
          </nav>

          <div className="mt-auto border-t border-[#edf0f7] pt-4">
            <div className={`flex items-center rounded-2xl py-2 ${isCollapsed ? "justify-center gap-2 px-0" : "gap-3 px-2"}`}>
              <Avatar name={account.name} imageUrl={account.imageUrl} />
              {!isCollapsed ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-[#24243a]">{account.name}</p>
                  <p className="mt-0.5 truncate text-[10px] font-bold text-[#a0a3b5]">{account.detail}</p>
                </div>
              ) : null}
              {accountAction}
            </div>
          </div>
        </div>
      </aside>

      <main className={`transition-[padding] duration-200 ${isCollapsed ? "lg:pl-[78px]" : "lg:pl-[238px]"}`}>
        <header className="sticky top-0 z-30 border-b border-[#e7eaf6]/80 bg-[#f3f5ff]/90 px-4 py-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 lg:hidden">
                <span className="text-xs font-black">EdiCut</span>
              </div>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.17em] text-[#9699ac]">{subtitle || "Your creative workspace"}</p>
              <h1 className="mt-1 truncate text-xl font-black tracking-[-0.04em] text-[#17172a] sm:text-2xl">{title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <button type="button" className="hidden h-10 w-10 items-center justify-center rounded-full bg-white text-[#62657a] shadow-[0_5px_18px_rgba(44,49,100,0.06)] transition hover:text-[#17172a] sm:inline-flex" aria-label="Settings">
                <span className="material-symbols-outlined text-[19px]">settings</span>
              </button>
              <button type="button" className="hidden h-10 w-10 items-center justify-center rounded-full bg-white text-[#62657a] shadow-[0_5px_18px_rgba(44,49,100,0.06)] transition hover:text-[#17172a] sm:inline-flex" aria-label="Help">
                <span className="material-symbols-outlined text-[19px]">help</span>
              </button>
              <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#62657a] shadow-[0_5px_18px_rgba(44,49,100,0.06)] transition hover:text-[#17172a]" aria-label="Notifications">
                <span className="material-symbols-outlined text-[19px]">notifications</span>
                <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-[#ee4b7a]" />
              </button>
              {headerActions}
            </div>
          </div>
          <nav className="mx-auto mt-3 flex max-w-[1500px] gap-2 overflow-x-auto pb-0.5 lg:hidden" aria-label="Mobile workspace navigation">
            {navItems.slice(0, 5).map((item) => (
              <WorkspaceNavLink key={`mobile-${item.label}-${item.to}`} item={item} compact />
            ))}
          </nav>
        </header>

        <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-7 sm:py-7 lg:px-9">{children}</div>
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
    ? `inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[11px] font-black transition ${active ? "bg-[#6d55e8] text-white shadow-[0_6px_16px_rgba(109,85,232,0.2)]" : "bg-white text-[#777b91]"}`
    : `flex items-center rounded-xl py-2.5 text-xs font-black transition ${collapsed ? "justify-center gap-0 px-2" : "gap-3 px-3"} ${active ? "bg-[#ece9ff] text-[#5a43d5]" : "text-[#777b91] hover:bg-[#f6f5ff] hover:text-[#34334b]"}`;
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
    <img src={imageUrl} alt="" className={`${size === "sm" ? "h-6 w-6" : "h-9 w-9"} rounded-full object-cover ring-2 ring-white`} />
  ) : (
    <span className={`${size === "sm" ? "h-6 w-6 text-[8px]" : "h-9 w-9 text-[10px]"} flex shrink-0 items-center justify-center rounded-full bg-[#27243d] font-black text-white ring-2 ring-white`}>
      {initials}
    </span>
  );
}
