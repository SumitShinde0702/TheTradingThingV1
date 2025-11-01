# The Trading Thing V1

An agent-first digital economy on Hedera testnet, enabling agent-to-agent (A2A) communication, discovery, and secure payments.

## 🚀 Features

- **Multi-Agent System**: Multiple agents running on a single HTTPS server
- **ERC-8004 Integration**: Agent discovery and trust via ERC-8004 contracts
- **x402 Payments**: Secure on-chain payments using x402 protocol
- **AI-Powered Agents**: Groq AI integration for intelligent agent responses
- **A2A Communication**: Agent-to-agent messaging and coordination
- **Hedera Testnet**: Full blockchain integration with Hedera testnet

## 📁 Project Structure

```
TheTradingThingV1/
├── server/              # Multi-agent HTTPS server
│   ├── src/            # Server source code
│   ├── README.md       # Server documentation
│   └── package.json    # Server dependencies
├── erc-8004-contracts/  # ERC-8004 smart contracts
│   ├── contracts/      # Solidity contracts
│   └── README.md       # Contracts documentation
└── README.md           # This file
```

## 🛠️ Quick Start

### 1. Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Git
- Hedera testnet account (for blockchain interactions)
- Groq API key (for AI-powered agents)

### 2. Environment Setup

**⚠️ IMPORTANT: Set up environment variables before running!**

Create a `.env` file in the `server/` directory:

```bash
cd server
# Create .env file
```

Add the following variables (see `server/ENV_SETUP.md` for details):

```env
# Groq API Key (required for AI agents)
GROQ_API_KEY=your_groq_api_key_here

# Hedera Configuration (optional - defaults in config/hedera.js)
OWNER_ACCOUNT_ID=0.0.7170260
OWNER_EVM_ADDRESS=0x...
OWNER_PRIVATE_KEY=0x...

CLIENT_ACCOUNT_ID=0.0.7174458
CLIENT_EVM_ADDRESS=0x...
CLIENT_PRIVATE_KEY=0x...

# x402 Facilitator (optional - uses hosted facilitator by default)
X402_FACILITATOR_URL=https://x402-hedera-production.up.railway.app
```

**See [server/ENV_SETUP.md](./server/ENV_SETUP.md) for complete setup instructions.**

### 3. Install Dependencies

```bash
cd server
npm install
```

### 4. Start the Server

```bash
npm start
```

The server will start on `http://localhost:8443` (or `https://localhost:8443` if SSL certificates are configured).

### 5. Verify It's Working

```bash
# Health check
curl http://localhost:8443/health

# List agents
curl http://localhost:8443/api/agents
```

## 📚 Documentation

- **[Server README](./server/README.md)** - Complete server documentation, API endpoints, and examples
- **[Environment Setup](./server/ENV_SETUP.md)** - Detailed environment variable configuration
- **[Account Setup](./server/ACCOUNT_SETUP.md)** - Owner/Client account structure
- **[Quick Start](./server/QUICKSTART.md)** - Get up and running in minutes
- **[Testing Guide](./server/TESTING.md)** - How to test your agents
- **[x402 Integration](./server/X402_INTEGRATION.md)** - x402 payment protocol implementation

## 🧪 Example Usage

### Register and Discover Agents

```bash
# List all agents
curl http://localhost:8443/api/agents

# Discover agents by capability
curl "http://localhost:8443/api/agents/discover?capability=trade"

# Send message to agent
curl -X POST http://localhost:8443/api/agents/13/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!", "fromAgentId": "client-1"}'
```

### x402 Payment Flow

```bash
# Test x402 payment flow
node server/src/examples/x402-client-example.js 13 "Hello" 0.1
```

## 🏗️ Architecture

### Agent Flow

1. **Registration**: Agents register with ERC-8004 Identity Registry
2. **Discovery**: Agents discover each other by capabilities
3. **Communication**: A2A messaging via REST API
4. **Payments**: x402 protocol for secure payments
5. **Trust**: Reputation tracked on Hedera blockchain

### Components

- **Agent Server**: Express.js server hosting multiple agents
- **ERC-8004 Service**: Blockchain integration for agent identity
- **x402 Service**: Payment processing and verification
- **Groq AI Service**: AI-powered agent responses
- **Agent Manager**: Coordinates agent lifecycle and interactions

## 🔐 Security Notes

- **Never commit `.env` files** - They contain sensitive API keys
- **Private keys**: Keep them secure and never share
- **Testnet only**: This uses Hedera testnet - not for production use
- **API keys**: Rotate if accidentally exposed

## 🧩 Technologies Used

- **Backend**: Node.js, Express.js
- **Blockchain**: Hedera Hashgraph (testnet)
- **Smart Contracts**: Solidity (ERC-8004)
- **AI**: Groq API (LLaMA models)
- **Payments**: x402 protocol
- **HTTP Client**: Axios
- **Web3**: Ethers.js

## 📝 License

MIT

## 🤝 Contributing

This is a hackathon project. For improvements or issues:

1. Check existing documentation
2. Review the code structure
3. Test your changes thoroughly
4. Update documentation as needed

## 🎯 Next Steps

- [ ] Add more agent types and capabilities
- [ ] Implement reputation system
- [ ] Add escrow mechanisms
- [ ] Support HTS token payments
- [ ] Build client SDK for easier integration
- [ ] Add WebSocket support for real-time updates

## 📞 Support

For questions or issues:
- Review the [server documentation](./server/README.md)
- Check [testing guide](./server/TESTING.md) for troubleshooting
- See [ENV_SETUP.md](./server/ENV_SETUP.md) for configuration help

---

**Built for**: Hedera Hackathon  
**Network**: Hedera Testnet  
**Status**: Active Development

