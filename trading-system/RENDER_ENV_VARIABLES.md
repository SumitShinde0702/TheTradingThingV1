# 🔐 Environment Variables for Render Deployment

Copy and paste these into Render's **Environment Variables** section (don't include the `#` comments in Render):

## ⚠️ Important Notes

1. **PORT** is automatically set by Render - you don't need to add it
2. **Replace all `YOUR_*_HERE` values** with your actual API keys
3. **Keep values secure** - never commit these to git

---

## 📝 Required Environment Variables

### No Environment Variables Needed!

**Render deployment uses Secret Files instead:**

1. Create your `config.json` locally with your API keys
2. Upload it as a **Secret File** in Render:
   - Go to your service → **Environment** tab
   - Scroll to **"Secret Files"** section
   - Click **"Add Secret File"**
   - Path: `config.json`
   - Upload your `config.json` file

This is more secure than environment variables for complex JSON configs.

---

## 🔄 Alternative: If You Want to Use Environment Variables

If you prefer environment variables, here's what you would need (but Secret Files is easier):

### Server Configuration
```
PORT=8080
```
*(This is auto-set by Render, but you can override it)*

### Trader 1 (OpenAI Trader)
```
TRADER_1_ID=openai_trader
TRADER_1_NAME=OpenAI Trader
TRADER_1_ENABLED=true
TRADER_1_AI_MODEL=groq
TRADER_1_EXCHANGE=paper
TRADER_1_GROQ_KEY=YOUR_GROQ_API_KEY_HERE
TRADER_1_GROQ_MODEL=openai/gpt-oss-120b
TRADER_1_INITIAL_BALANCE=10000.0
TRADER_1_SCAN_INTERVAL_MINUTES=5
```

### Trader 2 (Qwen Trader)
```
TRADER_2_ID=qwen_trader
TRADER_2_NAME=Qwen Trader
TRADER_2_ENABLED=true
TRADER_2_AI_MODEL=groq
TRADER_2_EXCHANGE=paper
TRADER_2_GROQ_KEY=YOUR_GROQ_API_KEY_HERE
TRADER_2_GROQ_MODEL=qwen/qwen3-32b
TRADER_2_INITIAL_BALANCE=10000.0
TRADER_2_SCAN_INTERVAL_MINUTES=5
```

### Global Settings
```
BTC_ETH_LEVERAGE=10
ALTCOIN_LEVERAGE=10
USE_DEFAULT_COINS=true
MAX_DAILY_LOSS=10.0
MAX_DRAWDOWN=20.0
STOP_TRADING_MINUTES=60
```

### Supabase Configuration (if using)
```
USE_SUPABASE=true
SUPABASE_URL=https://gboezrzwcsdktdmzmjwn.supabase.co
SUPABASE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
SUPABASE_DATABASE_URL=postgresql://postgres.gboezrzwcsdktdmzmjwn:YOUR_PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
SUPABASE_SCHEMA=public
```

---

## ✅ Recommended Approach

**Use Secret Files** - It's simpler and more secure:
1. Keep your `config.json` with all settings
2. Upload it as a Secret File in Render
3. No need to manage dozens of environment variables

