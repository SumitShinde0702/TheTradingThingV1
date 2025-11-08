# System Architecture Diagram

## Purchase Flow - Step by Step

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Orchestrator
    participant ERC8004
    participant PaymentAPI
    participant PaymentProcessor
    participant DataAnalyzer
    participant TradeExecutor
    participant Hedera

    User->>Frontend: Click "Purchase & Execute"
    Frontend->>Orchestrator: POST /api/ai/purchase<br/>(SSE connection)
    
    Note over Orchestrator: Phase 1: Discovery
    Orchestrator->>ERC8004: discover_agents(["process_payment"])
    ERC8004->>Hedera: Query Registered events
    Hedera-->>ERC8004: PaymentProcessor agentId
    ERC8004-->>Orchestrator: {agentId, endpoint, capabilities}
    
    Orchestrator->>ERC8004: discover_agents(["analyze", "predict"])
    ERC8004->>Hedera: Query Registered events
    Hedera-->>ERC8004: DataAnalyzer agentId
    ERC8004-->>Orchestrator: {agentId, endpoint, capabilities}
    
    Orchestrator->>ERC8004: discover_agents(["execute", "trade"])
    ERC8004->>Hedera: Query Registered events
    Hedera-->>ERC8004: TradeExecutor agentId
    ERC8004-->>Orchestrator: {agentId, endpoint, capabilities}
    
    Note over Orchestrator: Phase 2: Payment
    Orchestrator->>PaymentAPI: process_payment("Qwen")
    PaymentAPI->>Hedera: Send 0.1 HBAR transaction
    Hedera-->>PaymentAPI: txHash: 0xbe9ca6...
    PaymentAPI-->>Orchestrator: {success: true, txHash}
    
    Note over Orchestrator,PaymentProcessor: A2A Communication
    Orchestrator->>PaymentProcessor: A2A POST /api/agents/{id}/a2a<br/>"Payment processed. Tx: 0xbe9ca6..."
    Note over PaymentProcessor: Groq AI Processing
    PaymentProcessor->>PaymentProcessor: AI analyzes message<br/>(Groq LLM + instructions)
    PaymentProcessor->>Hedera: Verify payment (Mirror Node)
    Hedera-->>PaymentProcessor: Payment verified ✓
    PaymentProcessor->>PaymentProcessor: Format acknowledgment
    PaymentProcessor-->>Orchestrator: A2A Response<br/>"Payment confirmed. Access granted."
    
    Note over Orchestrator: Phase 3: Signal Retrieval
    Orchestrator->>DataAnalyzer: A2A POST /api/agents/{id}/a2a<br/>"Get trading signal for Qwen"
    Note over DataAnalyzer: Groq AI Processing
    DataAnalyzer->>DataAnalyzer: AI processes request<br/>(Groq LLM + instructions)
    DataAnalyzer->>DataAnalyzer: Map Qwen → qwen_trader
    DataAnalyzer->>DataAnalyzer: Fetch from Go API<br/>(172.23.240.1:8080/api/trading-signal)
    DataAnalyzer->>DataAnalyzer: Parse & format signal<br/>(decisions, chain_of_thought, etc.)
    DataAnalyzer-->>Orchestrator: A2A Response<br/>{decisions: [...], chain_of_thought, ...}
    
    Note over Orchestrator: Phase 4: Execution
    Orchestrator->>TradeExecutor: A2A POST /api/agents/{id}/a2a<br/>"Execute trades: {full signal JSON}"
    Note over TradeExecutor: Groq AI Processing
    TradeExecutor->>TradeExecutor: AI processes signal<br/>(Groq LLM + instructions)
    TradeExecutor->>TradeExecutor: Extract decisions array<br/>(actions, symbols, quantities)
    TradeExecutor->>TradeExecutor: Format acknowledgment
    TradeExecutor-->>Orchestrator: A2A Response<br/>"Received signal: CLOSE_LONG HYPEUSDT"<br/>"Trades executed successfully"
    
    Note over Orchestrator: Phase 5: Completion
    Orchestrator->>Frontend: SSE: "✅ Complete! All trades executed"
    Frontend->>User: Display results & logs
