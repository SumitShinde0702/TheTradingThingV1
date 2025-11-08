# 📝 Vercel Environment Variables - Copy & Paste

## Add These in Vercel Dashboard

Go to: **Your Project → Settings → Environment Variables**

Then add these **4 variables**:

---

### 1. Backend API URL (REQUIRED)
```
Key: VITE_API_URL
Value: https://lia-ai-pwup.onrender.com/api
```

### 2. Supabase URL (Required if using Supabase)
```
Key: VITE_SUPABASE_URL
Value: https://gboezrzwcsdktdmzmjwn.supabase.co
```

### 3. Supabase Anon Key (Required if using Supabase)
```
Key: VITE_SUPABASE_ANON_KEY
Value: [Get from Supabase Dashboard → Settings → API → anon public key]
```

### 4. Enable Supabase (Optional)
```
Key: VITE_USE_SUPABASE
Value: true
```
(Set to `false` if you want to disable Supabase and only use backend API)

---

## 🔍 How to Get Supabase Anon Key

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **Settings** (gear icon) → **API**
4. Find **"Project API keys"**
5. Copy the **"anon public"** key (NOT the service_role key!)
6. Paste it as `VITE_SUPABASE_ANON_KEY`

---

## ✅ Quick Copy List

Copy these exact values into Vercel:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://lia-ai-pwup.onrender.com/api` |
| `VITE_SUPABASE_URL` | `https://gboezrzwcsdktdmzmjwn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `[paste your anon key here]` |
| `VITE_USE_SUPABASE` | `true` |

---

## 🚀 After Adding Variables

1. Click **Save** in Vercel
2. Redeploy your project (Vercel will auto-redeploy after you save)
3. Your frontend will connect to your Render backend!

---

## ⚠️ Important Notes

- Make sure `VITE_API_URL` points to your actual Render backend URL
- If your Render URL is different, replace `lia-ai-pwup.onrender.com` with your URL
- The `/api` at the end is important - keep it!

