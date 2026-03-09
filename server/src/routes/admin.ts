import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const adminRouter = Router();

adminRouter.use(requireAuth);

async function assertAdmin(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { role: true, isActive: true },
  });

  return Boolean(profile?.isActive && profile.role === "admin");
}

adminRouter.use(async (req: AuthRequest, res, next) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ok = await assertAdmin(req.auth.userId);
  if (!ok) {
    return res.status(403).json({ error: "Admin access required" });
  }

  return next();
});

adminRouter.get("/companies", async (_req, res) => {
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      address: true,
      contactNumber: true,
      email: true,
      logoUrl: true,
      isActive: true,
      isHeadquarters: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  return res.json(companies.map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address || "",
    contact_number: c.contactNumber || "",
    email: c.email || "",
    logo_url: c.logoUrl || "",
    is_active: c.isActive,
    is_headquarters: c.isHeadquarters,
    created_at: c.createdAt,
  })));
});

adminRouter.get("/warehouses", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  const warehouses = await prisma.warehouse.findMany({
    where: {
      isActive: true,
      ...(companyId ? { companyId } : {}),
    },
    select: { id: true, name: true, companyId: true },
    orderBy: { name: "asc" },
  });

  return res.json(warehouses.map((w) => ({
    id: w.id,
    name: w.name,
    company_id: w.companyId,
  })));
});

adminRouter.get("/warehouses/manage", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  const viewAll = String(req.query.viewAll || "false") === "true";
  const filterSql = !viewAll && companyId ? Prisma.sql`WHERE w.company_id = ${companyId}` : Prisma.empty;

  type Row = {
    id: string;
    name: string;
    company_id: string;
    is_active: number | boolean;
    created_at: Date;
    company_name: string | null;
    stock_count: number | string | null;
  };

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      w.id, w.name, w.company_id, w.is_active, w.created_at,
      c.name AS company_name,
      COALESCE(SUM(cs.quantity), 0) AS stock_count
    FROM warehouses w
    LEFT JOIN companies c ON c.id = w.company_id
    LEFT JOIN current_stock cs ON cs.warehouse_id = w.id
    ${filterSql}
    GROUP BY w.id, w.name, w.company_id, w.is_active, w.created_at, c.name
    ORDER BY w.name ASC
  `;

  return res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      location: "",
      company_id: r.company_id,
      is_active: Boolean(r.is_active),
      created_at: r.created_at,
      company_name: r.company_name || "",
      stock_count: Number(r.stock_count || 0),
    })),
  );
});

adminRouter.post("/warehouses", async (req, res) => {
  const { name, companyId } = req.body as {
    name?: string;
    companyId?: string;
  };

  if (!name?.trim() || !companyId?.trim()) {
    return res.status(400).json({ error: "name and companyId are required" });
  }

  const id = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO warehouses (id, name, company_id, is_active, created_at, updated_at)
    VALUES (${id}, ${name.trim()}, ${companyId.trim()}, 1, NOW(), NOW())
  `;

  return res.status(201).json({
    id,
    name: name.trim(),
    location: "",
    company_id: companyId.trim(),
    is_active: true,
  });
});

