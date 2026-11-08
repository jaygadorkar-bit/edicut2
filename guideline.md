# Cryptomus Payment Gateway Setup

Maintainer reference for the Edicut incoming-payment integration. Checked against Cryptomus' official Merchant API documentation on 2026-10-19. Recheck the linked docs and the live account UI before changing credentials or payment behavior; Cryptomus may update its approval flow and supported currencies.

## Which API key Edicut needs

Edicut creates incoming payment invoices. It needs the **Merchant Payment API key** and the **Merchant ID** for the merchant that receives those payments.

Cryptomus has separate credentials for different APIs:

| Credential | Use | Does Edicut need it? |
| --- | --- | --- |
| Merchant Payment API key + Merchant ID | Create payment invoices and verify payment webhooks | Yes |
| Payout API key | Send payouts from Cryptomus | No |
| User API key | Call personal-account User API methods | No |

The account-level Personal → Settings → API screen can show a **Generate Payout API Key** modal. That is not the key for checkout. Cryptomus documents 2FA for generating the payout key and warns that generating a new payout key temporarily blocks withdrawals for 24 hours. Its User API key flow also requires 2FA. Do not generate either key for this integration. If a future task actually adds payouts or User API calls, treat those as separate features and credentials.

The official Merchant API key guide lists merchant setup, URL and description, domain confirmation, and moderation. It does not list personal KYC as a universal Payment API key step. The live Edicut merchant settings page inspected on 2026-10-19 explicitly says KYC must be passed before applying for project moderation. Since the API guide makes moderation a prerequisite to copying the Payment API key, KYC currently gates this merchant's payment-key path. Treat the account UI's explicit gate as account-specific evidence; do not generalize it to every Cryptomus account.

