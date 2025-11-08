-- Row Level Security (RLS) Policies for Frontend Access
-- This allows the frontend to read data from Supabase using the anon key

-- Enable RLS on tables (if not already enabled)
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_actions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read on decisions" ON decisions;
DROP POLICY IF EXISTS "Allow public read on positions" ON positions;
DROP POLICY IF EXISTS "Allow public read on decision_actions" ON decision_actions;

-- Create policies for SELECT (read-only) access
-- These allow anonymous users to read all data (safe for public dashboard)

CREATE POLICY "Allow public read on decisions" 
  ON decisions 
  FOR SELECT 
  USING (true);

CREATE POLICY "Allow public read on positions" 
  ON positions 
  FOR SELECT 
  USING (true);

CREATE POLICY "Allow public read on decision_actions" 
  ON decision_actions 
  FOR SELECT 
  USING (true);

-- Note: Write operations (INSERT, UPDATE, DELETE) are only allowed
-- through the Go backend using the service_role key or direct database connection
-- This ensures data integrity and prevents unauthorized modifications

