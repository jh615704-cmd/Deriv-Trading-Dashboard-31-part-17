import { Router, type IRouter } from "express";
import healthRouter from "./health";
import derivRouter from "./deriv";
import tokenRouter from "./token";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(derivRouter);
router.use(tokenRouter);
router.use(adminRouter);

export default router;
