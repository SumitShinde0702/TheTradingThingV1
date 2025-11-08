# Quick Setup: Allow Friend to Access API

## Fastest Method: ngrok (30 seconds)

### 1. Download ngrok
- Go to: https://ngrok.com/download
- Download Windows version
- Extract `ngrok.exe` to your project folder or anywhere

### 2. Run ngrok
Open a new terminal in your project folder and run:
```
ngrok http 8080
```

### 3. Share the URL
You'll see something like:
```
Forwarding  https://abc123-def456.ngrok-free.app -> http://localhost:8080
```
Share the `https://abc123-def456.ngrok-free.app` URL with your friend!

### 4. Your friend can now access:
```
https://abc123-def456.ngrok-free.app/api/competition
https://abc123-def456.ngrok-free.app/api/traders
https://abc123-def456.ngrok-free.app/api/account?trader_id=grok_trader
https://abc123-def456.ngrok-free.app/api/equity-history?trader_id=grok_trader
```

**Note:** The free ngrok URL changes every time you restart it. For a permanent URL, sign up for a free ngrok account.

