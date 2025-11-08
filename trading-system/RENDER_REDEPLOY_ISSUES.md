# 🔍 Render Redeploy Issues - Investigation & Solutions

## 🚨 Problem
When Render redeploys (after git push), the frontend shows incorrect data or resets to default values.

## 🔎 Potential Root Causes

### 1. **Backend State Restoration Issues**

#### Issue A: Cycle Number Not Restored Properly
- **Location**: `logger/decision_logger.go` → `restoreCycleNumber()`
- **Problem**: If Supabase query fails during startup, cycle number might reset to 0
- **Check**: Backend logs should show: `✅ Restored cycle number: continuing from X`
- **Fix**: Ensure Supabase connection is stable on startup

#### Issue B: Initial Balance Restoration
- **Location**: `trader/auto_trader.go` → Lines 217-229
- **Problem**: If cycle #0 doesn't exist or query fails, uses config value (10000) instead of restoring actual balance
- **Fix**: Ensure cycle #0 seed record exists in Supabase

#### Issue C: Paper Trader State Not Restored
- **Location**: `trader/auto_trader.go` → `restorePaperTraderState()`
- **Problem**: If latest record query fails, falls back to config initial balance
- **Fix**: Add retry logic for Supabase queries during startup

### 2. **Frontend Caching Issues**

#### Issue D: SWR Cache Not Invalidated
- **Location**: `web/src/App.tsx` → useSWR hooks
- **Problem**: Frontend might cache old data after backend restart
- **Fix**: Add `revalidateOnMount: true` and handle errors better

#### Issue E: API Timeout/Connection Issues
- **Location**: `web/src/lib/api.ts`
- **Problem**: If backend is restarting, API calls might timeout or fail
- **Fix**: Add retry logic and better error handling

### 3. **Database Connection Issues During Restart**

#### Issue F: Supabase Connection Pool Exhaustion
- **Problem**: Multiple traders trying to connect simultaneously during startup
- **Fix**: Stagger connection attempts or increase pool size

#### Issue G: Transaction Mode vs Session Mode
- **Problem**: Using session mode (port 5432) might limit connections
- **Current**: Already using transaction mode (port 6543) in tools
- **Fix**: Ensure Render config uses transaction mode

## 🛠️ Recommended Fixes

### Immediate Fixes (Do First)

1. **Add Startup Retry Logic**
   - Add retries for Supabase queries during initialization
   - Add delays between trader initializations

2. **Improve Error Logging**
   - Log when restoration fails
   - Log what values are being used vs restored

3. **Frontend Data Validation**
   - Check if account data is reasonable (not 0.00 after reset)
   - Show loading states during backend restart

### Long-term Fixes

1. **Health Check Endpoint**
   - Add `/api/health` with trader status
   - Frontend can check if backend is ready

2. **Graceful Degradation**
   - Frontend shows "Backend restarting..." message
   - Automatically retries API calls

3. **Database Connection Monitoring**
   - Log connection pool status
   - Alert on connection failures

## 📋 Debugging Steps

When Render redeploys:

1. **Check Backend Logs** (Render Dashboard → Logs):
   ```
   Look for:
   - "✅ Restored cycle number: continuing from X"
   - "✅ Successfully restored from database"
   - "💰 Current balance: Wallet=X, Equity=Y"
   - Any errors about Supabase connection
   ```

2. **Check Frontend Console**:
   ```
   Look for:
   - Account API errors
   - Timeout errors
   - Network failures
   ```

3. **Verify Database State**:
   ```sql
   SELECT trader_id, MAX(cycle_number), MAX(account_total_balance)
   FROM decisions
   GROUP BY trader_id;
   ```

4. **Test API Endpoints Directly**:
   ```bash
   curl https://your-render-url.onrender.com/api/account?trader_id=openai_trader
   ```

## 🎯 Next Steps

1. ✅ Reset database to cycle #0, 10000 USDT
2. ✅ Change scan interval to 3 minutes
3. 🔄 Test redeployment and monitor logs
4. 🔄 Identify which specific issue is causing the problem
5. 🔄 Apply targeted fix based on findings

