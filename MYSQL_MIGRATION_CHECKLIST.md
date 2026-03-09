# MySQL Migration Checklist (From Supabase)

This project is currently frontend-heavy and directly calls Supabase from React components/pages.
To move to MySQL, you need a separate backend API (the browser should not connect directly to MySQL).

## 1) Current Supabase Coupling (What Must Be Replaced)

### Core client and env
- `src/lib/supabase.ts`
- `src/vite-env.d.ts` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- `package.json` (`@supabase/supabase-js`)

### Auth/session and access control
- `src/contexts/AuthContext.tsx`
- `src/components/ChangePasswordModal.tsx`
- `src/pages/Login.tsx` (UI text still says Supabase auth)

### Supabase Edge Function calls from frontend
- `src/pages/Employees.tsx`
  - `get-all-users`
  - `create-employee`
  - `update-employee`
- `src/pages/POS.tsx`
  - `create-pos-transaction`
  - `process-product-image`
- `src/pages/Inventory.tsx`
  - `process-identifier-image`
- `src/pages/Products.tsx`
  - `process-product-image`

### Supabase functions currently used
- `supabase/functions/create-admin/index.ts`
- `supabase/functions/create-employee/index.ts`
- `supabase/functions/update-employee/index.ts`
- `supabase/functions/get-all-users/index.ts`
- `supabase/functions/create-pos-transaction/index.ts`
- `supabase/functions/process-product-image/index.ts`
- `supabase/functions/process-identifier-image/index.ts`

### RPCs currently used in frontend
- `get_own_profile`
- `get_employee_companies`
- `get_employee_warehouses`
- `get_employee_features`

### Tables directly used in frontend
- `account_titles`
- `banks`
- `categories`
- `companies`
- `current_stock`
- `disbursement_vouchers`
- `expenses`
- `inventory_movements`
- `landed_costs`
- `pos_transaction_items`
- `pos_transactions`
- `product_company_assignments`
- `product_identifiers`
- `product_variants`
- `product_warehouse_assignments`
- `products`
- `purchase_order_items`
- `purchase_order_landing_costs`
- `purchase_orders`
- `stock_transfers`
- `suppliers`
- `transaction_settings`
- `units`
- `user_company_access`
- `user_feature_permissions`
- `user_profiles`
- `user_warehouse_access`
- `vouchers`
- `warehouse_company_access`
- `warehouses`

## 2) Recommended Target Stack

- Backend: Node.js + Express (or NestJS)
- ORM/query layer: Prisma (recommended) or Knex
- DB: MySQL 8+
- Auth: JWT + refresh token (or external provider like Auth0/Clerk)
- Validation: Zod / class-validator
- Password hashing: bcrypt

## 3) Migration Order (Execution Plan)

1. Build backend skeleton and MySQL connection.
2. Port schema from `supabase/migrations/*.sql` into MySQL migrations.
3. Implement auth endpoints and middleware (replace Supabase Auth usage).
4. Implement employee/admin endpoints (replace edge functions + RPCs).
5. Implement POS transactional endpoint (replacement for `create-pos-transaction`).
6. Implement CRUD endpoints for master data (products, warehouses, suppliers, etc.).
7. Switch frontend from Supabase client calls to backend API service methods.
8. Remove Supabase dependencies/env vars and retest all flows.

## 4) File-by-File Frontend Refactor Checklist

### Phase A: Foundation
- [ ] Create `src/lib/api.ts` for centralized HTTP client (`fetch` wrapper + auth token).
- [ ] Replace usage of `src/lib/supabase.ts` incrementally.
- [ ] Update `src/vite-env.d.ts` to include `VITE_API_BASE_URL` and remove Supabase vars later.

### Phase B: Auth and session (highest priority)
- [ ] `src/contexts/AuthContext.tsx`
  - Replace `supabase.auth.*` with API endpoints:
    - `POST /auth/login`
    - `POST /auth/logout`
    - `GET /auth/me`
    - `POST /auth/refresh`
  - Replace RPC `get_own_profile` with backend `GET /users/me/profile`.
  - Replace direct table reads for company/warehouse/feature access with:
    - `GET /users/me/companies`
    - `GET /users/me/warehouses`
    - `GET /users/me/features`
- [ ] `src/components/ChangePasswordModal.tsx`
  - Replace `supabase.auth.signInWithPassword` + `updateUser` with `POST /auth/change-password`.
- [ ] `src/pages/Login.tsx`
  - Update auth branding text; no Supabase reference after migration.

### Phase C: Employee/admin and setup flows
- [ ] `src/pages/Employees.tsx`
  - Replace current function calls with:
    - `GET /admin/users`
    - `POST /admin/employees`
    - `PUT /admin/employees/:id`
  - Replace RPC calls (`get_employee_*`) with:
    - `GET /admin/employees/:id/access`
