import { Form, Link } from "react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import { ADMIN_BASE_PATH, adminAccessPath } from "../../lib/admin-paths";

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
        <Form method="post" action="/signout" className="neo-admin-toolbar__signout">
          <button type="submit" className="neo-admin-toolbar__action">
            <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </Form>
      </div>
    </nav>
  );
}
