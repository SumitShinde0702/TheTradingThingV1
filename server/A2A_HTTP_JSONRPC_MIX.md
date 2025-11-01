# Mixing HTTP Status Codes with JSON-RPC 2.0

## The Challenge

**A2A Protocol uses JSON-RPC 2.0 over HTTP:**
- Standard JSON-RPC responses are typically HTTP 200 with errors encoded in the JSON body
- The `A2AExpressApp` always returns HTTP 200 for valid JSON-RPC responses (see line 83 in `node_modules/@a2a-js/sdk/dist/server/express/index.js`)

**x402 Protocol requires HTTP 402:**
- Uses HTTP status code 402 "Payment Required"
- Includes x402 headers (`Payment-Required`, `Payment-Address`, etc.)

**How to combine them?**

## Solution: Intercept at Express Middleware Level

Since JSON-RPC is the **payload format** (the body), but HTTP status codes are at the **transport layer**, we can:

1. **Check payment BEFORE** the request reaches the A2A router
2. **Return HTTP 402** at the Express level (transport)
3. **Include JSON-RPC error structure** in the response body (protocol)
4. **Let A2A router handle** normal requests (after payment verified)

## Implementation Architecture

```
┌─────────────────────────────────────────┐
│  Express Request                        │
│  POST /api/agents/:agentId/a2a          │
│  Body: { jsonrpc: "2.0", method: ... }  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Payment Middleware (NEW)               │
│  - Parse JSON-RPC request               │
│  - Extract payment proof (if any)       │
│  - Check if payment required            │
│  - Verify payment (if provided)         │
│  - Return 402 if needed, or pass through│
└──────┬───────────────────┬──────────────┘
       │                   │
       │ Payment Required  │ Payment OK / Not Required
       │ HTTP 402          │
       ▼                   ▼
┌──────────────┐   ┌──────────────────────┐
│ Return 402   │   │ Continue to A2A      │
│ with JSON-RPC│   │ Router               │
│ error body   │   │ (returns HTTP 200)   │
└──────────────┘   └──────────────────────┘
```

## Code Implementation

### Step 1: Payment Middleware in Route Handler

```javascript
// routes/a2a.js
router.use("/agents/:agentId/a2a", async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const agent = agentManager.getAgent(agentId);
    
    if (!agent) {
      // Agent not found - return JSON-RPC error with HTTP 404
      return res.status(404).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: {
          code: -32601,
          message: "Agent not found",
        },
      });
    }

    // Check if this agent requires payment
    if (agent.requiresPayment) {
      const x402Service = agentManager.getX402Service();
      
      // Extract payment proof from:
      // 1. HTTP header: X-Payment
      // 2. JSON-RPC message metadata: params.message.metadata.payment
      const paymentHeader = req.headers["x-payment"];
      const paymentMetadata = req.body?.params?.message?.metadata?.payment;
      const txHash = paymentHeader || paymentMetadata?.txHash;

      // If no payment proof provided, return 402
      if (!txHash) {
        const paymentDetails = x402Service.generatePaymentRequest({
          amount: agent.paymentAmount || "1",
          token: "HBAR",
          recipient: agent.walletAddress || HEDERA_CONFIG.OWNER_EVM_ADDRESS,
          requestId: `req_${Date.now()}_${agentId}`,
          description: `Payment for ${agent.name} service`,
        });

        // MIX: HTTP 402 (transport) + JSON-RPC error (protocol)
        res.status(402);  // ← HTTP status code
        res.set("Payment-Required", paymentDetails["Payment-Required"]);
        res.set("Payment-Address", paymentDetails["Payment-Address"]);
        res.set("Payment-Amount", paymentDetails["Payment-Amount"]);
        res.set("Payment-Token", paymentDetails["Payment-Token"]);
        
        return res.json({  // ← JSON-RPC error in body
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32099,  // Custom: Payment Required
            message: "Payment required",
            data: {
              payment: JSON.parse(paymentDetails["Payment-Required"]),
            },
          },
        });
      }

      // Payment proof provided - verify it
      const paymentRequest = paymentMetadata || {
        amount: agent.paymentAmount || "1",
        token: "HBAR",
        address: agent.walletAddress || HEDERA_CONFIG.OWNER_EVM_ADDRESS,
      };

      const verification = await x402Service.verifyPayment(txHash, paymentRequest);
      
      if (!verification.verified) {
        // Payment verification failed
        return res.status(402).json({
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32098,  // Custom: Payment Verification Failed
            message: "Payment verification failed",
            data: {
              reason: verification.reason || "Transaction not found or invalid",
            },
          },
        });
      }

      // Payment verified ✅ - inject into message metadata
      if (!req.body.params.message.metadata) {
        req.body.params.message.metadata = {};
      }
      req.body.params.message.metadata.paymentVerified = true;
      req.body.params.message.metadata.paymentRequestId = paymentRequest.requestId;
    }

    // Payment OK or not required - pass to A2A router
    // The A2A router will handle the request normally (HTTP 200 + JSON-RPC response)
    next();
    
  } catch (error) {
    console.error("[A2A Payment Middleware] Error:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: error.message || "Internal error",
      },
    });
  }
});
```

