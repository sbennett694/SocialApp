import { Router } from "express";
import socialRoutes from "./socialRoutes";

const router = Router();
router.use("/", socialRoutes);

export default router;
