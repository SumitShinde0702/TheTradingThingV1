# Unified Agentic Economy System - Implementation Documentation

## 1. ERC-8004 Agent Discovery & Trust

### Implementation Overview
We implemented ERC-8004 protocol for decentralized agent discovery, registration, and trust establishment on Hedera testnet. Agents are registered on-chain and can be discovered by querying blockchain events.

### Key Files
- **`server/src/services/ERC8004Service.js`** - Core ERC-8004 service
- **`server/src/services/AgentManager.js`** - Agent registry and management
- **`server/src/routes/agents.js`** - API endpoints for agent operations
- **`server/src/index.js`** - Agent registration on server startup

### Code Snippets

#### Agent Discovery (ERC8004Service.js)
```javascript
async discoverAgents(options = {}) {
  const { limit = 10, capabilities = null, includeDetails = true } = options;
  
  // Query Registered events from blockchain
  const events = await this.identityRegistry.queryFilter(
    "Registered",
    queryFromBlock,
    toBlock
  );
  
  // Parse events and collect unique agentIds
  const agentMap = new Map();
  for (const event of events) {
    const parsed = event.args;
    const agentId = parsed.agentId.toString();
    
    if (includeDetails) {
      const owner = await this.getAgentOwner(agentId);
      const tokenURI = await this.getAgentURI(agentId);
      agentMap.set(agentId, {
        agentId,
        owner,
        tokenURI,
        blockNumber: event.blockNumber
      });
    }
  }
  
  return Array.from(agentMap.values()).slice(0, limit);
}
```

#### Agent Registration (AgentManager.js)
```javascript
async registerAgent(agentData) {
  const ercService = this.getERC8004Service();
  
  // Register agent on-chain
  const { agentId, txHash } = await ercService.registerAgent(tokenURI);
  
  // Store locally
  const agent = new Agent({
    id: agentId,
    name: agentData.name,
    capabilities: agentData.capabilities,
    endpoint: agentData.endpoint
  });
  
  this.agents.set(agentId, agent);
  this.updateCapabilityIndex(agent);
  
  return agent;
}
```

#### Reputation & Trust (ERC8004Service.js)
```javascript
async getAgentReputation(agentId, clientAddresses = [], tag1 = "0x0", tag2 = "0x0") {
  const result = await this.reputationRegistry.getSummary(
    agentId,
    clientAddresses,
    tag1 === "0x0" ? ethers.ZeroHash : tag1,
    tag2 === "0x0" ? ethers.ZeroHash : tag2
  );
  
  return {
    count: result.count.toString(),
    averageScore: result.averageScore.toString(),
  };
}
```

---

## 2. x402 Payment Integration

### Implementation Overview
We implemented HTTP 402 Payment Required protocol using x402-hedera specification. Payments are processed on Hedera testnet using HBAR or HTS tokens, with automatic verification via mirror nodes and facilitators.

### Key Files
- **`server/src/services/X402Service.js`** - Core x402 payment service
- **`server/src/services/X402Facilitator.js`** - Payment facilitator for verification
- **`server/src/routes/payments.js`** - Payment API endpoints
- **`server/src/middleware/x402Middleware.js`** - A2A payment middleware

### Code Snippets

#### Payment Request Generation (X402Service.js)
```javascript
generatePaymentRequest(paymentRequest) {
  const { amount, token = "HBAR", recipient, requestId } = paymentRequest;
  
  const paymentDetails = {
    requestId: requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    amount: amount.toString(),
    token,
    address: recipient || HEDERA_CONFIG.OWNER_EVM_ADDRESS,
    network: HEDERA_CONFIG.NETWORK,
    chainId: HEDERA_CONFIG.CHAIN_ID.toString(),
    facilitator: facilitatorURL,
  };
  
  // Store for verification
  this.pendingPayments.set(paymentDetails.requestId, {
    ...paymentDetails,
    status: "pending",
    createdAt: Date.now(),
  });
  
  // Return x402 standard response
  return {
    status: 402,
    "Payment-Required": JSON.stringify(paymentDetails),
    "Payment-Address": recipientAddress,
    "Payment-Amount": amount.toString(),
    "Payment-Token": token,
  };
}
```