Official key guides: [Merchant API keys](https://doc.cryptomus.com/merchant-api/getting-api-keys) and [User API keys](https://doc.cryptomus.com/methods/getting-api-keys).

## Create or approve the merchant

1. In Cryptomus, switch to the **Business** account and open the merchant that will receive Edicut payments. Create a merchant if one does not exist.
2. Open that merchant's **Settings**. Save the production website URL and a clear description of the goods or services. Record the Merchant ID from this merchant's settings.
3. Use a domain-confirmation method offered by the merchant UI. The current text of the official guide says to confirm the domain but does not enumerate the methods; use the values and instructions shown in the authenticated portal rather than copying a verification token from another account.
4. Submit the merchant and wait for Cryptomus moderation. The guide says the Payment API key and Merchant ID can be copied after moderation.
5. Copy the **Payment API key** from the merchant's own settings. Store it directly in the server secret manager. Do not paste it into chat, source control, issue comments, screenshots, or browser-visible application code.

If the portal asks for a 2FA code while generating a key, check the page and key type first. The documented payout-key flow explicitly asks for 2FA; it is unnecessary for Edicut's incoming-payment path. If the Merchant Payment API flow itself asks for a code, pause and request the account owner to complete that step.

## Configure Edicut secrets

The server reads these names:

| Variable | Value |
| --- | --- |
| `CRYPTOMUS_MERCHANT_ID` | Merchant UUID from the approved merchant's settings |
| `CRYPTOMUS_PAYMENT_API_KEY` | Secret Payment API key from that same merchant |
| `APP_URL` | Canonical HTTPS Edicut origin used for return and webhook URLs |

Placeholders are in [`.env.example`](.env.example). For local development, use the local runtime's ignored environment file or secret mechanism. In production, configure both Cryptomus values as Cloudflare Worker secrets on the **edicut-web** Worker. The Worker configuration currently sets `APP_URL` to `https://edicut.com` and names `edicut-production` as the deploy profile in the web package script. Before changing production secrets, verify the Cloudflare account, Worker, environment, and profile in the current CLI or dashboard. Use the dashboard or `wrangler secret put` interactively; do not pass secrets as command-line literals or commit them.

Do not expose the Payment API key to client code. Keep it distinct from any payout or personal User API key. If a key has been exposed, rotate it in Cryptomus and update the corresponding server secret.

## How the current checkout integration works

Edicut's implementation is in [`apps/web/app/lib/cryptomus.server.ts`](apps/web/app/lib/cryptomus.server.ts), [`apps/web/app/routes/checkout.tsx`](apps/web/app/routes/checkout.tsx), and [`apps/web/app/routes/api-cryptomus-webhook.ts`](apps/web/app/routes/api-cryptomus-webhook.ts).

1. Checkout saves an unpaid order using the server's saved price, then creates an invoice from that record. Never trust a browser-supplied amount or mark an order paid because the customer returned to `url_success`.
2. Create the invoice with `POST https://api.cryptomus.com/v1/payment`, JSON body, and `Content-Type: application/json`. Send `merchant: <Merchant ID>` and `sign: <signature>` headers.
3. The signature is `MD5(Base64(UTF-8(JSON body)) + Payment API key)`. Sign the exact serialized body sent on the request. Cryptomus' PHP JSON encoding escapes forward slashes; its webhook instructions warn other languages to account for this when verifying signatures. Keep the shared signing behavior covered by tests.
4. The current code sends the saved amount as a USD string, the subscription UUID as `order_id`, and server-built `url_return`, `url_success`, and `url_callback` URLs. A USD invoice lets the payer select a supported crypto currency and network on Cryptomus' hosted payment page. Cryptomus may also show the on-ramp provider's **Pay by Card** option to eligible payers; Cryptomus says this requires no separate installation, but it has a $25 minimum, provider authorization/KYC, and country restrictions (including Bangladesh in the current FAQ). This is an optional way for a payer to buy crypto to pay the invoice, not direct card acquiring by Edicut. `order_id` must be unique and alpha-dash; Cryptomus returns an existing invoice if that ID is reused. The code reuses it only for the explicit expired-invoice refresh flow.
5. Current settings are `lifetime: 3600`, `accuracy_payment_percent: 0`, and `is_payment_multiple: false`. One hour is inside Cryptomus' documented 300–43,200 second range. Zero accuracy requires an exact payment. With multiple payments disabled, Cryptomus says the invoice finalizes after the first payment; a partial transfer can therefore become a `wrong_amount` case rather than allowing the customer to pay the remainder. Keep this choice deliberate. Enabling multiple payments requires a clear partial-payment and final-callback policy before changing it.
6. Validate the API response (`state`, invoice UUID, hosted URL, and expiry) before saving it. The hosted URL should be on Cryptomus' payment domain. Store the invoice UUID and expiry with the order; refresh an expired invoice with the same order ID and `is_refresh: true` rather than creating a second logical order.

Cryptomus API details: [request signing](https://doc.cryptomus.com/merchant-api/request-format), [invoice creation](https://doc.cryptomus.com/merchant-api/payments/creating-invoice), and [payment integration types](https://doc.cryptomus.com/merchant-api/payments/getting-started).

## Webhook and payment-status rules

Cryptomus sends a POST to `url_callback` when the invoice status changes. The callback is public, so verify every callback before using it to change an order.

- Remove `sign`, recreate the signature from the remaining JSON data using the **Payment API key**, and compare it in constant time. Preserve compatible JSON ordering/escaping, including forward slashes.
- Require `type: "payment"`. Match the callback's `order_id` and invoice `uuid` to the saved order, and compare `payment_amount_usd` to the saved USD amount. Apply the paid transition and coupon redemption atomically and idempotently.
- Edicut currently unlocks an order only for `status: "paid"` and an exact amount. The return URL is for navigation only; the signed webhook is the payment authority.
- Cryptomus recommends both signature verification and an IP allowlist. Its current webhook page lists `91.227.144.54`; check the latest official page before configuring a network rule. The application currently verifies the signature but does not enforce a source-IP allowlist. Confirm Cloudflare's trusted client-IP handling before enforcing one at the edge.

| Status | Meaning / Edicut handling |
| --- | --- |
| `paid` | Exact amount paid. Edicut accepts it only when order ID, invoice UUID, and USD cents also match. |
| `paid_over` | More than required was paid. Do not silently fulfill or discard the overpayment; reconcile it and decide whether to refund or handle manually. Current code does not auto-fulfill it. |
| `wrong_amount`, `wrong_amount_waiting` | Underpayment. Do not unlock. With multiple payments disabled, investigate whether funds were credited and arrange a customer resolution. |
| `check`, `process`, `confirm_check` | Pending/confirming. Do not unlock. |
| `cancel`, `fail`, `system_fail` | Not paid/failed. Leave the order unpaid and let the customer retry according to invoice expiry. |
| `locked` | AML hold. Escalate through the Cryptomus merchant account; do not treat as paid. |
| `refund_process`, `refund_fail`, `refund_paid` | Refund lifecycle. The current integration does not automatically reverse a subscription based on these callbacks; reconcile the order and refund state explicitly. |

The webhook responds successfully to valid non-paid or unknown events without changing an order. It returns an error if the database write fails. Cryptomus documents a resend endpoint for finalized invoices in `wrong_amount`, `paid`, and `paid_over` statuses; a callback URL must have been supplied when creating the invoice, and the documented resend limit is 10. See [webhook signature and IP guidance](https://doc.cryptomus.com/merchant-api/payments/webhook), [payment statuses](https://doc.cryptomus.com/merchant-api/payments/payment-statuses), and [resend webhook](https://doc.cryptomus.com/merchant-api/payments/resend-webhook).

## Testing and release checklist

1. Check allowed currencies, networks, minimum/maximum limits, and commission for the approved merchant with `POST /v1/payment/services` before enabling a currency in product copy. See [List of services](https://doc.cryptomus.com/merchant-api/payments/list-of-services).
2. Run the Cryptomus test webhook endpoint against a staging callback to verify reachability and signature parsing. Use a dummy `order_id`/UUID that cannot match a real unpaid order. Cryptomus says test webhook data is not saved as a real payment. Never use a real order ID or point a synthetic `paid` callback at production.
3. Run unit tests, web typecheck, and the production build. Relevant tests are `apps/web/app/lib/cryptomus.server.test.ts` and `apps/web/app/routes/api-cryptomus-webhook.server.test.ts`.
4. Apply the migration through the reviewed migration process for the actual target database before enabling checkout. This repository currently has Drizzle migrations `packages/db/drizzle/0024_cryptomus_payment_invoices.sql` and `packages/db/drizzle/0025_cryptomus_invoice_expiry.sql`, plus `supabase/migrations/20261019150000_cryptomus_customer_subscription_payments.sql` for the Supabase migration path. Select the migration path that matches the deployed database; do not blindly apply multiple schema paths.
5. Verify the Cloudflare account, Worker, production environment, deployment branch, and secret names before deployment. Deploy only after explicit authorization. Check the live callback, invoice creation, a low-value payment, the saved order status, and the merchant's payment record. Do not expose secrets in logs or test output.

As of this guide's verification date, the application code and migrations exist, but the Cryptomus Payment API key has not been configured, remote migrations have not been applied, and production has not been deployed. Cryptomus's optional on-ramp card choice is available through the existing hosted invoice when the payer qualifies; direct card acquiring and payouts are outside the current integration. A paid invoice is not a recurring subscription; recurring billing requires a separate design.

## Official documentation

- [Getting Merchant API keys](https://doc.cryptomus.com/merchant-api/getting-api-keys)
- [Getting User API keys](https://doc.cryptomus.com/methods/getting-api-keys)
- [Request format and signatures](https://doc.cryptomus.com/merchant-api/request-format)
- [Payments getting started](https://doc.cryptomus.com/merchant-api/payments/getting-started)
- [Creating an invoice](https://doc.cryptomus.com/merchant-api/payments/creating-invoice)
- [Payment statuses](https://doc.cryptomus.com/merchant-api/payments/payment-statuses)
- [Webhook format and verification](https://doc.cryptomus.com/merchant-api/payments/webhook)
- [Testing webhooks](https://doc.cryptomus.com/merchant-api/payments/testing-webhook)
- [Resending a webhook](https://doc.cryptomus.com/merchant-api/payments/resend-webhook)
- [Available payment services](https://doc.cryptomus.com/merchant-api/payments/list-of-services)