adminRouter.put("/warehouses/:id", async (req, res) => {
  const { name, companyId } = req.body as {
    name?: string;
    companyId?: string;
  };

  if (!name?.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  await prisma.$executeRaw`
    UPDATE warehouses
    SET
      name = ${name.trim()},
      company_id = COALESCE(${companyId?.trim() || null}, company_id),
      updated_at = NOW()
    WHERE id = ${req.params.id}
  `;

  return res.json({ success: true });
});

adminRouter.patch("/warehouses/:id/status", async (req, res) => {
  const { isActive } = req.body as { isActive?: boolean };
  if (typeof isActive !== "boolean") {
    return res.status(400).json({ error: "isActive must be boolean" });
  }

  await prisma.$executeRaw`
    UPDATE warehouses
    SET is_active = ${isActive ? 1 : 0}, updated_at = NOW()
    WHERE id = ${req.params.id}
  `;

  return res.json({ success: true });
});

adminRouter.delete("/warehouses/:id", async (req, res) => {
  const id = req.params.id;

  try {
    await prisma.$transaction([
      prisma.$executeRaw`DELETE FROM current_stock WHERE warehouse_id = ${id}`,
      prisma.$executeRaw`DELETE FROM user_warehouse_access WHERE warehouse_id = ${id}`,
      prisma.$executeRaw`DELETE FROM product_warehouse_assignments WHERE warehouse_id = ${id}`,
      prisma.$executeRaw`DELETE FROM warehouses WHERE id = ${id}`,
    ]);

    return res.status(204).send();
  } catch (error: any) {
    const isFkRestrictError = error?.code === "P2010" && String(error?.meta?.code || "") === "1451";
    if (isFkRestrictError) {
      await prisma.$executeRaw`
        UPDATE warehouses
        SET is_active = 0, updated_at = NOW()
        WHERE id = ${id}
      `;
      return res.status(200).json({
        success: true,
        mode: "soft-delete",
        message: "Warehouse has linked records, so it was archived instead of hard deleted.",
      });
    }
    throw error;
  }
});

adminRouter.get("/warehouses/:id/inventory", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  const viewAll = String(req.query.viewAll || "false") === "true";
  const extraFilter = !viewAll && companyId ? Prisma.sql`AND p.company_id = ${companyId}` : Prisma.empty;

  type Row = {
    product_id: string;
    product_name: string | null;
    product_sku: string | null;
    quantity: number | string;
  };

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      cs.product_id,
      p.name AS product_name,
      p.sku AS product_sku,
      cs.quantity
    FROM current_stock cs
    LEFT JOIN products p ON p.id = cs.product_id
    WHERE cs.warehouse_id = ${req.params.id}
      AND cs.quantity > 0
      ${extraFilter}
    ORDER BY cs.quantity DESC
  `;

  return res.json(
    rows.map((r) => ({
      product_id: r.product_id,
      product_name: r.product_name || "Unknown Product",
      product_sku: r.product_sku || "",
      quantity: Number(r.quantity || 0),
    })),
  );
});

adminRouter.post("/companies", async (req: AuthRequest, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const {
    name,
    address,
    contact_number,
    email,
    logo_url,
    is_active,
    is_headquarters,
  } = req.body as {
    name?: string;
    address?: string;
    contact_number?: string;
    email?: string;
    logo_url?: string;
    is_active?: boolean;
    is_headquarters?: boolean;
  };

  if (!name?.trim()) {
    return res.status(400).json({ error: "Company name is required" });
  }

  const company = await prisma.company.create({
    data: {
      name: name.trim(),
      address: address?.trim() || null,
      contactNumber: contact_number?.trim() || null,
      email: email?.trim() || null,
      logoUrl: logo_url?.trim() || null,
      isActive: typeof is_active === "boolean" ? is_active : true,
      isHeadquarters: Boolean(is_headquarters),
    },
  });

  await prisma.userCompanyAccess.upsert({
    where: {
      userId_companyId: {
        userId: req.auth.userId,
        companyId: company.id,
      },
    },
    create: {
      userId: req.auth.userId,
      companyId: company.id,
      role: "admin",
    },
    update: {
      role: "admin",
    },
  });

  return res.status(201).json({
    id: company.id,
    name: company.name,
    address: company.address || "",
    contact_number: company.contactNumber || "",
    email: company.email || "",
    logo_url: company.logoUrl || "",
    is_active: company.isActive,
    is_headquarters: company.isHeadquarters,
    created_at: company.createdAt,
  });
});

adminRouter.put("/companies/:id", async (req, res) => {
  const {
    name,
    address,
    contact_number,
    email,
    logo_url,
    is_active,
    is_headquarters,
  } = req.body as {
    name?: string;
    address?: string;
    contact_number?: string;
    email?: string;
    logo_url?: string;
    is_active?: boolean;
    is_headquarters?: boolean;
  };

  if (!name?.trim()) {
    return res.status(400).json({ error: "Company name is required" });
  }

  const updated = await prisma.company.update({
    where: { id: req.params.id },
    data: {
      name: name.trim(),
      address: address?.trim() || null,
      contactNumber: contact_number?.trim() || null,
      email: email?.trim() || null,
      logoUrl: logo_url?.trim() || null,
      isActive: typeof is_active === "boolean" ? is_active : true,
      isHeadquarters: Boolean(is_headquarters),
    },
  });

  return res.json({
    id: updated.id,
    name: updated.name,
    address: updated.address || "",
    contact_number: updated.contactNumber || "",
    email: updated.email || "",
    logo_url: updated.logoUrl || "",
    is_active: updated.isActive,
    is_headquarters: updated.isHeadquarters,
    created_at: updated.createdAt,
  });
});

adminRouter.delete("/companies/:id", async (req, res) => {
  const companyId = req.params.id;

  await prisma.$transaction(async (tx) => {
    const profiles = await tx.userProfile.findMany({ where: { companyId } });

    await tx.warehouse.deleteMany({ where: { companyId } });
    await tx.userCompanyAccess.deleteMany({ where: { companyId } });

    for (const profile of profiles) {
      const remainingAccess = await tx.userCompanyAccess.findFirst({
        where: { userId: profile.userId },
        orderBy: { id: "asc" },
      });

      if (remainingAccess) {
        await tx.userProfile.update({
          where: { id: profile.id },
          data: { companyId: remainingAccess.companyId },
        });
      } else {
        await tx.userWarehouseAccess.deleteMany({ where: { userId: profile.userId } });
        await tx.userFeaturePermission.deleteMany({ where: { userId: profile.userId } });
        await tx.userProfile.delete({ where: { id: profile.id } });
        await tx.user.delete({ where: { id: profile.userId } });
      }
    }
    await tx.company.delete({ where: { id: companyId } });
  });

  return res.status(204).send();
});

adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true },
    orderBy: { email: "asc" },
  });

  return res.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      user_metadata: { full_name: u.fullName },
    })),
  );
});

adminRouter.get("/users/unassigned", async (_req, res) => {
  const [users, profiles] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, email: true, fullName: true },
      orderBy: { email: "asc" },
    }),
    prisma.userProfile.findMany({
      select: { userId: true },
    }),
  ]);

  const assigned = new Set(profiles.map((p) => p.userId));
  const unassigned = users
    .filter((u) => !assigned.has(u.id))
    .map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.fullName,
    }));

  return res.json(unassigned);
});

adminRouter.get("/employees", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  const active = String(req.query.active || "true") === "true";

  if (!companyId) {
    return res.status(400).json({ error: "companyId is required" });
  }

  const profiles = await prisma.userProfile.findMany({
    where: {
      companyId,
      isActive: active,
    },
    select: {
      id: true,
      userId: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { fullName: "asc" },
  });

  return res.json(profiles.map((p) => ({
    id: p.id,
    user_id: p.userId,
    email: p.email,
    full_name: p.fullName,
    role: p.role,
    is_active: p.isActive,
    created_at: p.createdAt,
  })));
});

adminRouter.get("/employees/:id/access", async (req, res) => {
  const profile = await prisma.userProfile.findUnique({
    where: { id: req.params.id },
    select: { userId: true },
  });

  if (!profile) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const [companyAccess, warehouseAccess, featureAccess] = await Promise.all([
    prisma.userCompanyAccess.findMany({
      where: { userId: profile.userId },
      select: { companyId: true, role: true },
    }),
    prisma.userWarehouseAccess.findMany({
      where: { userId: profile.userId },
      select: { warehouseId: true },
    }),
    prisma.userFeaturePermission.findMany({
      where: { userId: profile.userId },
      select: { featureKey: true },
    }),
  ]);

  return res.json({
    companyAccess: companyAccess.map((c) => ({ company_id: c.companyId, role: c.role })),
    warehouseAccess: warehouseAccess.map((w) => ({ warehouse_id: w.warehouseId })),
    featureAccess: featureAccess.map((f) => ({ feature_key: f.featureKey })),
  });
});

adminRouter.post("/employees", async (req, res) => {
  const {
    email,
    password,
    fullName,
    role,
    companyId,
    companyAccess,
    warehouseAccess,
    featureAccess,
  } = req.body as {
    email?: string;
    password?: string;
    fullName?: string;
    role?: string;
    companyId?: string;
    companyAccess?: Array<{ companyId: string; role?: string }>;
    warehouseAccess?: string[];
    featureAccess?: string[];
  };

  if (!email || !fullName || !companyId) {
    return res.status(400).json({ error: "email, fullName, and companyId are required" });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (existing) {
    return res.status(409).json({ error: "User already exists" });
  }

  const finalRole = role || "agent";
  const passwordHash = await bcrypt.hash(password, 10);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName: fullName.trim(),
        role: finalRole,
        isActive: true,
      },
    });

    await tx.userProfile.create({
      data: {
        userId: user.id,
        companyId,
        email: user.email,
        fullName: fullName.trim(),
        role: finalRole,
        isActive: true,
      },
    });

    const companyRows = (companyAccess || [{ companyId, role: finalRole }]).map((ca) => ({
      userId: user.id,
      companyId: ca.companyId,
      role: ca.role || finalRole,
    }));

    if (companyRows.length > 0) {
      await tx.userCompanyAccess.createMany({ data: companyRows, skipDuplicates: true });
    }

    const warehouseRows = (warehouseAccess || []).map((warehouseId) => ({
      userId: user.id,
      warehouseId,
    }));
    if (warehouseRows.length > 0) {
      await tx.userWarehouseAccess.createMany({ data: warehouseRows, skipDuplicates: true });
    }

    const featureRows = (featureAccess || []).map((featureKey) => ({
      userId: user.id,
      featureKey,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    }));
    if (featureRows.length > 0) {
      await tx.userFeaturePermission.createMany({ data: featureRows, skipDuplicates: true });
    }

    return user;
  });

  return res.status(201).json({ userId: created.id });
});

adminRouter.put("/employees/:id", async (req, res) => {
  const {
    fullName,
    role,
    companyAccess,
    warehouseAccess,
    featureAccess,
  } = req.body as {
    fullName?: string;
    role?: string;
    companyAccess?: Array<{ companyId: string; role?: string }>;
    warehouseAccess?: string[];
    featureAccess?: string[];
  };

  if (!fullName) {
    return res.status(400).json({ error: "fullName is required" });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { id: req.params.id },
    select: { id: true, userId: true },
  });
  if (!profile) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const finalRole = role || "agent";

  await prisma.$transaction(async (tx) => {
    await tx.userProfile.update({
      where: { id: profile.id },
      data: {
        fullName: fullName.trim(),
        role: finalRole,
      },
    });

    await tx.user.update({
      where: { id: profile.userId },
      data: {
        fullName: fullName.trim(),
        role: finalRole,
      },
    });

    await tx.userCompanyAccess.deleteMany({ where: { userId: profile.userId } });
    await tx.userWarehouseAccess.deleteMany({ where: { userId: profile.userId } });
    await tx.userFeaturePermission.deleteMany({ where: { userId: profile.userId } });

    const companyRows = (companyAccess || []).map((ca) => ({
      userId: profile.userId,
      companyId: ca.companyId,
      role: ca.role || finalRole,
    }));
    if (companyRows.length > 0) {
      await tx.userCompanyAccess.createMany({ data: companyRows, skipDuplicates: true });
    }

    const warehouseRows = (warehouseAccess || []).map((warehouseId) => ({
      userId: profile.userId,
      warehouseId,
    }));
    if (warehouseRows.length > 0) {
      await tx.userWarehouseAccess.createMany({ data: warehouseRows, skipDuplicates: true });
    }

    const featureRows = (featureAccess || []).map((featureKey) => ({
      userId: profile.userId,
      featureKey,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    }));
    if (featureRows.length > 0) {
      await tx.userFeaturePermission.createMany({ data: featureRows, skipDuplicates: true });
    }
  });

  return res.json({ success: true });
});

adminRouter.patch("/employees/:id/status", async (req, res) => {
  const { isActive } = req.body as { isActive?: boolean };
  if (typeof isActive !== "boolean") {
    return res.status(400).json({ error: "isActive boolean is required" });
  }

  const profile = await prisma.userProfile.findUnique({
    where: { id: req.params.id },
    select: { id: true, userId: true },
  });
  if (!profile) {
    return res.status(404).json({ error: "Employee not found" });
  }

  await prisma.$transaction([
    prisma.userProfile.update({
      where: { id: profile.id },
      data: { isActive },
    }),
    prisma.user.update({
      where: { id: profile.userId },
      data: { isActive },
    }),
  ]);

  return res.json({ success: true });
});

adminRouter.delete("/employees/:id", async (req, res) => {
  const profile = await prisma.userProfile.findUnique({
    where: { id: req.params.id },
    select: { id: true, userId: true },
  });
  if (!profile) {
    return res.status(404).json({ error: "Employee not found" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.userCompanyAccess.deleteMany({ where: { userId: profile.userId } });
    await tx.userWarehouseAccess.deleteMany({ where: { userId: profile.userId } });
    await tx.userFeaturePermission.deleteMany({ where: { userId: profile.userId } });
    await tx.userProfile.delete({ where: { id: profile.id } });
    await tx.user.delete({ where: { id: profile.userId } });
  });

  return res.status(204).send();
});

adminRouter.get("/categories", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  const viewAll = String(req.query.viewAll || "false") === "true";

  const categories = await prisma.category.findMany({
    where: viewAll ? {} : { companyId },
    orderBy: { name: "asc" },
  });

  return res.json(categories.map((c) => ({
    id: c.id,
    company_id: c.companyId,
    name: c.name,
    description: c.description || "",
    created_at: c.createdAt,
  })));
});

adminRouter.post("/categories", async (req, res) => {
  const { companyId, name, description } = req.body as {
    companyId?: string;
    name?: string;
    description?: string;
  };

  if (!companyId || !name?.trim()) {
    return res.status(400).json({ error: "companyId and name are required" });
  }

  const category = await prisma.category.create({
    data: {
      companyId,
      name: name.trim(),
      description: description?.trim() || null,
    },
  });

  return res.status(201).json({
    id: category.id,
    company_id: category.companyId,
    name: category.name,
    description: category.description || "",
    created_at: category.createdAt,
  });
});

adminRouter.put("/categories/:id", async (req, res) => {
  const { name, description } = req.body as {
    name?: string;
    description?: string;
  };

  if (!name?.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const category = await prisma.category.update({
    where: { id: req.params.id },
    data: {
      name: name.trim(),
      description: description?.trim() || null,
    },
  });

  return res.json({
    id: category.id,
    company_id: category.companyId,
    name: category.name,
    description: category.description || "",
    created_at: category.createdAt,
  });
});

adminRouter.delete("/categories/:id", async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

adminRouter.get("/suppliers", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  const viewAll = String(req.query.viewAll || "false") === "true";

  const suppliers = await prisma.supplier.findMany({
    where: {
      isActive: true,
      ...(viewAll ? {} : { companyId }),
    },
    orderBy: { name: "asc" },
  });

  return res.json(suppliers.map((s) => ({
    id: s.id,
    company_id: s.companyId,
    name: s.name,
    contact_person: s.contactPerson || "",
    email: s.email || "",
    phone: s.phone || "",
    address: s.address || "",
    city: s.city || "",
    notes: s.notes || "",
    is_active: s.isActive,
    created_at: s.createdAt,
  })));
});

adminRouter.post("/suppliers", async (req, res) => {
  const payload = req.body as {
    companyId?: string;
    name?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    notes?: string;
  };

  if (!payload.companyId || !payload.name?.trim()) {
    return res.status(400).json({ error: "companyId and name are required" });
  }

  const supplier = await prisma.supplier.create({
    data: {
      companyId: payload.companyId,
      name: payload.name.trim(),
      contactPerson: payload.contactPerson?.trim() || null,
      email: payload.email?.trim() || null,
      phone: payload.phone?.trim() || null,
      address: payload.address?.trim() || null,
      city: payload.city?.trim() || null,
      notes: payload.notes?.trim() || null,
      isActive: true,
    },
  });

  return res.status(201).json({
    id: supplier.id,
    company_id: supplier.companyId,
    name: supplier.name,
    contact_person: supplier.contactPerson || "",
    email: supplier.email || "",
    phone: supplier.phone || "",
    address: supplier.address || "",
    city: supplier.city || "",
    notes: supplier.notes || "",
    is_active: supplier.isActive,
    created_at: supplier.createdAt,
  });
});

adminRouter.put("/suppliers/:id", async (req, res) => {
  const payload = req.body as {
    name?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    notes?: string;
  };

  if (!payload.name?.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const supplier = await prisma.supplier.update({
    where: { id: req.params.id },
    data: {
      name: payload.name.trim(),
      contactPerson: payload.contactPerson?.trim() || null,
      email: payload.email?.trim() || null,
      phone: payload.phone?.trim() || null,
      address: payload.address?.trim() || null,
      city: payload.city?.trim() || null,
      notes: payload.notes?.trim() || null,
    },
  });

  return res.json({
    id: supplier.id,
    company_id: supplier.companyId,
    name: supplier.name,
    contact_person: supplier.contactPerson || "",
    email: supplier.email || "",
    phone: supplier.phone || "",
    address: supplier.address || "",
    city: supplier.city || "",
    notes: supplier.notes || "",
    is_active: supplier.isActive,
    created_at: supplier.createdAt,
  });
});

adminRouter.patch("/suppliers/:id/status", async (req, res) => {
  const { isActive } = req.body as { isActive?: boolean };
  if (typeof isActive !== "boolean") {
    return res.status(400).json({ error: "isActive boolean is required" });
  }

  await prisma.supplier.update({
    where: { id: req.params.id },
    data: { isActive },
  });
  return res.json({ success: true });
});

adminRouter.get("/units", async (_req, res) => {
  const units = await prisma.unit.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return res.json(units.map((u) => ({
    id: u.id,
    name: u.name,
    abbreviation: u.abbreviation || "",
    created_at: u.createdAt,
  })));
});

adminRouter.post("/units", async (req, res) => {
  const { name, abbreviation } = req.body as { name?: string; abbreviation?: string };
  if (!name?.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const unit = await prisma.unit.create({
    data: {
      name: name.trim(),
      abbreviation: abbreviation?.trim() || null,
      isActive: true,
    },
  });

  return res.status(201).json({
    id: unit.id,
    name: unit.name,
    abbreviation: unit.abbreviation || "",
    created_at: unit.createdAt,
  });
});

adminRouter.put("/units/:id", async (req, res) => {
  const { name, abbreviation } = req.body as { name?: string; abbreviation?: string };
  if (!name?.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const unit = await prisma.unit.update({
    where: { id: req.params.id },
    data: {
      name: name.trim(),
      abbreviation: abbreviation?.trim() || null,
    },
  });

  return res.json({
    id: unit.id,
    name: unit.name,
    abbreviation: unit.abbreviation || "",
    created_at: unit.createdAt,
  });
});

adminRouter.delete("/units/:id", async (req, res) => {
  await prisma.unit.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

adminRouter.get("/banks", async (_req, res) => {
  const banks = await prisma.bank.findMany({
    where: { isActive: true },
    orderBy: { bankName: "asc" },
  });

  return res.json(banks.map((b) => ({
    id: b.id,
    bank_name: b.bankName,
    current_amount: Number(b.currentAmount),
    created_at: b.createdAt,
  })));
});

adminRouter.post("/banks", async (req, res) => {
  const { bankName, currentAmount } = req.body as {
    bankName?: string;
    currentAmount?: number;
  };

  if (!bankName?.trim()) {
    return res.status(400).json({ error: "bankName is required" });
  }

  const bank = await prisma.bank.create({
    data: {
      bankName: bankName.trim(),
      currentAmount: Number(currentAmount || 0),
      isActive: true,
    },
  });

  return res.status(201).json({
    id: bank.id,
    bank_name: bank.bankName,
    current_amount: Number(bank.currentAmount),
    created_at: bank.createdAt,
  });
});

adminRouter.put("/banks/:id", async (req, res) => {
  const { bankName, currentAmount } = req.body as {
    bankName?: string;
    currentAmount?: number;
  };

  if (!bankName?.trim()) {
    return res.status(400).json({ error: "bankName is required" });
  }

  const bank = await prisma.bank.update({
    where: { id: req.params.id },
    data: {
      bankName: bankName.trim(),
      currentAmount: Number(currentAmount || 0),
    },
  });

  return res.json({
    id: bank.id,
    bank_name: bank.bankName,
    current_amount: Number(bank.currentAmount),
    created_at: bank.createdAt,
  });
});

adminRouter.delete("/banks/:id", async (req, res) => {
  await prisma.bank.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

adminRouter.get("/transaction-settings", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  if (!companyId) {
    return res.status(400).json({ error: "companyId is required" });
  }

  const setting = await prisma.transactionSetting.findUnique({
    where: { companyId },
  });

  if (!setting) {
    return res.json(null);
  }

  return res.json({
    id: setting.id,
    company_id: setting.companyId,
    prefix: setting.prefix,
    current_counter: setting.currentCounter,
    updated_at: setting.updatedAt,
  });
});

adminRouter.post("/transaction-settings", async (req, res) => {
  const { companyId, prefix, currentCounter } = req.body as {
    companyId?: string;
    prefix?: string;
    currentCounter?: number;
  };
  if (!companyId) {
    return res.status(400).json({ error: "companyId is required" });
  }

  const setting = await prisma.transactionSetting.upsert({
    where: { companyId },
    create: {
      companyId,
      prefix: (prefix || "ADDR").toUpperCase(),
      currentCounter: Number(currentCounter || 700),
    },
    update: {
      prefix: (prefix || "ADDR").toUpperCase(),
      currentCounter: Number(currentCounter || 700),
    },
  });

  return res.json({
    id: setting.id,
    company_id: setting.companyId,
    prefix: setting.prefix,
    current_counter: setting.currentCounter,
    updated_at: setting.updatedAt,
  });
});

adminRouter.get("/expenses", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  const viewAll = String(req.query.viewAll || "false") === "true";
  const filterSql = !viewAll && companyId ? Prisma.sql`WHERE e.company_id = ${companyId}` : Prisma.empty;

  type ExpenseRow = {
    id: string;
    company_id: string;
    category: string;
    amount: number | string;
    description: string | null;
    expense_date: Date;
    created_at: Date;
    created_by: string | null;
  };

  const rows = await prisma.$queryRaw<ExpenseRow[]>`
    SELECT
      e.id,
      e.company_id,
      e.title AS category,
      e.amount,
      e.description,
      e.expense_date,
      e.created_at,
      e.created_by
    FROM expenses e
    ${filterSql}
    ORDER BY e.expense_date DESC
    LIMIT 200
  `;

  return res.json(
    rows.map((e) => ({
      id: e.id,
      company_id: e.company_id,
      category: e.category || "Other",
      amount: Number(e.amount || 0),
      description: e.description || "",
      expense_date: new Date(e.expense_date).toISOString().slice(0, 10),
      created_at: e.created_at,
      created_by: e.created_by || "",
    })),
  );
});

adminRouter.post("/expenses", async (req: AuthRequest, res) => {
  const { companyId, category, amount, description, expense_date } = req.body as {
    companyId?: string;
    category?: string;
    amount?: number;
    description?: string;
    expense_date?: string;
  };

  if (!companyId || !category?.trim() || !expense_date) {
    return res.status(400).json({ error: "companyId, category, and expense_date are required" });
  }

  const id = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO expenses (id, company_id, title, description, amount, expense_date, created_by, created_at, updated_at)
    VALUES (
      ${id},
      ${companyId},
      ${category.trim()},
      ${description?.trim() || null},
      ${Number(amount || 0)},
      ${expense_date},
      ${req.auth?.userId || null},
      NOW(),
      NOW()
    )
  `;

  return res.status(201).json({
    id,
    company_id: companyId,
    category: category.trim(),
    amount: Number(amount || 0),
    description: description?.trim() || "",
    expense_date,
    created_at: new Date().toISOString(),
    created_by: req.auth?.userId || "",
  });
});

