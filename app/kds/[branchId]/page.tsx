import { prisma } from "@/lib/db/client";
import { resolveSession } from "@/lib/server/http";
import { notFound as nextNotFound } from "next/navigation";

export default async function KDSPage({
  params,
}: {
  params: { branchId: string };
}) {
  const session = await resolveSession();
  if (!session) return nextNotFound();

  const branch = await prisma.dunda_branches.findFirst({
    where: {
      id: params.branchId as string,
      organization_id: session.organizationId as string,
    },
    select: { id: true, name: true },
  });

  if (!branch) return nextNotFound();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>KDS - Kitchen Display</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0f172a;
            color: #f8fafc;
            height: 100vh;
            overflow: hidden;
          }
          .header {
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #334155;
          }
          .title { font-size: 2rem; font-weight: 800; letter-spacing: -0.025em; }
          .subtitle { font-size: 0.875rem; color: #94a3b8; margin-top: 0.25rem; }
          .time { font-size: 1.5rem; font-family: monospace; font-weight: 700; }
          .stations {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
            padding: 1rem 2rem;
            height: calc(100vh - 80px);
            overflow: hidden;
          }
          .station {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 1rem;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .station-header {
            padding: 1rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #334155;
          }
          .station-name {
            font-size: 1.25rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .station-bar { color: #3b82f6; }
          .station-kitchen { color: #22c55e; }
          .ticket-count {
            background: rgba(255,255,255,0.1);
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.875rem;
            font-weight: 600;
          }
          .tickets {
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            overflow-y: auto;
          }
          .ticket {
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 0.75rem;
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            animation: slideIn 0.3s ease-out;
          }
          @keyframes slideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .ticket-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .ticket-number {
            font-size: 1.5rem;
            font-weight: 800;
            font-family: monospace;
          }
          .ticket-number.bar { color: #3b82f6; }
          .ticket-number.kitchen { color: #22c55e; }
          .ticket-status {
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
          }
          .status-PENDING { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
          .status-READY { background: rgba(34, 197, 94, 0.2); color: #86efac; }
          .ticket-table {
            font-size: 0.875rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
          }
          .ticket-items {
            display: flex;
            flex-direction: column;
            gap: 0.375rem;
          }
          .ticket-item {
            display: flex;
            justify-content: space-between;
            font-size: 0.9375rem;
          }
          .item-name { font-weight: 500; }
          .item-qty { font-family: monospace; }
          .item-price { font-variant-numeric: tabular-nums; }
          .item-notes {
            font-size: 0.8125rem;
            color: #94a3b8;
            font-style: italic;
            margin-top: 0.125rem;
          }
          .ticket-time {
            font-size: 0.75rem;
            color: #64748b;
            font-family: monospace;
            margin-top: 0.5rem;
            border-top: 1px solid #334155;
            padding-top: 0.5rem;
          }
          .empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #64748b;
          }
          .empty span { font-size: 3rem; margin-bottom: 0.5rem; }
        `}</style>
      </head>
      <body>
        <div className="header">
          <div>
            <h1 className="title">KDS — Kitchen Display</h1>
            <p className="subtitle">Branch: {branch.name}</p>
          </div>
          <div className="time" id="clock">--:--:--</div>
        </div>
        <div className="stations" id="stations"></div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              const BRANCH_ID = ${JSON.stringify(branch.id)};
              async function loadTickets() {
                try {
                  const res = await fetch('/api/kds?branchId=' + encodeURIComponent(BRANCH_ID), {
                    credentials: 'include'
                  });
                  const data = await res.json();
                  renderTickets(data);
                } catch (e) {
                  console.error('KDS load error', e);
                }
              }

              function renderTickets(byStation) {
                const container = document.getElementById('stations');
                const stations = ['BAR', 'KITCHEN'];
                
                let html = '';
                for (const station of stations) {
                  const tickets = byStation[station] || [];
                  const isBar = station === 'BAR';
                  
                  html += '<div class="station">';
                  html += '<div class="station-header">';
                  html += '<span class="station-name ' + (isBar ? 'station-bar' : 'station-kitchen') + '">' + station + '</span>';
                  html += '<span class="ticket-count">' + tickets.length + '</span>';
                  html += '</div>';
                  html += '<div class="tickets">';
                  
                  if (tickets.length === 0) {
                    html += '<div class="empty"><span>✓</span><p>No tickets</p></div>';
                  } else {
                    for (const t of tickets) {
                      const itemsHtml = (t.dunda_orders.dunda_order_items || []).map(function(i) {
                        return '<div class="ticket-item">' +
                          '<span class="item-name">' + i.name + '</span>' +
                          '<span class="item-qty">×' + i.quantity + '</span>' +
                          '<span class="item-price">KES ' + i.total + '</span>' +
                          '</div>' +
                          (i.notes ? '<div class="item-notes">' + i.notes + '</div>' : '');
                      }).join('');
                      
                      const orderTotal = t.dunda_orders.total || 0;
                      const itemCount = (t.dunda_orders.dunda_order_items || []).length;
                      
                      html += '<div class="ticket" data-status="' + t.status + '">';
                      html += '<div class="ticket-header">';
                      html += '<div class="ticket-number ' + station.toLowerCase() + '">#' + t.number + '</div>';
                      html += '<span class="ticket-status status-' + t.status + '">' + t.status + '</span>';
                      html += '</div>';
                      html += '<div class="ticket-table">Table: ' + (t.order.table_name || '—') + '</div>';
                      html += '<div class="ticket-items">' + itemsHtml + '</div>';
                      html += '<div class="ticket-time">';
                      html += new Date(t.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                      html += ' &nbsp;•&nbsp; KES ' + orderTotal;
                      html += ' &nbsp;•&nbsp; ' + itemCount + ' item' + (itemCount !== 1 ? 's' : '');
                      html += '</div>';
                      html += '</div>';
                    }
                  }
                  html += '</div>';
                  html += '</div>';
                }
                container.innerHTML = html;
              }

              loadTickets();
              setInterval(loadTickets, 5000);
              
              function updateClock() {
                const now = new Date();
                document.getElementById('clock').textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
              }
              updateClock();
              setInterval(updateClock, 1000);
            `,
          }}
        />
      </body>
    </html>
  );
}
