import { useState } from "react";
import { useLocation } from "wouter";
import {
  useAssignOrganizationOwner,
  useCreateAdminOrganization,
} from "@workspace/api-client-react";
import { Card, field, inputStyle, linkButton, primaryButton } from "./shell";
import { colors } from "../lib/theme";

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
  const [created, setCreated] = useState<{ id: string; slug: string } | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
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
            Next: open the club app, sign in as the owner, and claim the
            organization with <code>pnpm db:setup-token</code>. They will not
            see anything until they do.
          </p>
          <button style={primaryButton} onClick={() => setLocation(`/clients/${created.id}`)}>
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
                { onSuccess: (r: { id: string; slug: string }) => setCreated(r) },
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
