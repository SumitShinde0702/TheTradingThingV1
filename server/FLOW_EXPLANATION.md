# Code Flow Explanation: Purchase → Execute Trade

## Overview
This document explains how the application works from when a user presses "Purchase" to when they execute a trade.

---

## 🎯 Main Flow: Purchase → Get Signal → Execute Trade

### **Step 1: User Selects Models & Pays**
**File:** `CompetitionPage.tsx`

#### Button: Model Selection (Lines 516-557)
- User clicks checkboxes to select AI models (OpenAI, Qwen)
- State: `selectedModels` (Set<string>) stores selected models
- Can only select when: `!isPaying && payments.size === 0 && !isPurchasing`

#### Button: 💳 Pay Button (Lines 561-601)
**Handler:** `handlePayment()` (Lines 68-157)

**What happens:**
1. Validates: `selectedModels.size > 0 && !isPaying`
2. Sets `isPaying = true`
3. **Frontend API Call:** `api.payForModel(modelName)` (api.ts line 139)
   - **Backend Endpoint:** `POST http://localhost:8443/api/payments/model-payment`
   - Sends: `{ modelName: "OpenAI" | "Qwen" }`
4. **Backend:** Creates Hedera blockchain payment transaction
5. Returns: `{ success: true, payment: { txHash, hashscanUrl } }`
6. Stores payment in `payments` Map: `payments.set(modelType, { txHash, hashscanUrl })`
7. Sets `isPaying = false`

---

### **Step 2: Get AI Signal**
**Button:** 📡 Get AI Signal (Lines 637-658)
**Handler:** `handlePurchase()` (Lines 159-273)

**What happens:**

#### Frontend (CompetitionPage.tsx)
1. Validates: `payments.size > 0 && selectedModels.size > 0 && !isPurchasing`
2. Sets states:
   - `isPurchasing = true`
   - `purchaseStarted = true` (prevents re-clicking)
   - `responses = []` (clear previous responses)
3. Builds query:
   ```javascript
   query = "Get me the trading signal (long/short/wait decision) from the OpenAI AI trading model(s)..."
   ```
4. **API Call:** `api.purchaseAgent(query, onEvent)` (api.ts line 183)
   - **Endpoint:** `POST http://localhost:8443/api/ai/purchase`
   - **Body:** `{ query: "Get me the trading signal..." }`
   - **Connection:** SSE (Server-Sent Events) stream

#### Backend (server/src/routes/ai.js - POST /api/ai/purchase)

**Lines 208-1158:** The purchase endpoint handler

**Initialization (Lines 247-261):**
1. Sets up SSE headers (Content-Type: text/event-stream)
2. Creates `sendEvent()` helper for streaming events
3. Initializes Groq LLM model (`llama-3.3-70b-versatile`)

**Creates Tools (Lines 262-956):**
The agent has 5 tools available:

##### Tool 1: `discover_agents` (Lines 262-403)
- **Purpose:** Find available agents (local or blockchain)
- **Input:** `{ capabilities?: string[], limit?: number }`
- **Process:**
  1. Tries to fetch local agents from `GET ${SERVER_URL}/api/agents`
  2. If local agents found → returns them
  3. If not, tries blockchain discovery via `ERC8004Service`
  4. Returns: `{ success, count, agents[], source }`

##### Tool 2: `get_agent_card` (Lines 405-536)
- **Purpose:** Get detailed info about a specific agent
- **Input:** `{ agentId: string }`
- **Returns:** Agent's capabilities, endpoint, description

##### Tool 3: `get_trading_signal` (Lines 539-647) ⭐ **KEY TOOL**
- **Purpose:** Fetch actual trading signal from Go trading API
- **Input:** `{ traderId: string }` (e.g., "openai_trader", "qwen_trader")
- **Process:**
  1. Maps "openai" → "openai_trader", "qwen" → "qwen_trader"
  2. **Calls:** `GET ${TRADING_API_URL}/api/trading-signal?trader_id=${traderId}`
  3. **Returns:** Full trading signal with:
     - `decisions` (long/short/wait actions with symbols, quantities)
     - `chain_of_thought` (AI reasoning)
     - `input_prompt` (context sent to AI)
     - `raw_response`
     - `account_state`

##### Tool 4: `respond_to_user` (Lines 649-680)
- **Purpose:** Send messages back to user
- **Input:** `{ message: string }`
- **Effect:** Sends SSE event `{ type: "response", message: "..." }`

##### Tool 5: `send_message_to_agent` (Lines 682-956)
- **Purpose:** Send A2A (Agent-to-Agent) message
- **Input:** `{ agentId, message, contextId? }`
- **Process:**
  1. Finds agent by ID or name
  2. Calls: `POST ${a2aEndpoint}` with JSON-RPC format
  3. Handles payment if required (402 status)
  4. Returns agent response

