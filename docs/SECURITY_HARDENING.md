# Security Hardening & Secret Management Documentation

This document serves as the definitive reference for the security measures implemented on EdiCut.com and details the storage locations for all sensitive credentials.

## 1. Secret Management Strategy

### Production Environment (Cloudflare + Supabase)
- **Primary storage**: Cloudflare Worker secrets for runtime credentials, with Supabase and Cloudinary dashboards managing their provider-side configuration.
- **Injection method**: Secrets are injected into the Cloudflare Worker at runtime. They are not stored in the client bundle or Docker image layers.

### Development Environment
- **Storage**: Local `.env` file (located in the project root).
- **Safety**: `.env` is explicitly ignored in `.gitignore` and must NEVER be committed to Git.

## 2. Resource Inventory & Credentials

| Service | Credential Variable Name | Location |
| :--- | :--- | :--- |
| **Database (Supabase PostgreSQL)** | `DATABASE_URL` | Cloudflare Worker secret / Supabase project |
| **Cache (Upstash)** | `REDIS_URL` | Cloudflare Worker secret / Upstash Console |
| **Email (Resend)** | `RESEND_API_KEY` | Cloudflare Worker secret / Resend Dashboard |
| **Email (Gmail OTP)** | `GMAIL_REFRESH_TOKEN`, etc. | Cloudflare Worker secret / Gmail API |
| **Auth (Supabase)** | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare Worker secrets / Supabase project |
| **Media (Cloudinary)** | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudflare Worker secrets / Cloudinary console |

## 3. Implemented Security Measures

### A. Middleware Protections (`src/proxy.ts`)
- **Rate Limiting**: Implemented via `@upstash/ratelimit`.
- **Threshold**: 10 requests per 10 seconds per IP address.
- **Affected Routes**: `/api/auth/*`, `/login`, `/signup`, `/forgot-password`.
- **Logic**: Leverages the production Upstash Redis instance for shared rate limiting across serverless instances.

### B. Security Headers (`next.config.ts`)
- **Content-Security-Policy (CSP)**: Restrictions on script sources, style sources, and frame origins.
- **HSTS**: Enforces HTTPS for 1 year with subdomains and preloading.
- **X-Frame-Options**: Set to `DENY` to prevent clickjacking through iframes.
- **X-Content-Type-Options**: Set to `nosniff` to prevent MIME-type sniffing.
- **Referrer-Policy**: Set to `strict-origin-when-cross-origin`.

### C. Git & History Safety
- **`.gitignore`**: Updated to block all `.env` files.
- **Clean Untracking**: Existing `.env` file has been removed from Git tracking (`git rm --cached`).

## 4. Pending Infrastructure Setup
- **Cloudflare Zero Trust**: Targeted for the `/admin` path once human verification is completed manually.
- **Provider setup**: Supabase project settings, Cloudflare custom domains/secrets, and Cloudinary upload credentials still require one-time manual configuration.

## 5. Emergency Contacts & Audit
- **Deployment Admin**: admin@edicut.studio
- **Last Audit Date**: 2026-04-17
