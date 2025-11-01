# Generated vs Hardcoded Data

This document explains what data in your agent system is **generated** (dynamic/real) vs **hardcoded** (static/predefined).

## 🔄 GENERATED (Dynamic/Real Data)

### Agent IDs (13, 14, 15...)
- **Source**: ERC-8004 Identity Registry contract on Hedera testnet
- **Generated**: Each time an agent registers, the contract assigns the next sequential ID
- **Changes**: IDs increment each time you register new agents (13, 14, 15...)
- **Location**: `src/services/ERC8004Service.js` → `registerAgent()` → contract call

### AI Responses
- **Source**: Groq API (llama-3.3-70b-versatile model)
- **Generated**: Every message gets a unique AI-generated response
- **Changes**: Responses are different each time you ask the same question
- **Location**: `src/services/GroqService.js` → `generateResponse()`

### Agent Count
- **Source**: AgentManager internal registry (in-memory)
- **Generated**: Counts agents registered on THIS server
- **Changes**: Updates when agents are added/removed locally
- **Location**: `src/services/AgentManager.js` → `getAllAgents()`
- **Note**: Does NOT query ERC-8004 contract - only counts local agents

### Agent Discovery
- **Source**: AgentManager capability index (in-memory Map)
- **Hardcoded**: Discovery searches local in-memory index only
- **Limitation**: Cannot discover agents from other servers
- **Location**: `src/services/AgentManager.js` → `discoverAgentsByCapability()`
- **Note**: Agents ARE registered on ERC-8004 (on-chain), but discovery is local only

### HBAR Balance (999.82274646 HBAR)
- **Source**: Real Hedera testnet account balance
- **Generated**: Your actual wallet balance from blockchain
- **Changes**: Updates as you send/receive transactions
- **Location**: `src/services/X402Service.js` → `getBalance()`

### Transaction Hashes
- **Source**: Hedera testnet blockchain
- **Generated**: Unique hash for each transaction
- **Changes**: Different for every transaction
- **Location**: Contract registration calls return tx hashes

### Timestamps
- **Source**: Current system time
- **Generated**: Current timestamp when data is requested
- **Changes**: Always current time
- **Location**: Various endpoints add `timestamp: Date.now()`

---

## 📝 HARDCODED (Static/Predefined Data)

### Agent Names
- **Hardcoded in**: `src/index.js` (lines 105, 122, 139)
- **Values**: "TradingAgent", "PaymentProcessor", "DataAnalyzer"
- **Change**: Edit the initialization code

### Agent Descriptions
- **Hardcoded in**: `src/index.js`
- **Example**: "Autonomous trading agent for cryptocurrency markets"
- **Change**: Edit the initialization code

### Agent Capabilities
- **Hardcoded in**: `src/index.js`
- **Values**: 
  - TradingAgent: `["trade", "analyze", "execute"]`
  - PaymentProcessor: `["process_payment", "verify", "escrow"]`
  - DataAnalyzer: `["analyze", "predict", "report"]`
- **Change**: Edit the initialization code

### AI Instructions/Prompts
- **Hardcoded in**: `src/index.js` → `metadata.instructions`
- **Example**: "You are an expert trading agent..."
- **Change**: Edit the initialization code

### Hedera Configuration
- **Hardcoded in**: `src/config/hedera.js`
- **Values**: 
  - Account ID: `0.0.7174458`
  - Contract addresses
  - RPC URLs
- **Change**: Edit the config file

### Groq API Key
- **Location**: Environment variable `GROQ_API_KEY` (loaded from `.env` file)
- **Note**: Not hardcoded - must be set in `.env` file
- **Change**: Edit `.env` file or set `GROQ_API_KEY` environment variable

### Available AI Models List
- **Hardcoded in**: `src/services/GroqService.js` → `getAvailableModels()`
- **Values**: List of Groq model names
- **Change**: Edit the method

### System Prompts (Structure)
- **Hardcoded in**: `src/services/GroqService.js` → `buildSystemPrompt()`
- **Change**: The prompt template/logic is hardcoded

---

## 🎯 Summary

| Data Type | Generated/Hardcoded | Source |
|-----------|---------------------|--------|
| Agent IDs | ✅ Generated | ERC-8004 Contract |
| Agent Names | 📝 Hardcoded | `src/index.js` |
| AI Responses | ✅ Generated | Groq API |
| Capabilities | 📝 Hardcoded | `src/index.js` |
| Balance | ✅ Generated | Hedera Testnet |
| Transaction Hashes | ✅ Generated | Blockchain |
| Model List | 📝 Hardcoded | `GroqService.js` |
| Instructions | 📝 Hardcoded | `src/index.js` |

---

## 🔧 How to Customize

### To Change Agent Properties:
Edit `src/index.js` → `initializeAgents()` function

### To Add New Agents:
Add to `initializeAgents()` or use the API:
```bash
curl -X POST http://localhost:8443/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyAgent",
    "capabilities": ["custom"],
    ...
  }'
```

### To Change AI Models:
Edit `src/services/GroqService.js` → `getAvailableModels()` or `getModelForAgentType()`

### To Use Environment Variables:
1. Create `.env` file in `server/` directory
2. Set `GROQ_API_KEY=your_key`
3. See [ENV_SETUP.md](./ENV_SETUP.md) for complete setup instructions

