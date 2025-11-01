# Environment Variables Setup

## Required Environment Variables

Create a `.env` file in the `server/` directory with the following variables:

```env
# Groq API Key (for AI-powered agents)
GROQ_API_KEY=gsk_...

# Hedera Configuration (Optional - defaults are in config/hedera.js)
OWNER_ACCOUNT_ID=0.0.7170260
OWNER_EVM_ADDRESS=0x987effd3acba1cf13968bc0c3af3fd661e07c62e
OWNER_PRIVATE_KEY=0x88921444661772c1e5bc273d5f9d00099c189a3294de9f85eae65307d80fbd67

CLIENT_ACCOUNT_ID=0.0.7174458
CLIENT_EVM_ADDRESS=0x1fef1c22bbf2e66bc575c8b433d75588ab2aea92
CLIENT_PRIVATE_KEY=0x06a0a3da5723988cdd989c371de7f77953c36cc27eb4c288cf03dc6c629b2e12

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

