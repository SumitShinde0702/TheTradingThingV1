# x402 Integration Guide

## What We've Implemented

Based on the [x402-hedera specification](https://github.com/hedera-dev/x402-hedera), we now have:

### ✅ Proper x402 Flow

1. **402 Payment Required Response**
   - Returns HTTP 402 status
   - Includes standard x402 headers:
     - `Payment-Required`: JSON with payment details
     - `Payment-Address`: Recipient address
     - `Payment-Amount`: Amount required
     - `Payment-Token`: Token type (HBAR, USDC, etc.)

2. **X-Payment Header Support**
   - Clients can include `X-Payment` header with payment proof
   - Server verifies payment before serving content

3. **Facilitator Integration**
   - Uses x402 facilitator for payment verification
   - Supports hosted facilitator: `https://x402-hedera-production.up.railway.app`
   - Falls back to local verification if needed

## How to Use x402 Payments

### Option 1: x402 Standard Flow (Recommended)

```bash
# Step 1: Request service (returns 402)
curl -X POST http://localhost:8443/api/agents/13/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello",
    "payment": {"required": true, "amount": "0.1", "token": "HBAR"}
  }'

# Response: 402 Payment Required with headers
# {
#   "paymentRequired": true,
#   "payment": {
#     "requestId": "...",
#     "amount": "0.1",
#     "address": "0x...",
#     "token": "HBAR"
#   }
# }

# Step 2: Client makes payment (using wallet or facilitator)
# Payment executed on Hedera...

# Step 3: Retry request with X-Payment header
curl -X POST http://localhost:8443/api/agents/13/message \
  -H "Content-Type: application/json" \
  -H "X-Payment: <txHash>" \
  -d '{
    "message": "Hello",
    "payment": {"requestId": "...", "txHash": "<txHash>"}
  }'

# Response: 200 OK with agent response
```

### Option 2: Using Facilitator API

The facilitator handles payment execution:

```javascript
// 1. Get payment request (402 response)
const paymentRequest = await fetch("/api/agents/13/message", {
  method: "POST",
  body: JSON.stringify({
    message: "Hello",
    payment: { required: true, amount: "0.1" }
  })
});

// 2. Pay through facilitator
const facilitator = "https://x402-hedera-production.up.railway.app";
const paymentResult = await fetch(`${facilitator}/pay`, {
  method: "POST",
  body: JSON.stringify({
    paymentRequest: paymentRequest.payment,
    privateKey: payerPrivateKey // Client's private key
  })
});

// 3. Retry with payment proof
const response = await fetch("/api/agents/13/message", {
  method: "POST",
  headers: {
    "X-Payment": paymentResult.txHash
  },
  body: JSON.stringify({
    message: "Hello",
    payment: { requestId: paymentRequest.payment.requestId }
  })
});
```

## Configuration

### Use Hosted Facilitator (Recommended)

Set in `.env`:
```
X402_FACILITATOR_URL=https://x402-hedera-production.up.railway.app
```

### Use Local Facilitator

Run your own facilitator (see x402-hedera repo):
```
X402_FACILITATOR_URL=http://localhost:3002
```

## x402 Headers Reference

### Server Response (402):
- `Payment-Required`: JSON string with full payment details
- `Payment-Address`: Recipient address
- `Payment-Amount`: Amount as string
- `Payment-Token`: Token identifier

### Client Request (with payment proof):
- `X-Payment`: Transaction hash or payment proof JSON

## Testing x402 Flow

```bash
# Test script that follows x402 flow
node server/src/examples/x402-client-example.js
```

## Integration with Agents

Agents can require payment by:

1. **In message handler:**
```javascript
if (payment && payment.required) {
  return res.status(402).json({
    paymentRequired: true,
    payment: paymentDetails
  });
}
```

2. **Check X-Payment header:**
```javascript
const paymentHeader = req.headers["x-payment"];
if (paymentHeader) {
  const verified = await verifyPayment(paymentHeader);
  if (!verified) return res.status(402);
}
```

## Next Steps

- [ ] Add client library for automatic x402 handling
- [ ] Support USDC payments (HTS tokens)
- [ ] Add payment caching/rate limiting
- [ ] Implement payment receipts

