# Final Setup Steps for Supabase Cloud Access

## ✅ What's Done

1. ✅ `.env` file created with publishable key
2. ✅ Supabase integration enabled

## ⚠️ Required: Enable RLS Policies

Before Supabase will work, you MUST enable Row Level Security (RLS) policies:

### Step 1: Go to Supabase SQL Editor

1. Open: https://gboezrzwcsdktdmzmjwn.supabase.co
2. Click **SQL Editor** (left sidebar)
3. Click **New query**

### Step 2: Run RLS Policies

Copy and paste this entire script:

```sql
-- Enable RLS on tables
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_actions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read on decisions" ON decisions;
DROP POLICY IF EXISTS "Allow public read on positions" ON positions;
DROP POLICY IF EXISTS "Allow public read on decision_actions" ON decision_actions;

-- Create policies for SELECT (read-only) access
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
```

### Step 3: Click "Run" (or press Ctrl+Enter)

You should see "Success. No rows returned"

## Step 4: Restart Dev Server

```bash
# Stop current server (Ctrl+C)
npm run dev
```

## Verification

1. Open browser DevTools (F12) → Console
2. Should see: `✅ Fetched X decisions from Supabase`
3. NO "Invalid API key" errors
4. Recent Decisions should appear!

## Why RLS is Required

The **publishable key** is safe to use, but Supabase requires RLS policies to allow read access. Without them, you'll get permission errors.

## Security Note

✅ **Publishable key:** Already in `.env` (safe for frontend)
❌ **Secret key:** Keep it secret! Only use in backend/server code

Your dashboard will now work from anywhere in the world! 🌍

