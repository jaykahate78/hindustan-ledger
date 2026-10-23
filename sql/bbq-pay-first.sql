-- Add payment audit metadata for pay-first BBQ quick billing.
-- Does not affect old orders; never implies gateway verification.
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
