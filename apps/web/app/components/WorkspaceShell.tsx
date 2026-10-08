import type { MouseEvent, ReactNode } from "react";
import { Link, matchPath, NavLink, useLocation, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";

export type WorkspaceNavItem = {
  label: string;
  bottomLabel?: string;
  icon: string;
  to: string;
  active?: boolean;
  end?: boolean;
  badge?: string;
  unreadCount?: number;
  unreadLabel?: string;
};

export type WorkspaceNavigationPanel = (controls: {
  collapsed: boolean;
  closeMenu: () => void;
  returnToMainMenu: () => void;
}) => ReactNode;

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
  mobileBottomNav?: boolean;
  navigationFeedback?: boolean;
  hideHeaderTitle?: boolean;
  hideMobileHeading?: boolean;
  hideMobileSubtitle?: boolean;
  mobileBottomNavItems?: WorkspaceNavItem[];
  mobileBottomMore?: boolean;
  mobileBottomNavLabel?: string;
  profileTo?: string | null;
  profileNavAtBottom?: boolean;
  settingsTo?: string | null;
  startProjectTo?: string | null;
  notificationsTo?: string | null;
  chatTo?: string | null;
  notificationCount?: number;
  navigationPanel?: WorkspaceNavigationPanel;
  children: ReactNode;
};

