import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import {
  useAssignOrganizationOwner,
  useCreateAdminOrganization,
} from "@/lib/api-client-react/src";
import { Card, field, inputStyle, linkButton, primaryButton } from "./ui";
import { colors } from "./theme";


export function NewClient() {
  const create = useCreateAdminOrganization();
  const assignOwner = useAssignOrganizationOwner();
  const { getToken } = useAuth();
  const [, setLocation] = useLocation();
  const [setupOwner, setSetupOwner] = useState({ name: "", email: "" });
  const [setupPlans, setSetupPlans] = useState<Array<{ id: string; name: string; monthlyPrice: number }>>([]);
  const [setupPlanId, setSetupPlanId] = useState("");
  const [setupPending, setSetupPending] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [setupCopied, setSetupCopied] = useState(false);
  const [setupLink, setSetupLink] = useState<{
    url: string;
    expiresAt: string;
    plan: { name: string; monthlyPrice: number };
    invitation: { sent: boolean; reason?: string };
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    branchName: "Main Branch",
    city: "",
    currency: "KES",
    taxRate: "16",
    serviceChargeRate: "10",
  });
  const [created, setCreated] = useState<{ id: string; slug: string; name: string } | null>(null);
  
  
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [owner, setOwner] = useState({ name: "", email: "" });
  const [ownerResult, setOwnerResult] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const response = await fetch("/api/admin/plans", { headers: { authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const plans = (await response.json()) as Array<{ id: string; name: string; monthlyPrice: number; isActive: boolean }>;
        const activePlans = plans.filter((plan) => plan.isActive);
        if (active) {
          setSetupPlans(activePlans);
          setSetupPlanId(activePlans[0]?.id ?? "");
        }
      } catch {
        if (active) setSetupError("Could not load active plans. Refresh the page and try again.");
      }
    })();
    return () => { active = false; };
  }, [getToken]);

  async function createSetupLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSetupPending(true);
    setSetupError("");
    setSetupLink(null);
    setSetupCopied(false);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your operator session has expired. Sign in again.");
      const response = await fetch("/api/admin/setup-links", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: setupOwner.email.trim().toLowerCase(),
          name: setupOwner.name.trim() || undefined,
          planId: setupPlanId || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create the owner setup link.");
      setSetupLink({
        url: body.setupUrl,
        expiresAt: body.expiresAt,
        plan: body.plan,
        invitation: body.invitation,
      });
    } catch (cause) {
      setSetupError(cause instanceof Error ? cause.message : "Could not create the owner setup link.");
    } finally {
      setSetupPending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 620 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>New client</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          Create a club yourself or invite its owner to set it up.
        </p>
      </div>

      <Card style={{ display: "grid", gap: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Send an owner setup link</h2>
          <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 13 }}>
            The owner creates the club and first branch. Their verified email receives the Owner role.
          </p>
        </div>
        <form onSubmit={createSetupLink} style={{ display: "grid", gap: 12 }}>
          {field("Owner name (optional)", (
            <input value={setupOwner.name} onChange={(event) => setSetupOwner({ ...setupOwner, name: event.target.value })} placeholder="Wanjiku Kamau" style={inputStyle} data-testid="input-setup-owner-name" />
          ))}
          {field("Owner email", (
            <input required type="email" value={setupOwner.email} onChange={(event) => setSetupOwner({ ...setupOwner, email: event.target.value })} placeholder="owner@example.com" style={inputStyle} data-testid="input-setup-owner-email" />
          ))}
          {field("Plan", (
            <select required value={setupPlanId} onChange={(event) => setSetupPlanId(event.target.value)} style={inputStyle} data-testid="select-owner-setup-plan">
              {setupPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · KES {plan.monthlyPrice.toLocaleString()}/mo</option>)}
            </select>
          ))}
          {setupError && <p role="alert" style={{ margin: 0, color: colors.red, fontSize: 13 }}>{setupError}</p>}
          <button style={{ ...primaryButton, opacity: setupPending || !setupPlanId ? 0.6 : 1 }} disabled={setupPending || !setupPlanId} data-testid="button-create-owner-setup-link">
            {setupPending ? "Creating link…" : "Create and email setup link"}
          </button>
        </form>
        {setupLink && (
          <div style={{ display: "grid", gap: 8, borderTop: `1px solid ${colors.line}`, paddingTop: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: setupLink.invitation.sent ? colors.green : colors.red }}>
              {setupLink.invitation.sent
                ? `Invitation sent to ${setupOwner.email.trim()}.`
                : `The invitation email could not be sent${setupLink.invitation.reason ? `: ${setupLink.invitation.reason}` : ". Copy and send the link manually."}`}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>
              {setupLink.plan.name} · KES {setupLink.plan.monthlyPrice.toLocaleString()}/month · expires {new Date(setupLink.expiresAt).toLocaleString()}
            </p>
            <input readOnly value={setupLink.url} onFocus={(event) => event.currentTarget.select()} style={inputStyle} aria-label="Owner setup link" data-testid="input-owner-setup-link" />
            <button type="button" style={linkButton} onClick={async () => {
              try {
                await navigator.clipboard.writeText(setupLink.url);
                setSetupCopied(true);
              } catch {
                setSetupError("Could not copy the link. Select and copy it from the field above.");
              }
            }} data-testid="button-copy-owner-setup-link">{setupCopied ? "Link copied" : "Copy setup link"}</button>
          </div>
        )}
      </Card>

      {created ? (
        <Card style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontWeight: 700, color: colors.green }}>
            {form.name} is created.
          </p>
          {paymentFailed && (
            <p style={{ margin: 0, fontSize: 13, color: colors.red }}>
              The first payment link could not be created. Collect it from
              the Billing screen, or the club's home screen will offer one
              once the owner signs up.
            </p>
          )}
          {paymentUrl && (
            <p style={{ margin: 0, fontSize: 13 }}>
              <span style={{ color: colors.muted }}>First payment: </span>
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: colors.green, fontWeight: 700 }}
                data-testid="link-first-payment"
              >
                Open the club's payment link
              </a>
              <span style={{ color: colors.muted }}>
                {" "}— it also waits on the owner's home screen once they sign up.
              </span>
            </p>
          )}
          <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
            Now name its owner. They get the Owner role and are the only person who
            can hand out the rest.
          </p>
          {field("Owner name", (
            <input
              value={owner.name}
              onChange={(e) => setOwner({ ...owner, name: e.target.value })}
              placeholder="Wanjiku Kamau"
              style={inputStyle}
              data-testid="input-owner-name"
            />
          ))}
          {field("Owner email", (
            <input
              type="email"
              value={owner.email}
              onChange={(e) => setOwner({ ...owner, email: e.target.value })}
              placeholder="where they will sign up"
              style={inputStyle}
              data-testid="input-owner-email"
            />
          ))}
          <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>
            Clerk sends them an invitation to that address. When they accept and sign
            up with it, their account claims the Owner role and the tabs follow.
          </p>
          <button
            style={primaryButton}
            disabled={!owner.email.trim() || assignOwner.isPending}
            data-testid="button-assign-owner"
            onClick={() =>
              assignOwner.mutate(
                {
                  organizationId: created.id,
                  data: {
                    email: owner.email.trim().toLowerCase(),
                    ...(owner.name.trim() ? { name: owner.name.trim() } : {}),
                  },
                },
                {
                  onSuccess: (result: unknown) => {
                    const r = result as {
                      invitation?: { sent: boolean; reason?: string };
                      owner?: { name?: string };
                    };
                    setOwnerResult(
                      r.invitation?.sent
                        ? {
                            ok: true,
                            text: `${r.owner?.name ?? 'The owner'} owns ${created.name}, and an invitation is on its way to ${owner.email.trim()}. They sign up with that address and the Owner role is waiting for them.`,
                          }
                        : {
                            ok: false,
                            text: `${created.name} has an owner row, but the invitation did not go out: ${r.invitation?.reason ?? 'unknown reason'} They can still sign up themselves with ${owner.email.trim()}.`,
                          },
                    );
                  },
                  onError: (err: unknown) =>
                    setOwnerResult({
                      ok: false,
                      text:
                        (err as { data?: { error?: string } })?.data?.error ??
                        "Could not set the owner.",
                    }),
                },
              )
            }
          >
            {assignOwner.isPending
              ? "Setting owner…"
              : `Make ${owner.name.trim() || "this person"} the owner`}
          </button>
          {ownerResult && (
            <p style={{ margin: 0, fontSize: 13, color: ownerResult.ok ? colors.green : colors.red }}>
              {ownerResult.text}
            </p>
          )}
          <button style={linkButton} onClick={() => setLocation(`/admin/clients/${created.id}`)}>
            Open its settings
          </button>
        </Card>
      ) : (
        <Card style={{ display: "grid", gap: 16 }}>
          {field("Club name", (
            <input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="The Lantern Room"
              style={inputStyle}
            />
          ))}
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
            {field("First branch", (
              <input
                required
                value={form.branchName}
                onChange={(e) => set("branchName", e.target.value)}
                style={inputStyle}
              />
            ))}
            {field("City", (
              <input
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Nairobi"
                style={inputStyle}
              />
            ))}
          </div>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(3, 1fr)" }}>
            {field("Currency", (
              <input
                value={form.currency}
                onChange={(e) => set("currency", e.target.value.toUpperCase().slice(0, 3))}
                maxLength={3}
                style={inputStyle}
              />
            ))}
            {field("Tax %", (
              <input
                type="number"
                value={form.taxRate}
                onChange={(e) => set("taxRate", e.target.value)}
                style={inputStyle}
                min={0}
                max={100}
              />
            ))}
            {field("Service %", (
              <input
                type="number"
                value={form.serviceChargeRate}
                onChange={(e) => set("serviceChargeRate", e.target.value)}
                style={inputStyle}
                min={0}
                max={100}
              />
            ))}
          </div>

          {create.isError && (
            <p style={{ margin: 0, fontSize: 13, color: colors.red }}>
              {(create.error as { data?: { error?: string } })?.data?.error ??
                "Could not create that client."}
            </p>
          )}

          <button
            disabled={!form.name.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  data: {
                    name: form.name.trim(),
                    branchName: form.branchName.trim() || "Main Branch",
                    city: form.city.trim(),
                    currency: form.currency.trim().toUpperCase() || "KES",
                    taxRate: Number(form.taxRate) || 0,
                    serviceChargeRate: Number(form.serviceChargeRate) || 0,
                  },
                },
                {
                  onSuccess: (r: unknown) => {
                    const created = r as {
                      id: string;
                      slug: string;
                      name?: string;
                      payment?: { redirectUrl: string } | null;
                      paymentFailed?: boolean;
                    };
                    setCreated({
                      id: created.id,
                      slug: created.slug,
                      
                      
                      name: created.name ?? form.name,
                    });
                    setPaymentUrl(created.payment?.redirectUrl ?? null);
                    setPaymentFailed(created.paymentFailed ?? false);
                  },
                },
              )
            }
            style={{ ...primaryButton, opacity: !form.name.trim() || create.isPending ? 0.5 : 1 }}
          >
            {create.isPending ? "Creating…" : "Create client"}
          </button>
        </Card>
      )}
    </div>
  );
}