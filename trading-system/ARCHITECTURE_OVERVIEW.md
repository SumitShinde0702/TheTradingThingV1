# 🏗️ Architecture Overview - Live Trading System

This document explains how your deployed system works and how the components connect.

---

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Browser                             │
│  https://your-project.vercel.app                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS
                     │
        ┌────────────▼────────────┐
        │   Vercel (Frontend)     │
        │   React + TypeScript    │
        │   Static Files          │
        └────────────┬────────────┘
                     │
        ┌────────────┼────────────┐
        │            │             │
        │            │             │
   ┌────▼────┐  ┌───▼────┐  ┌─────▼─────┐
   │  Go API  │  │Payment │  │ Supabase  │
   │ Backend  │  │ Server │  │ (Optional)│
   │          │  │        │  │           │
   │ Render/  │  │Render/ │  │  Cloud    │
   │ Railway  │  │Railway │  │  Database │
   └────┬─────┘  └───┬────┘  └───────────┘
        │            │
        │            │
   ┌────▼────┐  ┌───▼────┐
   │ Binance │  │ Hedera │
   │   API   │  │Network │
   └─────────┘  └────────┘
```

---

## 🔄 Data Flow

### 1. Viewing Trading Data

```
User Browser
    ↓ (HTTPS)
Vercel Frontend
    ↓ (API Call)
Go Backend API (Render/Railway)
    ↓ (REST API)
Binance API / SQLite Database
    ↓ (Data)
Go Backend
    ↓ (JSON Response)
Vercel Frontend
    ↓ (Render)
User Browser (Charts & Tables)
```

**Example Flow:**
1. User opens competition page
2. Frontend calls: `GET https://your-backend.onrender.com/api/competition`
3. Go backend queries traders and returns JSON
4. Frontend displays charts and statistics

---

### 2. Purchasing Model Access

```
User Browser
    ↓ (Click "Pay" button)
Vercel Frontend
    ↓ (POST /api/payments/model-payment)
Payment Server (Render/Railway)
    ↓ (Hedera SDK)
Hedera Blockchain
    ↓ (Transaction)
Payment Server
    ↓ (Payment Confirmation)
Vercel Frontend
    ↓ (Display Success)
User Browser
```

**Example Flow:**
1. User selects "OpenAI" model
2. User clicks "💳 Pay" button
3. Frontend calls: `POST https://your-payment-server.onrender.com/api/payments/model-payment`
4. Payment server creates Hedera transaction
5. Returns: `{ success: true, payment: { txHash, hashscanUrl } }`
6. Frontend stores payment and enables "Get Signal" button

---

### 3. Getting AI Trading Signal

```
User Browser
    ↓ (Click "Get Signal" button)
Vercel Frontend
    ↓ (POST /api/ai/purchase with SSE)
Payment Server (Render/Railway)
    ↓ (Agent calls get_trading_signal tool)
Go Backend API
    ↓ (GET /api/trading-signal?model=openai)
Go Backend (AI Decision)
    ↓ (JSON Response)
Payment Server
    ↓ (SSE Stream)
Vercel Frontend
    ↓ (Real-time Updates)
User Browser (Live Signal Display)
```

**Example Flow:**
1. User clicks "📡 Get AI Signal" button
2. Frontend opens SSE connection: `POST https://your-payment-server.onrender.com/api/ai/purchase`
3. Payment server's AI agent calls `get_trading_signal` tool
4. Tool makes HTTP request to Go backend: `GET https://your-backend.onrender.com/api/trading-signal?model=openai`
5. Go backend returns latest trading decision
6. Payment server streams response via SSE
7. Frontend displays signal in real-time

---

## 🔌 API Endpoints

### Frontend → Go Backend

All endpoints are prefixed with `/api`:

- `GET /api/competition` - Get all traders overview
- `GET /api/traders` - Get list of all traders
- `GET /api/status?trader_id=xxx` - Get trader status
- `GET /api/account?trader_id=xxx` - Get account info
- `GET /api/positions?trader_id=xxx` - Get open positions
- `GET /api/equity-history?trader_id=xxx` - Get equity chart data
- `GET /api/trading-signal?model=xxx` - Get latest AI signal
- `GET /api/statistics?trader_id=xxx` - Get trading statistics

**Base URL**: `https://your-backend.onrender.com`

---

### Frontend → Payment Server

- `POST /api/payments/model-payment` - Pay for model access
  - Body: `{ "modelName": "OpenAI" }`
  - Returns: `{ success: true, payment: { txHash, hashscanUrl } }`

- `POST /api/ai/purchase` - Get AI signal (SSE stream)
  - Body: `{ "query": "Get trading signal from OpenAI..." }`
  - Returns: Server-Sent Events stream

**Base URL**: `https://your-payment-server.onrender.com`

---

## 🔐 Environment Variables

### Frontend (Vercel)

```bash
VITE_API_URL=https://your-backend.onrender.com/api
VITE_AI_SERVER_URL=https://your-payment-server.onrender.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_key
VITE_USE_SUPABASE=true
```

### Go Backend (Render/Railway)

