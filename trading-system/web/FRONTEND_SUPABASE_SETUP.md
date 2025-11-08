# Frontend Supabase Integration

The frontend can now pull data directly from Supabase instead of going through the Go backend API.

## Setup

### Step 1: Get Supabase Anon Key

1. Go to your Supabase Dashboard: https://gboezrzwcsdktdmzmjwn.supabase.co
2. Click **Settings** (gear icon) → **API**
3. Find **Project API keys** section
4. Copy the **anon** `public` key (this is safe to use in frontend)

### Step 2: Create Environment File

Create a `.env` file in the `web/` directory:

```bash
cd web
copy .env.example .env
```

Edit `.env` and add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://gboezrzwcsdktdmzmjwn.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_USE_SUPABASE=true
```

### Step 3: Configure Row Level Security (RLS)

Since we're using the anon key, we need to allow read access. In Supabase SQL Editor, run:

```sql
-- Allow anonymous read access to decisions (for frontend)
ALTER POLICY "Allow all operations on decisions" ON decisions 
  FOR SELECT USING (true);

ALTER POLICY "Allow all operations on positions" ON positions 
  FOR SELECT USING (true);

ALTER POLICY "Allow all operations on decision_actions" ON decision_actions 
  FOR SELECT USING (true);
```

Or create new policies:

```sql
-- Drop existing policy if it doesn't allow SELECT
DROP POLICY IF EXISTS "Allow all operations on decisions" ON decisions;
DROP POLICY IF EXISTS "Allow all operations on positions" ON positions;
DROP POLICY IF EXISTS "Allow all operations on decision_actions" ON decision_actions;

-- Create SELECT-only policies for public read access
CREATE POLICY "Allow public read on decisions" ON decisions 
  FOR SELECT USING (true);

CREATE POLICY "Allow public read on positions" ON positions 
  FOR SELECT USING (true);

CREATE POLICY "Allow public read on decision_actions" ON decision_actions 
  FOR SELECT USING (true);
```

## What Works Now

The frontend will use Supabase directly for:

- ✅ **Decision Records** (`getDecisions`, `getLatestDecisions`)
- ✅ **Equity History** (`getEquityHistory`)
- ✅ **Statistics** (`getStatistics`)

The frontend still uses the Go backend API for:

- ⚙️ **System Status** (`getStatus`)
- ⚙️ **Account Info** (`getAccount`)
- ⚙️ **Positions** (`getPositions`)
- ⚙️ **Close Position** (`closePosition`) - Write operation
- ⚙️ **Competition Data** (`getCompetition`)
- ⚙️ **Trading Signals** (`getTradingSignal`)

## Benefits

- ✅ Faster data loading (direct database access)
- ✅ Real-time updates possible (with Supabase Realtime)
- ✅ Reduced backend load
- ✅ Works even if Go backend is down (for read operations)

## Fallback Behavior

If Supabase fetch fails, the frontend automatically falls back to the Go backend API, so your app will continue working.

## Testing

1. Make sure your `.env` file is configured
2. Restart the dev server: `npm run dev`
3. Check browser console for Supabase connection messages
4. Verify data loads from Supabase (check network tab in DevTools)

