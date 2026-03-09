import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import adminRouter from "./routes/admin.js";
import authRouter from "./routes/auth.js";
import healthRouter from "./routes/health.js";
import opsRouter from "./routes/ops.js";
import setupRouter from "./routes/setup.js";
import usersRouter from "./routes/users.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        // Non-browser requests (curl, server-to-server)
        return callback(null, true);
      }

      const isConfigured = env.corsOrigins.includes(origin);
      const isLocalDev =
        env.nodeEnv !== "production" &&
        (/^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin));

      if (isConfigured || isLocalDev) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    message: "Inventory API server is running",
  });
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/setup", setupRouter);
app.use("/admin", adminRouter);
app.use("/ops", opsRouter);

app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.path,
  });
});

app.listen(env.port, () => {
  // Keep startup log concise for local development
  console.log(`API server listening on http://localhost:${env.port}`);
});
