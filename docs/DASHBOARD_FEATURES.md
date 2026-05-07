# EdiCut Dashboard Feature Plan

Status: Implementation guide for the authenticated dashboard redesign.

## Product Goal

The dashboard should be the working cockpit for EdiCut clients, editor managers, and affiliate marketers. It should answer three questions within the first screen:

- What needs attention right now?
- Where is each project, asset, payment, or referral in the pipeline?
- What can the user do next without contacting support?

## Primary Audiences

### Clients

Clients need confidence, clarity, and fast approvals. Their dashboard should include:

- Active project timeline with stage, owner, due date, and revision status.
- Upload center for briefs, raw footage, references, brand assets, and receipts.
- Review queue with version status, time-coded notes, approval, and revision request actions.
- Deliverables area for final exports, shorts, thumbnails, captions, and platform-ready files.
- Billing and package summary showing current plan, payment status, usage, and upgrade path.
- Message center grouped by project so client, editor, and manager context stays together.

### Editors and Managers

Editors and project managers need operational visibility. Their dashboard should include:

- Workload board by editor, status, capacity, deadline risk, and priority.
- Production pipeline from intake to editing, quality check, client review, approved, and delivered.
- Assignment controls for project manager ownership, editor ownership, and escalation.
- QA checklist for technical export settings, brand fit, captions, hook quality, and delivery completeness.
- Client feedback panel that separates actionable notes from general comments.
- Payment and package queue for manual receipts, package changes, renewal risk, and support follow-up.

### Affiliate Marketers

Affiliates need transparent performance and quick sharing tools. Their dashboard should include:

- Referral link and campaign code with copy/share actions.
- Funnel metrics: clicks, signups, paid clients, conversion rate, commission, and payout status.
- Campaign leaderboard or channel breakdown by source, creator niche, and package sold.
- Pending payout timeline with approval state, minimum payout threshold, and next payout date.
- Creative kit with approved banners, short scripts, testimonials, and package landing links.
- Lead handoff view for high-intent prospects that need sales or manager follow-up.

## Shared Dashboard Features

- Role switcher or role-aware sections so users with multiple responsibilities can scan each workspace.
- Global search across projects, clients, files, messages, payments, and referrals.
- Notification center for overdue reviews, missing assets, blocked payments, and manager mentions.
- Compact analytics cards with trend context, not just raw numbers.
- Activity stream that logs uploads, comments, approvals, assignments, payment updates, and referral events.
- Clear empty states for new accounts, especially first project creation and first referral campaign.
- Mobile-first task list for approvals, uploads, messages, and links.

## First Implementation Scope

The current dashboard route is authenticated but only renders a welcome placeholder. The first redesign should ship a polished static workspace that can later be connected to database-backed projects, payments, review comments, and affiliate events.

Required first-screen modules:

- Personalized header with role, quick actions, search, and sign out.
- KPI strip for active projects, reviews due, monthly revenue or commission, and delivery health.
- Role cockpit cards for Client Studio, Editor Manager, and Affiliate Hub.
- Production pipeline showing intake, editing, review, approved, and delivered stages.
- Priority action queue for approvals, missing files, overdue work, payouts, and support tasks.
- Project table optimized for scanning owner, package, stage, deadline, priority, and next action.
- Right-side context rail with messages, package/billing state, affiliate payout, and recent activity.

## UX Principles

- Keep the dashboard operational, not promotional.
- Use dense but readable layouts with strong hierarchy and restrained styling.
- Keep cards to individual modules only; page sections should feel like a workspace, not a landing page.
- Prefer clear status labels, progress bars, tables, and queues over decorative visuals.
- Every prominent metric should imply an action or health signal.
