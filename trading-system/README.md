git# The Trading Thing

[![Go Version](https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat&logo=go)](https://golang.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)

An AI-powered cryptocurrency trading system that uses advanced AI models to make autonomous trading decisions across multiple exchanges.

## 🚀 Features

- **Multi-Exchange Support**: Trade on Binance Futures, Hyperliquid, and Aster DEX
- **AI-Powered Decisions**: Utilizes Grok, DeepSeek, Qwen, and custom AI models for trading decisions
- **Self-Learning System**: Analyzes historical performance (last 20 cycles) and adapts strategies accordingly
- **Risk Management**: Built-in position limits, leverage controls, stop-loss/take-profit management, and daily loss limits
- **Real-Time Dashboard**: Monitor trades, equity curves, and AI decision logs through a professional web interface
- **Multi-Timeframe Analysis**: 3-minute real-time data combined with 4-hour trend analysis
- **Technical Indicators**: EMA, MACD, RSI, ATR and more
- **Multi-Trader Competition**: Run multiple AI traders simultaneously and compare their performance

## 📋 Prerequisites

- **Go 1.21+**
- **Node.js 18+**
- **TA-Lib** library (for technical indicators)

### Installing TA-Lib

**macOS:**
```bash
brew install ta-lib
```

**Ubuntu/Debian:**
```bash
sudo apt-get install libta-lib0-dev
```

**Windows:**
Download from [TA-Lib website](http://ta-lib.org/install/) or use a package manager like Chocolatey.

**Other systems**: Refer to [TA-Lib Official Documentation](https://github.com/markcheno/go-talib)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/bchuazw/TheTradingThing.git
cd TheTradingThing
```

### 2. Install Backend Dependencies

```bash
go mod download
```

### 3. Install Frontend Dependencies

```bash
cd web
npm install
cd ..
```

### 4. Configure the System

Copy the example configuration file:

```bash
cp config.json.example config.json
```

Edit `config.json` with your API keys and settings (see Configuration section below).

## 🚀 Quick Start

### Docker Deployment (Recommended)

Build and run with Docker Compose:

```bash
docker compose up -d --build
```

Access the dashboard at: **http://localhost:3000**

The Docker setup automatically handles all dependencies and environment configuration.

### Manual Installation

**Step 1: Start the Backend**

```bash
# Build the program (first time only, or after code changes)
go build -o lia

# Start the backend
./lia
```

On Windows:
```bash
go build -o lia.exe
./lia.exe
```

Or run directly without building:
```bash
go run main.go
```

**What you should see:**
```
🚀 启动自动交易系统...
✓ Trader [your_trader] 已初始化
✓ API服务器启动在端口 8080
📊 开始交易监控...
```

**Step 2: Start the Frontend**

In a **NEW terminal window** (keep the backend running):

```bash
cd web
npm run dev
```

**What you should see:**
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:3000/
➜  Network: use --host to expose
```

**Step 3: Access Dashboard**

Open your browser and visit: **http://localhost:3000**

**First-time tips:**
- It may take 3-5 minutes for the first AI decision
- Initial decisions might say "wait" - this is normal as the AI analyzes market conditions
- Keep both terminal windows open while the system is running

## ⚙️ Configuration

The system is configured via `config.json`. Here's a detailed configuration guide:

### Basic Configuration Example

```json
{
  "traders": [
    {
      "id": "my_trader",
      "name": "My AI Trader",
      "enabled": true,
      "ai_model": "grok",
      "exchange": "binance",
      "binance_api_key": "your_binance_api_key",
      "binance_secret_key": "your_binance_secret_key",
      "grok_key": "your_grok_api_key",
      "initial_balance": 1000.0,
      "scan_interval_minutes": 3
    }
  ],
  "leverage": {
    "btc_eth_leverage": 5,
    "altcoin_leverage": 5
  },
  "use_default_coins": true,
  "default_coins": [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "ADAUSDT",
    "HYPEUSDT"
  ],
  "api_server_port": 8080,
  "max_daily_loss": 10.0,
  "max_drawdown": 20.0,
  "stop_trading_minutes": 60
}
```

### Configuration Field Explanations

#### Trader Configuration

| Field | Description | Example | Required |
|-------|-------------|---------|----------|
| `id` | Unique identifier for this trader | `"my_trader"` | ✅ Yes |
| `name` | Display name in dashboard | `"My AI Trader"` | ✅ Yes |
| `enabled` | Whether this trader is active | `true` or `false` | ✅ Yes |
| `ai_model` | AI provider to use | `"grok"`, `"deepseek"`, `"qwen"`, or `"custom"` | ✅ Yes |
| `exchange` | Exchange to use | `"binance"`, `"hyperliquid"`, or `"aster"` | ✅ Yes |
| `binance_api_key` | Binance API key | `"abc123..."` | Required for Binance |
| `binance_secret_key` | Binance secret key | `"xyz789..."` | Required for Binance |
| `hyperliquid_private_key` | Hyperliquid private key (remove `0x` prefix) | `"your_key..."` | Required for Hyperliquid |
| `hyperliquid_wallet_addr` | Hyperliquid wallet address | `"0xabc..."` | Required for Hyperliquid |
| `hyperliquid_testnet` | Use testnet | `true` or `false` | ❌ No (defaults to false) |
| `aster_user` | Aster main wallet address | `"0x63DD..."` | Required for Aster |
| `aster_signer` | Aster API wallet address | `"0x21cF..."` | Required for Aster |
| `aster_private_key` | Aster API wallet private key (remove `0x` prefix) | `"4fd0a4..."` | Required for Aster |
| `grok_key` | Grok API key | `"xai-xxx"` | If using Grok |
| `deepseek_key` | DeepSeek API key | `"sk-xxx"` | If using DeepSeek |
| `qwen_key` | Qwen API key | `"sk-xxx"` | If using Qwen |
| `custom_api_url` | Custom AI API URL | `"https://api.openai.com/v1"` | If using custom |
| `custom_api_key` | Custom AI API key | `"sk-xxx"` | If using custom |
| `custom_model_name` | Custom AI model name | `"gpt-4o"` | If using custom |
| `initial_balance` | Starting balance for P/L calculation | `1000.0` | ✅ Yes |
| `scan_interval_minutes` | How often to make trading decisions | `3` (3-5 recommended) | ✅ Yes |

#### Global Configuration

| Field | Description | Example |
|-------|-------------|---------|
| `leverage.btc_eth_leverage` | Max leverage for BTC/ETH (⚠️ Subaccounts: ≤5x) | `5` (safe) or `50` (max for main account) |
| `leverage.altcoin_leverage` | Max leverage for altcoins (⚠️ Subaccounts: ≤5x) | `5` (safe) or `20` (max for main account) |
| `use_default_coins` | Use built-in coin list | `true` (recommended) |
| `default_coins` | List of coins to trade | `["BTCUSDT", "ETHUSDT", ...]` |
| `coin_pool_api_url` | External coin pool API (optional) | `""` (empty) |
| `oi_top_api_url` | Open interest API (optional) | `""` (empty) |
| `api_server_port` | Web dashboard port | `8080` |
| `max_daily_loss` | Maximum daily loss percentage before stopping | `10.0` |
| `max_drawdown` | Maximum drawdown percentage | `20.0` |
| `stop_trading_minutes` | Minutes to wait after hitting limits | `60` |

### Exchange-Specific Configuration

#### Binance Futures Setup

1. Create a Binance account and enable Futures trading
2. Go to Account → API Management
3. Create new API key with **Futures** permission enabled
4. **Important**: Whitelist your IP address for security
5. Add to config:
```json
{
  "exchange": "binance",
  "binance_api_key": "your_api_key",
  "binance_secret_key": "your_secret_key"
}
```

**Leverage Limits:**
- Subaccounts: Maximum 5x leverage
- Main accounts: Up to 20x (altcoins) or 50x (BTC/ETH)

#### Hyperliquid Setup

1. Get your Ethereum private key from MetaMask (or any wallet)
2. Remove the `0x` prefix from the private key
3. Fund your wallet on [Hyperliquid](https://hyperliquid.xyz)
4. Add to config:
```json
{
  "exchange": "hyperliquid",
  "hyperliquid_private_key": "your_private_key_without_0x",
  "hyperliquid_wallet_addr": "your_ethereum_address",
  "hyperliquid_testnet": false
}
```

⚠️ **Security Warning**: Use a dedicated wallet for trading, not your main wallet!

#### Aster DEX Setup

1. Visit [Aster API Wallet](https://www.asterdex.com/en/api-wallet)
2. Connect your main wallet (MetaMask, WalletConnect, etc.)
3. Click "Create API Wallet"
4. **Save these 3 items immediately** (shown only once):
   - Main Wallet address (User)
   - API Wallet address (Signer)
   - API Wallet Private Key
5. Add to config:
```json
{
  "exchange": "aster",
  "aster_user": "0x63DD5aCC6b1aa0f563956C0e534DD30B6dcF7C4e",
  "aster_signer": "0x21cF8Ae13Bb72632562c6Fff438652Ba1a151bb0",
  "aster_private_key": "your_private_key_without_0x_prefix"
}
```

### AI Model Configuration

#### Grok (X.AI)

1. Visit [X.AI Console](https://console.x.ai/)
2. Sign up/login with your X (Twitter) account
3. Navigate to API Keys section
4. Create a new API key
5. Add to config: `"grok_key": "xai-your-api-key"`

#### DeepSeek

1. Visit [platform.deepseek.com](https://platform.deepseek.com)
2. Sign up and verify your account
3. Add credits (minimum ~$5 USD)
4. Create API key in API Keys section
5. Add to config: `"deepseek_key": "sk-xxxxxxxxxxxxx"`

**Pricing**: ~$0.14 per 1M tokens (very cost-effective!)

#### Qwen (Alibaba Cloud)

1. Visit [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com)
2. Register with Alibaba Cloud account
3. Enable DashScope service
4. Create API key in API Key Management
5. Add to config: `"qwen_key": "sk-xxxxxxxxxxxxx"`

#### Custom AI Models

Support for OpenAI, Anthropic, and other compatible APIs:

```json
{
  "ai_model": "custom",
  "custom_api_url": "https://api.openai.com/v1",
  "custom_api_key": "sk-your-api-key",
  "custom_model_name": "gpt-4o"
}
```

### Multi-Trader Competition Setup

Run multiple AI traders competing against each other:

```json
{
  "traders": [
    {
      "id": "grok_trader",
      "name": "Grok AI Trader",
      "enabled": true,
      "ai_model": "grok",
      "exchange": "binance",
      "binance_api_key": "YOUR_API_KEY_1",
      "binance_secret_key": "YOUR_SECRET_KEY_1",
      "grok_key": "xai-xxxxx",
      "initial_balance": 1000.0,
      "scan_interval_minutes": 3
    },
    {
      "id": "qwen_trader",
      "name": "Qwen AI Trader",
      "enabled": true,
      "ai_model": "qwen",
      "exchange": "binance",
      "binance_api_key": "YOUR_API_KEY_2",
      "binance_secret_key": "YOUR_SECRET_KEY_2",
      "qwen_key": "sk-xxxxx",
      "initial_balance": 1000.0,
      "scan_interval_minutes": 3
    }
  ]
}
```

**Requirements:**
- Separate exchange accounts/API keys for each trader
- Different AI API keys for comparison
- More capital for testing (recommended: 500+ USDT per account)

## 📊 Supported Exchanges

### Binance Futures
- ✅ Full futures trading support (long/short)
- ✅ Leverage up to 50x (BTC/ETH) or 20x (altcoins) on main accounts
- ✅ Automatic precision handling
- ✅ Requires API key and secret key
- ✅ Supports testnet and mainnet

### Hyperliquid
- ✅ Decentralized perpetual futures exchange
- ✅ Lower fees than centralized exchanges
- ✅ No KYC required
- ✅ Non-custodial - you control your funds
- ✅ Fast execution with on-chain settlement
- ✅ Uses Ethereum private key authentication

### Aster DEX
- ✅ Binance-compatible API (easy migration)
- ✅ Web3 wallet authentication (secure and decentralized)
- ✅ Lower trading fees than most CEX
- ✅ Multi-chain support (Ethereum, BSC, Polygon)
- ✅ API Wallet security system (separate trading wallet)

## 🧠 AI Decision Flow

Each decision cycle (default 3 minutes), the system executes:

1. **📊 Analyze Historical Performance** (last 20 cycles)
   - Calculate overall win rate, profit/loss ratio
   - Per-coin statistics (win rate, avg P/L in USDT)
   - Identify best/worst performing coins
   - List recent trade details with accurate PnL
   - Calculate Sharpe ratio for risk-adjusted performance

2. **💰 Get Account Status**
   - Total equity & available balance
   - Number of open positions & unrealized P/L
   - Margin usage rate (AI manages up to 90%)
   - Daily P/L tracking & drawdown monitoring

3. **🔍 Analyze Existing Positions** (if any)
   - Fetch latest market data for each position
   - Calculate real-time technical indicators
   - Track position holding duration
   - AI evaluates: Should hold or close?

4. **🎯 Evaluate New Opportunities** (candidate coins)
   - Fetch coin pool (default coins or external API)
   - Filter low liquidity assets (<15M USD)
   - Batch fetch market data + technical indicators
   - Calculate volatility, trend strength, volume surge

5. **🧠 AI Comprehensive Decision**
   - Review historical feedback
   - Analyze all raw sequence data (3min + 4hour)
   - Chain of Thought (CoT) reasoning process
   - Output structured decisions: action, coin, quantity, leverage, stop-loss, take-profit

6. **⚡ Execute Trades**
   - Priority: Close existing → Then open new
   - Risk checks: Position limits, margin usage, duplicate prevention
   - Auto-fetch exchange precision requirements
   - Execute orders via exchange API
   - Record execution results

7. **📝 Record Logs & Update Performance**
   - Save complete decision log with CoT reasoning
   - Update performance database with accurate USDT PnL
   - Match open/close pairs correctly
   - Calculate and store performance metrics

## 📈 Monitoring & Dashboard

The web dashboard provides real-time monitoring:

### Competition Page
- 🏆 **Leaderboard**: Real-time ROI ranking with golden border for leader
- 📈 **Performance Comparison**: Multi-AI ROI curve comparison
- ⚔️ **Head-to-Head**: Direct comparison showing lead margin
- **Real-time Data**: Total equity, P/L%, position count, margin usage (updates every 5 seconds)

### Details Page
- **Equity Curve**: Historical account value chart (USD/percentage toggle)
- **Statistics**: Total cycles, win/loss count, open/close stats
- **Position Table**: All position details (entry price, current price, P/L%, liquidation price)
- **AI Decision Logs**: Recent decisions with expandable Chain of Thought reasoning

### Real-time Updates
- System status, account info, position list: **5-second refresh**
- Decision logs, statistics: **10-second refresh**
- Equity charts: **10-second refresh**

## 🎛️ API Endpoints

The system provides a RESTful API for programmatic access:

### Health Check
```bash
GET /health
# Returns: {"status": "ok"}
```

### Competition & Traders
```bash
GET /api/competition          # Competition overview (compare all traders)
GET /api/traders              # Get list of all traders
```

### Trader-Specific Endpoints
All endpoints below accept `?trader_id=xxx` query parameter. If omitted, returns data for the first trader.

```bash
GET /api/status?trader_id=xxx            # Get system status
GET /api/account?trader_id=xxx          # Get account info (balance, P/L)
GET /api/positions?trader_id=xxx        # Get current positions
GET /api/decisions?trader_id=xxx        # Get all decision logs
GET /api/decisions/latest?trader_id=xxx # Get latest 5 decisions
GET /api/statistics?trader_id=xxx       # Get performance statistics
GET /api/equity-history?trader_id=xxx   # Get equity history (chart data)
GET /api/performance?trader_id=xxx       # Get AI learning performance metrics
```

### Trading Signals
```bash
GET /api/trading-signal?model=xxx       # Get latest signal by AI model name
GET /api/trading-signal?trader_id=xxx   # Get latest signal by trader ID
```

### Example API Calls

```bash
# Get competition overview
curl http://localhost:8080/api/competition

# Get account info for specific trader
curl http://localhost:8080/api/account?trader_id=my_trader

# Get latest trading decisions
curl http://localhost:8080/api/decisions/latest?trader_id=my_trader
```

## 🏗️ Project Structure

```
├── main.go                    # Program entry point (multi-trader manager)
├── config.json                # Configuration file (create from config.json.example)
├── api/                       # HTTP API service
│   └── server.go             # RESTful API endpoints
├── trader/                    # Trading core
│   ├── auto_trader.go        # Main trading controller
│   ├── binance_futures.go    # Binance Futures integration
│   ├── hyperliquid_trader.go # Hyperliquid DEX integration
│   ├── aster_trader.go       # Aster DEX integration
│   └── paper_trader.go       # Paper trading mode
├── decision/                  # AI decision engine
│   └── engine.go             # Decision logic with historical feedback
├── market/                    # Market data fetching
│   └── data.go               # Market data & technical indicators
├── logger/                    # Logging system
│   └── decision_logger.go    # Decision recording & performance analysis
├── manager/                   # Multi-trader management
│   └── trader_manager.go     # Manages multiple trader instances
├── mcp/                       # Model Context Protocol
│   └── client.go             # AI API client (Grok/DeepSeek/Qwen)
├── pool/                      # Coin pool management
│   └── coin_pool.go          # Coin selection logic
├── decision_logs/            # Decision log storage (SQLite databases)
│   ├── {trader_id}/
│   └── decisions.db         # SQLite database per trader
└── web/                       # React frontend
    ├── src/
    │   ├── components/       # React components
    │   │   ├── CompetitionPage.tsx
    │   │   ├── EquityChart.tsx
    │   │   ├── ComparisonChart.tsx
    │   │   └── OpenTrades.tsx
    │   ├── lib/api.ts        # API client wrapper
    │   └── App.tsx           # Main app
    └── package.json
```

## ⚠️ Risk Warning

**⚠️ Trading cryptocurrencies carries significant risk. This system is for educational and research purposes.**

### Trading Risks
- Cryptocurrency markets are extremely volatile
- AI decisions don't guarantee profit
- Futures trading uses leverage - losses may exceed principal
- Extreme market conditions may lead to liquidation risk
- Funding rates may affect holding costs
- Some coins may experience slippage

### Technical Risks
- Network latency may cause price slippage
- API rate limits may affect trade execution
- AI API timeouts may cause decision failures
- System bugs may trigger unexpected behavior

### Usage Recommendations

✅ **Recommended:**
- Use only funds you can afford to lose for testing
- Start with small amounts (recommended: 100-500 USDT)
- Regularly check system operation status
- Monitor account balance changes
- Analyze AI decision logs to understand strategy

❌ **Not Recommended:**
- Invest all funds or borrowed money
- Run unsupervised for long periods
- Blindly trust AI decisions
- Use without understanding the system
- Run during extreme market volatility

## 🛠️ Troubleshooting

### TA-Lib Not Found
**Error**: `TA-Lib not found` or compilation errors

**Solution**: Install TA-Lib library for your OS:
- macOS: `brew install ta-lib`
- Ubuntu/Debian: `sudo apt-get install libta-lib0-dev`
- Windows: Download from [TA-Lib website](http://ta-lib.org/install/)

### API Connection Errors
**Error**: `invalid API key` or connection timeouts

**Solutions:**
- Verify your API keys are correct (no extra spaces/quotes)
- Check network connectivity
- Ensure IP whitelisting is configured (for Binance)
- Verify API key permissions include futures trading
- Check exchange status page for outages

### Port Already in Use
**Error**: `bind: address already in use` or port conflict

**Solution**: Change the `api_server_port` in `config.json` to an available port (e.g., 8081, 8082)

### AI API Timeout
**Error**: AI API requests timing out or failing

**Solutions:**
- Check your AI API key and account balance
- Verify network connection (may need VPN for some regions)
- Check AI provider status page
- System timeout is set to 120 seconds by default
- Ensure API key has proper permissions

### Precision Errors
**Error**: `Precision is over the maximum defined for this asset`

**Solution**: System auto-handles precision from exchange requirements. If error persists:
- Check network connection
- Verify exchange is operational
- Check exchange API documentation for precision changes

### Frontend Can't Connect to Backend
**Error**: Dashboard shows "Failed to fetch" or connection errors

**Solutions:**
- Ensure backend is running (check terminal)
- Verify backend is on `http://localhost:8080` (or your configured port)
- Check browser console for CORS errors
- Ensure no firewall blocking localhost connections

### No Trading Decisions
**Issue**: System runs but no trades are executed

**Possible causes:**
- AI is choosing to wait (normal behavior in uncertain markets)
- Account balance too low
- All positions already open (max positions reached)
- Risk limits triggered (max daily loss, drawdown)
- Market data unavailable

**Solutions:**
- Wait a few cycles - AI needs time to analyze
- Check decision logs to see AI reasoning
- Verify exchange API keys have trading permissions
- Check account balance and margin requirements

## 📈 Performance Optimization Tips

1. **Set Reasonable Decision Cycle**: Recommended 3-5 minutes
   - Too frequent: Over-trading, higher costs
   - Too infrequent: Miss opportunities

2. **Control Coin Count**: System defaults to 8 mainstream coins
   - Add more coins via external API if needed
   - Too many coins: Slower decisions, more API calls

3. **Leverage Settings**: Match your risk tolerance
   - Conservative: 5x leverage (safe)
   - Moderate: 10-15x leverage
   - Aggressive: 20x+ leverage (high risk)

4. **Monitor API Usage**: 
   - Avoid triggering exchange rate limits
   - Cache coin pool data when possible
   - Batch API calls efficiently

5. **Start Small**: 
   - Test with 100-500 USDT first
   - Validate strategy before scaling up
   - Monitor for at least 24-48 hours

6. **Regular Maintenance**:
   - Clean old decision logs periodically
   - Monitor disk usage (SQLite databases)
   - Check system resources (CPU, memory)

## 🛑 Stopping the System

**Graceful Shutdown (Recommended):**

1. Go to the **backend terminal** (where you ran `./lia.exe` or `go run main.go`)
2. Press `Ctrl+C`
3. Wait for "系统已停止" (system stopped) message
4. Go to the **frontend terminal** (where you ran `npm run dev`)
5. Press `Ctrl+C`

**⚠️ Important:**
- Always stop the backend first
- Wait for confirmation before closing terminals
- Don't force quit (may cause data loss)

**Docker:**
```bash
docker compose down
```

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

### Development Guide

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📬 Contact

**Twitter**: [@Kinneas_1](https://twitter.com/Kinneas_1)

For questions, issues, or contributions:
- Open an issue on [GitHub](https://github.com/bchuazw/TheTradingThing/issues)
- Reach out on Twitter: [@Kinneas_1](https://twitter.com/Kinneas_1)

## 🙏 Acknowledgments

Built with amazing open-source tools:
- [Go](https://golang.org/) - Backend language
- [React](https://reactjs.org/) - Frontend framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Gin](https://gin-gonic.com/) - HTTP web framework
- [Binance API](https://binance-docs.github.io/apidocs/futures/en/) - Exchange integration
- [TA-Lib](https://ta-lib.org/) - Technical analysis library
- [Recharts](https://recharts.org/) - Chart library
- [Vite](https://vitejs.dev/) - Frontend build tool

---

**⚡ Automated trading powered by AI - Trade smarter, not harder.**

**⚠️ Remember: Only trade with funds you can afford to lose. This is experimental software for educational purposes.**