```

## Component Architecture

```mermaid
graph TB
    subgraph "Frontend Layer"
        UI[React UI<br/>CompetitionPage.tsx]
        SSE[SSE Client<br/>Real-time Updates]
    end
    
    subgraph "API Gateway"
        Express[Express Server<br/>index.js]
        AI_Route[AI Route<br/>routes/ai.js]
        Agent_Route[Agent Route<br/>routes/agents.js]
        Payment_Route[Payment Route<br/>routes/payments.js]
        A2A_Route[A2A Route<br/>routes/a2a.js]
    end
    
    subgraph "Orchestration Layer"
        Orchestrator[Orchestrator Agent<br/>LangChain + Groq]
        Tools[Agent Tools<br/>discover_agents<br/>process_payment<br/>send_message_to_agent]
    end
    
    subgraph "Agent Services"
        ERC8004[ERC8004Service<br/>Agent Discovery]
        AgentMgr[AgentManager<br/>Agent Registry]
        A2A_Service[A2AService<br/>A2A Protocol]
    end
    
    subgraph "Payment Layer"
        X402[X402Service<br/>Payment Protocol]
        X402_Facilitator[X402Facilitator<br/>Payment Verification]
        Payment_MW[x402Middleware<br/>Payment Gating]
    end
    
    subgraph "Specialized Agents (AI-Powered)"
        PaymentAgent[PaymentProcessor Agent<br/>• Groq AI + Instructions<br/>• Payment Verification<br/>• Mirror Node Queries<br/>• A2A Endpoint]
        DataAgent[DataAnalyzer Agent<br/>• Groq AI + Instructions<br/>• Signal Retrieval<br/>• Go API Integration<br/>• Data Formatting<br/>• A2A Endpoint]
        TradeAgent[TradeExecutor Agent<br/>• Groq AI + Instructions<br/>• Trade Processing<br/>• Signal Parsing<br/>• Execution Logic<br/>• A2A Endpoint]
    end
    
    subgraph "Blockchain Layer"
        Hedera[Hedera Testnet<br/>JSON-RPC + Mirror Node]
        Contracts[ERC-8004 Contracts<br/>Identity Registry]
    end
    
    subgraph "External Services"
        GoAPI[Go Trading API<br/>Trading Signals]
    end
    
    UI --> SSE
    SSE --> AI_Route
    UI --> Agent_Route
    UI --> Payment_Route
    
    Express --> AI_Route
    Express --> Agent_Route
    Express --> Payment_Route
    Express --> A2A_Route
    
    AI_Route --> Orchestrator
    Orchestrator --> Tools
    
    Tools --> ERC8004
    Tools --> Payment_Route
    Tools --> A2A_Service
    
    ERC8004 --> Hedera
    ERC8004 --> Contracts
    AgentMgr --> ERC8004
    
    Payment_Route --> X402
    X402 --> X402_Facilitator
    X402_Facilitator --> Hedera
    Payment_MW --> X402
    
    A2A_Service --> PaymentAgent
    A2A_Service --> DataAgent
    A2A_Service --> TradeAgent
    
    PaymentAgent --> Hedera
    PaymentAgent --> AgentMgr
    DataAgent --> GoAPI
    DataAgent --> AgentMgr
    TradeAgent --> AgentMgr
    
    AgentMgr --> PaymentAgent
    AgentMgr --> DataAgent
    AgentMgr --> TradeAgent
    
    style Orchestrator fill:#001a33,stroke:#4da6ff,color:#ffffff
    style ERC8004 fill:#332400,stroke:#ffb84d,color:#ffffff
    style X402 fill:#33001a,stroke:#ff4da6,color:#ffffff
    style Hedera fill:#003d1a,stroke:#4dff88,color:#ffffff
    style PaymentAgent fill:#660033,stroke:#ff4da6,color:#ffffff
    style DataAgent fill:#003d1a,stroke:#4dff88,color:#ffffff
    style TradeAgent fill:#331a00,stroke:#ff884d,color:#ffffff
