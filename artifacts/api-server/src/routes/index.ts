import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import dundaRouter from "./dunda";
import healthRouter from "./health";
import staffRouter from "./staff";
import customersRouter from "./customers";
import eventsRouter from "./events";
import ordersRouter from "./orders";
import ticketsRouter from "./tickets";
import inventoryRouter from "./inventory";
import categoriesRouter from "./categories";
import productsRouter from "./products";
import floorsRouter from "./floors";
import paymentsRouter from "./payments";
import stockRouter from "./stock";
import notificationsRouter from "./notifications";
import searchRouter from "./search";
import dashboardRouter from "./dashboard";
import meRouter from "./me";
import setupRouter from "./setup";
import adminRouter from "./admin";
import settingsRouter from "./settings";
import reportsRouter from "./reports";
import { tenantMiddleware } from "../middlewares/tenantMiddleware";
import { logAuditEntry } from "../lib/auditLogger";

const router: IRouter = Router();

router.use(healthRouter);

router.use((req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
});

// Ahead of tenant resolution, and deliberately so. An operator belongs to no
// club, so the tenant middleware would refuse them before these routes ran.
router.use("/admin", adminRouter);

// Ahead of the tenant guard, because it describes the signed-in account rather
// than the club. That is what lets an operator who owns no club still find out
// who they are, and reach the operator console to provision their first one.
router.use("/me", meRouter);

// Operator tooling for binding an owner's account. Not offered anywhere in the
// club app, so it is not something a club user can discover.
router.use("/setup", setupRouter);

router.use(tenantMiddleware);

// Sign-ins are recorded for the audit trail.
router.post("/auth/login", async (req, res): Promise<void> => {
  await logAuditEntry({
    organizationId: req.clerk.organizationId,
    branchId: req.clerk.branchId,
    staffId: req.clerk.staffId,
    action: "LOGIN",
    entity: "USER",
    entityId: req.clerk.clerkUserId,
    detail: "Signed in",
  });
  res.json({ ok: true });
});

router.use("/settings", settingsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/products", productsRouter);
router.use("/floors", floorsRouter);
router.use("/payments", paymentsRouter);
router.use("/stock", stockRouter);
router.use("/notifications", notificationsRouter);
router.use("/search", searchRouter);
router.use("/reports", reportsRouter);

router.use("/", dundaRouter);
router.use("/categories", categoriesRouter);
router.use("/orders", ordersRouter);
router.use("/tickets", ticketsRouter);
router.use("/staff", staffRouter);
router.use("/shifts", staffRouter);
router.use("/customers", customersRouter);
router.use("/events", eventsRouter);
router.use("/inventory", inventoryRouter);

export default router;
