import { Router, type IRouter } from "express";
import healthRouter from "./health";
import derivRouter from "./deriv";
import tokenRouter from "./token";
import adminRouter from "./admin";
import { requireGuest } from "../middlewares/requireGuest";

const router: IRouter = Router();

router.use(healthRouter);
router.use(["/token", "/deriv"], requireGuest);
router.use(derivRouter);
router.use(tokenRouter);
router.use(adminRouter);

export default router;
