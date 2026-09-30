import { db } from "@workspace/db";
import { auditLogsTable, type InsertAuditLog } from "@workspace/db";

export async function logAuditEntry(params: {
  organizationId: string;
  branchId?: string | null;
  staffId?: string | null;
  action: InsertAuditLog["action"];
  entity: string;
  entityId?: string | null;
  detail?: string | null;
  reason?: string | null;
}): Promise<void> {
  await db.insert(auditLogsTable).values({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: params.organizationId,
    branchId: params.branchId ?? null,
    staffId: params.staffId ?? null,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId ?? null,
    detail: params.detail ?? null,
    reason: params.reason ?? null,
  });
}
