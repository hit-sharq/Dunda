import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetStaffQueryKey,
  useCreateStaff,
  useGetBranches,
  useGetMe,
  useGetStaff,
  useUpdateStaff,
  type StaffMember,
} from "@/lib/api-client-react/src";
import { Button, Field, Modal, inputClass } from "../components/ui";
import { QueryNotice } from "../components/query-notice";
import { describeActionError } from "../lib/errors";

/**
 * Adding somebody to the team.
 *
 * Creating a staff record does not sign anybody in. It reserves their name,
 * email and role, and the moment they sign up with that address the record is
 * claimed and they get exactly the role chosen here. A record with no linked
 * account is shown as awaiting them, so it is never mistaken for a live login.
 */
export function StaffManager() {
  const staff = useGetStaff();
  const me = useGetMe();
  const branches = useGetBranches();
  const create = useCreateStaff();
  const update = useUpdateStaff();
  const qc = useQueryClient();

  const [inviting, setInviting] = useState<null | {
    name: string;
    email: string;
    phone: string;
    roleId: string;
    branchId: string;
  }>(null);
  const [editing, setEditing] = useState<null | { staff: StaffMember; roleId: string; status: string }>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const grantable = (me.data?.roles ?? []).filter((r) => r.grantable);
  const rows = staff.data ?? [];

  return (
    <section className="surface rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl font-bold">Staff members</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => staff.refetch()} data-testid="button-refresh-staff">
            Refresh
          </Button>
          {me.data?.canGrantStaff && (
            <Button
              onClick={() =>
                setInviting({
                  name: "",
                  email: "",
                  phone: "",
                  roleId: grantable.find((r) => !r.isOwner)?.id ?? grantable[0]?.id ?? "",
                  branchId: branches.data?.[0]?.id ?? "",
                })
              }
              data-testid="button-invite-staff"
            >
              + Add someone
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
            notice.tone === "ok"
              ? "border-[#b8d5c9] bg-[#e5f1eb] text-[#397463]"
              : "border-[#e6bdb2] bg-[#fbeae5] text-[#a3452e]"
          }`}
          data-testid="staff-notice"
        >
          {notice.text}
        </div>
      )}

      <QueryNotice
        loading={staff.isLoading}
        error={staff.error}
        what="staff members"
        emptyTitle="Nobody on the team yet."
        emptyHint="Add the first person, give them a role, and they'll be linked the moment they sign up."
        empty={!staff.isLoading && !staff.isError && !rows.length}
        onRetry={() => staff.refetch()}
      />

      <ul>
        {rows.map((s) => {
          // A record with no linked account has been created but nobody has
          // signed in with that address yet.
          const pending = !s.clerkUserId;
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eee8de] py-3 last:border-0"
              data-testid={`row-staff-${s.id}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e6f0eb] text-[#438875]">
                  {s.name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="truncate text-xs text-[#859087]">
                    {s.role} · {s.email ?? "no email"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {pending ? (
                  <span
                    className="rounded-full bg-[#fbf2d9] px-2 py-0.5 text-[10px] font-semibold text-[#92702b]"
                    title={"Created, but nobody has signed up with this email yet"}
                  >
                    Awaiting sign-up
                  </span>
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      s.status === "ACTIVE"
                        ? "bg-[#e2f0e8] text-[#3c7e69]"
                        : "bg-[#ece8de] text-[#7c8780]"
                    }`}
                  >
                    {s.status === "ACTIVE" ? "Active" : s.status}
                  </span>
                )}
                {me.data?.canGrantStaff && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setEditing({
                        staff: s,
                        roleId: s.roleId ?? grantable[0]?.id ?? "",
                        status: s.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
                      })
                    }
                    data-testid={`button-edit-staff-${s.id}`}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {inviting && (
        <Modal title="Add someone to the team" onClose={() => setInviting(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(
                {
                  data: {
                    name: inviting.name.trim(),
                    email: inviting.email.trim() || null,
                    phone: inviting.phone.trim() || null,
                    roleId: inviting.roleId,
                    branchId: inviting.branchId || null,
                  },
                },
                {
                  onSuccess: (created) => {
                    qc.invalidateQueries({ queryKey: getGetStaffQueryKey() });
                    setInviting(null);
                    setNotice({
                      tone: "ok",
                      text: `${created.name} added as ${created.role}. They are linked as soon as they sign up with ${created.email ?? "that email"}.`,
                    });
                  },
                  onError: (err: unknown) =>
                    setNotice({ tone: "err", text: describeActionError(err, { what: "this person" }) }),
                },
              );
            }}
            className="grid gap-4"
          >
            <p className="text-xs leading-5 text-[#69736f]">
              Their role is applied the moment they sign up with this email address. They
              cannot sign in until then, and only the role you pick here is granted.
            </p>
            <Field label="Full name">
              <input
                required
                value={inviting.name}
                onChange={(e) => setInviting({ ...inviting, name: e.target.value })}
                className={inputClass}
                placeholder="e.g. Nia Wanjiku"
                data-testid="input-invite-name"
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                value={inviting.email}
                onChange={(e) => setInviting({ ...inviting, email: e.target.value })}
                className={inputClass}
                placeholder="nia@example.com"
                data-testid="input-invite-email"
              />
            </Field>
            <Field label="Phone (optional)">
              <input
                value={inviting.phone}
                onChange={(e) => setInviting({ ...inviting, phone: e.target.value })}
                className={inputClass}
                placeholder="+254…"
                data-testid="input-invite-phone"
              />
            </Field>
            <Field label="Role">
              <select
                required
                value={inviting.roleId}
                onChange={(e) => setInviting({ ...inviting, roleId: e.target.value })}
                className={inputClass}
                data-testid="select-invite-role"
              >
                {grantable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Branch">
              <select
                value={inviting.branchId}
                onChange={(e) => setInviting({ ...inviting, branchId: e.target.value })}
                className={inputClass}
                data-testid="select-invite-branch"
              >
                <option value="">No branch yet</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button className="mt-2 w-full" disabled={create.isPending} data-testid="button-send-invite">
              {create.isPending ? "Adding…" : "Add to the team"}
            </Button>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.staff.name}`} onClose={() => setEditing(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate(
                {
                  staffId: editing.staff.id,
                  data: { roleId: editing.roleId, status: editing.status as "ACTIVE" | "INACTIVE" },
                },
                {
                  onSuccess: () => {
                    qc.invalidateQueries({ queryKey: getGetStaffQueryKey() });
                    setEditing(null);
                    setNotice({ tone: "ok", text: `${editing.staff.name} updated. Their tabs change the next time they open the app or come back to this window.` });
                  },
                  onError: (err: unknown) =>
                    setNotice({ tone: "err", text: describeActionError(err) }),
                },
              );
            }}
            className="grid gap-4"
          >
            <Field label="Role">
              <select
                value={editing.roleId}
                onChange={(e) => setEditing({ ...editing, roleId: e.target.value })}
                className={inputClass}
                data-testid="select-edit-role"
              >
                {grantable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                className={inputClass}
                data-testid="select-edit-status"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
            <p className="text-xs text-[#69736f]">
              Setting somebody inactive removes their access. Their shifts and past orders are
              kept for the record.
            </p>
            <Button className="w-full" disabled={update.isPending} data-testid="button-save-staff">
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </Modal>
      )}
    </section>
  );
}
