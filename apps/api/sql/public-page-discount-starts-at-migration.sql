-- Run once before deploying against an existing database, with ALTER permission:
-- mysql -u USER -p DATABASE < apps/api/sql/public-page-discount-starts-at-migration.sql
-- Idempotent on MySQL; this requires the public_page_discounts table to exist.
SET @add_discount_starts_at = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'public_page_discounts'
      AND COLUMN_NAME = 'starts_at'),
  'SELECT 1',
  'ALTER TABLE public_page_discounts ADD COLUMN starts_at DATETIME NULL DEFAULT NULL'
);
PREPARE discount_migration FROM @add_discount_starts_at;
EXECUTE discount_migration;
DEALLOCATE PREPARE discount_migration;
