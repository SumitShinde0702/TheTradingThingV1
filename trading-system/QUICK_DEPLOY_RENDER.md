# 🚀 Quick Deploy to Render - Step by Step

## Prerequisites

- ✅ Code is on GitHub: https://github.com/bchuazw/Lia_ai
- ✅ You have your API keys ready

## Steps (15 minutes)

### 1. Prepare Config File (2 min)

```bash
# On your local machine
cp config.json.example config.json
# Edit config.json with your actual API keys
# DON'T commit this file (it's in .gitignore)
```

### 2. Create Render Account (3 min)

1. Go to https://render.com
2. Click **"Get Started"**
3. Sign up with GitHub (recommended)
4. Authorize Render to access your GitHub

### 3. Deploy Backend (10 min)

1. In Render dashboard, click **"New +"** → **"Web Service"**

2. **Connect Repository:**

   - Click **"Connect account"** if not connected
   - Select repository: `Lia_ai`

3. **Basic Settings:**

   - Name: `lia-backend`
   - Region: Choose closest to you
   - Branch: `main`

4. **Build Settings:**

   - **Build Command**: `go mod download && go build -o lia`
   - **Start Command**: `bash -c "if [ ! -f config.json ]; then cp config.json.example config.json; fi && ./lia"`

5. **Instance Type:**

   - Choose **Starter** ($7/month) for 24/7 operation
   - ⚠️ Free tier spins down after 15 min inactivity

6. **Environment Tab:**

   - Scroll to **"Secret Files"** section
   - Click **"Add Secret File"**
   - Path: `config.json`
   - Upload your local `config.json` file with API keys
   - Click **"Add Secret File"**

7. **Health Check:**

   - Health Check Path: `/health`

8. **Deploy:**
   - Scroll down and click **"Create Web Service"**
   - Wait 5-10 minutes for first build

### 4. Verify Deployment

After deployment completes:

1. You'll get a URL like: `https://lia-backend.onrender.com`

2. Test health endpoint:

   ```
   https://lia-backend.onrender.com/health
   ```

   Should return: `{"status":"ok"}`

3. Test API:
   ```
   https://lia-backend.onrender.com/api/competition
   ```

### 5. Monitor Logs

- Go to Render dashboard → Your service → **"Logs"** tab
- Watch for startup messages
- Check for any errors

## ✅ That's It!

Your backend is now running 24/7 on Render!

### Important Notes:

- ⚠️ **Free tier**: Spins down after 15 min inactivity (not good for trading bot)
- 💰 **Recommended**: Starter plan ($7/month) for always-on service
- 🔒 **Security**: Your `config.json` is uploaded as secret file, not in git
- 🔄 **Auto-deploy**: Render auto-deploys when you push to `main` branch

### Next Steps:

- Monitor logs regularly
- Check API responses
- Set up frontend to connect to Render backend URL

---

**Need help?** Check the full guide: `RENDER_DEPLOYMENT.md`
