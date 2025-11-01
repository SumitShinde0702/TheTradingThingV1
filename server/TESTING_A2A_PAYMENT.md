# Testing A2A + x402 Payment Integration

This guide walks you through testing the complete A2A payment flow.

## Prerequisites

1. **Server dependencies installed**:
   ```bash
   cd server
   npm install
   ```

2. **Hedera Testnet Accounts**: 
   - The configuration uses test accounts with testnet HBAR
   - Make sure the CLIENT account has sufficient HBAR for payments
   - Check balances: https://hashscan.io/testnet

3. **Server running**: The server needs to be running for the test

## Step-by-Step Testing

### Step 1: Start the Server

```bash
cd server
npm start
```

**Expected output:**
```
🚀 Hedera Agent Server starting...
✅ Server running on http://localhost:8443
✅ TradingAgent registered with ID: 40
✅ PaymentProcessor registered with ID: 41
✅ DataAnalyzer registered with ID: 42
🔗 Setting up A2A endpoints...
✅ A2A endpoints ready!
```

**Important**: Wait for all agents to be registered and A2A endpoints to be ready.

### Step 2: Run the A2A Payment Example

In a **new terminal window**, run:

```bash
cd server
node src/examples/a2a-agent-communication-example.js
```

**Expected Flow:**

1. **Agent Discovery**:
   ```
   📋 Step 1: Discovering agents...
   ✅ Found TradingAgent: ID 40
   ✅ Found PaymentProcessor: ID 41
   ```

2. **Agent Card Retrieval**:
   ```
   📇 Step 2: Fetching PaymentProcessor's Agent Card...
   ✅ Agent Card retrieved:
      Name: PaymentProcessor
      URL: http://localhost:8443/api/agents/41/a2a
   ```

3. **Initial Request (Payment Required)**:
   ```
   💬 Step 4: TradingAgent sending message to PaymentProcessor...
   Sending A2A message/send request...
   
   💳 Payment required!
   
   📋 Payment Details:
      Amount: 0.1 HBAR
      Address: 0x987effd3acba1cf13968bc0c3af3fd661e07c62e
      Request ID: req_...
   ```

4. **Payment Execution**:
   ```
   💰 Executing payment...
      Recipient: 0x987effd3acba1cf13968bc0c3af3fd661e07c62e
      Amount: 0.1 HBAR
      Transaction sent: 0xabc123...
      Waiting for confirmation...
      ✅ Payment executed! TxHash: 0xabc123...
   ```

5. **Waiting for Indexing**:
   ```
   ⏳ Waiting 10 seconds for transaction to be indexed...
   (Hedera mirror node needs time to index new transactions)
   ```

6. **Retry with Payment Proof**:
   ```
   🔄 Retrying request with payment proof...
   
   ✅ Response received:
      Status: completed
      Agent response: "Payment of 0.1 HBAR has been processed successfully..."
   ```

7. **Success**:
   ```
   ✨ Example complete! TradingAgent successfully communicated 
      with PaymentProcessor using A2A protocol with payment.
   ```

## Manual Testing with curl

### Test 1: Payment Required Response

```bash
curl -X POST http://localhost:8443/api/agents/41/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test-1",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "role": "user",
        "parts": [{"kind": "text", "text": "Hello, need payment service"}],
        "messageId": "msg-1",
        "metadata": {
          "fromAgentId": "test-agent"
        }
      }
    }
  }' \
  -v
```

**Expected Response:**
- HTTP Status: `402 Payment Required`
- Headers: `Payment-Required`, `Payment-Address`, `Payment-Amount`, `Payment-Token`
- Body: JSON-RPC error with code `-32099` and payment details in `error.data.payment`

### Test 2: With Payment Proof

After getting payment details and executing payment, retry with:

```bash
curl -X POST http://localhost:8443/api/agents/41/a2a \
  -H "Content-Type: application/json" \
  -H "X-Payment: YOUR_TX_HASH_HERE" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test-2",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "role": "user",
        "parts": [{"kind": "text", "text": "Hello, need payment service"}],
        "messageId": "msg-2",
        "metadata": {
          "fromAgentId": "test-agent",
          "payment": {
            "requestId": "req_...",
            "txHash": "YOUR_TX_HASH_HERE",
            "amount": "0.1",
            "token": "HBAR"
          }
        }
      }
    }
  }' \
  -v
```

**Expected Response:**
- HTTP Status: `200 OK`
- Body: JSON-RPC response with `result` containing agent's response

## Troubleshooting

### Issue: "Payment verification failed"

**Possible causes:**
1. Transaction hasn't been indexed yet - wait longer (15-20 seconds)
2. Wrong recipient address - check payment details
3. Insufficient amount - verify transaction amount matches requirement

**Solution:**
- Check transaction on HashScan: https://hashscan.io/testnet
- Verify transaction is confirmed
- Wait additional 10-15 seconds before retry

### Issue: "Agent not found"

**Possible causes:**
1. Server not fully started
2. Agent ID mismatch

**Solution:**
- Wait for server to complete initialization
- Check `/api/agents` endpoint to get correct agent IDs

### Issue: "Transaction timeout"

**Possible causes:**
1. Network issues
2. Hedera testnet congestion

**Solution:**
- Check Hedera testnet status
- Verify RPC endpoint is accessible
- Retry after a few seconds

### Issue: Payment executed but verification still fails

**Possible causes:**
1. Mirror node not indexed yet
2. Using wrong account ID format

**Solution:**
- Increase wait time to 20 seconds
- Check transaction on HashScan manually
- Verify the recipient account ID matches

## Verifying Payment on Hedera

After executing payment, verify it on Hedera:

1. **HashScan**: Visit https://hashscan.io/testnet
2. **Search**: Enter your transaction hash
3. **Verify**:
   - Transaction status: `SUCCESS`
   - Recipient: `0x987effd3acba1cf13968bc0c3af3fd661e07c62e` (OWNER address)
   - Amount: `0.1 HBAR` (10000000 tinybars)

## Expected Server Logs

When payment flow works correctly, you should see:

```
[A2A Payment Middleware] Checking payment for agent: PaymentProcessor
📋 Payment request details: { requestId: '...', amount: '0.1', ... }
✅ Payment verified successfully
[A2AExecutor] Processing task: task_...
✅ Task completed: task_...
```

## Testing Without Payment

To test A2A communication without payment, use an agent that doesn't require payment:

```bash
# TradingAgent (ID 40) doesn't require payment
curl -X POST http://localhost:8443/api/agents/40/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test-no-payment",
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "role": "user",
        "parts": [{"kind": "text", "text": "Hello"}],
        "messageId": "msg-3",
        "metadata": {}
      }
    }
  }'
```

This should return `200 OK` immediately without payment requirement.

## Quick Test Script

You can also run this quick test to verify the setup:

```bash
# Test 1: Check agents are registered
curl http://localhost:8443/api/agents | jq '.agents[] | {id, name, requiresPayment}'

# Test 2: Check PaymentProcessor requires payment
curl http://localhost:8443/api/agents/41/.well-known/agent-card.json | jq '.name'

# Test 3: Full payment flow (run the example)
node src/examples/a2a-agent-communication-example.js
```

## Success Criteria

✅ **Test passes if:**
1. Initial request returns HTTP 402 with payment details
2. Payment executes successfully on Hedera
3. Retry with payment proof returns HTTP 200 with agent response
4. Agent responds with acknowledgment of payment

## Next Steps

Once testing is successful:
- Try different payment amounts
- Test with multiple agents
- Test payment verification failure scenarios
- Test concurrent requests

