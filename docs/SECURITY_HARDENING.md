# Security Hardening & Secret Management Documentation

This document serves as the definitive reference for the security measures implemented on EdiCut.com and details the storage locations for all sensitive credentials.

## 1. Secret Management Strategy

### Production Environment (GCP)
- **Primary Storage**: [Google Cloud Secret Manager](https://console.cloud.google.com/security/secret-manager)
- **Project**: `reference-tine-493519-a1` (Edicut)
- **Injection Method**: Secrets are injected into the Google Cloud Run container at runtime. They are NOT stored in the Docker image layers.

### Development Environment
- **Storage**: Local `.env` file (located in the project root).
- **Safety**: `.env` is explicitly ignored in `.gitignore` and must NEVER be committed to Git.

## 2. Resource Inventory & Credentials

| Service | Credential Variable Name | Location |
| :--- | :--- | :--- |
| **Database (Neon)** | `DATABASE_URL` | GCP Secret Manager / Neon Console |
| **Cache (Upstash)** | `REDIS_URL` | GCP Secret Manager / Upstash Console |
| **Email (Resend)** | `RESEND_API_KEY` | GCP Secret Manager / Resend Dashboard |
| **Email (Gmail OTP)** | `GMAIL_REFRESH_TOKEN`, etc. | GCP Secret Manager / Gmail API |
| **Auth (Google)** | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | GCP Secret Manager / GCP Credentials |
| **Auth (Auth.js)** | `AUTH_SECRET` | GCP Secret Manager |
| **Firebase** | `NEXT_PUBLIC_FIREBASE_*` | Firebase Console (Non-secret placeholders in code) |

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
- **Billing Activation**: GCP APIs (Secret Manager, Cloud Run) require billing enablement to fully utilize the secrets.

## 5. Emergency Contacts & Audit
- **Deployment Admin**: admin@edicut.studio
- **Last Audit Date**: 2026-04-17
