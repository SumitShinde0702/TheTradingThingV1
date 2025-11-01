# Account Setup

## Account Structure

### Owner Account (Server/Agents)
- **Purpose**: Server wallet, agent operations, receives payments
- **Account ID**: `0.0.7170260`
- **EVM Address**: `0x987effd3acba1cf13968bc0c3af3fd661e07c62e`
- **Private Key**: `0x88921444661772c1e5bc273d5f9d00099c189a3294de9f85eae65307d80fbd67`
- **Used by**: Server, agents (TradingAgent, PaymentProcessor, DataAnalyzer)

### Client Account (Customer/Testing)
- **Purpose**: Client wallet, makes payments, tests payment flows
- **Account ID**: `0.0.7174458`
- **EVM Address**: `0x1fef1c22bbf2e66bc575c8b433d75588ab2aea92`
- **Private Key**: `0x06a0a3da5723988cdd989c371de7f77953c36cc27eb4c288cf03dc6c629b2e12`
- **Used by**: Payment clients, test scripts

## How It Works

### Agent Payments Flow:
```
Client (0.0.7174458) → Pays → Agent/Server (0.0.7170260)
```

### Agent Registration:
- Agents register using Owner account (0.0.7170260)
- Agents receive payments to Owner account
- All agents currently share the Owner wallet

### Payment Testing:
- Use Client account to make payments
- Test x402 flow with Client → Owner transfers
- Verify payments from Client account

## Configuration

In `src/config/hedera.js`:
- `OWNER_*` - Server/agents account
- `CLIENT_*` - Client/customer account
- `ACCOUNT_ID`, `EVM_ADDRESS`, `PRIVATE_KEY` - Alias to Owner (for backward compatibility)

## Testing

### Test as Client:
```bash
# Uses CLIENT account to pay agents
node src/examples/x402-client-example.js 30 "Hello" 0.01
```

### Test A2A Transfer:
```bash
# Transfer from Owner account (agents) - currently self-transfer
node test-transfer.js 30 31 0.01
```

## Next Steps

For true A2A transfers with different wallets:
1. Each agent would get its own wallet
2. Clients would pay to agent-specific wallets
3. Agents could transfer between each other's wallets

For now, all agents use Owner account and receive payments there.