## Response Examples

### Payment Required Response

```http
HTTP/1.1 402 Payment Required
Payment-Required: {"requestId":"req_123","amount":"1","token":"HBAR","address":"0x..."}
Payment-Address: 0x...
Payment-Amount: 1
Payment-Token: HBAR
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "req_abc",
  "error": {
    "code": -32099,
    "message": "Payment required",
    "data": {
      "payment": {
        "requestId": "req_123",
        "amount": "1",
        "token": "HBAR",
        "address": "0x...",
        "facilitator": "https://..."
      }
    }
  }
}
```

### Normal A2A Response (After Payment)

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "req_abc",
  "result": {
    "kind": "status-update",
    "taskId": "task_123",
    "status": {
      "state": "completed",
      "message": {
        "kind": "message",
        "role": "agent",
        "parts": [{"kind": "text", "text": "Payment processed!"}]
      }
    }
  }
}
```

## Why This Works

1. **HTTP is the transport layer**: Status codes like 402 are part of HTTP, not JSON-RPC
2. **JSON-RPC is the payload format**: The error structure in the body is JSON-RPC compliant
3. **Middleware intercepts first**: We check payment before A2A router processes the request
4. **Standard compliance**: 
   - x402: HTTP 402 status + headers ✅
   - JSON-RPC: Error object in body ✅
   - A2A: Valid JSON-RPC responses ✅

## Client Handling

The client receives:
- HTTP 402 status → Knows payment is required (x402 standard)
- JSON-RPC error structure → Can parse programmatically (A2A standard)
- Payment details in `error.data.payment` → Can execute payment

```javascript
// Client code
try {
  const response = await fetch('/api/agents/payment-processor/a2a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jsonRpcRequest)
  });
  
  if (response.status === 402) {
    const jsonRpcResponse = await response.json();
    const paymentDetails = jsonRpcResponse.error.data.payment;
    
    // Execute payment
    const txHash = await executePayment(paymentDetails);
    
    // Retry with payment proof
    return fetch('/api/agents/payment-processor/a2a', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment': txHash  // ← Payment proof in header
      },
      body: JSON.stringify(jsonRpcRequest)
    });
  }
  
  // Normal processing
  return response.json();
} catch (error) {
  // Handle error
}
```

## Summary

**We're mixing HTTP and JSON-RPC at different layers:**
- **HTTP Layer (Transport)**: Status code 402, headers
- **JSON-RPC Layer (Protocol)**: Error structure in body
- **A2A Layer (Application)**: Standard message/task format

This is valid because:
- HTTP status codes are transport-level information
- JSON-RPC errors are protocol-level information
- They serve different purposes and can coexist

