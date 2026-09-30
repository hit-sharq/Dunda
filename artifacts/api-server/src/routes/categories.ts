import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  GetCategoriesResponse,
  GetCategoriesResponseItem,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { categoriesTable } from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";

const router: IRouter = Router();

router.get("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const rows = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.organizationId, tenant.organizationId))
    .orderBy(categoriesTable.sortOrder, categoriesTable.name);
  const response = rows.map((row) =>
    GetCategoriesResponseItem.parse({
      id: row.id,
      name: row.name,
      color: row.color,
    }),
  );
  res.json(GetCategoriesResponse.parse(response));
});

export default router;
