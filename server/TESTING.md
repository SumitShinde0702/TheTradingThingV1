# Testing Your Agents

Quick guide to test if your agents are alive and working.

## Quick Tests

### 1. Check Server Health

```bash
curl http://localhost:8443/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": 1234567890,
  "agents": 3
}
```

### 2. List All Agents

```bash
curl http://localhost:8443/api/agents
```

Should show all registered agents with their IDs, status, and capabilities.

### 3. Test Agent-to-Agent Communication

First, get an agent ID from the list above, then:

```bash
curl -X POST http://localhost:8443/api/agents/<AGENT_ID>/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello! Are you working?",
    "fromAgentId": "test-client"
  }'
```

You should get an AI-powered response from the agent!

### 4. Test AI Directly

```bash
curl -X POST http://localhost:8443/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Say hello",
    "systemPrompt": "You are a helpful assistant"
  }'
```

### 5. Test Agent Discovery

```bash
curl "http://localhost:8443/api/agents/discover?capability=trade"
```

Should return agents with "trade" capability.

### 6. Check Available AI Models

```bash
curl http://localhost:8443/api/ai/models
```

## Automated Testing Script

Run the comprehensive test suite:

```bash
node test-agents.js
```

This will test:
- ✅ Server health
- ✅ Agent registration and listing
- ✅ Agent discovery
- ✅ A2A communication
- ✅ AI responses
- ✅ Payment service

## Manual Testing with Browser

### 1. Health Check
Open: `http://localhost:8443/health`

### 2. List Agents
Open: `http://localhost:8443/api/agents`

### 3. Test AI
Use a tool like Postman or curl to POST to:
- `http://localhost:8443/api/ai/test`

## Expected Behavior

### ✅ Working Agents Should:
1. Appear in `/api/agents` list
2. Have `status: "online"`
3. Have `aiEnabled: true`
4. Respond intelligently to messages
5. Be discoverable by capability

### ❌ If Agents Don't Appear:
1. Check server logs for registration errors
2. Verify Hedera testnet connection
3. Ensure contract addresses are correct
4. Check that you have HBAR for gas fees

### ❌ If AI Doesn't Work:
1. Verify Groq API key is set in `.env` file (see [ENV_SETUP.md](./ENV_SETUP.md))
2. Check network connection
3. Verify Groq API is accessible
4. Check server logs for API errors

## Testing Specific Agents

### Trading Agent
```bash
# Find TradingAgent ID first
AGENT_ID=$(curl -s http://localhost:8443/api/agents | grep -o '"id":"[^"]*"[^}]*"name":"TradingAgent"' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

# Send message
curl -X POST http://localhost:8443/api/agents/$AGENT_ID/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are current market trends?",
    "fromAgentId": "test-client"
  }'
```

### Payment Processor
```bash
# Similar to above, but ask about payments
curl -X POST http://localhost:8443/api/agents/$PAYMENT_AGENT_ID/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How do payments work?",
    "fromAgentId": "test-client"
  }'
```

## Troubleshooting

### Server Not Responding
- Check if server is running: `npm start`
- Verify port 8443 is not in use
- Check firewall settings

### Agents Not Registering
- Check Hedera testnet RPC connection
- Verify contract addresses in `src/config/hedera.js`
- Ensure account has HBAR for gas

### AI Not Responding
- Check Groq API key in `.env` file (see [ENV_SETUP.md](./ENV_SETUP.md))
- Test Groq API directly: `curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer YOUR_KEY"`
- Check server logs for API errors

### Agents Show Offline
- Agents are set to "online" on registration
- Check `GET /api/agents/:agentId` to see status
- Use `PATCH /api/agents/:agentId/status` to change status

## Example Test Session

```bash
# 1. Start server (in one terminal)
cd server
npm start

# 2. Run tests (in another terminal)
cd server
node test-agents.js

# 3. Expected output:
# ✅ Server is healthy. 3 agents registered.
# ✅ Found 3 agents:
#    - TradingAgent (ID: 0)
#    - PaymentProcessor (ID: 1)
#    - DataAnalyzer (ID: 2)
# ✅ A2A communication working
# ✅ AI responding
```

## Next Steps

Once agents are working:
1. Test with different message types
2. Test payment-required scenarios
3. Test agent-to-agent communication
4. Test discovery with different capabilities
5. Integrate into your application!

