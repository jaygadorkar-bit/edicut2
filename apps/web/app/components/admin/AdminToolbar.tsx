import { Link } from "react-router";
import { ADMIN_BASE_PATH, adminPath } from "../../lib/admin-paths";

const toolbarLinks = [
  { label: "Admin", to: ADMIN_BASE_PATH, icon: "admin_panel_settings", title: "Open admin panel" },
  { label: "Packages", to: adminPath("?tab=packages"), icon: "sell", title: "Edit pricing packages" },
  { label: "Users", to: adminPath("?tab=users"), icon: "group", title: "Manage users", iconOnly: true },
];

export function AdminToolbar() {
  return (
    <div className="fixed bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-slate-950/95 p-2 text-white shadow-2xl shadow-black/25 backdrop-blur-md">
      {toolbarLinks.map((item, index) => (
        <div key={item.to} className="flex items-center gap-1">
          {index > 0 ? <span className="h-5 w-px bg-white/15" /> : null}
          <Link
            to={item.to}
            reloadDocument
            title={item.title}
            aria-label={item.title}
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-full text-xs font-black ${
              item.iconOnly ? "w-9" : "px-3"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
            {item.iconOnly ? <span className="sr-only">{item.label}</span> : item.label}
          </Link>
        </div>
      ))}
    </div>
  );
}
