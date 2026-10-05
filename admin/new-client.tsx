import { useState } from "react";
import { useLocation } from "wouter";
import {
  useAssignOrganizationOwner,
  useCreateAdminOrganization,
} from "@/lib/api-client-react/src";
import { Card, field, inputStyle, linkButton, primaryButton } from "./ui";
import { colors } from "./theme";

/**
 * Provision a client.
 *
 * A club exists before anybody signs up for it: you create the venue and its
 * first branch, then invite the owner. Nothing in the application can do this,
 * which is why there was exactly one venue in the database.
 */
export function NewClient() {
  const create = useCreateAdminOrganization();
  const assignOwner = useAssignOrganizationOwner();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({
    name: "",
    branchName: "Main Branch",
    city: "",
    currency: "KES",
    taxRate: "16",
    serviceChargeRate: "10",
  });
  const [created, setCreated] = useState<{ id: string; slug: string; name: string } | null>(null);
  const [owner, setOwner] = useState({ name: "", email: "" });
  const [ownerResult, setOwnerResult] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 620 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>New client</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          Create the venue and its first branch. You can correct anything later.
        </p>
      </div>

      {created ? (
        <Card style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontWeight: 700, color: colors.green }}>
            {form.name} is created.
          </p>
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
          <button style={linkButton} onClick={() => setLocation(`/clients/${created.id}`)}>
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
                    const created = r as { id: string; slug: string; name?: string };
                    setCreated({
                      id: created.id,
                      slug: created.slug,
                      // The endpoint answers with the name; the form has it too, so a
                      // club is never referred to as blank in the next step.
                      name: created.name ?? form.name,
                    });
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
