import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
const setupRouter = Router();
setupRouter.post("/create-admin", async (req, res) => {
    const { email, password, fullName } = req.body;
    if (!email || !password || !fullName) {
        return res.status(400).json({ error: "Email, password, and full name are required" });
    }
    const company = await prisma.company.findFirst({
        where: { isActive: true },
        select: { id: true },
    });
    if (!company) {
        return res.status(400).json({ error: "No company found. Create a company first." });
    }
    const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
    });
    if (existing) {
        return res.status(409).json({ error: "Email already exists" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
            data: {
                email: email.toLowerCase().trim(),
                passwordHash,
                fullName: fullName.trim(),
                role: "admin",
                isActive: true,
            },
        });
        await tx.userProfile.create({
            data: {
                userId: createdUser.id,
                companyId: company.id,
                email: createdUser.email,
                fullName: fullName.trim(),
                role: "admin",
                isActive: true,
            },
        });
        await tx.userCompanyAccess.create({
            data: {
                userId: createdUser.id,
                companyId: company.id,
                role: "admin",
            },
        });
        return createdUser;
    });
    const accessToken = jwt.sign({
        email: user.email,
        role: user.role,
    }, env.jwtSecret, {
        subject: user.id,
        expiresIn: "12h",
    });
    return res.status(201).json({
        success: true,
        accessToken,
        user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
        },
    });
});
export default setupRouter;
