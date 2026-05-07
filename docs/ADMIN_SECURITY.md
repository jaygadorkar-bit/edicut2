# EdiCut Admin Security Plan

Status: Initial implementation standard for the dedicated admin panel.

## Implemented Now

- Dedicated admin login URL: `/admin/login`.
- Dedicated admin console URL: `/admin`.
- Separate admin session cookie: `_edicut_admin`.
- Admin cookie scoped to `/admin` so it is not sent to public pages or the customer dashboard.
- Admin cookie uses `HttpOnly`, `SameSite=Strict`, and `Secure` in production.
- Short admin session lifetime: 2 hours.
- Server-side authorization on admin loaders and actions.
- Role management is only available to users with the `admin` role.
- `project_manager` users can access the admin console in a view-oriented operational role, but cannot change user roles.
- `/admin/login` has a basic server-side throttle for repeated failed attempts.

## Recommended Production Standard

The most secure long-term setup is to host the admin app separately from the public frontend and customer dashboard:

- Public site: `https://edicut.com`
- Customer dashboard: `https://app.edicut.com` or `/dashboard`
- Admin panel: `https://admin.edicut.com`

The admin panel should have its own deployment target, own session cookie, stricter CSP, stricter WAF rules, and narrower route surface. Keeping admin on a subdomain also makes it easier to apply Cloudflare Access, IP allowlists, device posture checks, and separate monitoring.

## Required Hardening Before Full Production Use

- Require MFA for every admin and project manager account.
- Move admin sessions to an environment-backed secret instead of any checked-in fallback.
- Add rate limiting and account lockout for `/admin/login`.
- Add audit logging for role changes, login events, failed login attempts, and privilege escalations.
- Add email or Slack alerts for admin role grants and repeated failed admin logins.
- Add CSRF protection tokens for all admin state-changing forms.
- Add a `lastAdminReauthAt` check before sensitive actions such as role changes.
- Add a disabled/suspended state workflow for staff accounts.
- Keep role updates server-side only; never trust client-provided roles.
- Prefer least privilege: use `admin` only for ownership/security tasks, `project_manager` for operations, and lower roles for normal workflows.

## Security References

- OWASP Authentication Cheat Sheet: authentication controls, reauthentication, and login hardening.
- OWASP Session Management Cheat Sheet: secure cookies, session lifetime, session renewal, and session invalidation.