#### Payment Execution (payments.js)
```javascript
router.post("/model-payment", async (req, res) => {
  const { modelName } = req.body;
  const wallet = await getClientWallet();
  const recipient = HEDERA_CONFIG.OWNER_EVM_ADDRESS;
  const amount = "0.1"; // HBAR
  
  // Execute payment transaction
  const tx = await wallet.sendTransaction({
    to: recipient,
    value: ethers.parseEther(amount),
  });
  
  const receipt = await tx.wait();
  const txHash = receipt.hash;
  
  res.json({
    success: true,
    modelName,
    txHash,
    hashscanUrl: `https://hashscan.io/testnet/transaction/${txHash}`
  });
});
```

#### Payment Verification (X402Facilitator.js)
```javascript
async verifyPayment(txHash, expectedPayment) {
  // Try multiple verification methods
  // 1. HashScan API
  // 2. Mirror Node API
  // 3. Account-based verification (fallback)
  
  // Query mirror node for transaction
  const response = await axios.get(
    `${this.mirrorNodeURL}/transactions/${txHash}`
  );
  
  // Verify amount, recipient, and status
  const transfers = response.data.transfers || [];
  const matchingTransfer = transfers.find(t => 
    t.account === expectedPayment.address &&
    t.amount >= expectedPayment.amount * 0.9 // 90% tolerance
  );
  
  return {
    verified: !!matchingTransfer,
    txHash,
    transactionId: response.data.transaction_id
  };
}
```

---

## 3. Hedera Testnet Integration

### Implementation Overview
Full integration with Hedera testnet using JSON-RPC endpoints, mirror node API, and HashScan explorer. Handles transaction submission, verification, and account management.

### Key Files
- **`server/src/config/hedera.js`** - Hedera configuration
- **`server/src/services/X402Facilitator.js`** - Mirror node queries
- **`server/src/routes/payments.js`** - Transaction execution

### Code Snippets

#### Configuration (hedera.js)
```javascript
export const HEDERA_CONFIG = {
  JSON_RPC_URL: "https://testnet.hashio.io/api",
  CHAIN_ID: 296,
  NETWORK: "testnet",
  MIRROR_NODE_URL: "https://testnet.mirrornode.hedera.com/api/v1",
  IDENTITY_REGISTRY: "0x...", // ERC-8004 contract address
  OWNER_EVM_ADDRESS: "0x...",  // Agent payment recipient
};
```

#### Mirror Node Integration (X402Facilitator.js)
```javascript
async verifyPaymentViaMirrorNode(txHash) {
  try {
    // Query transaction by hash
    const response = await axios.get(
      `${this.mirrorNodeURL}/transactions/${txHash}`
    );
    
    const transaction = response.data.transactions[0];
    if (!transaction) return { verified: false };
    
    // Extract transfers
    const transfers = transaction.transfers || [];
    
    return {
      verified: transaction.result === "SUCCESS",
      transactionId: transaction.transaction_id,
      transfers,
      consensusTimestamp: transaction.consensus_timestamp
    };
  } catch (error) {
    return { verified: false, error: error.message };
  }
}
```

#### Account-Based Verification (X402Facilitator.js)
```javascript
async verifyPaymentViaAccount(accountId, expectedAmount, txHash) {
  // Query recent transactions for account
  const response = await axios.get(
    `${this.mirrorNodeURL}/accounts/${accountId}/transactions`,
    { params: { limit: 100, order: "desc" } }
  );
  
  const transactions = response.data.transactions || [];
  const timeWindow = Date.now() - 30 * 60 * 1000; // Last 30 minutes
  
  // Find matching transaction
  for (const tx of transactions) {
    if (tx.consensus_timestamp >= timeWindow) {
      const transfers = tx.transfers || [];
      const match = transfers.find(t =>
        t.account === accountId &&
        t.amount >= expectedAmount * 0.9
      );
      
      if (match) {
        return {
          verified: true,
          transactionId: tx.transaction_id,
          amount: match.amount
        };
      }
    }
  }
  
  return { verified: false };
}
```

---

## 4. Autonomous Transaction Engine

### Implementation Overview
Built an A2A (Agent-to-Agent) messaging system using Hedera Agent Kit SDK, enabling secure inter-agent communication with payment gating, task management, and autonomous orchestration.

### Key Files
- **`server/src/services/A2AService.js`** - A2A protocol implementation
- **`server/src/services/A2AAgentExecutor.js`** - Agent execution bridge
- **`server/src/routes/a2a.js`** - A2A endpoints
- **`server/src/routes/ai.js`** - Orchestrator agent with LangChain

### Code Snippets

#### A2A Setup (A2AService.js)
```javascript
setupAgentA2A(agent) {
  // Create executor that bridges to our agent logic
  const executor = new HederaAgentExecutor(agent, this.agentManager);
  
  // Create task store for conversation context
  const taskStore = new InMemoryTaskStore();
  
  // Create agent card (metadata)
  const agentCard = this.createAgentCard(agent);
  
  // Create request handler
  const requestHandler = new DefaultRequestHandler(
    agentCard,
    taskStore,
    executor
  );
  
  // Setup Express routes for A2A protocol
  const agentRouter = express.Router();
  const appBuilder = new A2AExpressApp(requestHandler);
  appBuilder.setupRoutes(agentRouter, "");
  
  return agentRouter;
}
```

#### Agent Executor (A2AAgentExecutor.js)
```javascript
async execute(requestContext, eventBus) {
  const userMessage = requestContext.userMessage;
  const taskId = existingTask?.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Extract payment verification from metadata
  const paymentVerified = userMessage.metadata?.paymentVerified === true;
  
  // Process message through agent AI
  const aiResponse = await this.agentManager.processMessageWithAI(
    this.agent.id,
    messageText,
    userMessage.metadata?.fromAgentId || 'unknown',
    {
      taskId,
      contextId,
      paymentVerified, // Pass payment status
      ...userMessage.metadata,
    }
  );
  
  // Publish response via A2A protocol
  const completedUpdate = {
    kind: 'status-update',
    taskId,
    status: {
      state: 'completed',
      message: {
        kind: 'message',
        role: 'agent',
        parts: [{ kind: 'text', text: aiResponse }],
      },
      timestamp: new Date().toISOString(),
    },
    final: true,
  };
  eventBus.publish(completedUpdate);
}
```

#### Orchestrator Agent (ai.js)
```javascript
// LangChain agent with tools for orchestration
const agent = createAgent({
  model: new ChatGroq({
    model: "llama-3.3-70b-versatile",
    apiKey: GROQ_CONFIG.API_KEY,
  }),
  systemPrompt: systemPrompt,
  tools: [
    discoverAgentsTool,      // Find agents via ERC-8004
    processPaymentTool,        // Execute payments
    sendMessageToAgentTool,    // A2A communication
    respondToUserTool,         // User feedback
  ],
  recursionLimit: 50,
});