**Agent Creation (Lines 1026-1041):**
```javascript
const agent = createAgent({
  model: model,
  systemPrompt: systemPrompt, // Long prompt with workflow instructions
  tools: [discoverAgentsTool, getAgentCardTool, getTradingSignalTool, ...]
});
```

**System Prompt (Lines 960-1016):** 
Contains detailed instructions:
- When user asks for trading signals → use `get_trading_signal` FIRST
- Then format and present to user using `respond_to_user`
- Highlight DECISIONS prominently

**Invoke Agent (Lines 1067-1098):**
```javascript
response = await agent.invoke({
  messages: [{ role: "user", content: query }]
});
```

**The AI Agent's Workflow:**
1. Receives query: "Get me the trading signal from OpenAI..."
2. **Calls:** `get_trading_signal({ traderId: "openai_trader" })`
3. Tool fetches from Go API: `http://172.23.240.1:8080/api/trading-signal?trader_id=openai_trader`
4. Gets trading signal with decisions
5. **Calls:** `respond_to_user({ message: "Here are the trading signals: ..." })`
6. Frontend receives SSE events and displays them

**SSE Events Sent to Frontend:**
- `status` - Status updates ("Initializing...", "Thinking...")
- `tool` - Tool execution updates
- `response` - Agent responses with trading signals
- `complete` - Final completion

#### Frontend Event Handling (CompetitionPage.tsx Lines 176-262)
```javascript
api.purchaseAgent(query, (eventType, data) => {
  if (eventType === 'status') { /* Update statusMessage */ }
  if (eventType === 'tool') { /* Log tool execution */ }
  if (eventType === 'response') { /* Add to responses array */ }
  if (eventType === 'complete') {
    setSignalsReceived(true); // ✅ Enable "Execute Trade" button
  }
});
```

**Result:** 
- `signalsReceived = true` → Shows "⚡ Execute Trade" button
- `responses[]` contains all trading signal messages

---

### **Step 3: Execute Trade**
**Button:** ⚡ Execute Trade (Lines 667-687)
**Handler:** `handleExecuteTrade()` (Lines 275-337)

**What happens:**

#### Frontend
1. Validates: `signalsReceived && !isExecuting && !tradeExecuted`
2. Sets:
   - `isExecuting = true`
   - `tradeExecuted = true` (prevents re-clicking permanently)
3. Extracts all signal messages from `responses[]`
4. Builds query:
   ```javascript
   query = "Execute the trades from the trading signals I just received. 
            Here are the complete trading signals:\n\n${signalMessages}\n\n
            Find the TradeExecutor agent and send these trading signals to it."
   ```
5. **API Call:** `api.purchaseAgent(query, onEvent)` - Same endpoint as Step 2

#### Backend (Same /api/ai/purchase endpoint)

**The AI Agent's Workflow:**
1. Receives query: "Execute the trades from the trading signals..."
2. **Calls:** `discover_agents({ capabilities: ["trade", "execution"] })`
3. Tool returns list of agents including "TradeExecutor"
4. **Calls:** `send_message_to_agent({ 
     agentId: "TradeExecutor", 
     message: "Execute these trades: [signal details]" 
   })`
5. Tool sends A2A message to TradeExecutor agent
6. TradeExecutor agent endpoint: `/api/agents/{agentId}/a2a`
7. **Calls:** `respond_to_user({ message: "Trade execution response..." })`

**Frontend Event Handling (Lines 296-327):**
```javascript
api.purchaseAgent(query, (eventType, data) => {
  if (eventType === 'tool') {
    if (data.tool === 'send_message_to_agent') {
      // Update status when sending to TradeExecutor
    }
  }
  if (eventType === 'response') {
    // Show agent response
  }
  if (eventType === 'complete') {
    setIsExecuting(false);
  }
});
```

**Result:**
- Button shows "✅ Trade Executed" and is permanently disabled
- Response messages show execution confirmation

---