adminRouter.put("/expenses/:id", async (req, res) => {
  const { category, amount, description, expense_date } = req.body as {
    category?: string;
    amount?: number;
    description?: string;
    expense_date?: string;
  };

  if (!category?.trim() || !expense_date) {
    return res.status(400).json({ error: "category and expense_date are required" });
  }

  await prisma.$executeRaw`
    UPDATE expenses
    SET
      title = ${category.trim()},
      description = ${description?.trim() || null},
      amount = ${Number(amount || 0)},
      expense_date = ${expense_date},
      updated_at = NOW()
    WHERE id = ${req.params.id}
  `;

  return res.json({
    id: req.params.id,
    category: category.trim(),
    amount: Number(amount || 0),
    description: description?.trim() || "",
    expense_date,
  });
});

adminRouter.delete("/expenses/:id", async (req, res) => {
  await prisma.$executeRaw`DELETE FROM expenses WHERE id = ${req.params.id}`;
  return res.status(204).send();
});

adminRouter.get("/account-titles", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  if (!companyId) {
    return res.status(400).json({ error: "companyId is required" });
  }

  type AccountTitleRow = {
    id: string;
    company_id: string | null;
    code: string | null;
    title: string;
    created_at: Date;
  };

  const rows = await prisma.$queryRaw<AccountTitleRow[]>`
    SELECT id, company_id, code, title, created_at
    FROM account_titles
    WHERE company_id = ${companyId} AND is_active = 1
    ORDER BY title ASC
  `;

  return res.json(
    rows.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      code: row.code || "",
      title: row.title,
      category: row.code?.includes("-") ? row.code.split("-")[0] : "GENERAL",
      created_at: row.created_at,
    })),
  );
});