```

## Data Flow - Purchase Request

```mermaid
ff
    style TradeAgent fill:#331a00,stroke:#ff884d,stroke-width:2px,color:#ffffff
    style ERC8004 fill:#332400,stroke:#ffb84d,stroke-width:2px,color:#ffffff
    style PaymentAPI fill:#33001a,stroke:#ff4da6,stroke-width:2px,color:#ffffff
    style A2A fill:#1a0033,stroke:#b84dff,stroke-width:2px,color:#ffffff
    style MirrorNode fill:#003d1a,stroke:#4dff88,stroke-width:2px,color:#ffffffflowchart TD
    User[User Request<br/>Purchase trading signals from Qwen]
    
    Orchestrator[ORCHESTRATOR AGENT<br/>LangChain + Groq<br/>Tools Available:<br/>• discover_agents<br/>• process_payment<br/>• send_message_to_agent<br/>• respond_to_user]
    
    Tool1[Tool: discover_agents]
    Tool2[Tool: process_payment]
    Tool3[Tool: send_message_to_agent]
    
    ERC8004[ERC8004Service<br/>Returns:<br/>• agentId<br/>• endpoint<br/>• capabilities]
    
    PaymentAPI[payments.js<br/>Returns:<br/>• txHash<br/>• hashscanUrl]
    
    A2A[A2AService<br/>Routes to:<br/>• PaymentProcessor<br/>• DataAnalyzer<br/>• TradeExecutor]
    
    PaymentAgent[PAYMENT PROCESSOR AGENT<br/>• A2A Endpoint<br/>• Groq AI Processing<br/>• Payment Verification<br/>• Mirror Node Queries<br/>• Context Management]
    
    DataAgent[DATA ANALYZER AGENT<br/>• A2A Endpoint<br/>• Groq AI Processing<br/>• Signal Retrieval<br/>• Go API Integration<br/>• Data Formatting]
    
    TradeAgent[TRADE EXECUTOR AGENT<br/>• A2A Endpoint<br/>• Groq AI Processing<br/>• Trade Processing<br/>• Signal Parsing<br/>• Execution Logic]
    
    MirrorNode[Hedera Mirror Node<br/>Verify Transactions]
    
    GoAPI[Go Trading API<br/>Get Trading Signals]
    
    User --> Orchestrator
    Orchestrator --> Tool1
    Orchestrator --> Tool2
    Orchestrator --> Tool3
    
    Tool1 --> ERC8004
    Tool2 --> PaymentAPI
    Tool3 --> A2A
    
    A2A --> PaymentAgent
    A2A --> DataAgent
    A2A --> TradeAgent
    
    PaymentAgent --> MirrorNode
    DataAgent --> GoAPI
    
    style Orchestrator fill:#001a33,stroke:#4da6ff,stroke-width:3px,color:#ffffff
    style PaymentAgent fill:#660033,stroke:#ff4da6,stroke-width:2px,color:#ffffff
    style DataAgent fill:#003d1a,stroke:#4dff88,stroke-width:2px,color:#ffff
    style GoAPI fill:#330000,stroke:#ff4d4d,stroke-width:2px,color:#ffffff
