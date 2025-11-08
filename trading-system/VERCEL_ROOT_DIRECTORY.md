# 🔧 Vercel Root Directory Configuration

## ⚠️ Important: Set Root Directory in Vercel

Your frontend code is in the `web/` subdirectory, so you need to configure Vercel to use it as the root.

### Steps:

1. **Go to Vercel Dashboard** → Your project → **Settings**
2. **Click "General"** tab
3. **Scroll to "Root Directory"** section
4. **Click "Edit"**
5. **Set Root Directory to:** `web`
6. **Click "Save"**

This tells Vercel to:
- Look for `package.json` in the `web/` folder
- Run `npm install` and `npm run build` from the `web/` directory
- Use `web/dist` as the output directory

---

## ✅ After Setting Root Directory

Once you set the root directory to `web`:
- Vercel will automatically detect `package.json` in `web/`
- Build command will run from `web/` directory
- Output will be from `web/dist/`
- Deployment will work correctly!

---

## 🔄 Alternative: Manual Build Command (If Root Directory Doesn't Work)

If setting root directory doesn't work, you can manually set the build command in Vercel:

1. Go to **Settings** → **General** → **Build & Development Settings**
2. Override the build command with:
   ```bash
   npm install && npm run build
   ```
3. Set Framework Preset to: **Other** or **Vite**
4. Set Output Directory to: `dist`

But **Root Directory = `web`** is the recommended approach!