adminRouter.post("/account-titles", async (req, res) => {
  const { companyId, code, title, category } = req.body as {
    companyId?: string;
    code?: string;
    title?: string;
    category?: string;
  };

  if (!companyId || !title?.trim()) {
    return res.status(400).json({ error: "companyId and title are required" });
  }

  const id = crypto.randomUUID();
  const finalCode = code?.trim() ? code.trim().toUpperCase() : category?.trim() || null;

  await prisma.$executeRaw`
    INSERT INTO account_titles (id, company_id, code, title, is_active, created_at, updated_at)
    VALUES (${id}, ${companyId}, ${finalCode}, ${title.trim()}, 1, NOW(), NOW())
  `;

  return res.status(201).json({
    id,
    company_id: companyId,
    code: finalCode || "",
    title: title.trim(),
    category: finalCode?.includes("-") ? finalCode.split("-")[0] : "GENERAL",
    created_at: new Date().toISOString(),
  });
});

adminRouter.put("/account-titles/:id", async (req, res) => {
  const { code, title, category } = req.body as {
    code?: string;
    title?: string;
    category?: string;
  };

  if (!title?.trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  const finalCode = code?.trim() ? code.trim().toUpperCase() : category?.trim() || null;

  await prisma.$executeRaw`
    UPDATE account_titles
    SET code = ${finalCode}, title = ${title.trim()}, updated_at = NOW()
    WHERE id = ${req.params.id}
  `;

  return res.json({
    id: req.params.id,
    code: finalCode || "",
    title: title.trim(),
    category: finalCode?.includes("-") ? finalCode.split("-")[0] : "GENERAL",
  });
});

adminRouter.delete("/account-titles/:id", async (req, res) => {
  await prisma.$executeRaw`DELETE FROM account_titles WHERE id = ${req.params.id}`;
  return res.status(204).send();
});

adminRouter.get("/disbursement-vouchers/stats", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  const viewAll = String(req.query.viewAll || "false") === "true";
  const filterSql = !viewAll && companyId ? Prisma.sql`WHERE company_id = ${companyId}` : Prisma.empty;

  type StatsRow = { totalDisbursements: bigint | number; totalAmount: number | string | null };
  const rows = await prisma.$queryRaw<StatsRow[]>`
    SELECT COUNT(*) AS totalDisbursements, COALESCE(SUM(amount), 0) AS totalAmount
    FROM disbursement_vouchers
    ${filterSql}
  `;
  const row = rows[0];

  return res.json({
    totalDisbursements: Number(row?.totalDisbursements || 0),
    totalAmount: Number(row?.totalAmount || 0),
  });
});

