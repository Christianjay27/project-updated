# Inventory API Server (MySQL Scaffold)

## 1) Setup

1. Copy `.env.example` to `.env`
2. Fill values (`DATABASE_URL`, `JWT_SECRET`)
3. Install deps:
   - `npm install`
4. Generate Prisma client:
   - `npm run prisma:generate`
5. Start dev server:
   - `npm run dev`

## 2) Available routes

- `GET /` basic server status
- `GET /health` health check
- `POST /auth/login` placeholder
- `POST /auth/logout` placeholder
- `GET /auth/me` reads JWT claims
- `POST /auth/refresh` placeholder
- `POST /auth/change-password` placeholder

## 3) Next implementation tasks

- Implement login/logout/refresh with hashed password checks.
- Port Supabase user/profile/access tables to Prisma models.
- Build employee/admin/POS endpoints and connect frontend `src/lib/api.ts`.
