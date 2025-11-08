# 🚀 Deploy Frontend to Vercel - Complete Guide

## ⚠️ IMPORTANT: Set Root Directory First!

Before setting environment variables, you **must** set the root directory in Vercel:

1. Go to **Vercel Dashboard** → Your project → **Settings** → **General**
2. Scroll to **"Root Directory"** section
3. Click **"Edit"**
4. Set to: `web`
5. Click **"Save"**

This is required because your frontend code is in the `web/` subdirectory!

---

## Required Environment Variables

Add these in Vercel's **Environment Variables** section:

### 1. Backend API URL (Required)
```
VITE_API_URL=https://lia-ai-pwup.onrender.com/api
```
Replace `lia-ai-pwup.onrender.com` with your actual Render backend URL.

### 2. Supabase Configuration (Optional but Recommended)
```
VITE_SUPABASE_URL=https://gboezrzwcsdktdmzmjwn.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY_HERE
VITE_USE_SUPABASE=true
```

**Note**: 
- If you don't set Supabase variables, the frontend will fall back to using the backend API (which is fine!)
- `VITE_USE_SUPABASE=false` will disable Supabase completely

---

## 📋 Complete List for Vercel

Copy and paste these into Vercel:

```
VITE_API_URL=https://lia-ai-pwup.onrender.com/api
VITE_SUPABASE_URL=https://gboezrzwcsdktdmzmjwn.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY_HERE
VITE_USE_SUPABASE=true
```

---

## 🔍 Where to Get Values

### VITE_API_URL
- Your Render backend URL: `https://lia-ai-pwup.onrender.com/api`
- Make sure to include `/api` at the end

### VITE_SUPABASE_ANON_KEY
- Get from your Supabase dashboard:
  1. Go to https://supabase.com/dashboard
  2. Select your project
  3. Go to **Settings** → **API**
  4. Copy the **"anon public"** key (not the service_role key!)

---

## ✅ Quick Setup Steps

1. **Go to Vercel Dashboard** → Your project → **Settings** → **Environment Variables**
2. **Add each variable:**
   - Key: `VITE_API_URL`, Value: `https://lia-ai-pwup.onrender.com/api`
   - Key: `VITE_SUPABASE_URL`, Value: `https://gboezrzwcsdktdmzmjwn.supabase.co`
   - Key: `VITE_SUPABASE_ANON_KEY`, Value: `[your anon key]`
   - Key: `VITE_USE_SUPABASE`, Value: `true`
3. **Save** and redeploy

---

## 🔄 After Deployment

Your frontend will be available at: `https://your-project.vercel.app`

It will automatically connect to your Render backend!