adminRouter.get("/disbursement-vouchers", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  const viewAll = String(req.query.viewAll || "false") === "true";
  const filterSql = !viewAll && companyId ? Prisma.sql`WHERE dv.company_id = ${companyId}` : Prisma.empty;

  type VoucherRow = {
    id: string;
    company_id: string;
    company_name: string | null;
    voucher_no: string | null;
    date: Date;
    payee: string;
    particulars: string | null;
    amount: number | string;
    account_title: string | null;
    account_title_id: string | null;
    bank: string | null;
    bank_id: string | null;
    created_at: Date;
  };

  const rows = await prisma.$queryRaw<VoucherRow[]>`
    SELECT
      dv.id,
      dv.company_id,
      c.name AS company_name,
      dv.voucher_number AS voucher_no,
      dv.date,
      dv.payee,
      dv.particulars,
      dv.amount,
      at.title AS account_title,
      dv.account_title_id,
      b.bank_name AS bank,
      dv.bank_id,
      dv.created_at
    FROM disbursement_vouchers dv
    LEFT JOIN companies c ON c.id = dv.company_id
    LEFT JOIN account_titles at ON at.id = dv.account_title_id
    LEFT JOIN banks b ON b.id = dv.bank_id
    ${filterSql}
    ORDER BY dv.created_at DESC
  `;

  return res.json(
    rows.map((row) => ({
      id: row.id,
      company_id: row.company_id,
      company_name: row.company_name || "N/A",
      voucher_no: row.voucher_no || "",
      date: new Date(row.date).toISOString().slice(0, 10),
      payee: row.payee,
      particulars: row.particulars || "",
      amount: Number(row.amount || 0),
      account_title: row.account_title || "",
      account_title_id: row.account_title_id || "",
      bank: row.bank || "",
      bank_id: row.bank_id || "",
      check_no: "",
      amount_in_words: "",
      line_items: [],
      debit_amount: Number(row.amount || 0),
      credit_amount: Number(row.amount || 0),
      created_at: row.created_at,
    })),
  );
});

