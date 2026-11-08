import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { createNodeDb } from "../packages/db/dist/client.js";
import {
  attributeAffiliateSubscription,
  cancelPayout,
  loadAdminAffiliateProgram,
  loadPartnerProgram,
  recordAffiliateVisit,
  requestPayout,
  reviewApplication,
  reviewPayout,
  saveApplication,
  saveProgramSettings,
} from "../apps/web/app/lib/affiliate-program.server.ts";

const databaseUrl = process.env.AFFILIATE_TEST_DATABASE_URL ?? "";
const parsed = databaseUrl ? new URL(databaseUrl) : null;
if (!parsed || !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
  throw new Error("Set AFFILIATE_TEST_DATABASE_URL to the disposable localhost Postgres URL. Remote hosts are refused.");
}
if (parsed.pathname !== "/edicut_affiliate_test") {
  throw new Error("Refusing a database other than the dedicated /edicut_affiliate_test database.");
}

const connection = postgres(databaseUrl, { max: 1, prepare: false, ssl: false });
const db = createNodeDb({ DATABASE_URL: databaseUrl });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "packages/db/drizzle/0027_affiliate_program.sql");
const failures: string[] = [];
let checks = 0;

function check(label: string, fn: () => void) {
  checks += 1;
  try { fn(); console.log(`PASS ${label}`); }
  catch (error) { failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); console.error(`FAIL ${label}: ${error instanceof Error ? error.message : error}`); }
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const detail = error as Error & { code?: string; constraint?: string; cause?: unknown };
  const cause = detail.cause as { code?: string; constraint?: string; message?: string } | undefined;
  return `${detail.message}${cause?.code ? ` [${cause.code}${cause.constraint ? ` ${cause.constraint}` : ""}: ${cause.message ?? ""}]` : ""}`;
}

async function scenario(label: string, fn: () => Promise<void>) {
  checks += 1;
  try { await fn(); console.log(`PASS ${label}`); }
  catch (error) { failures.push(`${label}: ${describeError(error)}`); console.error(`FAIL ${label}: ${describeError(error)}`); }
}

const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  partnerUser: "20000000-0000-4000-8000-000000000001",
  otherPartnerUser: "20000000-0000-4000-8000-000000000002",
  applicant: "20000000-0000-4000-8000-000000000003",
  customer: "20000000-0000-4000-8000-000000000004",
  inactiveUser: "20000000-0000-4000-8000-000000000005",
  partner: "30000000-0000-4000-8000-000000000001",
  otherPartner: "30000000-0000-4000-8000-000000000002",
  paidSubscription: "40000000-0000-4000-8000-000000000001",
  holdSubscription: "40000000-0000-4000-8000-000000000002",
  foreignSubscription: "40000000-0000-4000-8000-000000000003",
  selfSubscription: "40000000-0000-4000-8000-000000000004",
  unpaidSubscription: "40000000-0000-4000-8000-000000000005",
  projectEligible: "50000000-0000-4000-8000-000000000001",
  projectIntake: "50000000-0000-4000-8000-000000000002",
  reversalSubscription: "40000000-0000-4000-8000-000000000006",
  application: "60000000-0000-4000-8000-000000000001",
};

