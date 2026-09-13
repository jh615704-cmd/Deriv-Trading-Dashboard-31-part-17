import { Router, type IRouter } from "express";
import healthRouter from "./health";
import derivRouter from "./deriv";
import tokenRouter from "./token";
import adminRouter from "./admin";
import accessRouter from "./access";
import { requireAccess, requireAccessFeature, requireAnyAccessFeature } from "../middlewares/requireAccess";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accessRouter);
router.use("/token", requireAccess, requireAnyAccessFeature("edge", "trade-x", "settings"));
router.use("/deriv", requireAccess, requireAnyAccessFeature("edge", "trade-x"));
router.use("/deriv/history", requireAccessFeature("history"));
router.use(derivRouter);
router.use(tokenRouter);
router.use(adminRouter);

export default router;