```

## Agent Communication Protocol

```
┌─────────────────────────────────────────────────────────────────┐
│  A2A Protocol (JSON-RPC over HTTP)                             │
│                                                                 │
│  Request Format:                                                │
│  {                                                              │
│    "jsonrpc": "2.0",                                            │
│    "id": "message-id",                                          │
│    "method": "message/send",                                   │
│    "params": {                                                  │
│      "message": {                                               │
│        "kind": "message",                                      │
│        "role": "user",                                          │
│        "parts": [{"kind": "text", "text": "..."}],            │
│        "contextId": "ctx_123...",                               │
│        "metadata": {                                            │
│          "payment": {                                           │
│            "txHash": "0x...",                                  │
│            "requestId": "req_..."                               │
│          }                                                      │
│        }                                                        │
│      }                                                          │
│    }                                                            │
│  }                                                              │
│                                                                 │
│  Response Format:                                               │
│  {                                                              │
│    "jsonrpc": "2.0",                                            │
│    "id": "message-id",                                          │
│    "result": {                                                  │
│      "kind": "task",                                            │
│      "status": {                                                │
│        "state": "completed",                                    │
│        "message": {                                             │
│          "kind": "message",                                     │
│          "role": "agent",                                       │
│          "parts": [{"kind": "text", "text": "..."}]           │
│        }                                                        │
│      }                                                          │
│    }                                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Payment Verification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Payment Verification (x402 Protocol)                          │
│                                                                 │
│  1. Agent requests payment:                                     │
│     → Returns HTTP 402 with Payment-Required header             │
│                                                                 │
│  2. Client executes payment:                                    │
│     → Sends HBAR transaction to Hedera                         │
│     → Receives txHash                                           │
│                                                                 │
│  3. Client retries with payment proof:                          │
│     → Includes X-Payment header with txHash                  │
│                                                                 │
│  4. Server verifies payment:                                    │
│     ├─ HashScan API (primary)                                  │
│     ├─ Mirror Node API (fallback)                              │
│     └─ Account-based verification (last resort)                │
│                                                                 │
│  5. Server marks context as verified:                           │
│     → Stores contextId → payment mapping                       │
│     → Subsequent messages in same context skip payment         │
└─────────────────────────────────────────────────────────────────┘
```

## Agent Interaction Details

```
┌─────────────────────────────────────────────────────────────────┐
│  SPECIALIZED AGENTS - How They Work                            │
│                                                                 │
│  Each agent is a FULL AI INSTANCE with:                         │
│                                                                 │
│  1. PaymentProcessor Agent                                      │
│     ├─ Registered: server/src/index.js (lines 149-173)          │
│     ├─ A2A Endpoint: /api/agents/{agentId}/a2a                  │
│     ├─ AI Engine: Groq LLM (llama-3.3-70b-versatile)           │
│     ├─ Instructions: Payment verification & acknowledgment      │
│     ├─ Processing: AgentManager.processMessageWithAI()         │
│     └─ Output: "Payment confirmed. Transaction: 0x..."         │
│                                                                 │
│  2. DataAnalyzer Agent                                          │
│     ├─ Registered: server/src/index.js (lines 175-205)         │
│     ├─ A2A Endpoint: /api/agents/{agentId}/a2a                  │
│     ├─ AI Engine: Groq LLM (llama-3.3-70b-versatile)           │
│     ├─ Instructions: Signal retrieval & formatting              │
│     ├─ Special Logic: Fetches from Go API                       │
│     │   → http://172.23.240.1:8080/api/trading-signal         │
│     ├─ Processing: AgentManager.processMessageWithAI()         │
│     │   → Injects realTradingSignal into context                │
│     └─ Output: Formatted signal with decisions, chain_of_thought│
│                                                                 │
│  3. TradeExecutor Agent                                         │
│     ├─ Registered: server/src/index.js (lines 207-227)         │
│     ├─ A2A Endpoint: /api/agents/{agentId}/a2a                  │
│     ├─ AI Engine: Groq LLM (llama-3.3-70b-versatile)           │
│     ├─ Instructions: Trade execution & acknowledgment           │
│     ├─ Processing: AgentManager.processMessageWithAI()         │
│     └─ Output: "Received signal: [ACTION] [SYMBOL] [QUANTITY]" │
│                                                                 │
│  Communication Flow:                                            │
│  Orchestrator → A2A POST → Agent A2A Endpoint →                │
│  AgentManager → GroqService → Agent Instructions →            │
│  Agent AI Processing → A2A Response → Orchestrator              │
│                                                                 │
│  Each agent:                                                    │
│  ✅ Has independent AI reasoning                                │
│  ✅ Processes messages autonomously                             │
│  ✅ Can be discovered via ERC-8004                              │
│  ✅ Can require payment (x402)                                  │
│  ✅ Maintains conversation context                              │
└─────────────────────────────────────────────────────────────────┘
```

