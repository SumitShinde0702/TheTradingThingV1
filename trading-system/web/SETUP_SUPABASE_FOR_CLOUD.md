# Set Up Supabase for Cloud Access

## Why Supabase?

✅ **Cloud-based** - Works from anywhere
✅ **Always available** - Works even when your computer is off
✅ **Direct database access** - Faster queries
✅ **No backend required** - Frontend can access data directly

## Current Setup

- **Backend API**: Only works when your computer is running
- **Supabase**: Works from anywhere, 24/7 (cloud database)

## Setup Steps

### Step 1: Get Your Supabase Anon Key

1. Go to: **https://gboezrzwcsdktdmzmjwn.supabase.co/settings/api**
2. Under **Project API keys**, find the **anon** `public` key
3. Copy the entire key (long string starting with `eyJ...`)

**Important:** Use the **anon** key, NOT the service_role key!

### Step 2: Update `.env` File

Edit the `.env` file in `web/` directory and replace with:

```env
VITE_SUPABASE_URL=https://gboezrzwcsdktdmzmjwn.supabase.co
VITE_SUPABASE_ANON_KEY=paste_your_full_anon_key_here
VITE_USE_SUPABASE=true
```

**Example:**
```env
VITE_SUPABASE_URL=https://gboezrzwcsdktdmzmjwn.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdib2V6cnp3Y3Nka3RkbXptanduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE...
VITE_USE_SUPABASE=true
```

### Step 3: Enable RLS Policies

Run this SQL in Supabase SQL Editor:

1. Go to: **https://gboezrzwcsdktdmzmjwn.supabase.co** → **SQL Editor**
2. Copy contents of `supabase/rls_policies.sql`
3. Paste and click **Run**

This allows the frontend to read data using the anon key.

### Step 4: Restart Dev Server

```bash
# Stop current server (Ctrl+C)
npm run dev
```

## Verification

1. Open browser DevTools (F12) → Console
2. Should see: `✅ Fetched X decisions from Supabase`
3. NO "Invalid API key" errors
4. Recent Decisions should appear

## Benefits

✅ **Works from anywhere** - Access from any device
✅ **24/7 availability** - Cloud database always online
✅ **No backend required** - Frontend directly queries Supabase
✅ **Faster** - Direct database queries

## Architecture Comparison

### Current (Local Backend):
```
Frontend → localhost:8080 (Backend) → Supabase Database
         ↑
    Only works when computer is on
```

### With Supabase Direct Access:
```
Frontend → Supabase Database (Cloud)
         ↑
    Works from anywhere, 24/7
```

The backend can still run for trading, but the frontend dashboard works independently!

