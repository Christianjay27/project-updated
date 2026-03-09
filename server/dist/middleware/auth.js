import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
export function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing bearer token" });
    }
    const token = header.slice("Bearer ".length);
    try {
        const payload = jwt.verify(token, env.jwtSecret);
        if (typeof payload === "string" || !payload.sub) {
            return res.status(401).json({ error: "Invalid token payload" });
        }
        req.auth = { ...payload, userId: payload.sub };
        return next();
    }
    catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
