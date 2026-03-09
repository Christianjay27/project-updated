# Inventory Management System - Setup Instructions

## ⚠️ IMPORTANT: First Time Setup Required

**You MUST create your admin account BEFORE you can login!**

The credentials shown are for account creation, not for an existing account.

---

## Quick Start Guide (3 Steps)

### Step 1: Create Your Admin Account

1. **Open the application** in your browser
2. You'll see the **Login page** with demo credentials displayed
3. **Click the green "Create Admin Account" button** at the bottom of the page
4. The Setup page opens with pre-filled information:
   - Email: `admin@demo.com`
   - Password: `admin123`
   - Full Name: Admin User
5. **Click "Complete Setup"** to create your account
6. ✅ Your account is now created!

### Step 2: Login

1. After account creation completes, you'll be automatically logged in
2. If you get logged out later, use the Login page with:
   - **Email:** `admin@demo.com`
   - **Password:** `admin123`

### Step 3: Start Managing

1. **Products** - Add your inventory items
2. **POS** - Process sales transactions
3. **Dashboard** - View business analytics

---

## Demo Company Details

A demo company has been pre-created in the database:
- **Company Name:** Demo Company
- **Address:** 123 Business Street, Metro Manila
- **Contact:** +63 912 345 6789
- **Email:** demo@company.com

## System Features

### Core Features Available:
- ✅ Multi-company support
- ✅ User authentication (Admin/Agent roles)
- ✅ Product management (with SKU, barcode, IMEI, MAC, serial number)
- ✅ Point of Sale (POS) system
- ✅ Dashboard with sales analytics
- ✅ Inventory tracking
- ✅ Transaction history

### Database Structure:
- Companies and user profiles
- Products with full details
- Inventory movements and stock levels
- POS transactions
- Warehouses
- Suppliers
- Vouchers
- Expenses
- Agent shifts

## Security

All tables are secured with Row Level Security (RLS):
- Admins have full access to their company's data
- Agents can only view their own sales and assigned data
- Multi-company isolation is enforced at the database level

## Next Steps

After logging in:
1. Navigate to **Products** to add your inventory items
2. Use the **POS** page to process sales
3. Check the **Dashboard** for business insights
4. Explore other features as needed

## Support

For issues or questions, refer to the project documentation or contact your system administrator.
