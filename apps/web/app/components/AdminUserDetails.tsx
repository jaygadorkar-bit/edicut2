import { Form, Link } from "react-router";
import { formatUserRole, isUserRole, normalizeUserRole, USER_ROLES } from "../lib/admin-user-roles";
import { optimizeCloudinaryUrl } from "../lib/cloudinary";

export type AdminUserDetailsProps = {
  user: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    country: string | null;
    profileImageUrl: string | null;
    role: string;
    active: boolean;
    deletedAt: string | Date | null;
    createdAt: string | Date;
    updatedAt: string | Date;
  };
  canEdit: boolean;
  returnTo: string;
  busy?: boolean;
  pendingIntent?: string;
  result?: { error?: string; success?: string };
  adminAccount?: { self: boolean };
};

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined admin-user__icon" aria-hidden="true">{name}</span>;
}

function accountDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function AdminUserDetails({ user, canEdit, returnTo, busy = false, pendingIntent, result, adminAccount }: AdminUserDetailsProps) {
  const disabled = !canEdit || busy;
  const initials = (user.name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("") || user.email[0] || "U").toUpperCase();
  const status = user.deletedAt ? "In trash" : user.active ? "Active" : "Disabled";
  const role = adminAccount ? user.role === "admin" ? "Administrator" : formatUserRole(user.role) : isUserRole(user.role) ? formatUserRole(user.role) : `Legacy ${formatUserRole(user.role)}`;
  const passwordMinimum = adminAccount ? 12 : 8;

  return <div className="admin-user">
    <Link to={returnTo} className="admin-user__back"><Icon name="arrow_back" />Back to accounts</Link>
    <div className="admin-user__heading">
      <h2>{adminAccount ? "Admin account details" : "Account details"}</h2>
      <p>Manage this user’s profile, access, and account settings.</p>
    </div>

    {result?.error ? <p className="admin-user__notice admin-user__notice--error" role="alert">{result.error}</p> : null}
    {result?.success ? <p className="admin-user__notice admin-user__notice--success" role="status">{result.success}</p> : null}
    {!canEdit ? <p className="admin-user__notice" role="status">Only admins can edit account records.</p> : null}

    <section className="admin-user__summary neo-workspace__panel" aria-labelledby="admin-user-name">
      <div className="admin-user__identity">
        {user.profileImageUrl
          ? <img className="admin-user__avatar" src={optimizeCloudinaryUrl(user.profileImageUrl)} width={64} height={64} alt="" />
          : <span className="admin-user__avatar admin-user__avatar--initials" aria-hidden="true">{initials}</span>}
        <div className="admin-user__identity-copy">
          <h3 id="admin-user-name">{user.name || "Unnamed user"}</h3>
          <p>{user.email}</p>
        </div>
      </div>
      <div className="admin-user__badges">
        <span className="admin-user__role">{role}</span>
        <span className={`admin-user__status ${user.active && !user.deletedAt ? "is-active" : "is-inactive"}`}><Icon name={user.active && !user.deletedAt ? "check_circle" : "remove_circle"} />{status}</span>
      </div>
      <dl className="admin-user__dates">
        <div><dt>Joined</dt><dd><time dateTime={new Date(user.createdAt).toISOString()}>{accountDate(user.createdAt)}</time></dd></div>
        <div><dt>Last updated</dt><dd><time dateTime={new Date(user.updatedAt).toISOString()}>{accountDate(user.updatedAt)}</time></dd></div>
      </dl>
    </section>

    <div className="admin-user__layout">
      <section className="admin-user__profile neo-workspace__panel" aria-labelledby="admin-user-profile-title">
        <header className="admin-user__section-heading">
          <Icon name="person" />
          <div><h3 id="admin-user-profile-title">Profile & access</h3><p>Keep contact information and workspace access up to date.</p></div>
        </header>
        <Form method="post" encType={adminAccount ? "application/x-www-form-urlencoded" : "multipart/form-data"} autoComplete="off" aria-label="Edit account profile" className="admin-user__profile-form">
          <input type="hidden" name="intent" value="save-profile" />
          <fieldset disabled={disabled} className="admin-user__group">
            <legend>Personal details</legend>
            <div className="admin-user__fields">
              <Field label="Full name" name="name" defaultValue={user.name || ""} maxLength={120} />
              <Field label="Email address" name="email" type="email" required defaultValue={user.email} maxLength={254} />
              <Field label="Phone number" name="phone" type="tel" defaultValue={user.phone || ""} maxLength={32} />
              {!adminAccount ? <Field label="Country" name="country" defaultValue={user.country || ""} maxLength={120} /> : null}
            </div>
          </fieldset>
          {!adminAccount ? <fieldset disabled={disabled} className="admin-user__group">
            <legend>Profile photo</legend>
            <Field label="Image URL" name="profileImageUrl" type="url" defaultValue={user.profileImageUrl || ""} placeholder="https://…" />
            <label className="admin-user__field admin-user__upload">
              <span>Or upload a photo</span>
              <input name="profileImageFile" type="file" accept="image/*" aria-describedby="admin-user-photo-help" />
            </label>
            <p id="admin-user-photo-help" className="admin-user__help">Choose an image up to 1 MB. An upload replaces the image URL.</p>
          </fieldset> : null}
          <fieldset disabled={disabled} className="admin-user__group">
            <legend>Access & status</legend>
            <div className="admin-user__fields admin-user__access-fields">
              <label className="admin-user__field"><span>Account role</span>
                {adminAccount ? <input value={role} readOnly /> : <select name="role" defaultValue={normalizeUserRole(user.role)}>{USER_ROLES.map(value => <option key={value} value={value}>{formatUserRole(value)}</option>)}</select>}
              </label>
              <label className="admin-user__active">
                <input name="active" type="checkbox" defaultChecked={user.active} disabled={adminAccount?.self} />
                <span><strong>Account active</strong><small>Allow this user to sign in.</small></span>
              </label>
            </div>
            {adminAccount?.self ? <><input type="hidden" name="active" value="on" /><p className="admin-user__help">You cannot disable the admin account you are using.</p></> : null}
            {user.deletedAt ? <p className="admin-user__help">This account is in trash. Restore it to make it available again.</p> : null}
          </fieldset>
          <footer className="admin-user__save">
            <span>Changes apply to this account.</span>
            <button disabled={disabled} className="admin-user__button admin-user__button--primary"><Icon name="save" />{busy && pendingIntent === "save-profile" ? "Saving…" : "Save changes"}</button>
          </footer>
        </Form>
      </section>

      <aside className="admin-user__aside" aria-label="Security and account actions">
        <section className="admin-user__side-panel neo-workspace__panel" aria-labelledby="admin-user-security-title">
          <header className="admin-user__section-heading"><Icon name="lock" /><div><h3 id="admin-user-security-title">Security</h3><p>Manage the sign-in password.</p></div></header>
          {adminAccount?.self ? <div className="admin-user__action-block"><p>Confirm your current password in account settings to change your own password.</p><Link className="admin-user__button admin-user__button--secondary" to="/site/node-logmin/account">Account settings</Link></div> : <details className="admin-user__password">
            <summary>Change password<Icon name="expand_more" /></summary>
            <Form method="post" aria-label="Reset account password">
              <input type="hidden" name="intent" value="reset-password" />
              <fieldset disabled={disabled}>
                <Field label="New password" name="password" type="password" required defaultValue="" minLength={passwordMinimum} maxLength={128} autoComplete="new-password" describedBy="admin-user-password-help" />
                <Field label="Confirm new password" name="confirmPassword" type="password" required defaultValue="" minLength={passwordMinimum} maxLength={128} autoComplete="new-password" />
                <p id="admin-user-password-help" className="admin-user__help">Use {passwordMinimum}–128 characters. This replaces the user’s current password.</p>
                <button disabled={disabled} className="admin-user__button admin-user__button--secondary"><Icon name="lock_reset" />{busy && pendingIntent === "reset-password" ? "Resetting…" : "Reset password"}</button>
              </fieldset>
            </Form>
          </details>}
        </section>

        {adminAccount ? <section className="admin-user__side-panel neo-workspace__panel" aria-labelledby="admin-access-help"><header className="admin-user__section-heading"><Icon name="shield_person" /><div><h3 id="admin-access-help">Administrator access</h3><p>This account can manage the admin workspace.</p></div></header><div className="admin-user__action-block"><p>Disabling an admin account prevents future access to the admin panel. Client accounts and projects are managed separately.</p></div></section> : <section className="admin-user__side-panel admin-user__actions neo-workspace__panel" aria-labelledby="admin-user-actions-title">
          <header className="admin-user__section-heading"><Icon name="manage_accounts" /><div><h3 id="admin-user-actions-title">Account actions</h3><p>Profile resets and account recovery.</p></div></header>
          <div className="admin-user__action-block">
            <h4>Creator profile</h4>
            <p id="creator-profile-reset-help">Clear saved creator details so the user can set up their profile again. Orders and projects are kept.</p>
            <Form method="post" onSubmit={event => !confirm("Reset this creator profile? All saved creator details will be cleared. Account settings, orders, and submitted projects will stay unchanged.") && event.preventDefault()}>
              <input type="hidden" name="intent" value="reset-creator-profile" />
              <button disabled={disabled} aria-describedby="creator-profile-reset-help" className="admin-user__button admin-user__button--secondary"><Icon name="refresh" />Reset creator profile</button>
            </Form>
          </div>
          <div className="admin-user__action-block admin-user__action-block--danger">
            <h4>{user.deletedAt ? "Account in trash" : "Move account to trash"}</h4>
            <p id="admin-user-trash-help">{user.deletedAt ? "Restore this account, or permanently delete it. Permanent deletion cannot be undone." : "Remove this account from the active user list. You can restore it later."}</p>
            {user.deletedAt ? <div className="admin-user__lifecycle-buttons">
              <Form method="post"><input type="hidden" name="intent" value="restore" /><button disabled={disabled} className="admin-user__button admin-user__button--restore"><Icon name="restore_from_trash" />Restore account</button></Form>
              <Form method="post" onSubmit={event => !confirm("Permanently delete this account? This cannot be undone.") && event.preventDefault()}>
                <input type="hidden" name="intent" value="permanent-delete" /><button disabled={disabled} aria-describedby="admin-user-trash-help" className="admin-user__button admin-user__button--danger"><Icon name="delete_forever" />Delete permanently</button>
              </Form>
            </div> : <Form method="post" onSubmit={event => !confirm("Move this account to trash?") && event.preventDefault()}>
              <input type="hidden" name="intent" value="move-to-trash" /><button disabled={disabled} aria-describedby="admin-user-trash-help" className="admin-user__button admin-user__button--danger"><Icon name="delete" />Move to trash</button>
            </Form>}
          </div>
        </section>}
      </aside>
    </div>
  </div>;
}

function Field({ label, name, type = "text", defaultValue, required, minLength, maxLength, autoComplete, placeholder, describedBy }: {
  label: string; name: string; type?: string; defaultValue: string; required?: boolean; minLength?: number;
  maxLength?: number; autoComplete?: string; placeholder?: string; describedBy?: string;
}) {
  return <label className="admin-user__field"><span>{label}{required ? <span className="admin-user__required"> (required)</span> : null}</span>
    <input name={name} type={type} required={required} defaultValue={defaultValue} minLength={minLength} maxLength={maxLength} autoComplete={autoComplete} placeholder={placeholder} aria-describedby={describedBy} />
  </label>;
}
