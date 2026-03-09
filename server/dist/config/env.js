import { config } from "dotenv";
config();
function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}
export const env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: Number(process.env.PORT ?? 4000),
    databaseUrl: required("DATABASE_URL"),
    jwtSecret: required("JWT_SECRET"),
    googleCloudApiKey: process.env.GOOGLE_CLOUD_API_KEY ?? "",
    corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
};
