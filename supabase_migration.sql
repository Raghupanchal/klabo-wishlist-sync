-- One-time Data Cleanup Migration for KLABO Supabase Database
-- Run this SQL in your Supabase SQL Editor to purge existing corrupt rows

DELETE FROM cart
WHERE product_id IS NULL
   OR product_id = ''
   OR title IS NULL
   OR title = ''
   OR variant_id IS NULL
   OR variant_id = ''
   OR variant_id = 'undefined'
   OR quantity <= 0;