// Workflow phases:
// 1. Discovery → 2. Payment → 3. Signal Retrieval → 4. Trade Execution → 5. Completion
```

---

## 5. Trust & Security Layer

### Implementation Overview
Implemented comprehensive security with payment verification, context management, audit trails, and permission controls for A2A communications.

### Key Files
- **`server/src/middleware/x402Middleware.js`** - Payment verification middleware
- **`server/src/services/X402Service.js`** - Context verification
- **`server/src/services/AgentManager.js`** - Permission and capability management

### Code Snippets

#### Payment Middleware (x402Middleware.js)
```javascript
export function x402PaymentMiddleware(x402Service) {
  return async (req, res, next) => {
    const paymentHeader = req.headers["x-payment"];
    const paymentRequired = req.headers["payment-required"];
    
    // Check if context already verified
    const contextId = req.body?.params?.message?.contextId;
    if (contextId && x402Service.isContextVerified(contextId)) {
      req.paymentVerified = true;
      return next();
    }
    
    // Verify payment if provided
    if (paymentHeader) {
      const paymentProof = x402Service.parsePaymentHeader(paymentHeader);
      const paymentData = JSON.parse(paymentRequired || "{}");
      
      const verification = await x402Service.verifyPayment(
        paymentProof,
        paymentData
      );
      
      if (verification.verified) {
        req.paymentVerified = true;
        // Mark context as verified
        x402Service.markContextVerified(contextId, verification);
      }
    }
    
    // If payment required but not verified, return 402
    if (!req.paymentVerified && paymentRequired) {
      return res.status(402).json({
        error: {
          code: -40200,
          message: "Payment Required",
          data: {
            payment: JSON.parse(paymentRequired)
          }
        }
      });
    }
    
    next();
  };
}
```

#### Context Verification (X402Service.js)
```javascript
markContextVerified(contextId, paymentInfo) {
  this.verifiedContexts.set(contextId, {
    txHash: paymentInfo.txHash,
    verifiedAt: Date.now(),
    paymentInfo,
  });
}

