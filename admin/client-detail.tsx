import { useEffect, useState } from "react";
import {
  useAssignOrganizationOwner,
  useGetPlans,
  useSetSubscription,
  type SetSubscriptionInput,
  type SubscriptionResultUsage,
  useGetAdminOrganizations,
  useUpdateAdminOrganization,
} from "@/lib/api-client-react/src";
import { Card, State, field, inputStyle, linkButton, primaryButton } from "./ui";
import { colors, dateOnly, money } from "./theme";

/**
 * One client, and the settings you can correct.
 *
 * Tax, service charge and currency are per client and were previously not
 * writable by anyone, which left every venue stuck on whatever the seed set.
 * Changing a rate only affects orders rung in afterwards: the rate is copied onto
 * the order when it is created, so a receipt already issued keeps the figures it
 * was issued with.
 */
export function ClientDetail({ id }: { id: string }) {
  const orgs = useGetAdminOrganizations();
  const update = useUpdateAdminOrganization();
  const assignOwner = useAssignOrganizationOwner();
  const plans = useGetPlans();
  const setSubscription = useSetSubscription();
  const org = orgs.data?.find((o) => o.id === id);

  const [currency, setCurrency] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [serviceChargeRate, setServiceChargeRate] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);
  const [planChoice, setPlanChoice] = useState("");
  const [cycle, setCycle] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [subStatus, setSubStatus] = useState<NonNullable<SetSubscriptionInput["status"]>>("ACTIVE");
  const [usage, setUsage] = useState<SubscriptionResultUsage | null>(null);
  const [planNote, setPlanNote] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    setPlanChoice((prev) => prev || org.plan || "");
    setCurrency(org.currency);
    setTaxRate(String(org.taxRate));
    setServiceChargeRate(String(org.serviceChargeRate));
  }, [org?.id, org?.currency, org?.taxRate, org?.serviceChargeRate]);

  if (orgs.isLoading) {
    return (
      <State loading>
        <span />
      </State>
    );
  }

  if (!org) {
    return (
      <State
        empty
        emptyTitle="No such client."
        emptyHint="It may have been removed."
      >
        <span />
      </State>
    );
  }

  const dirty =
    currency !== org.currency ||
    Number(taxRate) !== org.taxRate ||
    Number(serviceChargeRate) !== org.serviceChargeRate;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{org.name}</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          {org.slug} · client since {dateOnly(org.createdAt)}
          {org.plan ? ` · ${org.plan}` : ""}
        </p>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Card>
          <p style={labelStyle}>Branches</p>
          <p style={valueStyle}>{org.branches}</p>
        </Card>
        <Card>
          <p style={labelStyle}>Active staff</p>
          <p style={valueStyle}>
            {org.activeStaff} of {org.staff}
          </p>
        </Card>
        <Card>
          <p style={labelStyle}>Tables</p>
          <p style={valueStyle}>{org.tables}</p>
        </Card>
        <Card>
          <p style={labelStyle}>Revenue, 30d</p>
          <p style={valueStyle}>{money(org.revenueInWindow)}</p>
        </Card>
      </div>

      <Card style={{ display: "grid", gap: 16, maxWidth: 640 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Plan</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.muted }}>
            What this club pays. It has {org.branches} branch
            {org.branches === 1 ? "" : "es"} and {org.activeStaff} active staff.
            {org.plan && !plans.isLoading
              ? ` Currently on ${(plans.data ?? []).find((pl) => pl.code === org.plan)?.name ?? org.plan}.`
              : ""}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          }}
        >
          {field(
            "Tier",
            <select
              value={planChoice}
              onChange={(e) => setPlanChoice(e.target.value)}
              style={inputStyle}
              data-testid="select-client-plan"
            >
              {(plans.data ?? []).map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name}
                  {pl.monthlyPrice > 0 ? ` · ${money(pl.monthlyPrice)}/mo` : " · by agreement"}
                </option>
              ))}
            </select>,
          )}
          {field(
            "Billing",
            <select
              value={cycle}
              onChange={(e) => setCycle(e.target.value as "MONTHLY" | "ANNUAL")}
              style={inputStyle}
              data-testid="select-client-cycle"
            >
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
            </select>,
          )}
          {field(
            "Status",
            <select
              value={subStatus}
              onChange={(e) =>
                  setSubStatus(e.target.value as NonNullable<SetSubscriptionInput["status"]>)
                }
              style={inputStyle}
              data-testid="select-client-substatus"
            >
              <option value="TRIAL">Trial</option>
              <option value="ACTIVE">Active</option>
              <option value="PAST_DUE">Past due</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="EXPIRED">Expired</option>
            </select>,
          )}
        </div>

        {usage && (
          <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
            <UsageRow
              label="Branches"
              used={usage.branches}
              limit={usage.branchLimit}
              over={usage.overBranchLimit ?? false}
            />
            <UsageRow
              label="Staff"
              used={usage.users}
              limit={usage.userLimit}
              over={usage.overUserLimit ?? false}
            />
            {(usage.overBranchLimit || usage.overUserLimit) && (
              <p style={{ margin: 0, fontSize: 12, color: colors.amber }}>
                Past the tier's limits. They would need a higher plan, or an
                agreed price.
              </p>
            )}
          </div>
        )}
        {planNote && (
          <p style={{ margin: 0, fontSize: 13, color: colors.green }}>{planNote}</p>
        )}

        <div>
          <button
            style={{ ...primaryButton, opacity: setSubscription.isPending ? 0.5 : 1 }}
            disabled={setSubscription.isPending}
            onClick={() =>
              setSubscription.mutate(
                {
                  organizationId: org.id,
                  data: { planId: planChoice, billingCycle: cycle, status: subStatus },
                },
                {
                  onSuccess: (r) => {
                    setUsage(r.usage);
                    setPlanNote(`Set to ${r.subscription.plan} on ${r.subscription.billingCycle.toLowerCase()}.`);
                    orgs.refetch();
                  },
                },
              )
            }
            data-testid="button-save-plan"
          >
            {setSubscription.isPending ? "Saving…" : "Save plan"}
          </button>
        </div>
        {setSubscription.isError && (
          <p style={{ margin: 0, fontSize: 13, color: colors.red }}>
            {(setSubscription.error as { data?: { error?: string } })?.data?.error ??
              "Could not save that plan."}
          </p>
        )}
      </Card>

      <Card style={{ display: "grid", gap: 16, maxWidth: 640 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            Commercial settings
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.muted }}>
            Applies to future orders only. Receipts already issued keep the figures
            they were issued with.
          </p>
        </div>

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {field("Currency", (
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              style={inputStyle}
              maxLength={3}
            />
          ), "Three letters, e.g. KES")}
          {field("Tax rate %", (
            <input
              type="number"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              style={inputStyle}
              min={0}
              max={100}
            />
          ))}
          {field("Service charge %", (
            <input
              type="number"
              value={serviceChargeRate}
              onChange={(e) => setServiceChargeRate(e.target.value)}
              style={inputStyle}
              min={0}
              max={100}
            />
          ))}
        </div>

        {update.isError && (
          <p style={{ margin: 0, fontSize: 13, color: colors.red }}>
            {(update.error as { data?: { error?: string } })?.data?.error ??
              "Could not save those settings."}
          </p>
        )}
        {saved && !update.isError && (
          <p style={{ margin: 0, fontSize: 13, color: colors.green }}>{saved}</p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            disabled={!dirty || update.isPending}
            onClick={() =>
              update.mutate(
                {
                  organizationId: org.id,
                  data: {
                    currency,
                    taxRate: Number(taxRate),
                    serviceChargeRate: Number(serviceChargeRate),
                  },
                },
                {
                  onSuccess: () => {
                    setSaved("Saved. New orders use these figures.");
                    orgs.refetch();
                  },
                },
              )
            }
            style={{ ...primaryButton, opacity: !dirty || update.isPending ? 0.5 : 1 }}
          >
            {update.isPending ? "Saving…" : "Save settings"}
          </button>
          {saved ? (
            <button style={linkButton} onClick={() => setSaved(null)}>
              Dismiss
            </button>
          ) : null}
        </div>
      </Card>

      <Card style={{ maxWidth: 640, display: "grid", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            Ownership
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.muted }}>
            You are above this club rather than inside it, so you can take the
            owner role directly. That is also how you hand a running club to the
            person who runs it — they step down to Administrator.
          </p>
        </div>
        {claimed && (
          <p style={{ margin: 0, fontSize: 13, color: colors.green }}>{claimed}</p>
        )}
        {assignOwner.isError && (
          <p style={{ margin: 0, fontSize: 13, color: colors.red }}>
            {(assignOwner.error as { data?: { error?: string } })?.data?.error ??
              "Could not assign ownership."}
          </p>
        )}
        <div>
          <button
            style={{ ...primaryButton, opacity: assignOwner.isPending ? 0.5 : 1 }}
            disabled={assignOwner.isPending}
            onClick={() =>
              assignOwner.mutate(
                { organizationId: org.id, data: {} },
                {
                  onSuccess: (r) => {
                    setClaimed(
                      `You are now the owner of ${org.name}.` +
                        (r.demoted ? ` ${r.demoted.name} was made an Administrator.` : ""),
                    );
                    orgs.refetch();
                  },
                },
              )
            }
          >
            {assignOwner.isPending ? "Assigning…" : "Make me the owner"}
          </button>
        </div>
      </Card>

      <Card style={{ maxWidth: 640 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 700 }}>
          What this client has set up
        </h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: colors.muted, lineHeight: 1.8 }}>
          <li>
            {org.tables > 0
              ? `${org.tables} tables on the floor`
              : "No floor designed yet — they cannot take a table order"}
          </li>
          <li>
            {org.staff > 0
              ? `${org.staff} staff on the roster`
              : "Nobody invited yet"}
          </li>
          <li>
            {org.ordersInWindow > 0
              ? `${org.ordersInWindow} completed orders in the last 30 days`
              : "No completed orders in the last 30 days"}
          </li>
        </ul>
      </Card>
    </div>
  );
}

function UsageRow({
  label,
  used,
  limit,
  over,
}: {
  label: string;
  used: number;
  limit: number;
  over: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: colors.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: over ? colors.amber : colors.ink }}>
        {used} of {limit > 0 ? limit : "unlimited"}
      </span>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 10,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: colors.mutedSoft,
};
const valueStyle: React.CSSProperties = { margin: "6px 0 0", fontSize: 22, fontWeight: 800 };
