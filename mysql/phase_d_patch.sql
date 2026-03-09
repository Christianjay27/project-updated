-- Phase D patch for existing inventory_db schema
-- Run this in phpMyAdmin SQL tab if you already imported an older schema.

USE inventory_db;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER name;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS phone VARCHAR(100) NULL AFTER contact_person,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER city;

ALTER TABLE transaction_settings
  ADD COLUMN IF NOT EXISTS prefix VARCHAR(50) NOT NULL DEFAULT 'ADDR' AFTER company_id,
  ADD COLUMN IF NOT EXISTS current_counter INT NOT NULL DEFAULT 700 AFTER prefix;

-- Backfill from older column names when present.
SET @has_tx_prefix := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'transaction_settings'
    AND column_name = 'transaction_prefix'
);

SET @has_tx_counter := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'transaction_settings'
    AND column_name = 'next_transaction_number'
);

SET @sql1 := IF(@has_tx_prefix > 0,
  'UPDATE transaction_settings SET prefix = COALESCE(prefix, transaction_prefix) WHERE (prefix IS NULL OR prefix = '''');',
  'SELECT 1;'
);
PREPARE stmt1 FROM @sql1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @sql2 := IF(@has_tx_counter > 0,
  'UPDATE transaction_settings SET current_counter = COALESCE(current_counter, next_transaction_number);',
  'SELECT 1;'
);
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
