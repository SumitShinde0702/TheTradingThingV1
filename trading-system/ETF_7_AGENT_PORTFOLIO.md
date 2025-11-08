# 7-Agent ETF Portfolio Configuration

## Portfolio Composition

**Total Capital: 10,000 USDT** (divided equally = **1,428.57 USDT per agent**)

### Agent Breakdown

| # | Agent ID | Model | Speed | Strategy | Interval | Specialization |
|---|----------|-------|-------|----------|----------|----------------|
| 1 | `qwen_single` | Qwen3-32B | 400 T/S | Balanced | 3 min | General trading, good balance |
| 2 | `openai_single` | GPT OSS 120B | 500 T/S | Conservative | 5 min | Risk-aware, patient |
| 3 | `qwen_multi` | Qwen3-32B | 400 T/S | Aggressive | 3 min | Multi-agent consensus |
| 4 | `openai_multi` | GPT OSS 120B | 500 T/S | Validated | 5 min | Multi-agent consensus |
| 5 | `llama_scalper` | Llama 3.1 8B | **560 T/S** | **Scalping** | **1 min** | **Fast decisions, quick trades** |
| 6 | `llama_analyzer` | Llama 3.3 70B | 280 T/S | **Deep Analysis** | 5 min | **Complex analysis, high quality** |
| 7 | `gpt20b_fast` | GPT OSS 20B | **1000 T/S** | **Speed** | **2 min** | **Ultra-fast, cost-effective** |

## Model Selection Rationale

### ✅ Why These 3 New Models?

#### 1. **Llama 3.1 8B Instant** (`llama_scalper`)
- **Speed**: 560 T/S (fastest in portfolio)
- **Cost**: $0.05/$0.08 per 1M tokens (cheapest)
- **Use Case**: Scalping, quick decisions, 1-minute intervals
- **Why**: Perfect for catching fast-moving opportunities

#### 2. **Llama 3.3 70B Versatile** (`llama_analyzer`)
- **Speed**: 280 T/S (slower but powerful)
- **Cost**: $0.59/$0.79 per 1M tokens (most expensive)
- **Use Case**: Deep analysis, complex situations, high-quality decisions
- **Why**: Best for complex market conditions, acts as "smart money"

#### 3. **GPT OSS 20B** (`gpt20b_fast`)
- **Speed**: 1000 T/S (ultra-fast!)
- **Cost**: $0.075/$0.30 per 1M tokens (very cheap)
- **Use Case**: Fast alternative, 2-minute intervals
- **Why**: Great balance of speed and cost, different perspective

## Portfolio Diversification

### By Speed
- **Ultra-Fast** (1000 T/S): GPT OSS 20B
- **Fast** (560 T/S): Llama 3.1 8B
- **Medium** (400-500 T/S): Qwen, OpenAI 120B
- **Slower** (280 T/S): Llama 3.3 70B (but highest quality)

### By Strategy
- **Scalping** (1 min): Llama 3.1 8B
- **Fast Trading** (2 min): GPT OSS 20B
- **Balanced** (3 min): Qwen agents
- **Swing Trading** (5 min): OpenAI 120B, Llama 3.3 70B

### By Model Type
- **Qwen** (2 agents): Aggressive, opportunistic
- **OpenAI 120B** (2 agents): Conservative, analytical
- **Llama 3.1 8B** (1 agent): Fast, cost-effective
- **Llama 3.3 70B** (1 agent): Powerful, deep analysis
- **GPT OSS 20B** (1 agent): Ultra-fast, alternative perspective

## Expected Benefits

### 1. **Diversification**
- Different models = different decision-making styles
- Reduces correlation between agents
- Better risk distribution

### 2. **Market Regime Adaptation**
- **Trending markets**: Fast agents (Llama 8B, GPT 20B) catch moves
- **Ranging markets**: Analytical agents (Llama 70B, OpenAI 120B) find edges
- **Volatile markets**: Balanced agents (Qwen) adapt quickly

### 3. **Cost Optimization**
- Mix of cheap (Llama 8B, GPT 20B) and expensive (Llama 70B) models
- Average cost per decision is reasonable
- Fast models reduce latency costs

### 4. **Performance Stability**
- 7 agents = smoother equity curve
- Less volatility than single agent
- Better Sharpe ratio (usually)

## Cost Analysis

### Per 1M Tokens (Input/Output)

| Model | Input | Output | Avg Cost |
|-------|-------|--------|----------|
| Qwen3-32B | $0.29 | $0.59 | $0.44 |
| GPT OSS 120B | $0.15 | $0.60 | $0.375 |
| Llama 3.1 8B | $0.05 | $0.08 | **$0.065** ⭐ |
| Llama 3.3 70B | $0.59 | $0.79 | $0.69 |
| GPT OSS 20B | $0.075 | $0.30 | $0.1875 |

**Weighted Average**: ~$0.35 per 1M tokens (assuming equal usage)

## Usage Instructions

### 1. **Start ETF Portfolio**
```bash
cd trading-system
go build -o nofx-etf.exe
nofx-etf.exe config-etf-portfolio.json
```

### 2. **Access Dashboard**
- URL: `http://localhost:8082`
- View: Combined portfolio P&L (all 7 agents)

### 3. **Monitor Individual Agents** (Optional)
- Each agent has its own decision logs
- Can disable underperforming agents
- Can rebalance capital allocation

## Performance Monitoring

### Key Metrics to Track

1. **Portfolio Total Equity**: Sum of all 7 agents
2. **Portfolio P&L**: Combined profit/loss
3. **Best Performer**: Which agent is winning
4. **Worst Performer**: Which agent to disable/rebalance
5. **Correlation**: How correlated are the agents?

### Rebalancing Strategy

- **Weekly Review**: Check individual agent performance
- **Disable Losers**: Turn off agents with negative Sharpe < -0.5
- **Increase Winners**: Allocate more capital to top performers
- **Add New Agents**: Test new models/strategies

## Next Steps

1. ✅ **Config Created**: `config-etf-portfolio.json` ready
2. ⏳ **Portfolio API**: Add `/api/portfolio` endpoint for aggregated stats
3. ⏳ **Frontend View**: Create "Portfolio View" showing combined P&L
4. ⏳ **Rebalancing**: Implement performance-based capital allocation

## Alternative Configurations

### Option A: Equal Weight (Current)
- All agents: 1,428.57 USDT (14.3% each)

### Option B: Performance Weighted
- Top 3 agents: 20% each (2,000 USDT)
- Middle 2 agents: 15% each (1,500 USDT)
- Bottom 2 agents: 5% each (500 USDT)

### Option C: Strategy Weighted
- Scalpers (1-2 min): 20% total
- Balanced (3 min): 40% total
- Swing (5 min): 40% total

