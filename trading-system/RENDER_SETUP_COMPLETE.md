# ✅ Render Setup Guide - Complete Instructions

## 🐛 Issue Fixed: Slow Frontend Loading

**Problem**: Frontend was taking 30+ seconds to load because the `equity-history` endpoint was loading ALL records from database (taking 2+ minutes).

**Solution**: ✅ Fixed! Now limits to latest 2000 records (much faster).

---

## 📋 Step-by-Step Render Deployment

### Step 1: Prepare Config File

Your current `config.json` is ready! Just make sure it has:

- ✅ Your Groq API key
- ✅ Your Supabase credentials
- ✅ Trader configurations

**File location**: `config.json` (already exists on your machine)

---

### Step 2: Deploy on Render

1. **Go to Render.com** → Sign up/Login
2. **Click "New +"** → **"Web Service"**
3. **Connect GitHub** → Select `Lia_ai` repository
4. **Configure Service:**
   - Name: `lia-backend`
   - Region: Choose closest (Oregon/Frankfurt)
   - Branch: `main`
   - **Build Command**: `go mod download && go build -o lia`
   - **Start Command**: `bash -c "if [ ! -f config.json ]; then cp config.json.example config.json; fi && ./lia"`
   - Instance: **Starter** ($7/month) for 24/7 operation

### Step 3: Upload Config File (SECURE WAY)

⚠️ **This is the recommended way - keeps your API keys secure:**

1. Go to your Render service → **"Environment"** tab
2. Scroll down to **"Secret Files"** section
3. Click **"Add Secret File"**
4. **Path**: `config.json`
5. **Upload**: Your local `config.json` file (with all your API keys)
6. Click **"Save"**

✅ Your API keys are now secure and not in git!

---

### Step 4: Set Health Check

- **Health Check Path**: `/health`

### Step 5: Deploy

Click **"Create Web Service"** and wait 5-10 minutes.

---

## 🔐 Environment Variables (If You Want to Use Them)

**Note**: You don't need these if you upload `config.json` as a Secret File (recommended). But if you prefer environment variables:

### PORT (Auto-set by Render)

```
PORT=8080
```

_(Render sets this automatically - no need to add it)_

### That's It!

Since your config is in JSON format with Supabase settings, **Secret Files is the easiest approach**. Just upload your `config.json` file.

---

## ✅ After Deployment

Your backend URL will be: `https://lia-backend.onrender.com`

Test endpoints:

- Health: `https://lia-backend.onrender.com/health`
- API: `https://lia-backend.onrender.com/api/competition`

---

## 🚀 What's Fixed

1. ✅ **Slow loading issue** - Equity history now loads in seconds (limit 2000 records)
2. ✅ **PORT handling** - Automatically uses Render's PORT variable
3. ✅ **Config setup** - Ready for Secret Files upload
4. ✅ **Performance** - Much faster database queries

---

## 📝 Summary

**You don't need to manually enter environment variables!**

Just:

1. Deploy to Render
2. Upload your `config.json` as a Secret File
3. Done! ✅

The config file you have is perfect - just upload it to Render's Secret Files section.
