-- Storage Optimization Scripts
-- Run these to optimize database storage for high-frequency trading data

-- ============================================
-- OPTION 1: Make raw_response Optional (Recommended)
-- ============================================
-- The raw_response field stores the full AI response (5-15 KB per record)
-- It's mainly useful for debugging. Making it nullable saves significant space.

-- Allow NULL values (won't affect existing data)
ALTER TABLE decisions ALTER COLUMN raw_response DROP NOT NULL;

-- Set old raw_response data to NULL (reclaim space)
-- Uncomment to apply:
-- UPDATE decisions 
-- SET raw_response = NULL 
-- WHERE created_at < NOW() - INTERVAL '7 days';

-- ============================================
-- OPTION 2: Create Archive Table
-- ============================================
-- Move old data (>90 days) to archive table to keep main table fast

CREATE TABLE IF NOT EXISTS decisions_archive (LIKE decisions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS positions_archive (LIKE positions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS decision_actions_archive (LIKE decision_actions INCLUDING ALL);

-- Archive function (run monthly)
-- Uncomment to use:
/*
DO $$
BEGIN
    -- Archive decisions older than 90 days
    WITH moved_decisions AS (
        DELETE FROM decisions
        WHERE created_at < NOW() - INTERVAL '90 days'
        RETURNING *
    )
    INSERT INTO decisions_archive SELECT * FROM moved_decisions;
    
    -- Archive related positions and actions will cascade delete
    -- But we can also archive them explicitly if needed
END $$;
*/

-- ============================================
-- OPTION 3: Add Compression (PostgreSQL Built-in)
-- ============================================
-- PostgreSQL automatically compresses TEXT fields, but we can optimize further

-- Enable TOAST compression (automatic, but verify)
-- This is already enabled by default, but ensure it's set
ALTER TABLE decisions ALTER COLUMN input_prompt SET STORAGE EXTENDED;
ALTER TABLE decisions ALTER COLUMN cot_trace SET STORAGE EXTENDED;
ALTER TABLE decisions ALTER COLUMN raw_response SET STORAGE EXTENDED;
ALTER TABLE decisions ALTER COLUMN decision_json SET STORAGE EXTENDED;

-- ============================================
-- OPTION 4: Partition by Date (Advanced)
-- ============================================
-- Partition tables by month for better performance and easier archiving

-- Note: This requires dropping and recreating the table
-- Only use if you have significant data (>1GB) and need monthly partitioning

-- ============================================
-- OPTION 5: Vacuum and Analyze
-- ============================================
-- Reclaim space from deleted/updated rows

VACUUM FULL ANALYZE decisions;
VACUUM FULL ANALYZE positions;
VACUUM FULL ANALYZE decision_actions;

-- ============================================
-- Check Current Storage Usage
-- ============================================
-- Run this query to see current database size

SELECT 
    pg_size_pretty(pg_database_size(current_database())) as database_size,
    pg_size_pretty(pg_total_relation_size('decisions')) as decisions_size,
    pg_size_pretty(pg_total_relation_size('positions')) as positions_size,
    pg_size_pretty(pg_total_relation_size('decision_actions')) as actions_size;

-- Check row counts
SELECT 
    'decisions' as table_name,
    COUNT(*) as row_count,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record
FROM decisions
UNION ALL
SELECT 
    'positions',
    COUNT(*),
    MIN((SELECT created_at FROM decisions WHERE id = positions.decision_id)),
    MAX((SELECT created_at FROM decisions WHERE id = positions.decision_id))
FROM positions
UNION ALL
SELECT 
    'decision_actions',
    COUNT(*),
    MIN((SELECT created_at FROM decisions WHERE id = decision_actions.decision_id)),
    MAX((SELECT created_at FROM decisions WHERE id = decision_actions.decision_id))
FROM decision_actions;

