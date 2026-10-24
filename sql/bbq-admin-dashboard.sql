-- Small, additive POS reporting upgrade. Apply to isolated Neon staging before deployment.
-- Completed_at is set only when the kitchen marks an order COMPLETED.
-- Existing legacy completed orders can be reported by updated_at fallback.
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS cashier_user_id BIGINT REFERENCES app_users(id);
CREATE INDEX IF NOT EXISTS ix_bbq_completed_by_day ON pos_orders(organization_id,completed_at DESC) WHERE status='COMPLETED';
