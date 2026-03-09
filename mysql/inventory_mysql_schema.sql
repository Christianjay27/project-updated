-- Inventory Management MySQL Schema (phpMyAdmin import ready)
-- Date: 2026-03-09
-- MySQL: 8.0+

CREATE DATABASE IF NOT EXISTS inventory_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE inventory_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(191) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'agent',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NULL,
  contact_number VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  logo_url TEXT NULL,
  is_headquarters TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS warehouses (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_warehouses_company_id (company_id),
  CONSTRAINT fk_warehouses_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_profiles (
  id VARCHAR(191) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL UNIQUE,
  company_id VARCHAR(191) NOT NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'agent',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_profiles_company_id (company_id),
  CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_profiles_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_company_access (
  id VARCHAR(191) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  company_id VARCHAR(191) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'agent',
  UNIQUE KEY uq_user_company_access (user_id, company_id),
  INDEX idx_user_company_access_company_id (company_id),
  CONSTRAINT fk_user_company_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_company_access_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_warehouse_access (
  id VARCHAR(191) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  warehouse_id VARCHAR(191) NOT NULL,
  UNIQUE KEY uq_user_warehouse_access (user_id, warehouse_id),
  INDEX idx_user_warehouse_access_warehouse_id (warehouse_id),
  CONSTRAINT fk_user_warehouse_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_warehouse_access_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_feature_permissions (
  id VARCHAR(191) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  feature_key VARCHAR(120) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 1,
  can_create TINYINT(1) NOT NULL DEFAULT 1,
  can_edit TINYINT(1) NOT NULL DEFAULT 1,
  can_delete TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_user_feature_permissions (user_id, feature_key),
  CONSTRAINT fk_user_feature_permissions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_categories_company_id (company_id),
  CONSTRAINT fk_categories_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS units (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  abbreviation VARCHAR(30) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NULL,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255) NULL,
  phone VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  address TEXT NULL,
  city VARCHAR(120) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_suppliers_company_id (company_id),
  CONSTRAINT fk_suppliers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NULL,
  category_id VARCHAR(191) NULL,
  supplier_id VARCHAR(191) NULL,
  unit_id VARCHAR(191) NULL,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(191) NULL,
  barcode VARCHAR(191) NULL,
  imei VARCHAR(191) NULL,
  mac_address VARCHAR(191) NULL,
  serial_number VARCHAR(191) NULL,
  description TEXT NULL,
  cost_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  low_stock_alert DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_products_sku (sku),
  INDEX idx_products_company_id (company_id),
  INDEX idx_products_category_id (category_id),
  INDEX idx_products_supplier_id (supplier_id),
  INDEX idx_products_unit_id (unit_id),
  CONSTRAINT fk_products_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT fk_products_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_company_assignments (
  id VARCHAR(191) PRIMARY KEY,
  product_id VARCHAR(191) NOT NULL,
  company_id VARCHAR(191) NOT NULL,
  UNIQUE KEY uq_product_company_assignments (product_id, company_id),
  CONSTRAINT fk_pca_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pca_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_warehouse_assignments (
  id VARCHAR(191) PRIMARY KEY,
  product_id VARCHAR(191) NOT NULL,
  warehouse_id VARCHAR(191) NOT NULL,
  UNIQUE KEY uq_product_warehouse_assignments (product_id, warehouse_id),
  CONSTRAINT fk_pwa_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pwa_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_variants (
  id VARCHAR(191) PRIMARY KEY,
  product_id VARCHAR(191) NOT NULL,
  variant_name VARCHAR(255) NOT NULL,
  sku VARCHAR(191) NULL,
  price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  cost_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product_variants_product_id (product_id),
  CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS landed_costs (
  id VARCHAR(191) PRIMARY KEY,
  product_id VARCHAR(191) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_landed_costs_product_id (product_id),
  CONSTRAINT fk_landed_costs_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_identifiers (
  id VARCHAR(191) PRIMARY KEY,
  product_id VARCHAR(191) NOT NULL,
  warehouse_id VARCHAR(191) NULL,
  product_identifier VARCHAR(191) NULL,
  model VARCHAR(191) NULL,
  mac VARCHAR(191) NULL,
  dev_id VARCHAR(191) NULL,
  serial_number VARCHAR(191) NULL,
  barcode VARCHAR(191) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product_identifiers_product_id (product_id),
  INDEX idx_product_identifiers_warehouse_id (warehouse_id),
  CONSTRAINT fk_product_identifiers_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_identifiers_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS current_stock (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NOT NULL,
  product_id VARCHAR(191) NOT NULL,
  warehouse_id VARCHAR(191) NOT NULL,
  quantity DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_current_stock (product_id, warehouse_id),
  INDEX idx_current_stock_company_id (company_id),
  CONSTRAINT fk_current_stock_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_current_stock_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_current_stock_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NOT NULL,
  product_id VARCHAR(191) NOT NULL,
  warehouse_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NULL,
  movement_type VARCHAR(50) NOT NULL,
  quantity DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  reference_number VARCHAR(191) NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inventory_movements_company_id (company_id),
  INDEX idx_inventory_movements_product_id (product_id),
  INDEX idx_inventory_movements_warehouse_id (warehouse_id),
  INDEX idx_inventory_movements_created_by (created_by),
  CONSTRAINT fk_inventory_movements_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_movements_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_movements_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_transfers (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NOT NULL,
  product_id VARCHAR(191) NOT NULL,
  from_warehouse_id VARCHAR(191) NOT NULL,
  to_warehouse_id VARCHAR(191) NOT NULL,
  created_by VARCHAR(191) NULL,
  quantity DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  reference_number VARCHAR(191) NULL,
  notes TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'completed',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_stock_transfers_company_id (company_id),
  CONSTRAINT fk_stock_transfers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_transfers_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_transfers_from_warehouse FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_transfers_to_warehouse FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_transfers_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vouchers (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NULL,
  code VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  discount_value DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vouchers_company_id (company_id),
  CONSTRAINT fk_vouchers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS banks (
  id VARCHAR(191) PRIMARY KEY,
  bank_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(191) NULL,
  current_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pos_transactions (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NOT NULL,
  warehouse_id VARCHAR(191) NOT NULL,
  agent_id VARCHAR(191) NULL,
  voucher_id VARCHAR(191) NULL,
  bank_id VARCHAR(191) NULL,
  transaction_number VARCHAR(100) NOT NULL,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  base_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  agent_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(50) NOT NULL,
  delivery_agent_name VARCHAR(255) NULL,
  delivered_to VARCHAR(255) NULL,
  delivery_address TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pos_transactions_number (transaction_number),
  INDEX idx_pos_transactions_company_id (company_id),
  INDEX idx_pos_transactions_warehouse_id (warehouse_id),
  CONSTRAINT fk_pos_transactions_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_transactions_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_transactions_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_pos_transactions_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL,
  CONSTRAINT fk_pos_transactions_bank FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pos_transaction_items (
  id VARCHAR(191) PRIMARY KEY,
  transaction_id VARCHAR(191) NOT NULL,
  product_id VARCHAR(191) NOT NULL,
  warehouse_id VARCHAR(191) NULL,
  product_identifier VARCHAR(191) NULL,
  model VARCHAR(191) NULL,
  mac VARCHAR(191) NULL,
  dev_id VARCHAR(191) NULL,
  quantity DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  unit_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  edited_unit_price DECIMAL(18,2) NULL,
  total_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pos_transaction_items_transaction_id (transaction_id),
  INDEX idx_pos_transaction_items_product_id (product_id),
  CONSTRAINT fk_pos_transaction_items_transaction FOREIGN KEY (transaction_id) REFERENCES pos_transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_transaction_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pos_transaction_items_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS expenses (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NOT NULL,
  warehouse_id VARCHAR(191) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  expense_date DATE NOT NULL,
  created_by VARCHAR(191) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_expenses_company_id (company_id),
  INDEX idx_expenses_warehouse_id (warehouse_id),
  CONSTRAINT fk_expenses_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_expenses_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
  CONSTRAINT fk_expenses_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NOT NULL,
  warehouse_id VARCHAR(191) NOT NULL,
  supplier_id VARCHAR(191) NOT NULL,
  po_number VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  order_date DATE NOT NULL,
  expected_date DATE NULL,
  notes TEXT NULL,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_landing_cost DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_by VARCHAR(191) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_purchase_orders_number (po_number),
  INDEX idx_purchase_orders_company_id (company_id),
  CONSTRAINT fk_purchase_orders_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_orders_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_orders_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id VARCHAR(191) PRIMARY KEY,
  purchase_order_id VARCHAR(191) NOT NULL,
  product_id VARCHAR(191) NOT NULL,
  quantity DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  unit_cost DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_cost DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_purchase_order_items_po_id (purchase_order_id),
  CONSTRAINT fk_purchase_order_items_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_order_landing_costs (
  id VARCHAR(191) PRIMARY KEY,
  purchase_order_id VARCHAR(191) NOT NULL,
  cost_name VARCHAR(255) NOT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_purchase_order_landing_costs_po_id (purchase_order_id),
  CONSTRAINT fk_purchase_order_landing_costs_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS account_titles (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NULL,
  title VARCHAR(255) NOT NULL,
  code VARCHAR(100) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_account_titles_company_id (company_id),
  CONSTRAINT fk_account_titles_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS disbursement_vouchers (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NOT NULL,
  account_title_id VARCHAR(191) NULL,
  bank_id VARCHAR(191) NULL,
  voucher_number VARCHAR(100) NULL,
  payee VARCHAR(255) NOT NULL,
  particulars TEXT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  created_by VARCHAR(191) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_disbursement_vouchers_company_id (company_id),
  CONSTRAINT fk_disbursement_vouchers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_disbursement_vouchers_account_title FOREIGN KEY (account_title_id) REFERENCES account_titles(id) ON DELETE SET NULL,
  CONSTRAINT fk_disbursement_vouchers_bank FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE SET NULL,
  CONSTRAINT fk_disbursement_vouchers_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transaction_settings (
  id VARCHAR(191) PRIMARY KEY,
  company_id VARCHAR(191) NOT NULL UNIQUE,
  prefix VARCHAR(50) NOT NULL DEFAULT 'ADDR',
  current_counter INT NOT NULL DEFAULT 700,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_transaction_settings_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS warehouse_company_access (
  id VARCHAR(191) PRIMARY KEY,
  warehouse_id VARCHAR(191) NOT NULL,
  company_id VARCHAR(191) NOT NULL,
  UNIQUE KEY uq_warehouse_company_access (warehouse_id, company_id),
  CONSTRAINT fk_warehouse_company_access_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  CONSTRAINT fk_warehouse_company_access_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- Optional starter seed
INSERT INTO companies (id, name, address, contact_number, email, is_headquarters, is_active)
VALUES ('cmp_demo', 'Demo Company', '123 Business Street, Metro Manila', '+63 912 345 6789', 'demo@company.com', 1, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  address = VALUES(address),
  contact_number = VALUES(contact_number),
  email = VALUES(email),
  is_headquarters = VALUES(is_headquarters),
  is_active = VALUES(is_active);
