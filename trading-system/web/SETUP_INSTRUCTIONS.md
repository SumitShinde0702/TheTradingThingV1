# Frontend Supabase Setup Instructions

## Quick Setup (3 steps)

### Step 1: Get Your Supabase Anon Key

1. Go to: https://gboezrzwcsdktdmzmjwn.supabase.co
2. Click **Settings** (⚙️) → **API**
3. Under **Project API keys**, copy the **anon** `public` key
   - This key is safe to use in frontend code (read-only access)

### Step 2: Create `.env` File

Create a file named `.env` in the `web/` directory:

```bash
cd web
# Create .env file
```

Add this content (replace `your_anon_key_here` with your actual key):

```env
VITE_SUPABASE_URL=https://gboezrzwcsdktdmzmjwn.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_USE_SUPABASE=true
```

### Step 3: Enable RLS Policies in Supabase

1. Go to Supabase Dashboard → **SQL Editor**
2. Copy and paste the contents of `supabase/rls_policies.sql`
3. Click **Run** to execute

This enables read-only access for the frontend.

## What This Does

✅ **Frontend will pull from Supabase:**
- Decision records
- Equity history
- Statistics

⚠️ **Frontend still uses Go backend for:**
- System status
- Account info
- Positions (real-time)
- Close position actions (write operations)

## Test It

1. Make sure `.env` file exists with your anon key
2. Restart dev server: `npm run dev`
3. Check browser console - should see no Supabase warnings
4. Navigate to dashboard and verify data loads

## Troubleshooting

**"Supabase anon key not found" warning:**
- Make sure `.env` file exists in `web/` directory
- Check that `VITE_SUPABASE_ANON_KEY` is set correctly
- Restart the dev server after creating `.env`

**"Failed to fetch from Supabase" errors:**
- Make sure you ran `supabase/rls_policies.sql` in Supabase SQL Editor
- Check that RLS is enabled on tables
- Verify your anon key is correct

**Still using Go backend:**
- Set `VITE_USE_SUPABASE=true` in `.env`
- Check browser console for errors
- Frontend will auto-fallback to Go API if Supabase fails

