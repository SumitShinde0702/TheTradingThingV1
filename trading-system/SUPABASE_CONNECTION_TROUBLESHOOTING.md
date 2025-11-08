# Supabase Connection Troubleshooting

## Current Issue
Connection failing with DNS error: `getaddrinfow: The requested name is valid, but no data of the requested type was found`

This is a Windows IPv6 DNS resolution issue.

## Solution: Use Connection Pooler URL

### Step 1: Get the Connection Pooler URL from Supabase

1. Go to your Supabase Dashboard: https://gboezrzwcsdktdmzmjwn.supabase.co
2. Click **Settings** (gear icon) → **Database**
3. Scroll down to **Connection string** section
4. Find **Connection pooling** tab
5. Select **Transaction mode**
6. Copy the connection string - it should look like:

```
postgresql://postgres.gboezrzwcsdktdmzmjwn:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**Key differences:**
- Uses `pooler.supabase.com` instead of `db.supabase.com`
- Uses port `6543` instead of `5432`
- Username format: `postgres.gboezrzwcsdktdmzmjwn` instead of just `postgres`

### Step 2: Update config.json

Replace your `supabase_database_url` with the pooler URL and URL-encode the password:

**Example:**
```json
{
  "use_supabase": true,
  "supabase_database_url": "postgresql://postgres.gboezrzwcsdktdmzmjwn:8%23SdwpNZp67%25Je@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
  ...
}
```

**Note:** Replace `aws-0-us-east-1` with your actual pooler region from the Supabase dashboard.

## Alternative: Direct Connection with IP Address

If pooler doesn't work, try:

1. Go to Supabase Dashboard → Settings → Database
2. Find **Connection string** → **Direct connection**
3. Copy the connection string
4. Make sure it uses the correct format

## Why the Pooler is Better

- Better IPv4/IPv6 compatibility
- Handles Windows networking better
- Built for production use
- Automatic connection management