```bash
BINANCE_API_KEY=your_key
BINANCE_SECRET_KEY=your_secret
GROQ_API_KEY=your_key
DEEPSEEK_API_KEY=your_key
PORT=8080
SUPABASE_URL=your_url
SUPABASE_KEY=your_key
```

### Payment Server (Render/Railway)

```bash
HEDERA_NETWORK=testnet
HASHIO_RPC_URL=https://testnet.hashio.io/api
CHAIN_ID=296
MERCHANT_ACCOUNT_ID=0.0.xxxxx
MERCHANT_PRIVATE_KEY=0x...
CONSUMER_ACCOUNT_ID=0.0.xxxxx
CONSUMER_PRIVATE_KEY=0x...
PORT=8443
```

---

## 📁 File Structure

```
TheTradingThingV1/
├── trading-system/
│   ├── web/                    # Frontend (Vercel)
│   │   ├── src/
│   │   │   ├── App.tsx         # Main app component
│   │   │   ├── lib/
│   │   │   │   └── api.ts      # API client
│   │   │   └── components/    # React components
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── main.go                 # Go backend entry
│   ├── api/
│   │   └── server.go           # API server
│   ├── config.json             # Trader configuration
│   └── vercel.json             # Vercel config
│
└── server/                     # Payment server (Render/Railway)
    ├── src/
    │   ├── index.js            # Express server
    │   ├── routes/
    │   │   ├── payments.js     # Payment endpoints
    │   │   └── ai.js           # AI agent endpoints
    │   └── services/
    │       └── X402Facilitator.js  # Hedera payments
    └── package.json
```

---

## 🔄 How Models Run

### Go Backend (Trading Models)

The Go backend runs continuously and:

1. **Loads Configuration**: Reads `config.json` with trader settings
2. **Initializes Traders**: Creates AI traders (OpenAI, Qwen, DeepSeek, etc.)
3. **Starts Trading Loop**: Each trader:
   - Scans market every N minutes
   - Calls AI model for decision
   - Executes trades on Binance
   - Logs decisions to database
4. **Serves API**: Responds to frontend requests with real-time data

**Location**: Runs on Render/Railway 24/7

---

### Payment Server (Hedera Agents)

The payment server runs continuously and:

1. **Registers Agents**: PaymentProcessor, DataAnalyzer, TradeExecutor
2. **Listens for Requests**: Waits for payment and AI requests
3. **Processes Payments**: Creates Hedera transactions
4. **Calls AI Models**: Uses agents to get trading signals from Go backend
5. **Streams Responses**: Uses SSE for real-time updates

**Location**: Runs on Render/Railway 24/7

---

## 🎨 Frontend Components

### CompetitionPage
- Shows all traders in a comparison view
- Displays equity charts
- Model selection and payment buttons

### TraderDetailsPage
- Shows individual trader details
- Equity history chart
- Open positions table
- Recent decisions list

### PortfolioView
- Aggregated portfolio view
- Combined performance metrics

### TradingSignal
- Displays latest AI trading signal
- Shows AI reasoning and decision

---

## 🔒 Security Considerations

1. **API Keys**: Never exposed in frontend code (only in environment variables)
2. **CORS**: Backend must allow requests from Vercel domain
3. **HTTPS**: All connections use HTTPS (automatic on Vercel/Render)
4. **Private Keys**: Hedera keys only in payment server environment variables
5. **Rate Limiting**: Consider adding rate limits to payment endpoints

---

## 🚀 Scaling Considerations

### Current Setup (Small Scale)
- Frontend: Vercel (handles auto-scaling)
- Backend: Render/Railway free tier (1 instance)
- Payment: Render/Railway free tier (1 instance)

### For Larger Scale
- **Backend**: Use Render/Railway paid tier for 24/7 uptime
- **Database**: Use Supabase (PostgreSQL) instead of SQLite
- **CDN**: Vercel automatically uses CDN
- **Load Balancing**: Consider multiple backend instances
- **Monitoring**: Add UptimeRobot or similar

---

## 🐛 Debugging Tips

### Frontend Issues
1. Check browser console for errors
2. Check Network tab for failed API calls
3. Verify environment variables in Vercel dashboard
4. Test API endpoints directly with curl

### Backend Issues
1. Check Render/Railway logs
2. Test health endpoint: `curl https://your-backend.onrender.com/health`
3. Verify Go server is running
4. Check `config.json` has enabled traders

### Payment Server Issues
1. Check Render/Railway logs
2. Verify Hedera credentials
3. Test payment endpoint with curl
4. Check Hedera network (testnet vs mainnet)

---

## 📚 Related Documentation

- `DEPLOYMENT_GUIDE.md` - Complete deployment instructions
- `QUICK_DEPLOY_CHECKLIST.md` - Quick deployment checklist
- `API_ENDPOINTS_FOR_FRIEND.md` - API endpoint reference
- `server/FLOW_EXPLANATION.md` - Payment flow details

---

This architecture allows you to:
- ✅ Display real-time trading data
- ✅ Show model performance graphs
- ✅ Process payments via Hedera
- ✅ Get AI trading signals
- ✅ Scale as needed

All components are independent and can be updated separately! 🎉