const baseSchemaSql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE users (
  id uuid PRIMARY KEY, email text NOT NULL, name text, role text NOT NULL DEFAULT 'user',
  active boolean NOT NULL DEFAULT true, deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_users (
  id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text, password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'admin', active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key varchar(120) NOT NULL UNIQUE,
  value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE marketing_affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code varchar(32) NOT NULL UNIQUE, commission_rate_bps integer NOT NULL,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE customer_subscriptions (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_slug varchar(120) NOT NULL, plan_name varchar(120) NOT NULL,
  country varchar(2) NOT NULL DEFAULT 'US', phone varchar(16) NOT NULL DEFAULT '1234567890',
  subtotal_cents integer NOT NULL, discount_cents integer NOT NULL DEFAULT 0, amount_cents integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'USD', affiliate_id uuid REFERENCES marketing_affiliates(id) ON DELETE SET NULL,
  affiliate_code varchar(32), affiliate_commission_bps integer NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'unpaid', paid_at timestamptz, deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (subtotal_cents > 0 AND discount_cents >= 0 AND amount_cents = subtotal_cents - discount_cents),
  CHECK ((status = 'unpaid' AND paid_at IS NULL) OR (status = 'paid' AND paid_at IS NOT NULL AND deleted_at IS NULL))
);
CREATE TABLE workspace_projects (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(120) NOT NULL, package_slug varchar(120) NOT NULL, billing_status varchar(32) NOT NULL,
  final_amount_cents integer, currency varchar(3) NOT NULL DEFAULT 'USD',
  affiliate_id uuid REFERENCES marketing_affiliates(id) ON DELETE SET NULL,
  affiliate_code varchar(32),
  affiliate_commission_bps integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE project_intakes (
  project_id uuid PRIMARY KEY REFERENCES workspace_projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES customer_subscriptions(id), request_token uuid NOT NULL,
  reserved_units integer NOT NULL, brief jsonb NOT NULL, channel_snapshot jsonb NOT NULL
);
`;

async function main() {
  await connection`SELECT 1`;
  const existing = await connection`SELECT current_database() AS db, inet_server_addr()::text AS host`;
  if (existing[0]?.db !== "edicut_affiliate_test") throw new Error("Connected database name did not match the dedicated test database.");
  await connection.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;");
  await connection.unsafe(baseSchemaSql);
  await connection.unsafe(await readFile(migrationPath, "utf8"));

  await connection`INSERT INTO admin_users (id, email, name, password_hash) VALUES (${ids.admin}, 'test-admin@example.invalid', 'Test Admin', 'not-a-real-password-hash')`;
  await connection`INSERT INTO users (id,email,name,role) VALUES
    (${ids.partnerUser},'partner@example.invalid','Partner One','affiliate'),
    (${ids.otherPartnerUser},'other@example.invalid','Partner Two','affiliate'),
    (${ids.applicant},'applicant@example.invalid','Applicant','user'),
    (${ids.customer},'customer@example.invalid','Customer','user'),
    (${ids.inactiveUser},'inactive@example.invalid','Inactive Partner','affiliate')`;
  await connection`UPDATE users SET active=false WHERE id=${ids.inactiveUser}`;
  await connection`INSERT INTO marketing_affiliates (id,user_id,code,commission_rate_bps,active) VALUES
    (${ids.partner},${ids.partnerUser},'PARTNER1',1000,true),
    (${ids.otherPartner},${ids.otherPartnerUser},'PARTNER2',1000,true),
    ('30000000-0000-4000-8000-000000000004',${ids.inactiveUser},'INACTIVE',1000,false)`;

  await scenario("admin loader sees ready schema and empty queues", async () => {
    const value = await loadAdminAffiliateProgram(db);
    assert.equal(value.schemaReady, true);
    assert.equal(value.applications.length, 0);
    assert.equal(value.payouts.length, 0);
  });

  await scenario("settings persist and validate", async () => {
    const result = await saveProgramSettings(db, { attributionDays: 30, holdDays: 30, minimumPayoutCents: 500, payoutsEnabled: true, applicationsOpen: true });
    assert.ok("success" in result, JSON.stringify(result));
    const value = await loadPartnerProgram(db, ids.partnerUser, "https://example.invalid");
    assert.equal(value.settings.payoutsEnabled, true);
    assert.equal(value.settings.minimumPayoutCents, 500);
  });

  await scenario("customer application approval creates an affiliate profile without changing its role", async () => {
    const saved = await saveApplication(db, ids.applicant, { channelUrl: "https://video.example.invalid/applicant", audience: "Independent creators", promotionPlan: "Publish monthly tutorials." });
    assert.ok("success" in saved);
    const [application] = await connection`SELECT id FROM affiliate_applications WHERE user_id=${ids.applicant}`;
    assert.ok(application);
    const form = new FormData();
    form.set("applicationId", application.id);
    form.set("decision", "approved");
    form.set("code", "APPLICANT");
    form.set("commissionRate", "12.5");
    form.set("reviewNote", "Application reviewed");
    const reviews = await Promise.all([reviewApplication(db, ids.admin, form), reviewApplication(db, ids.admin, form)]);
    assert.equal(reviews.filter(result => "success" in result).length, 1, JSON.stringify(reviews));
    assert.equal(reviews.filter(result => "error" in result).length, 1, JSON.stringify(reviews));
    const [savedApplication] = await connection`SELECT status, reviewed_by FROM affiliate_applications WHERE id=${application.id}`;
    assert.equal(savedApplication.status, "approved");
    assert.equal(savedApplication.reviewed_by, ids.admin);
    const [createdProfile] = await connection`SELECT code, commission_rate_bps FROM marketing_affiliates WHERE user_id=${ids.applicant}`;
    assert.equal(createdProfile.code, "APPLICANT");
    assert.equal(createdProfile.commission_rate_bps, 1250);
    const [unchangedAccount] = await connection`SELECT role FROM users WHERE id=${ids.applicant}`;
    assert.equal(unchangedAccount.role, "user");
    const partnerView = await loadPartnerProgram(db, ids.applicant, "https://example.invalid");
    assert.equal(partnerView.active, true);
  });

  await scenario("application approval refuses inactive accounts and rejected review persists", async () => {
    const saved = await saveApplication(db, ids.inactiveUser, { channelUrl: "https://video.example.invalid/inactive", audience: "Small teams", promotionPlan: "Share weekly reviews." });
    assert.ok("success" in saved);
    const [app] = await connection`SELECT id FROM affiliate_applications WHERE user_id=${ids.inactiveUser}`;
    const approve = new FormData(); approve.set("applicationId", app.id); approve.set("status", "approved");
    const denied = await reviewApplication(db, ids.admin, approve);
    assert.ok("error" in denied);
    const reject = new FormData(); reject.set("applicationId", app.id); reject.set("status", "rejected");
    const result = await reviewApplication(db, ids.admin, reject);
    assert.ok("success" in result);
  });

  let visitId: string | null = null;
  await scenario("valid tracked visit records; self-referral, inactive code, and unsafe path are rejected", async () => {
    visitId = await recordAffiliateVisit(db, { code: "partner1", campaign: "Launch Series", landingPath: "/pricing/creator?ref=PARTNER1", userId: ids.customer });
    assert.ok(visitId);
    assert.equal(await recordAffiliateVisit(db, { code: "PARTNER1", landingPath: "/", userId: ids.partnerUser }), null);
    assert.equal(await recordAffiliateVisit(db, { code: "INACTIVE", landingPath: "/", userId: ids.customer }), null);
    assert.equal(await recordAffiliateVisit(db, { code: "PARTNER1", landingPath: "//evil.invalid", userId: ids.customer }), null);
  });

  const paidAt = new Date(Date.now() - 45 * 86400000);
  const holdPaidAt = new Date(Date.now() - 2 * 86400000);
  await connection`INSERT INTO customer_subscriptions (id,owner_id,package_slug,plan_name,subtotal_cents,amount_cents,currency,affiliate_id,affiliate_code,affiliate_commission_bps,status,paid_at,created_at)
    VALUES
      (${ids.paidSubscription},${ids.customer},'creator','Creator',10000,10000,'USD',${ids.partner},'PARTNER1',1000,'paid',${paidAt},${paidAt}),
      (${ids.holdSubscription},${ids.customer},'holding','Holding',15000,15000,'USD',${ids.partner},'PARTNER1',1000,'paid',${holdPaidAt},${holdPaidAt}),
      (${ids.foreignSubscription},${ids.customer},'foreign','Foreign',30000,30000,'EUR',${ids.partner},'PARTNER1',1000,'paid',${paidAt},${paidAt}),
      (${ids.selfSubscription},${ids.partnerUser},'self','Self',40000,40000,'USD',${ids.partner},'PARTNER1',1000,'paid',${paidAt},${paidAt}),
      (${ids.unpaidSubscription},${ids.customer},'unpaid','Unpaid',5000,5000,'USD',${ids.partner},'PARTNER1',1000,'unpaid',NULL,now())`;
  await connection`INSERT INTO workspace_projects (id,owner_id,title,package_slug,billing_status,final_amount_cents,currency,affiliate_id,affiliate_commission_bps,created_at,updated_at)
    VALUES
      (${ids.projectEligible},${ids.customer},'Eligible project','eligible','paid',20000,'USD',${ids.partner},1000,${paidAt},${paidAt}),
      (${ids.projectIntake},${ids.customer},'Intake project','intake','paid',50000,'USD',${ids.partner},1000,${paidAt},${paidAt})`;
  await connection`INSERT INTO project_intakes (project_id,owner_id,subscription_id,request_token,reserved_units,brief,channel_snapshot)
    VALUES (${ids.projectIntake},${ids.customer},${ids.paidSubscription},'70000000-0000-4000-8000-000000000001',1,'{}','{}')`;

  await scenario("attribution requires matching order owner, affiliate, and visit ownership", async () => {
    assert.equal(await attributeAffiliateSubscription(db, { subscriptionId: ids.paidSubscription, affiliateCode: "PARTNER1", visitId, userId: ids.customer }), true);
    assert.equal(await attributeAffiliateSubscription(db, { subscriptionId: ids.paidSubscription, affiliateCode: "PARTNER1", userId: ids.partnerUser }), false);
    const [attribution] = await connection`SELECT affiliate_id, visit_id FROM affiliate_order_attributions WHERE subscription_id=${ids.paidSubscription}`;
    assert.equal(attribution.affiliate_id, ids.partner);
    assert.equal(attribution.visit_id, visitId);
  });

  await scenario("ledger matures paid orders and excludes holds, non-USD, self-referrals, unpaid, and project intakes", async () => {
    const value = await loadPartnerProgram(db, ids.partnerUser, "https://example.invalid");
    const sourceIds = new Set(value.orders.map(order => order.id));
    assert.ok(sourceIds.has(ids.paidSubscription));
    assert.ok(sourceIds.has(ids.projectEligible));
    assert.equal(value.orders.find(order => order.id === ids.holdSubscription)?.payoutStatus, "pending", JSON.stringify(value.orders.find(order => order.id === ids.holdSubscription)));
    assert.equal(value.orders.find(order => order.id === ids.unpaidSubscription)?.payoutStatus, "pending", "Unpaid tracked orders should display as pending");
    for (const excluded of [ids.foreignSubscription, ids.selfSubscription, ids.projectIntake]) assert.equal(sourceIds.has(excluded), false, `Unexpected included source ${excluded}`);
    assert.equal(value.balance.availableCents, 3000);
    assert.ok(Object.values(value.balance).every(amount => Number.isSafeInteger(amount) && amount >= 0));
  });

  let payoutId = "";
  await scenario("concurrent payout requests reserve eligible commissions only once", async () => {
    const requests = await Promise.all([
      requestPayout(db, ids.partnerUser, { method: "paypal", destination: "partner@example.invalid" }),
      requestPayout(db, ids.partnerUser, { method: "paypal", destination: "partner@example.invalid" }),
    ]);
    assert.equal(requests.filter(result => "success" in result).length, 1);
    assert.equal(requests.filter(result => "error" in result).length, 1);
    const [payout] = await connection`SELECT id, amount_cents FROM affiliate_payouts WHERE affiliate_id=${ids.partner} AND status='requested'`;
    assert.ok(payout);
    assert.equal(payout.amount_cents, 3000);
    payoutId = payout.id;
    const [items] = await connection`SELECT count(*)::int AS count FROM affiliate_payout_items WHERE payout_id=${payoutId} AND reserved=true`;
    assert.equal(items.count, 2);
  });

  await scenario("foreign affiliate cannot cancel another partner payout; own cancellation releases reservations", async () => {
    const foreign = await cancelPayout(db, ids.otherPartnerUser, payoutId);
    assert.ok("error" in foreign);
    const result = await cancelPayout(db, ids.partnerUser, payoutId);
    assert.ok("success" in result);
    const [payout] = await connection`SELECT status FROM affiliate_payouts WHERE id=${payoutId}`;
    const [items] = await connection`SELECT count(*)::int AS count FROM affiliate_payout_items WHERE payout_id=${payoutId} AND reserved=true`;
    assert.equal(payout.status, "cancelled");
    assert.equal(items.count, 0);
  });

  await scenario("rejection releases commission and repeated payout requests remain nonnegative", async () => {
    const request = await requestPayout(db, ids.partnerUser, { method: "manual", destination: "secure transfer details" });
    assert.ok("success" in request);
    const [payout] = await connection`SELECT id FROM affiliate_payouts WHERE affiliate_id=${ids.partner} AND status='requested' ORDER BY created_at DESC LIMIT 1`;
    payoutId = payout.id;
    const form = new FormData(); form.set("payoutId", payoutId); form.set("status", "rejected"); form.set("note", "Please update details");
    const result = await reviewPayout(db, ids.admin, form);
    assert.ok("success" in result);
    const [item] = await connection`SELECT reserved FROM affiliate_payout_items WHERE payout_id=${payoutId} LIMIT 1`;
    assert.equal(item.reserved, false);
    const ledger = await loadPartnerProgram(db, ids.partnerUser, "https://example.invalid");
    assert.ok(Object.values(ledger.balance).every(amount => Number.isSafeInteger(amount) && amount >= 0));
  });

  await scenario("concurrent payout cancellation and approval preserve reservation/status consistency", async () => {
    const request = await requestPayout(db, ids.partnerUser, { method: "manual", destination: "race test destination" });
    assert.ok("success" in request);
    const [payout] = await connection`SELECT id FROM affiliate_payouts WHERE affiliate_id=${ids.partner} AND status='requested' ORDER BY created_at DESC LIMIT 1`;
    payoutId = payout.id;
    const approval = new FormData(); approval.set("payoutId", payoutId); approval.set("decision", "approved");
    const outcomes = await Promise.all([
      cancelPayout(db, ids.partnerUser, payoutId),
      reviewPayout(db, ids.admin, approval),
    ]);
    const [row] = await connection`SELECT status FROM affiliate_payouts WHERE id=${payoutId}`;
    const [items] = await connection`SELECT count(*)::int AS total, count(*) FILTER (WHERE reserved)::int AS reserved FROM affiliate_payout_items WHERE payout_id=${payoutId}`;
    assert.ok(["cancelled", "approved"].includes(row.status), JSON.stringify({ row, outcomes }));
    assert.ok(items.total > 0);
    assert.equal(items.reserved, row.status === "approved" ? items.total : 0, JSON.stringify({ row, items, outcomes }));
  });

  await scenario("external paid status requires a nonblank reference and stores the external reference", async () => {
    const [actionable] = await connection`SELECT id FROM affiliate_payouts WHERE affiliate_id=${ids.partner} AND status IN ('requested','approved') ORDER BY created_at DESC LIMIT 1`;
    if (actionable) payoutId = actionable.id;
    else {
      const request = await requestPayout(db, ids.partnerUser, { method: "paypal", destination: "partner@example.invalid" });
      assert.ok("success" in request);
      const [payout] = await connection`SELECT id FROM affiliate_payouts WHERE affiliate_id=${ids.partner} AND status='requested' ORDER BY created_at DESC LIMIT 1`;
      payoutId = payout.id;
    }
    const missing = new FormData(); missing.set("payoutId", payoutId); missing.set("status", "paid");
    assert.ok("error" in await reviewPayout(db, ids.admin, missing));
    const withoutConfirmation = new FormData(); withoutConfirmation.set("payoutId", payoutId); withoutConfirmation.set("status", "paid"); withoutConfirmation.set("reference", "txn-test-001");
    const noConfirmationResult = await reviewPayout(db, ids.admin, withoutConfirmation);
    assert.ok("error" in noConfirmationResult, "Expected explicit external-payment confirmation enforcement");
    const paid = new FormData(); paid.set("payoutId", payoutId); paid.set("status", "paid"); paid.set("reference", "txn-test-001"); paid.set("confirmExternalPayment", "true");
    assert.ok("success" in await reviewPayout(db, ids.admin, paid));
    const [row] = await connection`SELECT status,reference,paid_at FROM affiliate_payouts WHERE id=${payoutId}`;
    assert.equal(row.status, "paid"); assert.equal(row.reference, "txn-test-001"); assert.ok(row.paid_at);
  });

  await scenario("post-payment reversal creates a clawback that cannot be covered by a newer source", async () => {
    // Lower commission on a source included in a paid payout to model a post-settlement reversal.
    await connection`UPDATE customer_subscriptions SET affiliate_commission_bps=0 WHERE id=${ids.paidSubscription}`;
    await connection`INSERT INTO customer_subscriptions (id,owner_id,package_slug,plan_name,subtotal_cents,amount_cents,currency,affiliate_id,affiliate_code,affiliate_commission_bps,status,paid_at,created_at)
      VALUES (${ids.reversalSubscription},${ids.customer},'reversal','Reversal source',10000,10000,'USD',${ids.partner},'PARTNER1',1000,'paid',${paidAt},${paidAt})`;
    const before = await loadPartnerProgram(db, ids.partnerUser, "https://example.invalid");
    assert.ok(Object.values(before.balance).every(amount => Number.isSafeInteger(amount) && amount >= 0));
    assert.equal(before.balance.availableCents, 0, "The newer source must first cover the older clawback");
    const request = await requestPayout(db, ids.partnerUser, { method: "manual", destination: "ledger test destination" });
    assert.ok("error" in request, JSON.stringify(request));
    const [reserved] = await connection`SELECT count(*)::int AS count FROM affiliate_payout_items pi JOIN affiliate_payouts p ON p.id=pi.payout_id WHERE p.affiliate_id=${ids.partner} AND pi.source_id=${ids.reversalSubscription} AND pi.reserved`;
    assert.equal(reserved.count, 0, "New source must not be reserved against the older reversal");
    const ledger = await loadPartnerProgram(db, ids.partnerUser, "https://example.invalid");
    assert.ok(Object.values(ledger.balance).every(amount => Number.isSafeInteger(amount) && amount >= 0));
    await connection`UPDATE customer_subscriptions SET affiliate_commission_bps=1000,status='unpaid',paid_at=NULL WHERE id=${ids.paidSubscription}`;
    const unpaidReversal = await loadPartnerProgram(db, ids.partnerUser, "https://example.invalid");
    assert.ok(unpaidReversal.balance.clawbackCents > 0, "A previously paid source that becomes unpaid must reverse its settled commission");
    assert.equal(unpaidReversal.balance.availableCents, 0);
  });

  await scenario("migration enables RLS and denies anon/authenticated table privileges", async () => {
    const status = await connection`
      SELECT c.relname, c.relrowsecurity,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
        has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname LIKE 'affiliate_%' AND c.relkind='r'
    `;
    assert.equal(status.length, 5);
    assert.ok(status.every(row => row.relrowsecurity === true && row.anon_select === false && row.authenticated_select === false));
  });

  await scenario("unauthorized affiliate application and payout table reads are denied", async () => {
    for (const table of ["affiliate_applications", "affiliate_payouts"]) {
      let denied = false;
      try { await connection.unsafe(`SET ROLE anon; SELECT * FROM public.${table} LIMIT 1;`); }
      catch { denied = true; }
      finally { await connection`RESET ROLE`; }
      assert.equal(denied, true, `anon unexpectedly queried ${table}`);
    }
  });

  if (failures.length) {
    console.error(`\n${failures.length} of ${checks} affiliate database checks failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${checks} affiliate database checks passed.`);
  }
}

try {
  await main();
} finally {
  await connection.end({ timeout: 3 }).catch(() => undefined);
  await db.$client.end({ timeout: 3 }).catch(() => undefined);
}
