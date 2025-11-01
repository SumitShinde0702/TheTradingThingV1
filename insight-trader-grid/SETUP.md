# The Trading Thing - Setup Guide

A dark-themed AI trading platform with multi-model performance tracking, real-time signals, and per-model trading insights via x402 payment protocol on Hedera testnet.

## Features

- **Free Trading Graph**: View multi-model performance tracking (always visible, no payment required)
- **Per-Model Insights**: Purchase AI-generated trading insights for 4 USDC per model
- **Live Signals Feed**: Real-time trading signals (FREE to view)
- **Hedera Testnet**: Web3 wallet integration with x402 payment protocol
- **Multi-Model Support**: DeepSeek, ChatGPT, Groq, xAI Grok, Mock Vendor

## Quick Start

### 1. Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

```env
VITE_API_URL=http://localhost:8443
VITE_FACILITATOR_URL=https://x402-hedera-production.up.railway.app
VITE_NETWORK=hedera-testnet
VITE_CHAIN_ID=296
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:8080`.

## Backend Integration

### Backend Server

The app expects a backend server running at `http://localhost:8443` (or configured URL) with the following endpoints:

#### Health Check
```
GET /health
Response: { status: "healthy", agents: 3, timestamp: 1234567890 }
```

#### List Agents
```
GET /api/agents
Response: {
  success: true,
  agents: [
    {
      id: "13",
      name: "TradingAgent",
      description: "Autonomous trading agent",
      walletAddress: "0x987effd3acba1cf13968bc0c3af3fd661e07c62e"
    }
  ]
}
```

#### Get Trading Insights (x402 Payment Flow)
```
POST /api/agents/{tradingAgentId}/message
Headers: { "Content-Type": "application/json", "X-Payment": "0x..." }
Body: {
  message: "Provide trading insights...",
  fromAgentId: "user-client",
  payment: {
    required: true,
    amount: "4",
    token: "0.0.429274"
  }
}

Response (402 Payment Required):
{
  success: false,
  paymentRequired: true,
  payment: {
    requestId: "req_...",
    amount: "4",
    token: "0.0.429274",
    facilitator: "https://x402-hedera-production.up.railway.app"
  }
}

Response (200 Success):
{
  success: true,
  response: "AI-generated trading insights..."
}
```

#### Live Signals (SSE - Optional)
```
GET /api/ai/signals?models=deepseek,groq
Response: text/event-stream
```

If SSE is not implemented, the app automatically falls back to mock data.

### Backend Server Setup

See the backend documentation for setting up the trading agent server with x402 payment integration.

## Wallet Connection

### Hedera Testnet

- **Network**: Hedera Testnet
- **RPC URL**: https://testnet.hashio.io/api
- **Chain ID**: 296
- **Currency**: HBAR
- **USDC Token**: 0.0.429274

### Wallet Setup

1. Install MetaMask or compatible Web3 wallet
2. Add Hedera Testnet network (app will prompt automatically)
3. Get testnet HBAR from [Hedera Faucet](https://portal.hedera.com/faucet)
4. Get testnet USDC tokens for purchasing insights

### Simulated Wallet

If no wallet is connected, click "Connect Wallet" and the app will offer a simulated wallet option for demo purposes.

## Usage

### 1. View Trading Performance (FREE)

The trading graph is always visible and shows multi-model performance tracking. No payment required.

### 2. Select Trading Models

Use the "Trading Models" card to select which AI models to track (multi-select enabled).

### 3. Purchase Trading Insights

1. Click "Purchase Info" on any model badge in the graph
2. Review the 4 USDC price for that model's insights
3. Click "Purchase {Model} Insights"
4. Complete payment via x402 facilitator window
5. View AI-generated buy/sell recommendations

**Pricing**: 4 USDC per model
- 1 model = 4 USDC
- 2 models = 8 USDC (two separate payments)
- 3 models = 12 USDC (three separate payments)

Each model purchase is independent.

### 4. Monitor Live Signals (FREE)

The "Live Signals" list shows the last 10 trading signals across all selected models. No payment required.

## Contract Addresses (Hedera Testnet)

- **USDC Token**: `0.0.429274`
- **Identity Registry**: `0x4c74ebd72921d537159ed2053f46c12a7d8e5923`
- **Reputation Registry**: `0xc565edcba77e3abeade40bfd6cf6bf583b3293e0`
- **Validation Registry**: `0x18df085d85c586e9241e0cd121ca422f571c2da6`

## Development

### Project Structure

```
src/
├── components/
│   ├── TradingChart.tsx          # Multi-line chart with model badges
│   ├── ModelSelector.tsx         # Model selection checkboxes
│   ├── LiveSignals.tsx           # Terminal-style signals list
│   └── TradingInsightsModal.tsx  # x402 payment flow & insights
├── hooks/
│   ├── useWallet.ts              # Hedera wallet connection
│   └── useSignals.ts             # SSE/mock signals feed
├── lib/
│   └── api.ts                    # Backend API client
└── pages/
    └── Index.tsx                 # Main app layout
```

### Mock Data

If the backend is not available, the app automatically uses mock data:
- Mock signals generate every 3 seconds
- Mock account values simulate trading performance
- All features work without backend except payment flow

### Styling

The design system uses dark theme with neon accents:
- Background: `#0a0a0a`
- Neon violet: `hsl(263 70% 60%)`
- Neon cyan: `hsl(180 100% 50%)`
- Neon lime: `hsl(84 100% 60%)`
- Neon orange: `hsl(30 100% 60%)`

All colors are defined in `src/index.css` using HSL values.

## Troubleshooting

### Backend Connection Failed
- Check `VITE_API_URL` in `.env`
- Verify backend server is running
- App will fallback to mock data automatically

### Wallet Connection Failed
- Ensure MetaMask is installed
- Check network settings (Chain ID 296)
- Use "Simulated Wallet" option for demo

### Payment Failed
- Verify wallet has sufficient USDC balance
- Check Hedera testnet status
- Review browser console for error details

### Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear build cache: `npm run build -- --force`

## Support

For issues or questions:
1. Check browser console for error messages
2. Verify backend health: `curl http://localhost:8443/health`
3. Test wallet connection manually
4. Review network requests in browser DevTools

## License

MIT
