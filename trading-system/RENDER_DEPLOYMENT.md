# Deploy Backend to Render.com - Complete Guide

This guide will help you deploy your Lia AI Trading backend to Render.com so it runs 24/7 without keeping your computer on.

## 📋 Prerequisites

1. ✅ GitHub repository is up to date (already done: https://github.com/bchuazw/Lia_ai)
2. ✅ Render.com account (free tier available)
3. ✅ Your API keys and configuration ready

## 🚀 Step-by-Step Deployment

### Step 1: Prepare Your Config File

**Option A: Commit a config.json (Not Recommended for Security)**

- This exposes your API keys in the repository
- Only do this if using a private repo and you're okay with the risk

**Option B: Use Environment Variables (Recommended)**

- We'll create config.json at build time from environment variables

For now, let's use a simple approach:

1. Copy `config.json.example` as a template:

   ```bash
   cp config.json.example config.json
   ```

2. Edit `config.json` with your actual API keys (but DON'T commit this file - it's in .gitignore)

### Step 2: Sign Up for Render

1. Go to [render.com](https://render.com)
2. Sign up with your GitHub account (recommended) or email
3. Verify your email if needed

### Step 3: Create a New Web Service

1. Click **"New +"** button in the Render dashboard
2. Select **"Web Service"**
3. Click **"Connect account"** and authorize Render to access your GitHub
4. Select your repository: **`Lia_ai`** (or `bchuazw/Lia_ai`)

### Step 4: Configure the Service

Use these settings:

**Basic Settings:**

- **Name**: `lia-backend` (or any name you like)
- **Region**: Choose closest to you (recommended: `Oregon` for US West, `Frankfurt` for Europe)
- **Branch**: `main`
- **Root Directory**: Leave empty (default)

**Build & Deploy:**

- **Runtime**: `Go`
- **Build Command**:
  ```bash
  go mod download && go build -o lia
  ```
- **Start Command**:
  ```bash
  bash -c "if [ ! -f config.json ]; then cp config.json.example config.json; fi && ./lia"
  ```

**Instance Type:**

- **Free Tier**: `Free` (512 MB RAM) - ⚠️ **Note**: Free tier may spin down after inactivity
- **Paid Tier**: `Starter` ($7/month) - Recommended for 24/7 operation

### Step 5: Configure Environment Variables

⚠️ **IMPORTANT**: Your API keys should be in environment variables, NOT committed to GitHub!

In Render dashboard, scroll to **"Environment Variables"** section and add:

#### Required Variables

**Critical**: Set `PORT` environment variable (Render sets this automatically, but you can override):

**Note**: Render automatically sets the `PORT` environment variable. The app now reads this and overrides the config file setting.

**For Security (Recommended)**: Instead of committing `config.json` with API keys, you should:

1. **Create `config.json` locally** with your API keys
2. **Don't commit it** (it's already in `.gitignore`)
3. **Upload it via Render Dashboard**:
   - Go to your Render service → **"Environment"** tab
   - Click **"Secret Files"** section
   - Add a secret file: Path = `config.json`, upload your local `config.json`
   - This way your API keys stay secure and aren't in git

OR

**Option: Use Environment Variables** (if we implement env var support later)

For now, the simplest approach is to upload `config.json` as a secret file in Render.

### Step 6: Set Up Health Check

The backend already has a `/health` endpoint, so Render can monitor it:

- **Health Check Path**: `/health`

### Step 7: Deploy!

1. Scroll to the bottom
2. Click **"Create Web Service"**
3. Render will start building and deploying
4. Wait 5-10 minutes for the first build

### Step 8: Get Your Service URL

After deployment:

1. You'll get a URL like: `https://lia-backend.onrender.com`
2. Test the health endpoint: `https://lia-backend.onrender.com/health`
3. Test API: `https://lia-backend.onrender.com/api/competition`

## 🔧 Configuration Tips

### Port Configuration

The app uses port 8080 by default, but Render assigns a `PORT` environment variable. We need to update the code to use Render's PORT.

### Database Storage

**For persistent storage on Render:**

- Use **Supabase** (recommended for cloud) - Free tier available
- OR use Render's PostgreSQL (paid, $7/month)
- SQLite files on Render's ephemeral disk will be lost on restart

### Free Tier Limitations

⚠️ **Important**: Render's free tier:

- Spins down after 15 minutes of inactivity
- Takes 30-60 seconds to wake up on first request
- Not ideal for 24/7 trading bots

**Solution**: Use Render's **Starter** plan ($7/month) for always-on service.

## 📝 Next Steps After Deployment

### 1. Update Frontend API URL

If you want to access the backend from your frontend:

1. Update `web/src/lib/api.ts`:

   ```typescript
   const API_BASE =
     import.meta.env.VITE_API_URL || "https://lia-backend.onrender.com/api";
   ```

2. Deploy frontend separately (Vercel, Netlify, or Render Static Site)

### 2. Monitor Logs

- Go to Render dashboard → Your service → **"Logs"** tab
- Check for any errors or issues
- Monitor API calls and trading activity

### 3. Set Up Auto-Deploy

Render automatically deploys when you push to `main` branch.

## 🛠️ Troubleshooting

### Build Fails

**Error**: `go: cannot find module`

- **Fix**: Make sure `go.mod` is in the root directory

### Service Won't Start

**Error**: `port already in use` or connection refused

- **Fix**: Make sure the app reads `PORT` environment variable (we'll update the code)

### Config File Not Found

**Error**: `Failed to load configuration`

- **Fix**: The startup script should generate `config.json` before starting

### API Keys Not Working

- Double-check environment variables are set correctly
- Verify no extra spaces or quotes in the values
- Check logs in Render dashboard for specific errors

## 💰 Cost Estimate

- **Free Tier**: $0/month (may spin down)
- **Starter Plan**: $7/month (always-on, 512 MB RAM, suitable for trading bot)
- **Standard Plan**: $25/month (1 GB RAM, better performance)

## ✅ Checklist

Before deploying, make sure:

- [ ] All sensitive data is in environment variables (NOT in code)
- [ ] GitHub repository is up to date
- [ ] You have all API keys ready
- [ ] Database is configured (Supabase recommended)
- [ ] Health check endpoint works (`/health`)
- [ ] You've tested locally first

---

**Ready to deploy?** Follow the steps above, and your trading bot will run 24/7 on Render! 🚀
