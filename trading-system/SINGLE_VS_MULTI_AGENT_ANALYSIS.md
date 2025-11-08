# Single-Agent vs Multi-Agent Performance Analysis

## Current Performance (as of latest snapshot)

| Trader | P&L | Status | Key Insight |
|--------|-----|--------|-------------|
| **OpenAI Single-Agent** | **+46.58%** 🥇 | Best | Conservative, patient, avoids overtrading |
| **Qwen Multi-Agent** | **+13.43%** 🥈 | Good | Finds high-confidence trades despite negative Sharpe |
| **OpenAI Multi-Agent** | **-1.57%** | Neutral | Too conservative, misses opportunities |
| **Qwen Single-Agent** | **-33.58%** | Worst | Overly aggressive, takes lower-confidence trades |

## Why Performance Varies

### 1. **Decision-Making Speed & Decisiveness**

**Single-Agent:**
- ✅ **Fast decisions** - One AI makes the call immediately
- ✅ **Can be decisive** - Takes calculated risks when confident
- ✅ **Adapts quickly** - Changes strategy based on market conditions
- ❌ **Can be wrong** - Single perspective, no validation

**Multi-Agent:**
- ✅ **Validated decisions** - Multiple perspectives reduce errors
- ✅ **Better risk control** - Consensus prevents rash decisions
- ❌ **Can be too slow** - Consensus takes time, may miss opportunities
- ❌ **Too conservative** - Requires agreement, misses good trades

### 2. **Consensus Mode Impact**

Your multi-agent uses **"best" consensus mode**, which:
- Picks the **highest confidence** trade from all agents
- Prioritizes actual trades over "wait" decisions
- Can work well when agents have different strengths

**Example from logs:**
- **Qwen Multi-Agent** found a **83% confidence** DOGEUSDT short
- All agents analyzed, best one was selected
- This worked well → **+13.43%**

**But:**
- **OpenAI Multi-Agent** was too conservative
- Agents disagreed or all said "wait"
- Missed opportunities → **-1.57%**

### 3. **Market Condition Dependency**

**When Single-Agent Wins:**
- **Clear trends** - One decisive call is better than consensus
- **Fast-moving markets** - Speed matters more than validation
- **High-confidence setups** - Single agent can act quickly

**When Multi-Agent Wins:**
- **Uncertain markets** - Multiple perspectives catch nuances
- **Complex situations** - Different agents see different angles
- **Risk management** - Consensus prevents bad trades

### 4. **Agent-Specific Behavior**

**OpenAI (GPT-OSS-120B):**
- More **conservative** and **analytical**
- Better at **risk management**
- Works well in **single-agent** mode (patient, avoids overtrading)
- In **multi-agent**, can be too cautious

**Qwen (Qwen3-32B):**
- More **aggressive** and **opportunistic**
- Better at **finding trades**
- Works better in **multi-agent** mode (validated by consensus)
- In **single-agent**, can overtrade

## Key Findings from Decision Logs

### Cycle 70 Analysis (Same Market Conditions)

**OpenAI Single-Agent:**
```json
{
  "action": "wait",
  "reasoning": "Sharpe ratio is neutral; keep existing BTC short (downtrend confirmed) and no new high‑confidence signals detected. Avoid overtrading and premature exits."
}
```
- **Sharpe: 0.00** (neutral)
- **Decision: Wait** - Holding existing position
- **Result: ✅ Good** - Patient, avoids overtrading

**Qwen Single-Agent:**
```json
{
  "action": "open_short",
  "symbol": "ADAUSDT",
  "confidence": 75,
  "reasoning": "Overbought RSI (76.66)... Risk-reward ratio of 1:3 met"
}
```
- **Sharpe: 0.03** (slightly positive)
- **Decision: Trade** - Opens ADAUSDT short at 75% confidence
- **Result: ❌ Risky** - Lower confidence, more aggressive

**OpenAI Multi-Agent:**
```json
{
  "action": "wait",
  "reasoning": "Sharpe Ratio slightly negative; all altcoin short signals lack strong bearish confluence (MACD weakening, low volume, confidence <80)."
}
```
- **Sharpe: -0.05** (slightly negative)
- **Decision: Wait** - Requires >80% confidence
- **Result: ⚠️ Too conservative** - Misses opportunities

**Qwen Multi-Agent:**
```json
{
  "action": "open_short",
  "symbol": "DOGEUSDT",
  "confidence": 83,
  "reasoning": "4h downtrend (EMA20 < EMA50), RSI 71 (overbought)... strong short signal with confidence >80."
}
```
- **Sharpe: -0.07** (slightly negative)
- **Decision: Trade** - Opens DOGEUSDT short at 83% confidence
- **Result: ✅ Good** - High confidence, validated by consensus

## Recommendations

### 1. **Hybrid Approach**
- Use **single-agent** for **clear, high-confidence** setups
- Use **multi-agent** for **uncertain, complex** situations
- Switch dynamically based on market volatility

### 2. **Optimize Consensus Mode**
- **"best" mode** (current) works well - picks highest confidence
- Consider **"weighted" mode** - give more weight to better-performing agents
- Avoid **"unanimous" mode** - too conservative, rarely trades

### 3. **Agent Selection**
- **OpenAI** → Better for **single-agent** (patient, risk-aware)
- **Qwen** → Better for **multi-agent** (aggressive, needs validation)
- Consider **specialized agents** - technical, momentum, risk management

### 4. **Confidence Thresholds**
- **Single-agent**: 75% confidence (current)
- **Multi-agent**: 80% confidence (current) - maybe lower to 75%?
- **Multi-agent "best" mode** already prioritizes trades, so 75% might work

### 5. **Market Regime Detection**
- **Trending markets** → Single-agent performs better
- **Ranging markets** → Multi-agent performs better
- **Volatile markets** → Multi-agent risk management helps

## Conclusion

**Why sometimes multi-agent wins, sometimes single-agent wins:**

1. **Market conditions** - Different strategies work in different markets
2. **Consensus mode** - "best" mode helps, but can still be too conservative
3. **Agent personalities** - OpenAI is conservative, Qwen is aggressive
4. **Timing** - Single-agent is faster, multi-agent is safer
5. **Confidence levels** - Multi-agent requires higher confidence, misses some good trades

**Best Strategy:**
- **Keep both running** - They complement each other
- **Monitor performance** - Switch based on market conditions
- **Optimize consensus** - Fine-tune confidence thresholds
- **Specialize agents** - Different roles in multi-agent system

The divergence you're seeing (33.16% gap) is actually **healthy** - it shows the systems are making different decisions, which provides **diversification** and **risk management**.

