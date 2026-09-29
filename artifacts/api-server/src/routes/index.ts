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
const tradingFeatures = ["edge", "digit-flip", "trade-x", "bulk-trader", "cash-grab", "money-bank", "jdy-ai-3"] as const;
const tokenFeatures = [...tradingFeatures, "settings"] as const;

router.use("/token", requireAccess, requireAnyAccessFeature(...tokenFeatures));
// History is part of the shared Deriv cockpit. A key that can run any trading
// feature must be able to read its own resulting trades, even when it was not
// separately provisioned with the optional history feature.
router.use("/deriv/history", requireAccess, requireAnyAccessFeature(...tradingFeatures, "history"));
router.use("/deriv", requireAccess, (req, res, next) => {
  const features = res.locals.accessKey?.features as string[] | undefined;
  if (req.path === "/history" && features?.includes("history")) {
    next();
    return;
  }
  requireAnyAccessFeature(...tradingFeatures)(req, res, next);
});
router.use(derivRouter);
router.use(tokenRouter);
router.use(adminRouter);

export default router;