isContextVerified(contextId) {
  const verified = this.verifiedContexts.get(contextId);
  if (!verified) return false;
  
  // Check if verification is still valid (not expired)
  const expiryTime = 3600000; // 1 hour
  return (Date.now() - verified.verifiedAt) < expiryTime;
}
```

#### Capability-Based Access (AgentManager.js)
```javascript
updateCapabilityIndex(agent) {
  // Index agent by capabilities for fast discovery
  for (const capability of agent.capabilities || []) {
    if (!this.capabilityIndex.has(capability)) {
      this.capabilityIndex.set(capability, new Set());
    }
    this.capabilityIndex.get(capability).add(agent.id);
  }
}

findAgentsByCapability(capability) {
  const agentIds = this.capabilityIndex.get(capability) || new Set();
  return Array.from(agentIds)
    .map(id => this.agents.get(id))
    .filter(Boolean);
}
```

---

## Architecture Diagram

### Agent Interaction Flow (Purchase Button Click)

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER CLICKS "PURCHASE"                   │
│                      (CompetitionPage.tsx)                       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              ORCHESTRATOR AGENT (LangChain + Groq)              │
│                     (routes/ai.js)                              │
│  • Receives purchase request                                    │
│  • Orchestrates workflow phases                                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│   PHASE 1:    │      │   PHASE 2:    │      │   PHASE 3:    │
│  DISCOVERY    │      │   PAYMENT     │      │    SIGNAL     │
└───────┬───────┘      └───────┬───────┘      └───────┬───────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ discover_agents  │   │ process_payment  │   │ send_message_    │
│   Tool Call      │   │   Tool Call      │   │  to_agent        │
│                  │   │                  │   │  (DataAnalyzer)  │
└─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘
          │                       │                       │
          ▼                       ▼                       ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ ERC8004Service   │   │ payments.js       │   │ A2A Protocol    │
│ • Query Events   │   │ • Execute Tx      │   │ • JSON-RPC      │
│ • Get Capabilities│   │ • Return txHash   │   │ • Send Message  │
└──────────────────┘   └─────────┬──────────┘   └─────────┬─────────┘
                                 │                       │
                                 ▼                       ▼
                    ┌────────────────────┐   ┌──────────────────┐
                    │  Hedera Testnet    │   │  DataAnalyzer    │
                    │  • Send HBAR       │   │  Agent           │
                    │  • Get txHash      │   │  • Fetch Signal  │
                    └────────────────────┘   │  • Return JSON    │
                                             └─────────┬─────────┘
                                                       │
                                                       ▼
                                    ┌──────────────────────────┐
                                    │   PHASE 4: EXECUTION     │
                                    └────────────┬─────────────┘
                                                 │
                                                 ▼
                                    ┌──────────────────────────┐
                                    │ send_message_to_agent    │
                                    │   (TradeExecutor)        │
                                    └────────────┬─────────────┘
                                                 │
                                                 ▼
                                    ┌──────────────────────────┐
                                    │    TradeExecutor Agent   │
                                    │    • Execute Trades      │
                                    └──────────────────────────┘
                                                 │
                                                 ▼
                                    ┌──────────────────────────┐
                                    │   PHASE 5: COMPLETION    │
                                    │   respond_to_user        │
                                    └──────────────────────────┘
```

### Detailed Component Interaction

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                            │
│  CompetitionPage.tsx                                                │
│  • User selects models (OpenAI/Qwen)                                │
│  • Clicks "Purchase & Execute"                                      │
│  • Opens SSE connection to /api/ai/purchase                        │
│  • Displays real-time agent conversations                           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ HTTP POST + SSE
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND API (Express)                            │
│  routes/ai.js - /api/ai/purchase                                   │
│  • Creates LangChain Orchestrator Agent                             │
│  • Provides tools: discover_agents, process_payment,              │
│    send_message_to_agent, respond_to_user                          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│  ERC8004      │      │  X402Service  │      │  A2AService   │
│  Service      │      │               │      │               │
│               │      │               │      │               │
│ • Identity    │      │ • Payment     │      │ • Agent Card  │
│   Registry    │      │   Requests    │      │ • Task Store  │
│ • Reputation  │      │ • Verification│      │ • Executor    │
│ • Discovery   │      │ • Context Mgmt │      │ • JSON-RPC    │
└───────┬───────┘      └───────┬───────┘      └───────┬───────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Hedera Testnet   │   │ Hedera Testnet   │   │ Specialized      │
│ (Blockchain)     │   │ (Blockchain)     │   │ Agents           │
│                  │   │                  │   │                  │
│ • ERC-8004       │   │ • HBAR Transfer  │   │ • PaymentProcessor│
│   Contracts      │   │ • Mirror Node    │   │ • DataAnalyzer   │
│ • Events         │   │ • Verification   │   │ • TradeExecutor  │
└──────────────────┘   └──────────────────┘   └──────────────────┘
```

### Agent Communication Flow

```
┌─────────────────┐
│ Orchestrator    │
│  Agent (AI)      │
└────────┬─────────┘
         │
         │ 1. discover_agents("process_payment", "verify")
         ▼
