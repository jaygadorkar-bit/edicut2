import { Link } from "react-router";
import { Handshake, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import { ADMIN_BASE_PATH, adminAccessPath } from "../../lib/admin-paths";
import { ConfirmSignOutButton } from "../ConfirmSignOutButton";

const toolbarLink = {
  label: "Admin panel",
  to: adminAccessPath(ADMIN_BASE_PATH),
  title: "Open admin panel",
};

export function AdminToolbar() {
  return (
    <nav className="neo-admin-toolbar" aria-label="EdiCut admin toolbar">
      <div className="neo-admin-toolbar__inner">
        <Link
          to={toolbarLink.to}
          reloadDocument
          title={toolbarLink.title}
          aria-label={toolbarLink.title}
          className="neo-admin-toolbar__action"
        >
          <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{toolbarLink.label}</span>
        </Link>
        <Link
          to="/dashboard"
          reloadDocument
          title="Open client dashboard"
          aria-label="Open client dashboard"
          className="neo-admin-toolbar__action neo-admin-toolbar__client-dashboard"
        >
          <LayoutDashboard size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Client dashboard</span>
        </Link>
        <Link
          to="/affiliate-signup"
          reloadDocument
          title="Open the affiliate program signup page"
          aria-label="Open the affiliate program signup page"
          className="neo-admin-toolbar__action neo-admin-toolbar__affiliate-signup"
        >
          <Handshake size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Affiliate signup</span>
        </Link>
        <ConfirmSignOutButton wrapperClassName="neo-admin-toolbar__signout" buttonClassName="neo-admin-toolbar__action">
          <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Sign out</span>
        </ConfirmSignOutButton>
      </div>
    </nav>
  );
}
