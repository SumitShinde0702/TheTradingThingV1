# Multi-Agent System Usage

## 🚀 How to Use

### Step 1: Add Multi-Agent Config to Your config.json

Add this section to your existing `config.json`:

```json
{
  "traders": [
    {
      "id": "multi_agent_trader",
      "name": "Multi-Agent Trader",
      "enabled": true,
      "ai_model": "multi_agent",
      "exchange": "paper",
      "initial_balance": 10000.0,
      "scan_interval_minutes": 5
    }
  ],
  "multi_agent": {
    "enabled": true,
    "consensus_mode": "voting",
    "fast_first": true,
    "min_agents": 2,
    "max_wait_time": 5,
    "agents": [
      {
        "id": "agent_1",
        "name": "Technical Analysis Agent",
        "model": "groq",
        "api_key": "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",
        "groq_model": "openai/gpt-oss-120b",
        "role": "technical",
        "weight": 0.4
      },
      {
        "id": "agent_2",
        "name": "Momentum Agent",
        "model": "groq",
        "api_key": "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",
        "groq_model": "qwen/qwen3-32b",
        "role": "momentum",
        "weight": 0.3
      }
    ]
  }
}
```

### Step 2: Integration (Future)

To actually use this in the trading system, you would need to:

1. **Modify `trader/auto_trader.go`** (optional - only if you want to use it):
   ```go
   // In runCycle() function, around line 442:
   if multiAgentConfig != nil && multiAgentConfig.Enabled {
       decision, err = multiagent.GetMultiAgentDecision(ctx, multiAgentConfig)
   } else {
       decision, err = decisionPkg.GetFullDecision(ctx, at.mcpClient)
   }
   ```

2. **Add config loading** in `config/config.go`:
   ```go
   type Config struct {
       // ... existing fields ...
       MultiAgent *multiagent.MultiAgentConfig `json:"multi_agent,omitempty"`
   }
   ```

## 🧪 Testing Without Integration

For now, this is a **standalone experimental system**. You can:

1. **Test the consensus logic** separately
2. **Compare results** with single-agent decisions
3. **Experiment** with different consensus modes

## 📊 Consensus Modes

- **`voting`**: Majority wins (simple, fast)
- **`weighted`**: Weight by agent confidence/weight
- **`unanimous`**: All agents must agree (very conservative)
- **`best`**: Pick highest confidence decision

## ⚡ Fast-First Mode

When `fast_first: true`:
- Proceeds as soon as `min_agents` respond
- Doesn't wait for slowest agent
- Faster decisions (2-4 seconds vs 5-7 seconds)

## ⚠️ Important Notes

- This is **experimental** - test thoroughly
- Existing `nofx.exe` is **not affected**
- All code is in `multi-agent/` folder
- Safe to experiment without breaking anything

