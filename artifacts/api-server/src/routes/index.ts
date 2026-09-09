import { Router, type IRouter } from "express";
import healthRouter from "./health";
import derivRouter from "./deriv";
import tokenRouter from "./token";

const router: IRouter = Router();

router.use(healthRouter);
router.use(derivRouter);
router.use(tokenRouter);

export default router;
