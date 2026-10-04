# Google sign-in configuration

## Keep EdiCut separate from SK Sports

Use the Google Cloud project `edicut-sign-in` (display name **EdiCut Sign In**)
for EdiCut sign-in. Its consent-screen app name is **EdiCut**.

The older project `reference-tine-493519-a1` contains SK Sports clients as
well as legacy EdiCut clients. Google consent-screen branding is shared by
all clients in a project. Keep that project's app name **SK Sports**; changing
the name of an individual OAuth client does not change the consent screen.

## Web client

Application type: **Web application**.

Client ID (public):
`484471444925-5911g6casbtadm62ppilt3apnvigod17.apps.googleusercontent.com`.

| Environment | Authorized JavaScript origin | Authorized redirect URI |
| --- | --- | --- |
| Local | `http://localhost:3002` | `http://localhost:3002/api/auth/callback/google` |
| Live | `https://edicut.com` | `https://edicut.com/api/auth/callback/google` |

The live Worker redirects `www.edicut.com` to `edicut.com` before starting
OAuth. Only request the existing `openid email profile` scopes. Sign-in
does not require Gmail access or changes to the separate `GMAIL_*` credentials.

For testing mode, add the intended Google accounts as test users in the new
project. Before opening sign-in to all live customers, review the new project's
publishing status and Google's verification requirements.

## Runtime credentials

Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` together from the new client.
Keep secrets in ignored local files or Cloudflare Worker secrets; never commit
them or paste them into logs.

The local OAuth helper reads `.env`, `.env.local`, and `secrets.json`, followed
by Vite, process, and Cloudflare environment overrides. `secrets.json` takes
precedence over the local env files. Check every configured copy when replacing
the client so the old shared-project client cannot override the new one.

Local values:

```dotenv
APP_URL=http://localhost:3002
AUTH_GOOGLE_REDIRECT_URI=http://localhost:3002/api/auth/callback/google
```

Live target: Cloudflare account `f2c46bb116722bcb7dc4be44e500154b`, Worker
`edicut-web`. Its `APP_URL` is `https://edicut.com`. Update only the two Google
sign-in secrets on a version of the currently deployed Worker, then deploy
that version. A secret-only update avoids deploying unrelated local changes.
Record the previous deployed version before changing it.

## Verification

1. Inspect the redirect from `/auth/google?returnTo=%2Fdashboard` locally and
   live. Both must use the new client ID and the matching callback above.
2. Start a fresh browser flow and verify that Google displays **EdiCut**.
3. Complete sign-in and verify the dashboard and persisted session.
4. Verify that callbacks with missing or mismatched OAuth state are rejected.
5. Verify the shared project's saved branding remains **SK Sports**.

Never reuse an expired Google consent tab: the local OAuth state cookie expires
after ten minutes.

## Credential switch on 2026-10-02

The new client was installed in the ignored local credential files and the
local Docker web service was recreated to reload its environment. Only
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` were changed on the live Worker.

- Previous live version: `c4f437d7-0263-4edd-b07a-5e03352d44ab`.
- Secret-only live version: `e0d5800b-066e-461c-96d2-ffae4a546959` (100% traffic).
- Local and live Google sign-in both reached `/dashboard`; sessions survived
  reloads. Missing/mismatched-state callbacks were rejected on both sites.
- The new OAuth app is external and in production. It requests only the
  existing basic identity scopes, with no Gmail mailbox permissions.

Google may show `edicut.com` for live sign-in until its brand verification
approves the **EdiCut** display name. Follow the review in the new project's
Branding page. See [Google's brand verification guide](https://developers.google.com/identity/verification/authentication-verification).

### Remaining Google review

The first automated branding review found that `https://edicut.com` was not
registered as owned by the Google project owner. A Google verification TXT
record was added to the existing `edicut.com` Cloudflare zone, and Search
Console confirmed **Ownership verified** for `jaygadorkar@gmail.com` on
2026-10-02. Public DNS also returned the new verification record. Existing
DNS records were preserved. Keep the TXT record to retain verification.

Google's issue panel explicitly requires waiting **24 hours** after ownership
verification before retrying. After that interval, open the new project's
Branding page, choose **View issues → I have fixed the issues → Proceed**,
and publish the branding if the review succeeds. The display-name review is
still pending; OAuth sign-in and session persistence are already verified.

Commands used for the configuration update and checks included
`docker compose up -d --no-deps --force-recreate web`,
`wrangler whoami`, `wrangler deployments list`, `wrangler versions list`,
`wrangler versions secret bulk`, and `wrangler versions deploy`.
Browser checks completed Google sign-in on both hosts and reloaded the
dashboards. HTTP checks verified health, callback rejection, client IDs,
callback URLs, and the OAuth cookies' HttpOnly/SameSite/Secure settings.
