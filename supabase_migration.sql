-- Standalone migration to add versioning and timestamps to the cart table
ALTER TABLE cart ADD COLUMN IF NOT EXISTS cart_version BIGINT DEFAULT 1;
ALTER TABLE cart ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
