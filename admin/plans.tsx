import { useState } from "react";
import {
  useGetPlans,
  useUpdatePlan,
  type Plan,
} from "@/lib/api-client-react/src";
import { Card, State, field, inputStyle, linkButton, primaryButton } from "./ui";
import { colors, money } from "./theme";

/**
 * The plan catalogue.
 *
 * Prices live here, not on each club, so changing what a tier costs is one edit
 * rather than touching every club already on it. That is deliberate: a club is
 * agreed a price, and the catalogue is what new clubs are sold.
 */
export function Plans() {
  const plans = useGetPlans();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Plan>>({});
  const [saved, setSaved] = useState<string | null>(null);

  const update = useUpdatePlan();

  function startEdit(plan: Plan) {
    setEditing(plan.id);
    setSaved(null);
    setDraft({
      name: plan.name,
      description: plan.description ?? "",
      monthlyPrice: plan.monthlyPrice,
      annualPrice: plan.annualPrice,
      branchLimit: plan.branchLimit,
      userLimit: plan.userLimit,
    });
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Plans</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          What a club pays. Limits are the pricing: a club past its branch or user
          limit has to move up.
        </p>
      </div>

      {saved && (
        <p style={{ margin: 0, fontSize: 13, color: colors.green }}>{saved}</p>
      )}

      <State
        loading={plans.isLoading}
        error={plans.error}
        empty={!plans.isLoading && !(plans.data ?? []).length}
        emptyTitle="No tiers yet."
        emptyHint="Run pnpm db:sync:plans to load the starting catalogue."
        onRetry={() => plans.refetch()}
      >
        <div style={{ display: "grid", gap: 14 }}>
          {(plans.data ?? []).map((plan) => {
            const open = editing === plan.id;
            return (
              <Card key={plan.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: "1 1 260px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                        {open ? (draft.name ?? plan.name) : plan.name}
                      </h2>
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          background: colors.canvas,
                          color: colors.mutedSoft,
                          borderRadius: 999,
                          padding: "2px 8px",
                        }}
                      >
                        {plan.code}
                      </span>
                      {plan.isCustom && (
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: 1,
                            textTransform: "uppercase",
                            background: colors.amberSoft,
                            color: colors.amber,
                            borderRadius: 999,
                            padding: "2px 8px",
                          }}
                        >
                          by agreement
                        </span>
                      )}
                      {!plan.isActive && (
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: 1,
                            textTransform: "uppercase",
                            background: colors.redSoft,
                            color: colors.red,
                            borderRadius: 999,
                            padding: "2px 8px",
                          }}
                        >
                          retired
                        </span>
                      )}
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.muted }}>
                      {open ? (draft.description ?? "") : (plan.description ?? "")}
                    </p>
                  </div>

                  {!open ? (
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                        {plan.monthlyPrice > 0 ? money(plan.monthlyPrice) : "—"}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: colors.mutedSoft }}>
                        per month
                        {plan.annualPrice > 0
                          ? ` · ${money(plan.annualPrice)} yearly`
                          : ""}
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: colors.muted }}>
                        {plan.branchLimit > 0 ? `${plan.branchLimit} branch` : "no branch cap"}
                        {plan.branchLimit > 1 ? "es" : ""} ·{" "}
                        {plan.userLimit > 0 ? `${plan.userLimit} users` : "no user cap"}
                      </p>
                      <button
                        style={{ ...linkButton, marginTop: 10 }}
                        onClick={() => startEdit(plan)}
                        data-testid={`button-edit-plan-${plan.code}`}
                      >
                        Edit price
                      </button>
                    </div>
                  ) : null}
                </div>

                {!open && plan.modules.length > 0 && (
                  <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {plan.modules.map((m) => (
                      <span
                        key={m}
                        style={{
                          fontSize: 10,
                          background: colors.canvas,
                          color: colors.muted,
                          borderRadius: 6,
                          padding: "3px 7px",
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}

                {open && (
                  <div
                    style={{
                      marginTop: 16,
                      display: "grid",
                      gap: 14,
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    }}
                  >
                    {field("Name", (
                      <input
                        value={draft.name ?? ""}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        style={inputStyle}
                      />
                    ))}
                    {field("Monthly (KES)", (
                      <input
                        type="number"
                        value={draft.monthlyPrice ?? 0}
                        onChange={(e) =>
                          setDraft({ ...draft, monthlyPrice: Number(e.target.value) })
                        }
                        style={inputStyle}
                        min={0}
                      />
                    ))}
                    {field("Yearly (KES)", (
                      <input
                        type="number"
                        value={draft.annualPrice ?? 0}
                        onChange={(e) =>
                          setDraft({ ...draft, annualPrice: Number(e.target.value) })
                        }
                        style={inputStyle}
                        min={0}
                      />
                    ))}
                    {field("Branch limit", (
                      <input
                        type="number"
                        value={draft.branchLimit ?? 0}
                        onChange={(e) =>
                          setDraft({ ...draft, branchLimit: Number(e.target.value) })
                        }
                        style={inputStyle}
                        min={0}
                      />
                    ), "0 means no cap")}
                    {field("User limit", (
                      <input
                        type="number"
                        value={draft.userLimit ?? 0}
                        onChange={(e) =>
                          setDraft({ ...draft, userLimit: Number(e.target.value) })
                        }
                        style={inputStyle}
                        min={0}
                      />
                    ), "0 means no cap")}
                    {field(
                      "Description",
                      <input
                        value={draft.description ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, description: e.target.value })
                        }
                        style={inputStyle}
                      />,
                    )}

                    <div style={{ display: "flex", gap: 10, gridColumn: "1 / -1" }}>
                      <button
                        style={{
                          ...primaryButton,
                          opacity: update.isPending ? 0.5 : 1,
                        }}
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate(
                            {
                              planId: plan.id,
                              data: {
                                code: plan.code,
                                name: draft.name ?? plan.name,
                                description: draft.description ?? null,
                                monthlyPrice: draft.monthlyPrice ?? plan.monthlyPrice,
                                annualPrice: draft.annualPrice ?? plan.annualPrice,
                                branchLimit: draft.branchLimit ?? plan.branchLimit,
                                userLimit: draft.userLimit ?? plan.userLimit,
                              },
                            },
                            {
                              onSuccess: () => {
                                setEditing(null);
                                setSaved(
                                  `${draft.name ?? plan.name} updated. Clubs already on this tier keep the price they were agreed.`,
                                );
                                plans.refetch();
                              },
                            },
                          )
                        }
                      >
                        {update.isPending ? "Saving…" : "Save changes"}
                      </button>
                      <button
                        style={linkButton}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                    {update.isError && (
                      <p style={{ margin: 0, fontSize: 13, color: colors.red, gridColumn: "1 / -1" }}>
                        {(update.error as { data?: { error?: string } })?.data?.error ??
                          "Could not save that tier."}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </State>
    </div>
  );
}