-- Optional: Make raw_response nullable (if not already)
-- This ensures the optimization works smoothly

-- Check if column allows NULL (it should by default, but verify)
-- Run this first to check:
SELECT 
    column_name, 
    is_nullable, 
    data_type
FROM information_schema.columns
WHERE table_name = 'decisions' 
  AND column_name = 'raw_response';

-- If is_nullable is 'NO', run this to make it nullable:
-- ALTER TABLE decisions ALTER COLUMN raw_response DROP NOT NULL;

-- Note: The migration.sql already has raw_response TEXT (nullable by default)
-- So this should NOT be necessary, but included for safety

-- ============================================
-- OPTIONAL: Clean up existing raw_response data
-- ============================================
-- If you want to reclaim space from existing records, uncomment below:

-- Set successful decisions' raw_response to NULL (reclaim space)
-- UPDATE decisions 
-- SET raw_response = NULL 
-- WHERE success = true 
--   AND raw_response IS NOT NULL 
--   AND raw_response != '';

-- This will free up space from historical records
-- Only run if you want to clean up old data

