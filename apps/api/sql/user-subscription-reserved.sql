-- Run before deploying when ENABLE_SCHEMA_MUTATIONS is disabled:
-- mysql -u USER -p DATABASE < apps/api/sql/user-subscription-reserved.sql
-- Idempotent for the standard enum. Back up and review custom enum values first.
SET @status_type = (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_subscriptions' AND COLUMN_NAME = 'status');
-- Fail rather than silently discard unexpected values or run without the table.
SET @migration = CASE
  WHEN @status_type IS NULL THEN 'SELECT * FROM __subscription_status_column_missing__'
  WHEN @status_type NOT IN ('enum(''active'',''expired'',''canceled'')', 'enum(''active'',''reserved'',''expired'',''canceled'')')
    THEN 'SELECT * FROM __unexpected_subscription_status_enum__'
  WHEN @status_type LIKE '%''reserved''%' THEN 'SELECT 1'
  ELSE 'ALTER TABLE user_subscriptions MODIFY COLUMN status ENUM(''active'',''reserved'',''expired'',''canceled'') NOT NULL DEFAULT ''active'''
END;
PREPARE subscription_migration FROM @migration;
EXECUTE subscription_migration;
DEALLOCATE PREPARE subscription_migration;