## 📊 Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                          │
│                  (CompetitionPage.tsx)                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Select Models & Pay                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Select OpenAI│  │ Select Qwen  │  │  💳 Pay       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                            │                                │
│                            ▼                                │
│              POST /api/payments/model-payment               │
│              { modelName: "OpenAI" }                        │
│                            │                                │
│                            ▼                                │
│              Returns: { txHash, hashscanUrl }              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Get AI Signal                                     │
│  ┌────────────────────────────────────────────┐            │
│  │ 📡 Get AI Signal Button                     │            │
│  │ handlePurchase()                           │            │
│  └────────────────────────────────────────────┘            │
│                            │                                │
│                            ▼                                │
│  POST /api/ai/purchase (SSE Stream)                        │
│  { query: "Get trading signal from OpenAI..." }            │
│                            │                                │
│                            ▼                                │
│  ┌────────────────────────────────────────────┐           │
│  │ Backend: LangChain Agent with Groq LLM      │           │
│  │                                              │           │
│  │ 1. Agent receives query                    │           │
│  │ 2. Calls: get_trading_signal tool          │           │
│  │    │                                       │           │
│  │    └─> GET http://172.23.240.1:8080/      │           │
│  │        /api/trading-signal?trader_id=...  │           │
│  │    │                                       │           │
│  │    └─> Returns: { decisions, chain_of_...}│           │
│  │                                              │           │
│  │ 3. Calls: respond_to_user tool             │           │
│  │    └─> Sends SSE event with signals       │           │
│  └────────────────────────────────────────────┘           │
│                            │                                │
│                            ▼                                │
│  Frontend receives SSE events → displays signals          │
│  sets signalsReceived = true → Shows "Execute Trade"      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Execute Trade                                      │
│  ┌────────────────────────────────────────────┐            │
│  │ ⚡ Execute Trade Button                     │            │
│  │ handleExecuteTrade()                       │            │
│  └────────────────────────────────────────────┘            │
│                            │                                │
│                            ▼                                │
│  POST /api/ai/purchase (SSE Stream)                        │
│  { query: "Execute trades: [signals]..." }                │
│                            │                                │
│                            ▼                                │
│  ┌────────────────────────────────────────────┐           │
│  │ Backend: LangChain Agent                   │           │
│  │                                              │           │
│  │ 1. Calls: discover_agents                  │           │
│  │    └─> Returns: TradeExecutor agent        │           │
│  │                                              │           │
│  │ 2. Calls: send_message_to_agent            │           │
│  │    │                                       │           │
│  │    └─> POST /api/agents/{id}/a2a          │           │
│  │        JSON-RPC message with signals      │           │
│  │    │                                       │           │
│  │    └─> TradeExecutor processes & responds │           │
│  │                                              │           │
│  │ 3. Calls: respond_to_user                  │           │
│  │    └─> Sends confirmation                   │           │
│  └────────────────────────────────────────────┘           │
│                            │                                │
│                            ▼                                │
│  Frontend: Shows "✅ Trade Executed"                        │
│  Button permanently disabled                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Components

### Frontend (React)
- **CompetitionPage.tsx**: Main UI component
- **api.ts**: API client with SSE support
- **State Management**: React useState hooks

### Backend (Node.js)
- **routes/ai.js**: `/api/ai/purchase` endpoint
- **LangChain Agent**: Orchestrates tool calling
- **Groq LLM**: Processes natural language queries
- **Tools**: 5 tools for discovery, signals, messaging

### External Services
- **Go Trading API** (`http://172.23.240.1:8080`): Provides trading signals
- **Hedera Blockchain**: Payment processing
- **Groq API**: LLM inference

---

## 🔄 SSE (Server-Sent Events) Flow

1. Frontend opens connection: `POST /api/ai/purchase`
2. Backend sets SSE headers and keeps connection open
3. Backend streams events as they happen:
   - `event: status\ndata: {...}`
   - `event: tool\ndata: {...}`
   - `event: response\ndata: {...}`
   - `event: complete\ndata: {...}`
4. Frontend parses events and updates UI in real-time
5. Connection closes when complete

---

## 🛠️ Tool Execution Details

### Tool: `get_trading_signal`
**Called when:** User asks for trading signals
**Flow:**
1. AI agent decides to call this tool
2. Tool receives `{ traderId }`
3. Maps trader ID (e.g., "openai" → "openai_trader")
4. Calls Go API: `GET /api/trading-signal?trader_id=openai_trader`
5. Returns full signal with decisions, chain of thought, etc.
6. Agent formats and sends to user via `respond_to_user`

### Tool: `send_message_to_agent`
**Called when:** User asks to execute trades
**Flow:**
1. Agent calls `discover_agents` to find TradeExecutor
2. Agent calls `send_message_to_agent` with trading signals
3. Tool constructs A2A (JSON-RPC) message
4. Posts to: `POST /api/agents/{agentId}/a2a`
5. TradeExecutor agent receives and processes
6. Returns response via A2A protocol
7. Agent forwards to user via `respond_to_user`

---

## 📝 Important Notes

1. **Button State Management:**
   - `purchaseStarted`: Prevents re-clicking purchase button
   - `tradeExecuted`: Permanently disables execute button after first click
   - `isExecuting`: Shows loading state

2. **SSE Cleanup:**
   - `cleanupRef.current` stores cleanup function
   - Cancels SSE stream on component unmount

3. **Error Handling:**
   - Each step has try/catch
   - Errors sent via SSE `error` events
   - Frontend displays error messages

4. **Agent Routing:**
   - TradeExecutor agent found by name or ID
   - A2A protocol handles agent-to-agent communication
   - Payment can be required (handled automatically)