export function WorkspaceShell({
  title,
  subtitle,
  navItems: providedNavItems,
  account,
  accountAction,
  headerActions,
  mobileMenu = false,
  mobileBottomNav,
  navigationFeedback = false,
  hideHeaderTitle = false,
  hideMobileHeading = false,
  hideMobileSubtitle = false,
  mobileBottomNavItems,
  mobileBottomMore,
  mobileBottomNavLabel = "Primary workspace navigation",
  profileTo,
  profileNavAtBottom = false,
  settingsTo,
  startProjectTo,
  notificationsTo = "/dashboard/reviews",
  chatTo = "/dashboard/chat",
  notificationCount = 0,
  navigationPanel,
  children,
}: WorkspaceShellProps) {
  const navItems = chatTo && !providedNavItems.some(item => item.to === chatTo)
    ? [...providedNavItems.slice(0, Math.min(2, providedNavItems.length)), { label: "Chat", icon: "chat", to: chatTo }, ...providedNavItems.slice(Math.min(2, providedNavItems.length))]
    : providedNavItems;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [showNavigationPanel, setShowNavigationPanel] = useState(Boolean(navigationPanel));
  const desktopNavigationRef = useRef<HTMLElement>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const previousNavigationModeRef = useRef(showNavigationPanel);
  const headerRef = useRef<HTMLElement>(null);
  const bottomControlsRef = useRef<HTMLDivElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileDrawerCloseRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const navigation = useNavigation();
  const isNavigationPending = navigationFeedback && Boolean(navigation.location);
  const showMobileBottomNav = mobileBottomNav ?? mobileMenu;
  const isProfileActive = profileTo ? Boolean(matchPath({ path: profileTo, end: true }, location.pathname)) : false;
  const bottomAccountItems: WorkspaceNavItem[] = profileNavAtBottom && profileTo
    ? [{ label: "Profile", icon: "person", to: profileTo, end: true, active: isProfileActive }]
    : [];
  const pinnedAccountNavTo = new Set(bottomAccountItems.map((item) => item.to));
  const accountNavigationPinned = Boolean(profileNavAtBottom && profileTo);
  const defaultPrimaryMobileItems = accountNavigationPinned ? navItems.slice(0, 3) : navItems.slice(0, 4);
  const primaryMobileItems = (mobileBottomNavItems ?? defaultPrimaryMobileItems)
    .filter((item) => !pinnedAccountNavTo.has(item.to));
  const primaryMobileTo = new Set(primaryMobileItems.map((item) => item.to));
  const moreMobileItems = navItems.filter((item) => !primaryMobileTo.has(item.to) && !pinnedAccountNavTo.has(item.to));
  const showMobileMore = mobileBottomMore ?? moreMobileItems.length > 0;
  const settingsTarget = settingsTo === null ? null : settingsTo ?? profileTo ?? null;
  const panelActive = Boolean(navigationPanel && showNavigationPanel);
  const closeMenu = () => { setIsMobileMenuOpen(false); setIsMoreOpen(false); };
  const returnToMainMenu = () => setShowNavigationPanel(false);
  const navigateItem = (item: WorkspaceNavItem, event: MouseEvent<HTMLAnchorElement>, mobile = false) => {
    if (navigationPanel && item.to === chatTo && isNavItemActive(item, location.pathname, location.search)) {
      event.preventDefault();
      setShowNavigationPanel(true);
      setIsCollapsed(false);
      setIsMoreOpen(false);
      if (mobile) setIsMobileMenuOpen(true);
    } else if (mobile) closeMenu();
  };
  const mobileMenuButton = mobileMenu ? (
    <button
      ref={mobileMenuTriggerRef}
      type="button"
      className="neo-workspace__menu-toggle neo-workspace__icon-button lg:hidden"
      aria-label={isMobileMenuOpen ? "Close workspace menu" : panelActive ? "Open conversations" : "Open workspace menu"}
      aria-controls="neo-workspace-mobile-menu"
      aria-expanded={isMobileMenuOpen}
      onClick={() => {
        setIsMobileMenuOpen((open) => !open);
        setIsMoreOpen(false);
      }}
    >
      <span className="material-symbols-outlined text-[21px]">{isMobileMenuOpen ? "close" : "menu"}</span>
    </button>
  ) : null;

  useEffect(() => {
    if (previousNavigationModeRef.current === showNavigationPanel) return;
    previousNavigationModeRef.current = showNavigationPanel;
    const frame = requestAnimationFrame(() => {
      const menu = window.matchMedia("(min-width: 1024px)").matches ? desktopNavigationRef.current : isMobileMenuOpen ? mobileNavigationRef.current : null;
      menu?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [showNavigationPanel, isMobileMenuOpen]);

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
    <div className={`neo-workspace min-h-screen ${showMobileBottomNav ? "neo-workspace--bottom-nav-enabled" : ""} ${hideMobileHeading ? "neo-workspace--hide-mobile-heading" : ""}`}>
      <aside className={`neo-workspace__sidebar fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 lg:flex lg:flex-col ${isCollapsed ? "w-[78px]" : "w-[238px]"}`}>
        <div className={`flex h-full min-h-0 flex-col py-5 ${isCollapsed ? "px-3" : "px-4"}`}>
          <div className={`flex shrink-0 items-center ${isCollapsed ? "justify-center" : "justify-between gap-3"}`}>
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

          {!isCollapsed && !panelActive ? <p className="neo-workspace__eyebrow mt-10 shrink-0 px-3">Workspace</p> : null}
          <nav ref={desktopNavigationRef} className={`neo-workspace__desktop-nav ${panelActive ? "mt-6 flex flex-col" : `${isCollapsed ? "mt-10" : "mt-3"} grid gap-1.5`}`} aria-label={panelActive ? "Conversations" : "Workspace navigation"}>
            {panelActive ? navigationPanel!({ collapsed: isCollapsed, closeMenu, returnToMainMenu }) : navItems.filter((item) => !bottomAccountItems.some((bottomItem) => bottomItem.to === item.to)).map((item) => (
              <WorkspaceNavLink key={`${item.label}-${item.to}`} item={item} collapsed={isCollapsed} onNavigate={event => navigateItem(item, event)} />
            ))}
          </nav>

          <div className="mt-auto shrink-0">
            <div className="neo-workspace__account shrink-0 border-t pt-3">
              {accountNavigationPinned && profileTo ? (
                <div className={`flex items-center gap-2 ${isCollapsed ? "flex-col justify-center" : ""}`}>
                  <Link
                    to={profileTo}
                    className={`neo-workspace__account-link ${isProfileActive ? "is-active" : ""} ${isCollapsed ? "neo-workspace__account-link--compact justify-center" : ""}`}
                    aria-label={`Open profile settings for ${account.name}`}
                    aria-current={isProfileActive ? "page" : undefined}
                    title={isCollapsed ? `Profile settings for ${account.name}` : undefined}
                  >
                    <Avatar name={account.name} imageUrl={account.imageUrl} />
                    {!isCollapsed ? (
                      <span className="min-w-0 flex-1 text-left">
                        <span className="neo-workspace__account-name block truncate">{account.name}</span>
                        <span className="neo-workspace__account-detail mt-0.5 block truncate">{account.detail}</span>
                      </span>
                    ) : null}
                  </Link>
                  {accountAction}
                </div>
              ) : (
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
              )}
            </div>
          </div>
        </div>
      </aside>

      <main
        className={`neo-workspace__main transition-[padding] duration-200 ${isCollapsed ? "lg:pl-[78px]" : "lg:pl-[238px]"}`}
        aria-busy={isNavigationPending}
      >
        <header ref={headerRef} className="neo-workspace__header sticky top-0 z-30 px-4 py-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="neo-workspace__header-inner mx-auto flex max-w-[1500px] items-center justify-between gap-4">
            {hideHeaderTitle ? (
              <div className="flex min-w-0 flex-1 items-center">
                {mobileMenuButton}
                <h1 className="sr-only">{title}</h1>
              </div>
            ) : hideMobileSubtitle ? (
              <>
                <div className="neo-workspace__mobile-heading lg:hidden">
                  <h1 className="neo-workspace__title m-0 min-w-0 truncate text-base leading-tight">{title}</h1>
                </div>
                <div className="hidden min-w-0 lg:block">
                  <p className="neo-workspace__eyebrow mt-1">{subtitle || "Your creative workspace"}</p>
                  <h1 className="neo-workspace__title mt-1 truncate">{title}</h1>
                </div>
              </>
            ) : (
              <div className="min-w-0">
                <p className="neo-workspace__eyebrow mt-1">{subtitle || "Your creative workspace"}</p>
                <h1 className="neo-workspace__title mt-1 truncate">{title}</h1>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {settingsTarget ? (
                <Link to={settingsTarget} className="neo-workspace__icon-button" aria-label="Settings" title="Settings">
                  <span className="material-symbols-outlined text-[19px]">settings</span>
                </Link>
              ) : null}
              {notificationsTo ? (
                <Link to={notificationsTo} className="neo-workspace__icon-button relative" aria-label={notificationCount > 0 ? `${notificationCount} cuts waiting for review` : "Open review queue"} title={notificationCount > 0 ? `${notificationCount} cuts waiting for review` : "Open review queue"}>
                  <span className="material-symbols-outlined text-[19px]">notifications</span>
                  {notificationCount > 0 ? <span className="neo-workspace__notification-dot absolute right-2.5 top-2" aria-hidden="true" /> : null}
                </Link>
              ) : null}
              {hideHeaderTitle ? null : mobileMenuButton}
              {startProjectTo ? (
                <Link to={startProjectTo} className="neo-workspace__start-project text-white" aria-label="Start project" title="Start project">
                  <span className="material-symbols-outlined text-[19px]" aria-hidden="true">add</span>
                  <span className="neo-workspace__start-project-label">Start project</span>
                </Link>
              ) : null}
              {headerActions}
            </div>
          </div>
          {mobileMenu ? null : (
            <nav className="neo-workspace__mobile-nav mx-auto mt-3 flex max-w-[1500px] gap-2 overflow-x-auto pb-0.5 lg:hidden" aria-label="Mobile workspace navigation">
              {navItems.filter((item) => !bottomAccountItems.some((bottomItem) => bottomItem.to === item.to)).slice(0, 5).map((item) => (
                  <WorkspaceNavLink key={`mobile-${item.label}-${item.to}`} item={item} compact onNavigate={event => navigateItem(item, event, true)} />
              ))}
            </nav>
          )}
        </header>

        <div
          className="neo-workspace__content mx-auto max-w-[1500px] px-4 py-5 sm:px-7 sm:py-7 lg:px-9"
        >
          {children}
        </div>
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
            className="neo-workspace__sidebar neo-workspace__mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="neo-workspace-mobile-drawer-title"
          >
            <div className="neo-workspace__mobile-drawer-content">
              <div className="neo-workspace__mobile-drawer-topbar">
                <Link to="/" className="flex min-w-0 items-center justify-center px-2" aria-label="EdiCut home" title="EdiCut home">
                  <img src="/icons/edicut-logo.svg" alt="EdiCut" className="h-10 w-auto object-contain" />
                </Link>
                <button
                  ref={mobileDrawerCloseRef}
                  type="button"
                  className="neo-workspace__icon-button neo-workspace__mobile-drawer-close"
                  aria-label="Close workspace navigation"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="material-symbols-outlined text-[22px]" aria-hidden="true">close</span>
                </button>
              </div>
              <p id="neo-workspace-mobile-drawer-title" className={`neo-workspace__eyebrow px-3 ${panelActive ? "sr-only" : "mt-10"}`}>{panelActive ? "Conversations" : "Workspace"}</p>
              <nav ref={mobileNavigationRef} className={`neo-workspace__mobile-drawer-nav ${panelActive ? "mt-6 flex flex-col" : "mt-3 grid gap-1"}`} aria-label={panelActive ? "Conversations" : "Workspace navigation"}>
                {panelActive ? navigationPanel!({ collapsed: false, closeMenu, returnToMainMenu }) : navItems.filter((item) => !bottomAccountItems.some((bottomItem) => bottomItem.to === item.to)).map((item) => (
                  <WorkspaceNavLink
                    key={`drawer-${item.label}-${item.to}`}
                    item={item}
                    onNavigate={event => navigateItem(item, event, true)}
                  />
                ))}
              </nav>
            </div>
            <div className="neo-workspace__mobile-account neo-workspace__mobile-drawer-footer">
              {profileTo ? <Link
                  to={profileTo}
                  className={`neo-workspace__mobile-drawer-profile neo-workspace__mobile-drawer-profile--link ${isProfileActive ? "is-active" : ""}`}
                  aria-label={`Open profile settings for ${account.name}`}
                  aria-current={isProfileActive ? "page" : undefined}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Avatar name={account.name} imageUrl={account.imageUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="neo-workspace__account-name block truncate">{account.name}</span>
                    <span className="neo-workspace__account-detail mt-0.5 block truncate">{account.detail}</span>
                  </span>
                </Link> : <div className="neo-workspace__mobile-drawer-profile">
                  <Avatar name={account.name} imageUrl={account.imageUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="neo-workspace__account-name block truncate">{account.name}</span>
                    <span className="neo-workspace__account-detail mt-0.5 block truncate">{account.detail}</span>
                  </span>
                </div>}
              {accountAction}
            </div>
          </aside>
        </div>
      ) : null}
      {showMobileBottomNav ? (
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
                    onNavigate={event => navigateItem(item, event, true)}
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
                onNavigate={event => navigateItem(item, event, true)}
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
  onNavigate,
}: {
  item: WorkspaceNavItem;
  compact?: boolean;
  collapsed?: boolean;
  bottom?: boolean;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const getClassName = (active: boolean) => navClassName(active, compact, collapsed, bottom);
  const className = ({ isActive }: { isActive: boolean }) => getClassName(item.active ?? isActive);
  const contents = (
    <>
      <NavIcon item={item} collapsed={collapsed} bottom={bottom} />
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

function NavIcon({ item, collapsed, bottom }: { item: WorkspaceNavItem; collapsed: boolean; bottom: boolean }) {
  const label = bottom ? item.bottomLabel ?? item.label : item.label;
  const count = typeof item.unreadCount === "number" && Number.isSafeInteger(item.unreadCount) && item.unreadCount > 0 ? item.unreadCount : 0;

  return (
    <>
      <span aria-hidden="true" className={`material-symbols-outlined ${bottom ? "neo-workspace__bottom-nav-icon" : "text-[19px]"}`}>{item.icon}</span>
      {collapsed ? <span className="sr-only">{label}</span> : <span className={bottom ? "neo-workspace__bottom-nav-label" : "min-w-0 flex-1 truncate"}>{label}</span>}
      {count > 0 ? <>
        <span aria-hidden="true" className={`neo-workspace__nav-count${collapsed || bottom ? " neo-workspace__nav-count--overlay" : ""}${count > 99 ? " neo-workspace__nav-count--large" : ""}`}>{count > 99 ? "99+" : count}</span>
        <span className="sr-only">{`, ${count} ${item.unreadLabel ?? "unread enquiries"}`}</span>
      </> : null}
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
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  return imageUrl && failedImageUrl !== imageUrl ? (
    <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedImageUrl(imageUrl)} className={`neo-workspace__avatar ${size === "sm" ? "neo-workspace__avatar--sm" : ""} rounded-full object-cover`} />
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
