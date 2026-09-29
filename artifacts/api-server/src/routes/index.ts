import { Router, type IRouter } from "express";
import dundaRouter from "./dunda";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dundaRouter);

export default router;
