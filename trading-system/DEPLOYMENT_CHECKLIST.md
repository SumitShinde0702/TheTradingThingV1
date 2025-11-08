# ✅ Deployment Checklist - Before Pushing to Render

## Pre-Deployment Checks

1. **✅ Database Reset**
   - [ ] Run `supabase/reset_to_10000.sql` in Supabase SQL Editor
   - [ ] Verify cycle #0 exists with 10000 USDT for both traders
   - [ ] Query: `SELECT trader_id, cycle_number, account_total_balance FROM decisions WHERE cycle_number = 0;`

2. **✅ Config Changes**
   - [ ] `scan_interval_minutes` set to 3
   - [ ] `initial_balance` set to 10000.0
   - [ ] Config pushed to Render as Secret File

3. **✅ Backend Ready**
   - [ ] All code changes committed
   - [ ] No breaking changes
   - [ ] Health check endpoint works: `/health`

## Post-Deployment Verification

1. **Check Render Logs** (Immediately after deploy):
   ```
   ✅ Look for:
   - "✅ Connected to Supabase database"
   - "✅ Restored cycle number: continuing from 0" (after reset)
   - "✅ Successfully restored from database"
   - "💰 Current balance: Wallet=10000.00, Equity=10000.00"
   ```

2. **Check Frontend** (After deploy):
   - [ ] Dashboard loads correctly
   - [ ] Account shows 10000.00 USDT (not 0.00)
   - [ ] Cycle numbers start from #1 (not #0 or random)
   - [ ] No console errors

3. **Test API Endpoints**:
   ```bash
   # Account info
   curl https://lia-ai-pwup.onrender.com/api/account?trader_id=openai_trader
   
   # Latest decisions
   curl https://lia-ai-pwup.onrender.com/api/decisions/latest?trader_id=openai_trader
   
   # Status
   curl https://lia-ai-pwup.onrender.com/api/status?trader_id=openai_trader
   ```

4. **Monitor First Few Cycles**:
   - [ ] First decision should be cycle #1
   - [ ] Balance should be around 10000 (allowing for trading)
   - [ ] No errors in logs

## If Issues Occur After Deploy

1. **Check Render Logs** for restoration errors
2. **Verify Supabase** has cycle #0 records
3. **Test API** directly to see what backend returns
4. **Clear Frontend Cache** (hard refresh: Ctrl+Shift+R)
5. **Wait 30 seconds** for backend to fully initialize

## Common Issues & Solutions

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Balance shows 0.00 | Backend didn't restore from DB | Check logs for restoration errors |
| Cycle starts from 0 | Cycle number not restored | Check `restoreCycleNumber()` in logs |
| Frontend shows old data | Cache issue | Hard refresh or wait for SWR to refresh |
| API returns 500 error | Backend not ready | Wait 30s after deploy, check health endpoint |

