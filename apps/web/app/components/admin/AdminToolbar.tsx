import { Link } from "react-router";
import { ADMIN_BASE_PATH, adminAccessPath } from "../../lib/admin-paths";

const toolbarLink = {
  label: "Admin",
  to: adminAccessPath(ADMIN_BASE_PATH),
  icon: "admin_panel_settings",
  title: "Open admin panel",
};

export function AdminToolbar() {
  return (
    <div className="fixed bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-slate-950/95 p-2 text-white shadow-2xl shadow-black/25 backdrop-blur-md">
      <Link
        to={toolbarLink.to}
        reloadDocument
        title={toolbarLink.title}
        aria-label={toolbarLink.title}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-full px-3 text-xs font-black"
      >
        <span className="material-symbols-outlined text-[18px]">{toolbarLink.icon}</span>
        {toolbarLink.label}
      </Link>
    </div>
  );
}
