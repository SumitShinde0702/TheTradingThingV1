# Hedera Agent Server

> **Note:** Before running, set up your environment variables. See [ENV_SETUP.md](./ENV_SETUP.md) for details.

Multi-agent HTTPS server with ERC-8004 agent discovery and x402 payment integration on Hedera testnet.

## Features

- ✅ **Multi-Agent Support**: Host multiple agents on a single HTTPS server
- ✅ **ERC-8004 Integration**: Agent registration and discovery using ERC-8004 contracts
- ✅ **x402 Payments**: Secure payment processing using x402 protocol
- ✅ **A2A Communication**: Agent-to-agent messaging and coordination
- ✅ **Agent Discovery**: Find agents by capabilities
- ✅ **Hedera Testnet**: Full integration with Hedera testnet
- ✅ **AI-Powered Agents**: Groq AI integration for intelligent agent responses

## Configuration

The server uses the following Hedera testnet configuration:

- **Account ID**: 0.0.7174458
- **EVM Address**: 0x1fef1c22bbf2e66bc575c8b433d75588ab2aea92
- **Identity Registry**: 0x4c74ebd72921d537159ed2053f46c12a7d8e5923
- **Reputation Registry**: 0xc565edcba77e3abeade40bfd6cf6bf583b3293e0
- **Validation Registry**: 0x18df085d85c586e9241e0cd121ca422f571c2da6

## Installation

```bash
cd server
npm install
```

## Running the Server

```bash
npm start
```

The server will start on `https://localhost:8443` (or `http://localhost:8443` if SSL certificates are not configured).

## HTTPS Setup (Optional)

To enable HTTPS, create a `certs/` directory and place your SSL certificates:

```
server/
  certs/
    key.pem
    cert.pem
```

For development, you can generate self-signed certificates:

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes
```

## API Endpoints

### Agents

- `GET /api/agents` - List all agents
- `POST /api/agents/register` - Register a new agent
- `GET /api/agents/:agentId` - Get agent details
- `GET /api/agents/discover?capability=<capability>` - Discover agents by capability
- `POST /api/agents/:agentId/message` - Send A2A message to agent
- `PATCH /api/agents/:agentId/status` - Update agent status

### Payments

- `POST /api/payments/request` - Request payment (returns 402)
- `POST /api/payments/execute` - Execute payment transaction
- `POST /api/payments/verify` - Verify payment transaction
- `GET /api/payments/status/:requestId` - Get payment status
- `GET /api/payments/balance/:address` - Get account balance

### AI

- `GET /api/ai/models` - Get available Groq AI models
- `POST /api/ai/test` - Test AI response
- `GET /api/ai/agent/:agentId/status` - Get agent AI status

### Transfers (A2A)

- `POST /api/transfers/a2a` - Transfer HBAR/tokens from one agent to another
- `GET /api/transfers/history/:agentId` - Get transfer history for an agent
- `POST /api/transfers/request` - Request a transfer (returns 402 payment required)

## Example: Register an Agent

```bash
curl -X POST https://localhost:8443/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyAgent",
    "description": "My custom agent",
    "capabilities": ["process", "analyze"],
    "endpoint": "https://localhost:8443/api/agents/myagent"
  }'
```

## Example: Discover Agents

```bash
curl "https://localhost:8443/api/agents/discover?capability=trade"
```

## Example: A2A Communication with Payment

```bash
curl -X POST https://localhost:8443/api/agents/:agentId/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, agent!",
    "fromAgentId": "123",
    "payment": {
      "required": true,
      "amount": "1",
      "token": "HBAR",
      "description": "Payment for service"
    }
  }'
```

## Example: Execute Payment

```bash
curl -X POST https://localhost:8443/api/payments/execute \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "0x...",
    "amount": "1",
    "token": "HBAR"
  }'
```

## Example: Agent-to-Agent Transfer

### Using curl:
```bash
curl -X POST http://localhost:8443/api/transfers/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "fromAgentId": "13",
    "toAgentId": "14",
    "amount": "0.1",
    "token": "HBAR",
    "description": "Payment for trading service"
  }'
```

### Using the test script (from server/ directory):
```bash
cd server
node test-transfer.js 13 14 0.1
```

### Using the full example script:
```bash
cd server
node src/examples/a2a-transfer-example.js 13 14 0.1 "Payment for service"
```

## Architecture

```
server/
├── src/
│   ├── config/
│   │   └── hedera.js          # Hedera testnet configuration
│   ├── models/
│   │   └── Agent.js            # Agent model
│   ├── services/
│   │   ├── AgentManager.js    # Agent management
│   │   ├── ERC8004Service.js  # ERC-8004 integration
│   │   └── X402Service.js      # x402 payment service
│   ├── routes/
│   │   ├── agents.js           # Agent routes
│   │   └── payments.js         # Payment routes
│   └── index.js                # Main server file
└── package.json
```

## Development

The server automatically registers example agents on startup:

1. **TradingAgent** - Trading capabilities
2. **PaymentProcessor** - Payment processing
3. **DataAnalyzer** - Data analysis

You can extend these or register your own agents via the API.

## Next Steps

- Implement agent-specific business logic
- Add more sophisticated A2A protocols
- Integrate Hedera Consensus Service for logging
- Add agent reputation querying
- Implement escrow mechanisms

