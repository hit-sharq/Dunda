import { Router, type IRouter } from "express";
import { and, eq, gte } from "drizzle-orm";
import {
  CreateEventBody,
  CreateEventResponse,
  GetEventParams,
  GetEventResponse,
  GetEventsResponse,
  GetEventsResponseItem,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import { BranchScopeError, requireBranchScope } from "../lib/branchScope";

const router: IRouter = Router();

router.get("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.organizationId, tenant.organizationId),
        ...(tenant.branchId
          ? [eq(eventsTable.branchId, tenant.branchId)]
          : []),
        gte(eventsTable.date, today),
      ),
    )
    .orderBy(eventsTable.date, eventsTable.startTime);
  const response = rows.map((row) =>
    GetEventsResponseItem.parse({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      capacity: row.capacity,
      status: row.status as
        | "DRAFT"
        | "UPCOMING"
        | "LIVE"
        | "COMPLETED"
        | "CANCELLED",
      revenue: row.revenue,
    }),
  );
  res.json(GetEventsResponse.parse(response));
});

router.post("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = `evt-${Date.now()}`;
  const [row] = await db
    .insert(eventsTable)
    .values({
      id,
      organizationId: tenant.organizationId,
      branchId: requireBranchScope(tenant, parsed.data.branchId),
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      date: parsed.data.date.toISOString().slice(0, 10),
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      capacity: parsed.data.capacity,
      status: "DRAFT",
      revenue: 0,
    })
    .returning();
  res.status(201).json(
    CreateEventResponse.parse({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      capacity: row.capacity,
      status: row.status as
        | "DRAFT"
        | "UPCOMING"
        | "LIVE"
        | "COMPLETED"
        | "CANCELLED",
      revenue: row.revenue,
    }),
  );
});

router.get("/:eventId", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.id, params.data.eventId),
        eq(eventsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!row) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(
    GetEventResponse.parse({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      capacity: row.capacity,
      status: row.status as
        | "DRAFT"
        | "UPCOMING"
        | "LIVE"
        | "COMPLETED"
        | "CANCELLED",
      revenue: row.revenue,
    }),
  );
});

export default router;
