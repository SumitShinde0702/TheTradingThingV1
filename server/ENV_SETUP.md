# Environment Variables Setup

## Required Environment Variables

Create a `.env` file in the `server/` directory with the following variables:

```env
# Groq API Key (for AI-powered agents)
GROQ_API_KEY=gsk_...

# Hedera Configuration (Optional - defaults are in config/hedera.js)
# Replace with your actual account details
OWNER_ACCOUNT_ID=0.0.7170260
OWNER_EVM_ADDRESS=0x...
OWNER_PRIVATE_KEY=0x...

CLIENT_ACCOUNT_ID=0.0.7174458
CLIENT_EVM_ADDRESS=0x...
CLIENT_PRIVATE_KEY=0x...

# x402 Facilitator URL (Optional - uses hosted facilitator by default)
X402_FACILITATOR_URL=https://x402-hedera-production.up.railway.app
```

## Quick Setup

1. Copy this file or create `.env` manually:
   ```bash
   cd server
   # Create .env file with your API keys
   ```

2. The `.env` file is already in `.gitignore` so it won't be committed

3. Start the server:
   ```bash
   npm start
   ```

## Important Notes

- **Never commit `.env` files** - they contain sensitive API keys
- The `.env` file is already in `.gitignore`
- If `GROQ_API_KEY` is not set, agents will run without AI capabilities (with a warning)