- [ ] If admin bootstrap is needed in UI, add/restore endpoint usage for:
  - `POST /setup/create-admin`

### Phase D: Domain pages/components
- [ ] `src/pages/Products.tsx` -> replace all `supabase.from(...)` calls with products/inventory endpoints.
- [ ] `src/pages/POS.tsx` -> replace transactional and stock update calls with backend POS endpoint.
- [ ] `src/pages/PurchaseOrders.tsx` -> replace PO + receiving + stock movement writes.
- [ ] `src/pages/Inventory.tsx` -> replace stock/movement/identifier access.
- [ ] `src/pages/Transactions.tsx` -> replace transaction + item queries.
- [ ] `src/pages/Dashboard.tsx` -> replace aggregate queries with dedicated dashboard endpoints.
- [ ] `src/pages/Settings.tsx` -> replace settings/banks operations.
- [ ] `src/pages/Companies.tsx` -> replace company CRUD + access logic.
- [ ] `src/pages/Categories.tsx` -> replace category CRUD.
- [ ] `src/pages/Suppliers.tsx` -> replace supplier CRUD.
- [ ] `src/pages/Units.tsx` -> replace unit CRUD.
- [ ] `src/pages/Warehouses.tsx` -> replace warehouse CRUD + access checks.
- [ ] `src/pages/Expenses.tsx` -> replace expenses CRUD.
- [ ] `src/pages/Vouchers.tsx` -> replace account title/voucher data calls.
- [ ] `src/pages/Accounting.tsx` -> replace accounting summary queries.
- [ ] `src/components/DeliveryReceipt.tsx` -> replace transaction detail joins.
- [ ] `src/components/DisbursementVoucher.tsx` -> replace voucher/account/bank operations.
- [ ] `src/components/DisbursementVoucherList.tsx` -> replace voucher/account title queries.
- [ ] `src/components/ScannerInput.tsx` -> replace identifier lookup source.

### Phase E: Cleanup
- [ ] Remove `@supabase/supabase-js` from `package.json`.
- [ ] Remove `src/lib/supabase.ts` once no imports remain.
- [ ] Remove `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env`.

## 5) Backend Endpoints You Need (Minimum)

### Auth
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/change-password`

### Setup/Admin/Employees
- `POST /setup/create-admin`
- `GET /admin/users`
- `POST /admin/employees`
- `PUT /admin/employees/:id`
- `GET /admin/employees/:id/access`

### POS/Inventory
- `POST /pos/transactions` (atomic transaction + stock deduction + voucher/bank effects)
- `GET /inventory/current-stock`
- `POST /inventory/movements`
- `POST /inventory/transfers`

### Master/Config data
- CRUD endpoints for: products, categories, suppliers, units, companies, warehouses, vouchers, banks, expenses, purchase orders, disbursement vouchers, account titles, transaction settings.

### OCR/image processing
- `POST /vision/process-product-image`
- `POST /vision/process-identifier-image`

## 6) Access Control Strategy (Replace Supabase RLS)

Supabase currently enforces row-level rules in SQL policies. In MySQL, enforce in backend:
- Authenticate every request (JWT/session middleware).
- Resolve current user + role + company access + warehouse access.
- Apply filters in queries by `company_id` and allowed warehouses/features.
- Enforce permission checks per route/action (`view/create/edit/delete`).

## 7) What To Install For Migration

### Backend (new folder, e.g. `server/`)
- Runtime/framework:
  - `express`
  - `cors`
  - `helmet`
- Database/ORM:
  - `prisma`
  - `@prisma/client`
  - `mysql2`
- Auth/security:
  - `jsonwebtoken`
  - `bcrypt`
  - `cookie-parser` (if cookie-based auth)
- Validation:
  - `zod`
- Dev tooling:
  - `typescript`
  - `ts-node-dev` or `tsx`
  - `dotenv`

### Frontend additions
- Optional: `axios` (if preferred over `fetch`)
- Keep existing React/Vite packages.

## 8) Risks To Handle Early

- Setup docs and UI appear inconsistent (docs mention "Create Admin Account" button; current login page has no such button).
- POS transaction flow must be fully atomic on backend to avoid stock/data drift.
- Feature-based permissions now in RLS must be mirrored in backend authorization checks.
- Existing Supabase SQL migrations include many policy/function fixes; re-implement business rules, not just table structures.

## 9) Cutover Strategy

1. Keep Supabase running while backend/MySQL is built.
2. Migrate auth first and verify login/profile/company switching.
3. Migrate POS + inventory transaction flows next.
4. Migrate remaining CRUD pages.
5. Run side-by-side QA with real workflows.
6. Remove Supabase code only after all pages run on API.
