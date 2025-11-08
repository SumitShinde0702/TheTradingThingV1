# 🔄 Reset Database to 10000 USDT

## ✅ Current Status Check

I checked your database and found:
- **openai_trader**: 9676.37 USDT (82 records, cycles 0-89) - NOT reset
- **qwen_trader**: 10000.00 USDT (87 records, cycles 0-94) - **RESET detected**

## 🔧 How to Reset

Since Windows Defender blocked the Go script, use the **SQL script method**:

### Option 1: Supabase SQL Editor (Recommended)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Click **"SQL Editor"** in the left sidebar
4. Click **"New query"**
5. Open `supabase/reset_to_10000.sql` file
6. Copy and paste the entire SQL script
7. Click **"Run"** or press `Ctrl+Enter`
8. Wait for success message

### Option 2: Command Line (if you have psql)

```bash
psql "postgresql://postgres.gboezrzwcsdktdmzmjwn:8%23SdwpNZp67%25Je@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true" -f supabase/reset_to_10000.sql
```

## ✅ What the Reset Does

1. **Deletes all existing records**:
   - All decision_actions
   - All positions  
   - All decisions (except will recreate cycle #0)

2. **Seeds cycle #0 with 10000 USDT**:
   - Creates initial record for `openai_trader` (balance: 10000.00)
   - Creates initial record for `qwen_trader` (balance: 10000.00)

3. **System will restart fresh**:
   - Backend will restore from cycle #0
   - New cycles will start from #1
   - Both traders will begin with 10000 USDT

## 🔄 After Reset

1. The backend on Render will automatically detect the reset
2. When it restarts (or you redeploy), it will:
   - Load cycle #0 with 10000 USDT
   - Start making new decisions from cycle #1
   - Continue trading with fresh 10000 USDT balance

## 📊 Verify Reset

After running the SQL script, verify with:

```sql
SELECT 
    trader_id,
    cycle_number,
    account_total_balance,
    timestamp
FROM decisions
WHERE cycle_number = 0
ORDER BY trader_id;
```

Expected result:
- `openai_trader`, `0`, `10000.0`
- `qwen_trader`, `0`, `10000.0`

---

## 🚨 Important Notes

- This will **delete ALL trading history**
- This cannot be undone (unless you have backups)
- The backend on Render will automatically pick up the reset on next restart
- Both traders will start fresh from 10000 USDT