┌─────────────────┐
│  ERC8004Service │──────┐
│  • Query Events │      │
└─────────────────┘      │
                         │
         │               │ Returns: PaymentProcessor agentId
         │               │
         │ 2. process_payment("Qwen")
         ▼               │
┌─────────────────┐      │
│ payments.js     │      │
│ • Send 0.1 HBAR │      │
└────────┬────────┘      │
         │               │
         │ Returns: txHash
         │               │
         │ 3. send_message_to_agent(PaymentProcessor, "Payment processed...")
         │               │
         │               ▼
         │      ┌─────────────────┐
         │      │ PaymentProcessor│
         │      │ Agent (A2A)     │
         │      │ • Verify Payment│
         │      │ • Acknowledge   │
         │      └────────┬────────┘
         │               │
         │               │ Returns: "Payment confirmed"
         │               │
         │ 4. send_message_to_agent(DataAnalyzer, "Get trading signal...")
         │               │
         │               ▼
         │      ┌─────────────────┐
         │      │ DataAnalyzer    │
         │      │ Agent (A2A)     │
         │      │ • Fetch API     │
         │      │ • Parse Signal  │
         │      └────────┬────────┘
         │               │
         │               │ Returns: {decisions: [...], chain_of_thought: ...}
         │               │
         │ 5. send_message_to_agent(TradeExecutor, "Execute trades...")
         │               │
         │               ▼
         │      ┌─────────────────┐
         │      │ TradeExecutor   │
         │      │ Agent (A2A)     │
         │      │ • Process Signal│
         │      │ • Execute Trades│
         │      └────────┬────────┘
         │               │
         │               │ Returns: "Trades executed"
         │               │
         │ 6. respond_to_user("✅ Complete!")
         │
         ▼
┌─────────────────┐
│  Frontend (SSE)  │
│  • Display Logs  │
│  • Show Results  │
└─────────────────┘
```

### Purchase Flow Steps

1. **User Action**: User selects models (OpenAI/Qwen) and clicks "Purchase & Execute"
2. **Frontend**: Opens SSE connection to `/api/ai/purchase` and sends request
3. **Orchestrator Initialization**: LangChain agent created with Groq LLM and tools
4. **Phase 1 - Discovery**: 
   - Calls `discover_agents` tool with capabilities
   - ERC8004Service queries blockchain for PaymentProcessor, DataAnalyzer, TradeExecutor
   - Returns agent IDs and endpoints
5. **Phase 2 - Payment**:
   - Calls `process_payment` tool with modelName
   - payments.js executes Hedera transaction (0.1 HBAR)
   - Returns txHash
   - Sends A2A message to PaymentProcessor with txHash
   - PaymentProcessor verifies payment via mirror node
   - PaymentProcessor acknowledges
6. **Phase 3 - Signal Retrieval**:
   - Sends A2A message to DataAnalyzer requesting trading signal
   - DataAnalyzer fetches from Go API (`http://172.23.240.1:8080/api/trading-signal`)
   - Returns parsed JSON signal with decisions, chain_of_thought, account_state
7. **Phase 4 - Trade Execution**:
   - Extracts signal data from DataAnalyzer response
   - Sends A2A message to TradeExecutor with full signal JSON
   - TradeExecutor processes and executes trades
8. **Phase 5 - Completion**:
   - Orchestrator sends completion message via `respond_to_user`
   - Frontend displays final results
   - SSE connection closes

### Key Technologies

- **ERC-8004**: On-chain agent registry and discovery
- **x402 Protocol**: HTTP 402 Payment Required for agent monetization
- **Hedera Testnet**: Fast, low-cost transactions with mirror node verification
- **A2A Protocol**: Standardized agent-to-agent messaging (JSON-RPC)
- **LangChain**: AI orchestration with tool calling
- **Groq LLM**: Fast inference for real-time agent decisions
- **Server-Sent Events (SSE)**: Real-time updates to frontend


