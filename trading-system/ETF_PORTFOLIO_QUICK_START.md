# ETF Portfolio System - Quick Start Guide

## ✅ What's Been Implemented

1. **Portfolio API Endpoint** (`/api/portfolio`)
   - Aggregates all 7 agents' equity, P&L, positions
   - Returns combined portfolio statistics
   - Shows individual agent performance

2. **Frontend API Function** (`api.getPortfolio()`)
   - Ready to use in React components
   - Fetches portfolio data from backend

3. **Run Script** (`RUN_ETF_PORTFOLIO.bat`)
   - One-click startup for ETF portfolio
   - Builds and runs on port 8082

4. **Configuration** (`config-etf-portfolio.json`)
   - 7 agents configured
   - Equal capital allocation (1,428.57 USDT each)

## 🚀 How to Run

### Step 1: Start the ETF Portfolio
```bash
cd trading-system
RUN_ETF_PORTFOLIO.bat
```

This will:
- Build `nofx-etf.exe`
- Start all 7 agents
- Run on port **8082**

### Step 2: Access the Dashboard
- **URL**: `http://localhost:8082`
- **Portfolio API**: `http://localhost:8082/api/portfolio`

### Step 3: Test the Portfolio API
```bash
curl http://localhost:8082/api/portfolio
```

Expected response:
```json
{
  "total_equity": 10000.0,
  "initial_balance": 10000.0,
  "total_pnl": 0.0,
  "total_pnl_pct": 0.0,
  "total_positions": 0,
  "agent_count": 7,
  "is_running": true,
  "agents": [
    {
      "trader_id": "qwen_single",
      "trader_name": "Qwen Single-Agent",
      "ai_model": "groq",
      "equity": 1428.57,
      "initial_balance": 1428.57,
      "pnl": 0.0,
      "pnl_pct": 0.0,
      "position_count": 0,
      "is_running": true
    },
    // ... 6 more agents
  ]
}
```

## 📊 Portfolio Composition

| Agent | Model | Speed | Strategy | Capital |
|-------|-------|-------|----------|---------|
| Qwen Single | Qwen3-32B | 400 T/S | Balanced | 1,428.57 USDT |
| OpenAI Single | GPT OSS 120B | 500 T/S | Conservative | 1,428.57 USDT |
| Qwen Multi | Qwen3-32B | 400 T/S | Aggressive | 1,428.57 USDT |
| OpenAI Multi | GPT OSS 120B | 500 T/S | Validated | 1,428.57 USDT |
| Llama Scalper | Llama 3.1 8B | 560 T/S | Fast Scalping | 1,428.57 USDT |
| Llama Analyzer | Llama 3.3 70B | 280 T/S | Deep Analysis | 1,428.57 USDT |
| GPT Fast | GPT OSS 20B | 1000 T/S | Ultra-Fast | 1,428.57 USDT |

**Total**: 10,000 USDT

## 🎯 Next Steps (Frontend Integration)

To show the portfolio view in the frontend:

1. **Create Portfolio Component**
   ```typescript
   // web/src/components/PortfolioView.tsx
   import { api } from '../lib/api';
   
   export function PortfolioView() {
     const [portfolio, setPortfolio] = useState(null);
     
     useEffect(() => {
       api.getPortfolio('http://localhost:8082/api').then(setPortfolio);
     }, []);
     
     return (
       <div>
         <h1>ETF Portfolio</h1>
         <p>Total Equity: ${portfolio?.total_equity}</p>
         <p>Total P&L: {portfolio?.total_pnl_pct}%</p>
         <p>Agents: {portfolio?.agent_count}</p>
       </div>
     );
   }
   ```

2. **Add Route** (if using React Router)
   ```typescript
   <Route path="/portfolio" element={<PortfolioView />} />
   ```

3. **Or Replace Competition View**
   - Modify existing dashboard to show portfolio instead of individual traders
   - Use `api.getPortfolio()` instead of `api.getCompetition()`

## 📈 Monitoring

### Individual Agent Logs
Each agent has its own decision logs:
- `decision_logs/qwen_single/`
- `decision_logs/openai_single/`
- `decision_logs/llama_scalper/`
- etc.

### Portfolio Performance
- Check `/api/portfolio` for real-time aggregated stats
- Monitor individual agent performance in `agents` array
- Disable underperforming agents by setting `enabled: false` in config

## 🔧 Configuration

Edit `config-etf-portfolio.json` to:
- Change capital allocation per agent
- Adjust scan intervals
- Enable/disable specific agents
- Modify leverage settings

## 💡 Tips

1. **Start Small**: Test with 2-3 agents first
2. **Monitor Costs**: 7 agents = 7x API calls
3. **Rebalance**: Adjust capital allocation based on performance
4. **Disable Losers**: Turn off agents with negative Sharpe < -0.5

## 🐛 Troubleshooting

**Port 8082 already in use?**
- Kill existing process: `taskkill /F /IM nofx-etf.exe`
- Or change port in config: `"api_server_port": 8083`

**Agents not starting?**
- Check Groq API key is valid
- Verify all models are available
- Check logs in console window

**Portfolio API returns 404?**
- Make sure backend is running
- Check port matches config (8082)
- Verify route is registered: `/api/portfolio`

