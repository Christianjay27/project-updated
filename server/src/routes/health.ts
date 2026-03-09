import { Router } from "express";

const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "inventory-api-server",
    timestamp: new Date().toISOString(),
  });
});

export default healthRouter;
