# Quick Start Guide

Get your multi-agent server running with ERC-8004 and x402 in minutes!

## 1. Install Dependencies

```bash
cd server
npm install
```

## 2. (Optional) Generate SSL Certificates for HTTPS

On **Linux/Mac**:
```bash
chmod +x generate-certs.sh
./generate-certs.sh
```

On **Windows**:
```powershell
.\generate-certs.ps1
```

Or manually:
```bash
mkdir certs
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes
```

**Note**: The server will run in HTTP mode if certificates are not found (fine for development).

## 3. Start the Server

```bash
npm start
```

You should see:
```
🚀 Hedera Agent Server running on http://localhost:8443
✅ TradingAgent registered with ID: <agentId>
✅ PaymentProcessor registered with ID: <agentId>
✅ DataAnalyzer registered with ID: <agentId>
```

## 4. Test the API

### List all agents:
```bash
curl http://localhost:8443/api/agents
```

### Discover agents by capability:
```bash
curl "http://localhost:8443/api/agents/discover?capability=trade"
```

### Register a new agent:
```bash
curl -X POST http://localhost:8443/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyCustomAgent",
    "description": "My custom agent",
    "capabilities": ["custom_action"],
    "endpoint": "http://localhost:8443/api/agents/custom"
  }'
```

### Send A2A message:
```bash
curl -X POST http://localhost:8443/api/agents/<agentId>/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, agent!",
    "fromAgentId": "123"
  }'
```

### Check balance:
```bash
curl http://localhost:8443/api/payments/balance/0x1fef1c22bbf2e66bc575c8b433d75588ab2aea92
```

## 5. Run Example Scripts

```bash
# Register an agent example
node src/examples/register-agent-example.js

# A2A communication example
node src/examples/a2a-communication-example.js trade "Hello!"
```

## Troubleshooting

### "Cannot find module" errors
- Make sure you've run `npm install` in the `server/` directory

### "Contract address not found" errors
- Verify the contract addresses in `src/config/hedera.js` match your deployed contracts

### Connection errors to Hedera
- Check your internet connection
- Verify the RPC URL is accessible: `https://testnet.hashio.io/api`

### Agent registration fails
- Ensure your Hedera account has sufficient HBAR for gas fees
- Check that contract addresses are correct
- Verify private key is correct

## Next Steps

1. **Customize Agents**: Modify the agent initialization in `src/index.js`
2. **Add Business Logic**: Implement agent-specific handlers in route handlers
3. **Integrate x402**: Use the payment endpoints for agent services
4. **Enhance Discovery**: Add more sophisticated agent discovery logic
5. **Add Reputation**: Query reputation scores from ReputationRegistry

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         Express HTTPS Server            │
├─────────────────────────────────────────┤
│  Agent Manager                          │
│    ├── Agent Registry                   │
│    └── Capability Index                 │
├─────────────────────────────────────────┤
│  ERC-8004 Service                       │
│    ├── Identity Registry                │
│    ├── Reputation Registry              │
│    └── Validation Registry              │
├─────────────────────────────────────────┤
│  x402 Payment Service                   │
│    ├── Payment Requests                 │
│    ├── Payment Verification             │
│    └── Transaction Execution            │
└─────────────────────────────────────────┘
```

## Agent Flow

1. **Registration**: Agent registers with ERC-8004 Identity Registry
2. **Discovery**: Other agents discover by capability
3. **Communication**: Agents send messages via A2A endpoints
4. **Payment**: x402 handles payment requests and verification
5. **Trust**: Reputation and validation tracked on-chain

Happy building! 🚀

