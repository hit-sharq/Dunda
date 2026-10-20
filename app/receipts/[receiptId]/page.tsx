import { prisma } from "@/lib/db/client";
import { resolveSession } from "@/lib/server/http";
import { notFound as nextNotFound } from "next/navigation";

export default async function ReceiptPage({
  params,
}: {
  params: { receiptId: string };
}) {
  const session = await resolveSession();
  if (!session) return nextNotFound();

  const receipt = await prisma.dunda_receipts.findFirst({
    where: {
      id: params.receiptId,
      organization_id: session.organizationId as string,
    },
    include: {
      dunda_organizations: { select: { name: true, currency: true } },
      dunda_branches: { select: { name: true, city: true, phone: true } },
      dunda_orders: {
        select: {
          number: true,
          table_name: true,
          subtotal: true,
          service_charge: true,
          tax: true,
          discount: true,
          total: true,
          dunda_order_items: {
            select: {
              name: true,
              quantity: true,
              unit_price: true,
              total: true,
              notes: true,
              price_overridden: true,
              original_price: true,
            },
          },
        },
      },
      dunda_tabs: { select: { number: true } },
      dunda_staff: { select: { name: true } },
    },
  });

  if (!receipt) return nextNotFound();

  const currency = receipt.currency;
  const money = (amount: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);

  const items = receipt.dunda_orders?.dunda_order_items ?? [];

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Receipt {receipt.number}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
            background: #f1f5f9;
            padding: 2rem 1rem;
            display: flex;
            justify-content: center;
          }
          .receipt {
            background: #fff;
            width: 100%;
            max-width: 380px;
            padding: 1.5rem;
            box-shadow: 0 4px 24px rgba(0,0,0,0.08);
            border-radius: 4px;
          }
          .merchant { text-align: center; margin-bottom: 1rem; }
          .merchant-name { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.02em; }
          .merchant-meta { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; line-height: 1.5; }
          .rule { border-top: 1px dashed #cbd5e1; margin: 0.75rem 0; }
          .meta-row { display: flex; justify-content: space-between; font-size: 0.75rem; color: #475569; margin-bottom: 0.25rem; }
          .items { width: 100%; }
          .item { display: flex; justify-content: space-between; font-size: 0.8125rem; margin-bottom: 0.375rem; }
          .item-name { flex: 1; }
          .item-qty { color: #64748b; margin-right: 0.5rem; min-width: 1.5rem; }
          .item-total { font-variant-numeric: tabular-nums; }
          .item-note { font-size: 0.6875rem; color: #94a3b8; font-style: italic; }
          .override-tag { font-size: 0.625rem; background: #fef3c7; color: #92400e; padding: 0.0625rem 0.25rem; border-radius: 2px; margin-left: 0.25rem; }
          .totals { font-size: 0.8125rem; }
          .total-row { display: flex; justify-content: space-between; margin-bottom: 0.25rem; }
          .total-row.grand { font-size: 1rem; font-weight: 800; border-top: 1px solid #e2e8f0; padding-top: 0.5rem; margin-top: 0.5rem; }
          .total-row.paid { color: #15803d; }
          .footer { text-align: center; margin-top: 1rem; font-size: 0.6875rem; color: #94a3b8; line-height: 1.5; }
          .actions { max-width: 380px; margin: 1rem auto 0; display: flex; gap: 0.5rem; }
          .btn {
            flex: 1;
            padding: 0.75rem;
            border: 1px solid #cbd5e1;
            background: #fff;
            border-radius: 8px;
            font-size: 0.875rem;
            font-weight: 600;
            cursor: pointer;
            text-align: center;
            text-decoration: none;
            color: #0f172a;
          }
          .btn.primary { background: #0f172a; color: #fff; border-color: #0f172a; }
          @media print {
            body { background: #fff; padding: 0; }
            .actions { display: none; }
            .receipt { box-shadow: none; max-width: 100%; }
          }
        `}</style>
      </head>
      <body>
        <div className="receipt">
          <div className="merchant">
            <div className="merchant-name">{receipt.dunda_organizations.name}</div>
            <div className="merchant-meta">
              {receipt.dunda_branches.name}
              {receipt.dunda_branches.city ? ` • ${receipt.dunda_branches.city}` : ""}
              {receipt.dunda_branches.phone ? (
                <>
                  <br />
                  {receipt.dunda_branches.phone}
                </>
              ) : null}
            </div>
          </div>

          <div className="rule" />

          <div className="meta-row">
            <span>Receipt</span>
            <span>{receipt.number}</span>
          </div>
          <div className="meta-row">
            <span>Date</span>
            <span>{receipt.issued_at.toLocaleString()}</span>
          </div>
          {receipt.dunda_tabs ? (
            <div className="meta-row">
              <span>Tab</span>
              <span>{receipt.dunda_tabs.number}</span>
            </div>
          ) : null}
          {receipt.dunda_orders ? (
            <div className="meta-row">
              <span>Order</span>
              <span>
                {receipt.dunda_orders.number}
                {receipt.dunda_orders.table_name
                  ? ` • ${receipt.dunda_orders.table_name}`
                  : ""}
              </span>
            </div>
          ) : null}
          {receipt.dunda_staff ? (
            <div className="meta-row">
              <span>Served by</span>
              <span>{receipt.dunda_staff.name}</span>
            </div>
          ) : null}

          <div className="rule" />

          <div className="items">
            {items.length === 0 ? (
              <div className="item-note">No line items on this receipt.</div>
            ) : (
              items.map((item, idx) => (
                <div key={idx}>
                  <div className="item">
                    <span className="item-qty">{item.quantity}×</span>
                    <span className="item-name">
                      {item.name}
                      {item.price_overridden ? (
                        <span className="override-tag">adjusted</span>
                      ) : null}
                      {item.notes ? (
                        <div className="item-note">{item.notes}</div>
                      ) : null}
                    </span>
                    <span className="item-total">{money(item.total)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="rule" />

          <div className="totals">
            <div className="total-row">
              <span>Subtotal</span>
              <span>{money(receipt.items_subtotal)}</span>
            </div>
            {receipt.pool_charges > 0 ? (
              <div className="total-row">
                <span>Pool charges</span>
                <span>{money(receipt.pool_charges)}</span>
              </div>
            ) : null}
            {receipt.service_charge > 0 ? (
              <div className="total-row">
                <span>Service charge</span>
                <span>{money(receipt.service_charge)}</span>
              </div>
            ) : null}
            {receipt.tax > 0 ? (
              <div className="total-row">
                <span>Tax</span>
                <span>{money(receipt.tax)}</span>
              </div>
            ) : null}
            {receipt.discount > 0 ? (
              <div className="total-row">
                <span>Discount</span>
                <span>-{money(receipt.discount)}</span>
              </div>
            ) : null}
            <div className="total-row grand">
              <span>Total</span>
              <span>{money(receipt.total)}</span>
            </div>
            <div className="total-row paid">
              <span>Paid</span>
              <span>{money(receipt.amount_paid)}</span>
            </div>
            {receipt.outstanding > 0 ? (
              <div className="total-row">
                <span>Outstanding</span>
                <span>{money(receipt.outstanding)}</span>
              </div>
            ) : null}
            {receipt.payment_method ? (
              <div className="total-row">
                <span>Method</span>
                <span>{receipt.payment_method}</span>
              </div>
            ) : null}
            {receipt.payment_reference ? (
              <div className="meta-row" style={{ marginTop: "0.5rem" }}>
                <span>Reference</span>
                <span>{receipt.payment_reference}</span>
              </div>
            ) : null}
          </div>

          <div className="footer">
            Thank you for your patronage.
            <br />
            {receipt.number}
          </div>
        </div>

        <div className="actions">
          <button className="btn" onClick={() => window.print()}>
            Print
          </button>
          <a className="btn primary" href="/">
            Done
          </a>
        </div>
      </body>
    </html>
  );
}
