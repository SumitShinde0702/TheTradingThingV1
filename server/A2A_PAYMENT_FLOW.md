# A2A + x402 Payment Integration - Concrete Flow

## Overview

This document shows the **exact step-by-step flow** of how an agent communicates via A2A protocol with payment requirements.

## Scenario

**TradingAgent** wants to send a message to **PaymentProcessor** agent that requires 1 HBAR payment.

---

## Step 1: Agent Discovery

**Client (TradingAgent)** discovers PaymentProcessor's A2A endpoint:

```http
GET /api/agents/payment-processor/.well-known/agent-card.json
```

**Response:**
```json
{
  "name": "PaymentProcessor",
  "description": "Handles payment verification",
  "url": "http://localhost:8443/api/agents/payment-processor/a2a",
  "version": "1.0.0",
  "skills": [...],
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  }
}
```

---

## Step 2: Initial Message Request (No Payment)

**Client** sends message via A2A:

```http
POST /api/agents/payment-processor/a2a
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "req_123",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "Process a payment of 1 HBAR for trading service"
        }
      ],
      "messageId": "msg_abc123",
      "metadata": {
        "fromAgentId": "trading-agent",
        "fromAgentName": "TradingAgent"
      }
    }
  }
}
```

**What happens on server:**

1. Request hits `router.use("/agents/:agentId/a2a", ...)` in `a2a.js`
2. Routes to agent's A2A router (via `A2AExpressApp`)
3. `DefaultRequestHandler` receives JSON-RPC call
4. Extracts message, creates `RequestContext`
5. Calls `HederaAgentExecutor.execute(requestContext, eventBus)`

**Current executor logic:**
- No payment checking yet ❌
- Immediately processes message
- Returns AI response

**After payment integration, executor will:**
1. Check if agent requires payment for this service
2. Extract payment info from message metadata (if provided)
3. Check `X-Payment` header (if we can access HTTP request)

---

## Step 3: Payment Required Response

**Two approaches for returning payment requirement:**

### Approach A: JSON-RPC Error with HTTP 402

```http
HTTP/1.1 402 Payment Required
Payment-Required: {"requestId":"req_pay_456","amount":"1","token":"HBAR","address":"0x123...","facilitator":"https://..."}
Payment-Address: 0x123...
Payment-Amount: 1
Payment-Token: HBAR
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "req_123",
  "error": {
    "code": -32099,
    "message": "Payment required",
    "data": {
      "payment": {
        "requestId": "req_pay_456",
        "amount": "1",
        "token": "HBAR",
        "address": "0x123...",
        "facilitator": "https://x402-hedera-production.up.railway.app",
        "network": "testnet",
        "chainId": "296",
        "description": "Payment for PaymentProcessor service"
      }
    }
  }
}
```

### Approach B: TaskStatusUpdateEvent with input-required (More A2A-native)

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "req_123",
  "result": {
    "kind": "status-update",
    "taskId": "task_789",
    "contextId": "ctx_xyz",
    "status": {
      "state": "input-required",
      "message": {
        "kind": "message",
        "role": "agent",
        "parts": [
          {
            "kind": "text",
            "text": "Payment of 1 HBAR required to proceed"
          },
          {
            "kind": "data",
            "data": {
              "payment": {
                "requestId": "req_pay_456",
                "amount": "1",
                "token": "HBAR",
                "address": "0x123...",
                "facilitator": "https://x402-hedera-production.up.railway.app"
              }
            }
          }
        ]
      },
      "timestamp": "2024-01-15T10:30:00Z"
    },
    "final": false
  }
}
```

**Recommended: Approach A** (HTTP 402 + JSON-RPC error) because:
- Maintains x402 standard compliance
- Clear separation of transport (HTTP) and protocol (JSON-RPC)
- Client can easily detect 402 status

---

## Step 4: Client Executes Payment

**Client** receives payment requirement and executes payment:

### Option 1: Via Facilitator (Recommended)

```javascript
// Client code
const paymentDetails = error.data.payment;
const facilitator = paymentDetails.facilitator;

// Execute payment through facilitator
const paymentResult = await fetch(`${facilitator}/pay`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    paymentRequest: paymentDetails,
    privateKey: clientPrivateKey  // Client's Hedera private key
  })
});

const { txHash } = await paymentResult.json();
// txHash = "0xabc123..."
```

### Option 2: Direct Hedera Transaction

Client executes payment directly on Hedera network and gets `txHash`.

---

## Step 5: Retry with Payment Proof

**Client** retries the A2A request with payment proof:

```http
POST /api/agents/payment-processor/a2a
Content-Type: application/json
X-Payment: 0xabc123...  ← Payment proof in header

