import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";

const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const accessToken = jwt.sign(
    {
      email: user.email,
      role: user.role,
    },
    env.jwtSecret,
    {
      subject: user.id,
      expiresIn: "12h",
    },
  );

  return res.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
    },
  });
});

authRouter.post("/logout", (_req, res) => {
  res.status(204).send();
});

authRouter.get("/me", requireAuth, (req: AuthRequest, res) => {
  res.json({
    userId: req.auth?.userId ?? null,
    claims: req.auth ?? null,
  });
});

authRouter.post("/refresh", requireAuth, async (req: AuthRequest, res) => {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const accessToken = jwt.sign(
    {
      email: user.email,
      role: user.role,
    },
    env.jwtSecret,
    {
      subject: user.id,
      expiresIn: "12h",
    },
  );

  return res.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
    },
  });
});

authRouter.post("/change-password", requireAuth, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!req.auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return res.json({ success: true });
});

authRouter.post("/register", async (req, res) => {
  const { email, password, fullName, companyId, role } = req.body as {
    email?: string;
    password?: string;
    fullName?: string;
    companyId?: string;
    role?: "admin" | "agent";
  };

  if (!email || !password || !fullName || !companyId) {
    return res.status(400).json({ error: "Email, password, full name, and company ID are required" });
  }

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (existing) {
    return res.status(409).json({ error: "Email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const finalRole = role || "agent";

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

    await tx.userCompanyAccess.create({
      data: {
        userId: user.id,
        companyId,
        role: finalRole,
      },
    });

    return user;
  });

  const accessToken = jwt.sign(
    {
      email: created.email,
      role: created.role,
    },
    env.jwtSecret,
    {
      subject: created.id,
      expiresIn: "12h",
    },
  );

  return res.status(201).json({
    accessToken,
    user: {
      id: created.id,
      email: created.email,
    },
  });
});

export default authRouter;
