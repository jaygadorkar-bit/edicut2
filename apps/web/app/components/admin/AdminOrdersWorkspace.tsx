import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { ArrowUpRight, Check, ChevronDown, Download } from "lucide-react";
import { adminPath } from "../../lib/admin-paths";
import { clientMoney } from "../../lib/admin-clients";
import { countryName } from "../../lib/checkout-contact";
import { savedPackageAddOns } from "../../lib/package-addons";
import type { loadAdminOrders } from "../../lib/admin-orders.server";

export type AdminOrdersData = Awaited<ReturnType<typeof loadAdminOrders>>;
type OrderRow = AdminOrdersData["records"][number];
type Intent = "mark-paid" | "mark-unpaid" | "delete-purchase";
const clientsPath = adminPath("/clients");
function date(value: Date | string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Not recorded";
}

function orderDateTime(value: Date | string | null) {
  if (!value) return "Not recorded";
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.valueOf())) return "Not recorded";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(timestamp)} UTC`;
}

function relativeAge(value: Date | string | null, now: string) {
  if (!value) return "Time unknown";
  const elapsed = new Date(now).valueOf() - new Date(value).valueOf();
  if (!Number.isFinite(elapsed)) return "Time unknown";
  if (Math.abs(elapsed) < 60_000) return "Just now";

  const units = [
    { unit: "year" as const, duration: 365 * 24 * 60 * 60 * 1000 },
    { unit: "month" as const, duration: 30 * 24 * 60 * 60 * 1000 },
    { unit: "day" as const, duration: 24 * 60 * 60 * 1000 },
    { unit: "hour" as const, duration: 60 * 60 * 1000 },
    { unit: "minute" as const, duration: 60 * 1000 },
  ];
  const elapsedMagnitude = Math.abs(elapsed);
  const unit = units.find(({ duration }) => elapsedMagnitude >= duration)!;
  const amount = Math.floor(elapsedMagnitude / unit.duration);
  return new Intl.RelativeTimeFormat("en", { numeric: "always" }).format(
    elapsed > 0 ? -amount : amount,
    unit.unit,
  );
}

function Order({
  row,
  selected,
  showClient,
  now,
}: {
  row: OrderRow;
  selected: boolean;
  showClient: boolean;
  now: string;
}) {
  const record = row.subscription;
  const [open, setOpen] = useState(selected);
  const [confirm, setConfirm] = useState<Intent | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null),
    returnButton = useRef<HTMLButtonElement | null>(null);
  const returnIntent = useRef<Intent | null>(null);
  const busy = useNavigation().state !== "idle";
  const unpaid = record.status === "unpaid",
    amount = clientMoney(record.amountCents, record.currency);
  const cryptomusOrder = record.paymentProvider === "cryptomus";
  const cryptomusInvoiceExpired = !record.cryptomusInvoiceExpiresAt
    ? new Date(record.updatedAt).valueOf() <= Date.now() - 12 * 60 * 60 * 1000
    : new Date(record.cryptomusInvoiceExpiresAt).valueOf() <= Date.now();
  const person = row.name || row.email || "Customer",
    extras = savedPackageAddOns(record.addOns);
  const id = `order-${record.id}`;
  useEffect(() => {
    if (selected) setOpen(true);
  }, [selected]);
  useEffect(() => {
    if (confirm) confirmButton.current?.focus();
    else returnButton.current?.focus();
  }, [confirm]);
  const ask = (intent: Intent, button: HTMLButtonElement) => {
    returnIntent.current = intent;
    returnButton.current = button;
    setConfirm(intent);
  };
  return (
    <li className={`client-order ${open ? "is-open" : ""}`}>
      <button
        className="client-order-summary"
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Order details for ${person}'s ${record.planName}`}
        onClick={() => {
          setOpen(!open);
          setConfirm(null);
        }}
      >
        <span className="client-order-name">
          <strong>{record.planName}</strong>
          <span>
            {showClient ? `${person} · ` : ""}
            {record.purchaseType === "monthly"
              ? "Monthly package"
              : "Single video edit"}{" "}
            ·{" "}
            <time dateTime={new Date(record.createdAt).toISOString()}>
              {orderDateTime(record.createdAt)}
            </time>
            {" · "}
            <time
              className="client-order-age"
              dateTime={new Date(record.createdAt).toISOString()}
            >
              {relativeAge(record.createdAt, now)}
            </time>
          </span>
        </span>
        <strong className="client-order-amount">{amount}</strong>
        <span
          className={`clients-badge ${unpaid ? "clients-badge--amber" : "clients-badge--green"}`}
        >
          {unpaid ? "Unpaid" : "Paid"}
        </span>
        <ChevronDown
          size={16}
          className={open ? "is-rotated" : ""}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="client-order-details" id={id}>
          <dl className="client-order-facts">
            <div>
              <dt>Customer</dt>
              <dd>{person}</dd>
              <dd className="client-order-secondary">{row.email}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>{countryName(record.country)}</dd>
              <dd className="client-order-secondary">
                {record.phone || "No phone number"}
              </dd>
            </div>
            <div>
              <dt>Payment recorded</dt>
              <dd>
                {record.paidAt ? date(record.paidAt) : "Awaiting confirmation"}
              </dd>
              {record.paidAt ? (
                <dd className="client-order-secondary">{cryptomusOrder ? "Cryptomus" : "Manual confirmation"}</dd>
              ) : null}
              {unpaid && cryptomusOrder ? (
                <dd className="client-order-secondary">
                  {record.cryptomusInvoiceExpiresAt
                    ? `Cryptomus invoice expires ${date(record.cryptomusInvoiceExpiresAt)}`
                    : "Cryptomus payment setup pending"}
                </dd>
              ) : null}
            </div>
            {record.couponCode ? (
              <div>
                <dt>Coupon</dt>
                <dd>{record.couponCode}</dd>
              </div>
            ) : null}
          </dl>
          {extras.length ? (
            <ul className="client-order-extras" aria-label="Purchased add-ons">
              {extras.map((extra) => (
                <li key={extra.id}>
                  {extra.label}{" "}
                  <span>
                    {clientMoney(extra.amountCents, record.currency)} one time
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {record.purchaseType === "monthly" ? (
            <p className="clients-help">
              {extras.length
                ? "This total includes the first month and the listed one-time extras."
                : "Monthly package amount. Renewals are confirmed separately."}
            </p>
          ) : null}
          {confirm ? (
            <Form
              method="post"
              className="client-order-confirm"
              aria-label="Confirm order change"
            >
              <input type="hidden" name="intent" value={confirm} />
              <input type="hidden" name="subscriptionId" value={record.id} />
              <input
                type="hidden"
                name="expectedUpdatedAt"
                value={new Date(record.updatedAt).toISOString()}
              />
              <p>
                {confirm === "mark-paid"
                  ? `Confirm that ${amount} has been received. This records payment; it does not charge a card.`
                  : confirm === "mark-unpaid"
                    ? "Set this order to unpaid? Paid access will be removed and coupon use released. This is blocked after project work starts."
                    : "Remove this order from the ledger and customer account? Paid access and coupon use will be removed. This is blocked after project work starts."}
              </p>
              <div>
                <button
                  ref={confirmButton}
                  disabled={busy}
                  type="submit"
                  className={`clients-button ${confirm === "delete-purchase" ? "clients-button--danger" : "clients-button--primary"}`}
                >
                  {busy
                    ? "Saving…"
                    : confirm === "mark-paid"
                      ? "Confirm payment received"
                      : confirm === "mark-unpaid"
                        ? "Confirm unpaid"
                        : "Remove order"}
                </button>
                <button
                  type="button"
                  className="clients-button"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
              </div>
            </Form>
          ) : (
            <div
              className="client-order-actions"
              ref={(element) => {
                if (element && returnIntent.current)
                  returnButton.current =
                    element.querySelector<HTMLButtonElement>(
                      `[data-order-action="${returnIntent.current}"]`,
                    );
              }}
            >
              <Link
                to={
                  showClient && row.isClient
                    ? `${clientsPath}?client=${record.ownerId}&section=orders&event=${record.id}#client-detail`
                    : adminPath(`/users/${record.ownerId}`)
                }
              >
                <ArrowUpRight size={14} aria-hidden="true" />
                {showClient && row.isClient ? "Open client" : "Open account"}
              </Link>
              <div>
                {!cryptomusOrder ? <>
                <button
                  type="button"
                  className="clients-button"
                  disabled={busy}
                  data-order-action={unpaid ? "mark-paid" : "mark-unpaid"}
                  onClick={(event) =>
                    ask(
                      unpaid ? "mark-paid" : "mark-unpaid",
                      event.currentTarget,
                    )
                  }
                >
                  {unpaid ? "Record payment" : "Set unpaid"}
                </button>
                <button
                  type="button"
                  className="clients-button clients-button--quiet-danger"
                  disabled={busy}
                  data-order-action="delete-purchase"
                  onClick={(event) =>
                    ask("delete-purchase", event.currentTarget)
                  }
                >
                  Remove
                </button>
                </> : unpaid && cryptomusInvoiceExpired ? <button
                  type="button"
                  className="clients-button clients-button--quiet-danger"
                  disabled={busy}
                  data-order-action="delete-purchase"
                  onClick={(event) => ask("delete-purchase", event.currentTarget)}
                >Remove expired invoice</button> : <span className="client-order-secondary">
                  {unpaid ? "Waiting for Cryptomus payment" : "Cryptomus payment recorded"}
                </span>}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

export function AdminOrdersWorkspace({
  data,
  totals,
  now,
}: {
  data: AdminOrdersData;
  totals?: { currency: string; amountCents: number }[];
  now: string;
}) {
  const [params] = useSearchParams();
  const base = adminPath(data.ownerId ? "/clients" : "/orders");
  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch))
      value === null ? next.delete(key) : next.set(key, value);
    return `${base}?${next}${data.ownerId ? "#client-detail" : ""}`;
  };
  const count =
    data.status === "paid"
      ? data.summary.paid
      : data.status === "unpaid"
        ? data.summary.unpaid
        : data.summary.total;
  const pages = Math.max(1, Math.ceil(count / 25));
  return (
    <section
      className="client-orders-workspace"
      aria-label={
        data.ownerId ? "Client orders and payments" : "All orders and payments"
      }
    >
      <div className="client-orders-toolbar">
        <nav className="client-order-filters" aria-label="Order payment status">
          {(
            [
              { id: "all", label: "All orders", count: data.summary.total },
              { id: "unpaid", label: "Unpaid", count: data.summary.unpaid },
              { id: "paid", label: "Paid", count: data.summary.paid },
            ] as const
          ).map((tab) => (
            <Link
              key={tab.id}
              to={href({
                status: tab.id,
                page: null,
                orderPage: null,
                event: null,
              })}
              aria-current={data.status === tab.id ? "page" : undefined}
            >
              {tab.label}
              <span>{tab.count}</span>
            </Link>
          ))}
        </nav>
        {data.ownerId ? (
          <Link className="clients-button" to={adminPath("/orders")}>
            All clients' orders <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        ) : (
          <a
            className="clients-button"
            href={adminPath("/subscriptions/export")}
            download="orders.csv"
          >
            <Download size={14} aria-hidden="true" />
            Export all
          </a>
        )}
      </div>
      {totals?.length ? (
        <p className="clients-help client-orders-total">
          Paid package total{" "}
          <strong>
            {totals
              .map((total) => clientMoney(total.amountCents, total.currency))
              .join(" + ")}
          </strong>
        </p>
      ) : null}
      {data.eventId ? (
        <p className="clients-help">
          Showing the selected order.{" "}
          <Link to={href({ event: null, page: null, orderPage: null })}>
            Show all orders
          </Link>
        </p>
      ) : null}
      <ul className="client-order-list" aria-label="Order ledger">
        {data.records.map((row) => (
          <Order
            key={row.subscription.id}
            row={row}
            selected={data.eventId === row.subscription.id}
            showClient={!data.ownerId}
            now={now}
          />
        ))}
      </ul>
      {!data.records.length ? (
        <div className="clients-empty">
          <Check size={24} aria-hidden="true" />
          <h3>
            {data.eventId
              ? "Order unavailable"
              : data.status === "unpaid"
                ? "No unpaid orders"
                : "No orders here yet"}
          </h3>
          <p>
            {data.eventId
              ? "This order may have been removed, or belongs to another client."
              : data.status === "unpaid"
                ? "There are no orders waiting for payment confirmation."
                : "Saved package selections will appear here."}
          </p>
        </div>
      ) : null}
      {!data.eventId && pages > 1 ? (
        <nav className="clients-pagination" aria-label="Order pages">
          <span>
            Page {data.page} of {pages}
          </span>
          <div>
            {data.page > 1 ? (
              <Link
                className="clients-button"
                to={href({
                  [data.ownerId ? "orderPage" : "page"]: String(data.page - 1),
                })}
              >
                Previous
              </Link>
            ) : null}
            {data.hasNext ? (
              <Link
                className="clients-button"
                to={href({
                  [data.ownerId ? "orderPage" : "page"]: String(data.page + 1),
                })}
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </section>
  );
}
