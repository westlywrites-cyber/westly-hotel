import { Router, type IRouter } from "express";
import healthRouter from "./health";
import westlyRouter from "./westly";

const router: IRouter = Router();

router.use(healthRouter);
router.use(westlyRouter);

export default router;