adminRouter.post("/disbursement-vouchers", async (req: AuthRequest, res) => {
  const payload = req.body as {
    companyId?: string;
    payee?: string;
    voucherNo?: string;
    date?: string;
    particulars?: string;
    amount?: number;
    accountTitleId?: string;
    bankId?: string;
    bank?: string;
    debitAmount?: number;
  };

  if (!payload.companyId || !payload.payee?.trim() || !payload.date) {
    return res.status(400).json({ error: "companyId, payee, and date are required" });
  }

  const payee = payload.payee.trim();
  const parsedAmount = Number(payload.amount || 0);
  const disbursementAmount = Number(payload.debitAmount || payload.amount || 0);

  try {
    const created = await prisma.$transaction(async (tx) => {
      let resolvedBankId = payload.bankId || null;
      if (!resolvedBankId && payload.bank?.trim()) {
        const bankRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM banks WHERE bank_name = ${payload.bank.trim()} LIMIT 1
        `;
        resolvedBankId = bankRows[0]?.id || null;
      }

      if (resolvedBankId) {
        const bankRows = await tx.$queryRaw<Array<{ id: string; current_amount: number | string }>>`
          SELECT id, current_amount FROM banks WHERE id = ${resolvedBankId} LIMIT 1
        `;
        const bank = bankRows[0];
        if (!bank) {
          throw new Error("Selected bank not found");
        }

        const balance = Number(bank.current_amount || 0);
        if (disbursementAmount > balance) {
          throw new Error(
            `Insufficient bank balance. Available: ${balance.toFixed(2)}, requested: ${disbursementAmount.toFixed(2)}`,
          );
        }

        await tx.$executeRaw`
          UPDATE banks SET current_amount = ${balance - disbursementAmount}, updated_at = NOW() WHERE id = ${bank.id}
        `;
      }

      const id = crypto.randomUUID();
      await tx.$executeRaw`
        INSERT INTO disbursement_vouchers (
          id, company_id, account_title_id, bank_id, voucher_number, payee, particulars, amount, date, status, created_by, created_at, updated_at
        ) VALUES (
          ${id},
          ${payload.companyId},
          ${payload.accountTitleId || null},
          ${resolvedBankId},
          ${payload.voucherNo?.trim() || null},
          ${payee},
          ${payload.particulars?.trim() || null},
          ${parsedAmount},
          ${payload.date},
          ${"draft"},
          ${req.auth?.userId || null},
          NOW(),
          NOW()
        )
      `;

      return { id, bankId: resolvedBankId };
    });

    return res.status(201).json({
      id: created.id,
      company_id: payload.companyId,
      voucher_no: payload.voucherNo?.trim() || "",
      date: payload.date,
      payee,
      particulars: payload.particulars?.trim() || "",
      amount: parsedAmount,
      account_title_id: payload.accountTitleId || "",
      bank_id: created.bankId || "",
      bank: payload.bank || "",
      check_no: "",
      amount_in_words: "",
      line_items: [],
      debit_amount: parsedAmount,
      credit_amount: parsedAmount,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create voucher" });
  }
});

adminRouter.put("/disbursement-vouchers/:id", async (req, res) => {
  const payload = req.body as {
    payee?: string;
    voucherNo?: string;
    date?: string;
    particulars?: string;
    amount?: number;
    accountTitleId?: string;
    bankId?: string;
    bank?: string;
  };

  if (!payload.payee?.trim() || !payload.date) {
    return res.status(400).json({ error: "payee and date are required" });
  }

  let resolvedBankId = payload.bankId || null;
  if (!resolvedBankId && payload.bank?.trim()) {
    const bankRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM banks WHERE bank_name = ${payload.bank.trim()} LIMIT 1
    `;
    resolvedBankId = bankRows[0]?.id || null;
  }

  await prisma.$executeRaw`
    UPDATE disbursement_vouchers
    SET
      payee = ${payload.payee.trim()},
      voucher_number = ${payload.voucherNo?.trim() || null},
      date = ${payload.date},
      particulars = ${payload.particulars?.trim() || null},
      amount = ${Number(payload.amount || 0)},
      account_title_id = ${payload.accountTitleId || null},
      bank_id = ${resolvedBankId},
      updated_at = NOW()
    WHERE id = ${req.params.id}
  `;

  return res.json({
    id: req.params.id,
    voucher_no: payload.voucherNo?.trim() || "",
    date: payload.date,
    payee: payload.payee.trim(),
    particulars: payload.particulars?.trim() || "",
    amount: Number(payload.amount || 0),
    account_title_id: payload.accountTitleId || "",
    bank_id: resolvedBankId || "",
    bank: payload.bank || "",
    check_no: "",
    amount_in_words: "",
    line_items: [],
    debit_amount: Number(payload.amount || 0),
    credit_amount: Number(payload.amount || 0),
  });
});

adminRouter.delete("/disbursement-vouchers/:id", async (req, res) => {
  await prisma.$executeRaw`DELETE FROM disbursement_vouchers WHERE id = ${req.params.id}`;
  return res.status(204).send();
});

adminRouter.get("/accounting/summary", async (req, res) => {
  const companyId = String(req.query.companyId || "");
  const viewAll = String(req.query.viewAll || "false") === "true";
  const dateFrom = String(req.query.dateFrom || "");
  const dateTo = String(req.query.dateTo || "");

  if (!dateFrom || !dateTo) {
    return res.status(400).json({ error: "dateFrom and dateTo are required" });
  }

  const fromDateTime = `${dateFrom} 00:00:00`;
  const toDateTime = `${dateTo} 23:59:59`;
  const filterSql = !viewAll && companyId ? Prisma.sql` AND t.company_id = ${companyId}` : Prisma.empty;
  const voucherFilterSql = !viewAll && companyId ? Prisma.sql` AND dv.company_id = ${companyId}` : Prisma.empty;
  const expenseFilterSql = !viewAll && companyId ? Prisma.sql` AND e.company_id = ${companyId}` : Prisma.empty;

  type TxRow = {
    transaction_id: string;
    created_at: Date;
    total_amount: number | string;
    agent_price: number | string | null;
    payment_method: string | null;
    delivery_agent_name: string | null;
    company_id: string;
    company_name: string | null;
    quantity: number | string | null;
    total_price: number | string | null;
    cost_price: number | string | null;
    category_name: string | null;
  };

  type ExpenseRow = {
    category: string | null;
    amount: number | string;
  };

  type VoucherRow = {
    id: string;
    voucher_no: string | null;
    date: Date;
    payee: string;
    amount: number | string;
    particulars: string | null;
    company_id: string;
  };

  type AgentSaleRow = {
    agent_id: string;
    agent_name: string;
    company_id: string;
    company_name: string;
    total_sales: number | string;
    transaction_count: bigint | number;
    total_commission: number | string;
  };

  const [txRows, expenseRows, voucherRows, agentSalesRows, companies] = await Promise.all([
    prisma.$queryRaw<TxRow[]>`
      SELECT
        t.id AS transaction_id,
        t.created_at,
        t.total_amount,
        t.agent_price,
        t.payment_method,
        t.delivery_agent_name,
        t.company_id,
        c.name AS company_name,
        i.quantity,
        i.total_price,
        p.cost_price,
        cat.name AS category_name
      FROM pos_transactions t
      LEFT JOIN companies c ON c.id = t.company_id
      LEFT JOIN pos_transaction_items i ON i.transaction_id = t.id
      LEFT JOIN products p ON p.id = i.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      WHERE t.created_at BETWEEN ${fromDateTime} AND ${toDateTime}
      ${filterSql}
      ORDER BY t.created_at ASC
    `,
    prisma.$queryRaw<ExpenseRow[]>`
      SELECT e.title AS category, e.amount
      FROM expenses e
      WHERE e.expense_date BETWEEN ${dateFrom} AND ${dateTo}
      ${expenseFilterSql}
    `,
    prisma.$queryRaw<VoucherRow[]>`
      SELECT
        dv.id,
        dv.voucher_number AS voucher_no,
        dv.date,
        dv.payee,
        dv.amount,
        dv.particulars,
        dv.company_id
      FROM disbursement_vouchers dv
      WHERE dv.created_at BETWEEN ${fromDateTime} AND ${toDateTime}
      ${voucherFilterSql}
      ORDER BY dv.date DESC
    `,
    prisma.$queryRaw<AgentSaleRow[]>`
      SELECT
        COALESCE(t.delivery_agent_name, 'Unknown Agent') AS agent_id,
        COALESCE(t.delivery_agent_name, 'Unknown Agent') AS agent_name,
        t.company_id,
        COALESCE(c.name, 'Unknown') AS company_name,
        SUM(t.total_amount) AS total_sales,
        COUNT(*) AS transaction_count,
        SUM(COALESCE(t.agent_price, 0)) AS total_commission
      FROM pos_transactions t
      LEFT JOIN companies c ON c.id = t.company_id
      WHERE t.created_at BETWEEN ${fromDateTime} AND ${toDateTime}
      ${filterSql}
      GROUP BY COALESCE(t.delivery_agent_name, 'Unknown Agent'), t.company_id, COALESCE(c.name, 'Unknown')
      ORDER BY total_sales DESC
    `,
    prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const txMap = new Map<
    string,
    {
      created_at: Date;
      total_amount: number;
      agent_price: number;
      payment_method: string;
      items: Array<{ quantity: number; total_price: number; cost_price: number; category_name: string }>;
    }
  >();

  for (const row of txRows) {
    if (!txMap.has(row.transaction_id)) {
      txMap.set(row.transaction_id, {
        created_at: new Date(row.created_at),
        total_amount: Number(row.total_amount || 0),
        agent_price: Number(row.agent_price || 0),
        payment_method: row.payment_method || "unknown",
        items: [],
      });
    }

    if (row.quantity !== null || row.total_price !== null || row.cost_price !== null) {
      txMap.get(row.transaction_id)?.items.push({
        quantity: Number(row.quantity || 0),
        total_price: Number(row.total_price || 0),
        cost_price: Number(row.cost_price || 0),
        category_name: row.category_name || "Uncategorized",
      });
    }
  }

  let totalRevenue = 0;
  let totalCOGS = 0;
  let totalCommission = 0;
  const categoryRevenue = new Map<string, { revenue: number; quantity: number }>();
  const paymentMethodData = new Map<string, { total: number; count: number }>();
  const dailySales = new Map<string, { unitPrice: number; commission: number; transactions: number }>();

  for (const [, txn] of txMap) {
    totalRevenue += txn.total_amount;
    totalCommission += txn.agent_price;

    const txDate = txn.created_at.toISOString().slice(0, 10);
    const day = dailySales.get(txDate) || { unitPrice: 0, commission: 0, transactions: 0 };
    day.unitPrice += txn.total_amount - txn.agent_price;
    day.commission += txn.agent_price;
    day.transactions += 1;
    dailySales.set(txDate, day);

    const payment = paymentMethodData.get(txn.payment_method) || { total: 0, count: 0 };
    payment.total += txn.total_amount;
    payment.count += 1;
    paymentMethodData.set(txn.payment_method, payment);

    for (const item of txn.items) {
      totalCOGS += item.cost_price * item.quantity;
      const current = categoryRevenue.get(item.category_name) || { revenue: 0, quantity: 0 };
      current.revenue += item.total_price;
      current.quantity += item.quantity;
      categoryRevenue.set(item.category_name, current);
    }
  }

  const expensesByCategory = new Map<string, { amount: number; count: number }>();
  const regularExpenses = expenseRows.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  for (const exp of expenseRows) {
    const cat = exp.category || "Uncategorized";
    const current = expensesByCategory.get(cat) || { amount: 0, count: 0 };
    current.amount += Number(exp.amount || 0);
    current.count += 1;
    expensesByCategory.set(cat, current);
  }

  const voucherExpenses = voucherRows.reduce((sum, v) => sum + Number(v.amount || 0), 0);
  if (voucherExpenses > 0) {
    const current = expensesByCategory.get("Disbursement Vouchers") || { amount: 0, count: 0 };
    current.amount += voucherExpenses;
    current.count += voucherRows.length;
    expensesByCategory.set("Disbursement Vouchers", current);
  }

  const totalExpenses = regularExpenses + voucherExpenses;
  const unitPriceSales = totalRevenue - totalCommission;
  const grossProfit = unitPriceSales - totalCOGS;
  const netProfit = grossProfit - totalExpenses;
  const grossMargin = unitPriceSales > 0 ? (grossProfit / unitPriceSales) * 100 : 0;
  const netMargin = unitPriceSales > 0 ? (netProfit / unitPriceSales) * 100 : 0;

  return res.json({
    summary: {
      totalRevenue,
      totalExpenses,
      totalCOGS,
      netProfit,
      grossProfit,
      grossMargin,
      netMargin,
      transactionCount: txMap.size,
      totalCommission,
    },
    revenueByCategory: Array.from(categoryRevenue.entries())
      .map(([category, data]) => ({
        category,
        revenue: data.revenue,
        quantity: data.quantity,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    expenseByCategory: Array.from(expensesByCategory.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
      }))
      .sort((a, b) => b.amount - a.amount),
    paymentMethods: Array.from(paymentMethodData.entries())
      .map(([method, data]) => ({
        method,
        total: data.total,
        count: data.count,
      }))
      .sort((a, b) => b.total - a.total),
    salesData: Array.from(dailySales.entries())
      .map(([date, data]) => ({
        date,
        unitPrice: data.unitPrice,
        commission: data.commission,
        transactions: data.transactions,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    salesByAgent: agentSalesRows.map((row) => ({
      agent_id: row.agent_id,
      agent_name: row.agent_name,
      company_id: row.company_id,
      company_name: row.company_name,
      total_sales: Number(row.total_sales || 0),
      transaction_count: Number(row.transaction_count || 0),
      total_commission: Number(row.total_commission || 0),
    })),
    companies: companies.map((c) => ({ id: c.id, name: c.name })),
    disbursementVouchers: voucherRows.map((v) => ({
      id: v.id,
      voucher_no: v.voucher_no || "",
      date: new Date(v.date).toISOString().slice(0, 10),
      payee: v.payee,
      amount: Number(v.amount || 0),
      particulars: v.particulars || "",
      company_id: v.company_id,
    })),
  });
});

export default adminRouter;