{
  "jsonrpc": "2.0",
  "id": "req_124",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "Process a payment of 1 HBAR for trading service"
        }
      ],
      "messageId": "msg_abc124",
      "metadata": {
        "fromAgentId": "trading-agent",
        "fromAgentName": "TradingAgent",
        "payment": {
          "requestId": "req_pay_456",
          "txHash": "0xabc123...",
          "amount": "1",
          "token": "HBAR"
        }
      }
    }
  }
}
```

**What happens on server:**

1. Request hits route handler
2. **Payment middleware** (new) extracts:
   - `X-Payment` header → `txHash`
   - `message.metadata.payment` → payment details
3. **Payment verification**:
   - Calls `x402Service.verifyPayment(txHash, paymentDetails)`
   - Queries Hedera mirror node
   - Verifies: correct recipient, amount, token
4. If verified ✅ → Proceed to executor
5. If not verified ❌ → Return payment verification error

---

## Step 6: Payment Verified - Message Processing

**Executor receives verified request:**

```javascript
// HederaAgentExecutor.execute()
async execute(requestContext, eventBus) {
  const userMessage = requestContext.userMessage;
  
  // Payment already verified by middleware ✅
  // metadata.paymentVerified = true (set by middleware)
  
  // Extract message text
  const messageText = userMessage.parts[0].text;
  
  // Process with AI
  const aiResponse = await this.agentManager.processMessageWithAI(
    this.agent.id,
    messageText,
    userMessage.metadata.fromAgentId,
    {
      taskId,
      contextId,
      paymentVerified: true,  // ← Pass to AI context
      ...userMessage.metadata
    }
  );
  
  // Return response...
}
```

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "req_124",
  "result": {
    "kind": "status-update",
    "taskId": "task_790",
    "contextId": "ctx_xyz",
    "status": {
      "state": "completed",
      "message": {
        "kind": "message",
        "role": "agent",
        "parts": [
          {
            "kind": "text",
            "text": "Payment of 1 HBAR has been processed successfully. Your trading service is now active."
          }
        ]
      },
      "timestamp": "2024-01-15T10:35:00Z"
    },
    "final": true
  }
}
```

---

## Implementation Details

### 1. Payment Check Location

**Option A: Middleware in Route Handler** (Recommended)

```javascript
// routes/a2a.js
router.use("/agents/:agentId/a2a", async (req, res, next) => {
  const { agentId } = req.params;
  const agent = agentManager.getAgent(agentId);
  
  // Extract payment proof
  const txHash = req.headers["x-payment"];
  const paymentMetadata = req.body?.params?.message?.metadata?.payment;
  
  // Check if payment required
  if (agent.requiresPayment) {
    if (!txHash && !paymentMetadata?.txHash) {
      // Return payment required error
      return res.status(402).json({
        jsonrpc: "2.0",
        id: req.body?.id,
        error: {
          code: -32099,
          message: "Payment required",
          data: {
            payment: x402Service.generatePaymentRequest({
              amount: agent.paymentAmount || "1",
              token: "HBAR"
            })
          }
        }
      });
    }
    
    // Verify payment
    const verified = await x402Service.verifyPayment(
      txHash || paymentMetadata.txHash,
      paymentMetadata
    );
    
    if (!verified) {
      return res.status(402).json({
        jsonrpc: "2.0",
        id: req.body?.id,
        error: {
          code: -32098,
          message: "Payment verification failed"
        }
      });
    }
    
    // Inject payment status into message metadata
    if (req.body?.params?.message?.metadata) {
      req.body.params.message.metadata.paymentVerified = true;
    }
  }
  
  next(); // Continue to A2A router
});
```

**Option B: Check in Executor**

- Access to HTTP request is limited in `RequestContext`
- Would need to pass payment info through message metadata only
- Less flexible

### 2. Payment Requirement Detection

**When should an agent require payment?**

1. **Agent-level setting**: `agent.requiresPayment = true`
2. **Service-level**: Certain messages/capabilities require payment
3. **Dynamic**: AI determines if payment needed based on message content

**Current implementation**: Check in route handler based on agent config

### 3. Error Codes

- `-32099`: Payment Required
- `-32098`: Payment Verification Failed
- `-32097`: Payment Expired
- `-32096`: Insufficient Payment Amount

---

## Complete Flow Diagram

```
┌─────────────┐
│   Client    │
│ (TradingAgent)
└──────┬──────┘
       │
       │ 1. POST /a2a (message/send)
       │    No payment proof
       ▼
┌─────────────────────────────────────┐
│  Express Route Handler (a2a.js)    │
│  - Extract agentId                  │
│  - Check payment requirement        │
│  - No txHash found                  │
└──────┬──────────────────────────────┘
       │
       │ 2. HTTP 402 + JSON-RPC Error
       │    Payment details in error.data
       ▼
┌─────────────┐
│   Client    │
│ - Receives 402
│ - Extracts payment details
│ - Executes payment (facilitator)
│ - Gets txHash
└──────┬──────┘
       │
       │ 3. POST /a2a (message/send)
       │    X-Payment: 0xabc123...
       │    metadata.payment: {...}
       ▼
┌─────────────────────────────────────┐
│  Express Route Handler              │
│  - Extract txHash                   │
│  - Verify payment via X402Service   │
│  - Query Hedera mirror node         │
│  - ✅ Payment verified              │
│  - Inject paymentVerified=true      │
└──────┬──────────────────────────────┘
       │
       │ 4. Forward to A2A Router
       ▼
┌─────────────────────────────────────┐
│  DefaultRequestHandler              │
│  - Parse JSON-RPC                   │
│  - Create RequestContext            │
│  - Call HederaAgentExecutor         │
└──────┬──────────────────────────────┘
       │
       │ 5. execute(requestContext, eventBus)
       ▼
┌─────────────────────────────────────┐
│  HederaAgentExecutor                │
│  - Extract message text             │
│  - Call processMessageWithAI()      │
│  - Generate response                │
│  - Publish TaskStatusUpdateEvent    │
└──────┬──────────────────────────────┘
       │
       │ 6. JSON-RPC Response
       │    status: "completed"
       ▼
┌─────────────┐
│   Client    │
│ - Receives response
│ - Payment processed ✅
└─────────────┘
```

---

## Next Steps

1. **Add payment middleware** in `routes/a2a.js`
2. **Update `HederaAgentExecutor`** to pass payment context to AI
3. **Update example** `a2a-agent-communication-example.js` to handle payment flow
4. **Test end-to-end** payment flow

