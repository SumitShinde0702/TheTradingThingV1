# Supabase Integration Guide

This guide explains how to integrate Supabase as your cloud database instead of using local SQLite files.

## Overview

Supabase provides a PostgreSQL database in the cloud, allowing you to:
- Store all trading decision logs in the cloud
- Access data from multiple machines
- Scale your database without local storage concerns
- Use Supabase's built-in features (realtime, backups, etc.)

## Prerequisites

1. A Supabase account (sign up at [supabase.com](https://supabase.com))
2. A Supabase project created

## Step 1: Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click "New Project"
3. Fill in project details:
   - Name: Your project name
   - Database Password: Create a strong password (save this!)
   - Region: Choose closest to your location
4. Wait for project to be created (takes a few minutes)

## Step 2: Get Database Connection String

1. In your Supabase project dashboard, go to **Settings** → **Database**
2. Scroll down to **Connection string** section
3. Copy the **URI** connection string. It looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
4. Replace `[YOUR-PASSWORD]` with your actual database password

Alternatively, you can construct it manually:
- Host: `db.[PROJECT-REF].supabase.co`
- Port: `5432`
- Database: `postgres`
- User: `postgres`
- Password: Your database password

## Step 3: Run Database Migration

1. Go to **SQL Editor** in your Supabase dashboard
2. Open the file `supabase/migration.sql` from this repository
3. Copy and paste the SQL into the Supabase SQL Editor
4. Click **Run** to execute the migration
5. Verify tables were created by checking **Table Editor** in the dashboard

The migration creates these tables:
- `decisions` - Main decision records
- `positions` - Position snapshots
- `decision_actions` - Trading actions executed

## Step 4: Configure Your Application

### Option A: Using Database Connection String (Recommended)

Edit your `config.json` file and add:

```json
{
  "use_supabase": true,
  "supabase_database_url": "postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres",
  "supabase_schema": "public",
  "traders": [
    ...
  ]
}
```

### Option B: Using Environment Variables

You can also set environment variables:

```bash
export SUPABASE_USE=true
export SUPABASE_DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
export SUPABASE_SCHEMA="public"
```

The application will automatically read these environment variables.

## Step 5: Update Code to Use Supabase

The code needs to be updated to pass Supabase configuration to the DecisionLogger. Currently, it defaults to SQLite. You need to:

1. Update `trader/auto_trader.go` to check for Supabase config
2. Update `manager/trader_manager.go` to pass Supabase config when creating traders
3. Update `main.go` to read Supabase config from `config.json`

**Note**: The current implementation supports both SQLite and Supabase. If Supabase config is provided, it will use Supabase; otherwise, it falls back to SQLite.

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `use_supabase` | boolean | Yes | Enable Supabase instead of SQLite |
| `supabase_database_url` | string | Yes* | PostgreSQL connection string |
| `supabase_url` | string | No | Supabase project URL (not used with direct connection) |
| `supabase_key` | string | No | Supabase API key (not used with direct connection) |
| `supabase_schema` | string | No | Database schema (default: "public") |

\* Required if `use_supabase` is true

## How It Works

When Supabase is enabled:

1. Each trader's data is stored in the same database tables
2. Data is separated by `trader_id` column (automatically added to queries)
3. Cycle numbers are tracked per trader
4. All existing functionality works the same, just using cloud database

### Data Separation

- In SQLite: Each trader has separate database files (`decision_logs/{trader_id}/decisions.db`)
- In Supabase: All traders share the same database, separated by `trader_id` column

## Migration from SQLite to Supabase

If you have existing SQLite data:

1. Export data from SQLite (if needed for backup)
2. Start using Supabase with a fresh database
3. Historical data from SQLite will remain in local files
4. New data will be stored in Supabase

**Note**: Currently, there's no automatic migration tool. You would need to write a script to migrate existing SQLite data if needed.

## Security Best Practices

1. **Never commit your database password** to version control
2. Use environment variables for sensitive data
3. Consider using Supabase's connection pooling for production
4. Set up Row Level Security (RLS) policies if needed (see migration.sql)
5. Use `.gitignore` to exclude config files with passwords

## Troubleshooting

### Connection Failed

- Verify your database password is correct
- Check that your IP is allowed (Supabase firewall settings)
- Ensure the connection string format is correct
- Check Supabase project status in dashboard

### Tables Not Found

- Verify migration was run successfully
- Check SQL Editor for any errors
- Ensure you're using the correct schema name

### Data Not Appearing

- Check that `trader_id` matches between queries
- Verify Supabase is actually being used (check logs for "Connected to Supabase database")
- Check Table Editor in Supabase dashboard directly

## Benefits of Supabase

- ✅ Cloud storage - no local disk usage
- ✅ Accessible from anywhere
- ✅ Automatic backups
- ✅ Built-in dashboard for viewing data
- ✅ Scalable PostgreSQL database
- ✅ Optional: Realtime subscriptions
- ✅ Optional: REST API access

## Example config.json

```json
{
  "use_supabase": true,
  "supabase_database_url": "postgresql://postgres:mypassword123@db.abcdefghijklmnop.supabase.co:5432/postgres",
  "supabase_schema": "public",
  "traders": [
    {
      "id": "openai_trader",
      "name": "OpenAI Trader",
      "enabled": true,
      "ai_model": "groq",
      "exchange": "paper",
      "initial_balance": 10000,
      "scan_interval_minutes": 3
    }
  ],
  "api_server_port": 8080,
  "leverage": {
    "btc_eth_leverage": 5,
    "altcoin_leverage": 5
  }
}
```

## Next Steps

1. Update your code to read Supabase config (see TODO in code)
2. Test with one trader first
3. Monitor Supabase dashboard for data
4. Verify all functionality works as expected
5. Optionally set up RLS policies for additional security

For questions or issues, check the code comments or Supabase documentation at [supabase.com/docs](https://supabase.com/docs).

