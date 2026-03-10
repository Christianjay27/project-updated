import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/me/profile", async (req: AuthRequest, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: req.auth.userId },
  });

  if (!profile || !profile.isActive) {
    return res.status(404).json({ error: "Profile not found" });
  }

  return res.json({
    id: profile.id,
    user_id: profile.userId,
    company_id: profile.companyId,
    email: profile.email,
    full_name: profile.fullName,
    role: profile.role,
    is_active: profile.isActive,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  });
});

usersRouter.get("/me/companies", async (req: AuthRequest, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const data = await prisma.userCompanyAccess.findMany({
    where: { userId: req.auth.userId },
    include: {
      company: {
        select: {
          name: true,
          isHeadquarters: true,
        },
      },
    },
  });

  const payload = data.map((row) => ({
    id: row.id,
    company_id: row.companyId,
    role: row.role,
    companies: {
      name: row.company.name,
      is_headquarters: row.company.isHeadquarters,
    },
  }));

  return res.json(payload);
});

usersRouter.get("/me/warehouses", async (req: AuthRequest, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const data = await prisma.userWarehouseAccess.findMany({
    where: { userId: req.auth.userId },
    select: { warehouseId: true },
  });

  return res.json(data.map((x) => ({ warehouse_id: x.warehouseId })));
});

usersRouter.get("/me/features", async (req: AuthRequest, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const data = await prisma.userFeaturePermission.findMany({
    where: { userId: req.auth.userId },
    select: { featureKey: true },
  });

  return res.json(data.map((x) => ({ feature_key: x.featureKey })));
});

export default usersRouter;
