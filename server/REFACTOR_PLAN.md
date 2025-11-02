# Refactor Plan: Single Purchase Button with Agent Orchestration

## 🎯 Goal
Transform the multi-button workflow into a single "Purchase" button that triggers an intelligent agent orchestrator. The agent will autonomously:
1. Discover agents (PaymentProcessor, DataAnalyzer, TradeExecutor)
2. Handle payment via PaymentProcessor agent
3. Get trading signal via DataAnalyzer agent  
4. Execute trade via TradeExecutor agent
5. Show real-time logs of all agent-to-agent communication

---

## 📋 Current State Analysis

### Current Flow (Multi-Button)
1. **Pay Button** → `POST /api/payments/model-payment` → Direct Hedera payment
2. **Get Signal Button** → `POST /api/ai/purchase` → Agent calls `get_trading_signal` tool → Direct Go API call
3. **Execute Trade Button** → `POST /api/ai/purchase` → Agent calls `discover_agents` → Agent calls `send_message_to_agent` to TradeExecutor

### Problems with Current Approach
- ❌ User must click 3 separate buttons
- ❌ `get_trading_signal` bypasses A2A protocol (direct API call)
- ❌ No agent-to-agent communication visibility
- ❌ Payment handled separately, not via agent

---

## 🚀 Target State (Single Purchase Button)

### New Flow (One Button)
1. **Purchase Button** → `POST /api/ai/purchase` → Orchestrator Agent:
   - Discovers agents via `discover_agents`
   - Sends A2A message to **PaymentProcessor** → Waits for confirmation
   - Sends A2A message to **DataAnalyzer** → Gets trading signal
   - Sends A2A message to **TradeExecutor** → Executes trade
   - Reports final status to user

### Benefits
- ✅ Single button click
- ✅ Full A2A protocol compliance
- ✅ Real-time agent conversation logs
- ✅ Better separation of concerns
- ✅ More scalable architecture

---

## 🏗️ Architecture Changes

### Backend Changes (`server/src/routes/ai.js`)

#### 1. Remove `get_trading_signal` Tool
**Current:** Tool directly calls Go API `GET /api/trading-signal`
**New:** DataAnalyzer agent will handle this internally

**Action:**
- Remove `getTradingSignalTool` definition (lines 539-647)
- Remove from tools array in `createAgent`

#### 2. Update System Prompt
**Current Prompt:** Mentions `get_trading_signal` tool for direct API calls
**New Prompt:** Orchestration workflow via A2A

**New Workflow Instructions:**
```javascript
const systemPrompt = `You are an Orchestrator Agent that coordinates a complete trading workflow 
using A2A (Agent-to-Agent) protocol. When a user presses "Purchase":

1. DISCOVERY PHASE:
   - Use discover_agents to find these three agents:
     * PaymentProcessor (capabilities: ["process_payment", "verify", "escrow"])
     * DataAnalyzer (capabilities: ["analyze", "predict", "report"])
     * TradeExecutor (capabilities: ["execute", "trade", "exchange"])

2. PAYMENT PHASE:
   - Send A2A message to PaymentProcessor agent with:
     message: "Process payment for model access. Model: [OpenAI/Qwen]"
   - Wait for payment confirmation response
   - Store payment contextId for later reference

3. SIGNAL RETRIEVAL PHASE:
   - Send A2A message to DataAnalyzer agent with:
     message: "Get the latest trading signal from [OpenAI/Qwen] AI trading model. 
              I need the complete signal including decisions (long/short/wait actions), 
              chain_of_thought, input_prompt, and account_state."
   - Parse the trading signal response
   - Extract decisions array (most important part)

4. TRADE EXECUTION PHASE:
   - Send A2A message to TradeExecutor agent with:
     message: "Execute trades based on the following trading signal: [paste full signal]"
   - Include the complete trading signal data
   - Wait for execution confirmation

5. USER COMMUNICATION:
   - Use respond_to_user after each phase to show progress:
     * "✅ Payment processed successfully"
     * "📊 Trading signal retrieved: [decisions]"
     * "🚀 Trade execution initiated"
   - Always end with a final respond_to_user showing complete status

Key points:
- ALL communication must go through A2A protocol (send_message_to_agent)
- Show agent-to-agent conversations transparently via respond_to_user
- Each agent response should be logged and shown to user
- Maintain contextId across conversation for each agent
- If any step fails, use respond_to_user to inform the user`;
```

#### 3. Enhanced SSE Event Logging
**Add new event types for agent conversations:**
- `agent_conversation` - Show when Agent A talks to Agent B
- `agent_response` - Show Agent B's response
- `workflow_step` - Show workflow phase (Payment, Signal, Execution)

**Update `sendEvent` calls:**
```javascript
// When sending message to agent
sendEvent("agent_conversation", {
  from: "Orchestrator",
  to: agentName,
  message: message.substring(0, 100),
  phase: "payment" | "signal" | "execution"
});

// When receiving agent response
sendEvent("agent_response", {
  from: agentName,
  response: responseText,
  phase: currentPhase
});

// Workflow progress
sendEvent("workflow_step", {
  step: "payment" | "signal" | "execution",
  status: "starting" | "completed" | "failed"
});
```

#### 4. Update `send_message_to_agent` Tool
**Enhance to log agent conversations:**
- Add phase tracking parameter
- Log conversation start/end
- Include phase in SSE events

---

### Frontend Changes (`web/src/components/CompetitionPage.tsx`)

#### 1. Simplify Button Structure
**Remove:**
- `handlePayment()` function
- `handleExecuteTrade()` function  
- Payment button (lines 561-601)
- Execute Trade button (lines 667-687)

**Keep:**
- Single `handlePurchase()` function (updated)
- Model selection (keep as-is)
- One "Purchase" button

#### 2. Update `handlePurchase()` Function

**New Query Building:**
```typescript
const handlePurchase = async () => {
  // Remove payment check - agent handles it
  // Remove execute trade logic
  
  const modelNames = Array.from(selectedModels).map(m => m === 'openai' ? 'OpenAI' : 'Qwen');
  const modelsText = modelNames.length === 1 
    ? modelNames[0]
    : `${modelNames.slice(0, -1).join(', ')} and ${modelNames[modelNames.length - 1]}`;
  
  // Simple query - agent does the rest
  const query = `Purchase trading signals from ${modelsText} and execute the trades. 
                 Process payment, get trading signals, and execute trades in sequence.`;
  
  // ... rest of SSE handling
};
```

#### 3. Enhanced Event Handling

**Handle new event types:**
```typescript
api.purchaseAgent(query, (eventType, data) => {
  // Existing events
  if (eventType === 'status') { /* ... */ }
  
  // NEW: Agent conversations
  if (eventType === 'agent_conversation') {
    setResponses(prev => [...prev, {
      type: 'agent_chat',
      from: data.from,
      to: data.to,
      message: `💬 ${data.from} → ${data.to}: ${data.message}`,
      phase: data.phase
    }]);
  }
  
  // NEW: Agent responses
  if (eventType === 'agent_response') {
    setResponses(prev => [...prev, {
      type: 'agent_response',
      from: data.from,
      message: `📨 ${data.from}: ${data.response}`,
      phase: data.phase
    }]);
  }
  
  // NEW: Workflow steps
  if (eventType === 'workflow_step') {
    const phaseEmojis = {
      payment: '💳',
      signal: '📊',
      execution: '🚀'
    };
    setStatusMessage(`${phaseEmojis[data.step]} ${data.step}: ${data.status}`);
  }
});
```

#### 4. Update Response Display

**Add conversation view:**
```tsx
{responses.map((response, idx) => {
  if (response.type === 'agent_chat') {
    return (
      <div className="agent-conversation" style={{ borderLeft: '3px solid #F0B90B' }}>
        <div className="text-xs opacity-75">{response.message}</div>
        <div className="text-xs mt-1" style={{ color: '#848E9C' }}>
          Phase: {response.phase}
        </div>
      </div>
    );
  }
  // ... other response types
})}
```

#### 5. Remove Payment State Management
**Remove:**
- `payments` state
- `isPaying` state
- `paymentProgress` state
- All payment-related UI

**Keep:**
- Model selection
- Purchase button
- Response display (enhanced)

---

### Agent Implementation Updates

#### PaymentProcessor Agent (`index.js` lines 149-163)
**Current:** Generic payment instructions
**Update:** Handle model-specific payment requests

**New Instructions:**
```javascript
instructions: "You are a payment processing agent. When you receive a payment request: " +
  "1. Process payment for the specified model (OpenAI/Qwen) " +
  "2. Create Hedera transaction (1 HBAR per model) " +
  "3. Return confirmation with txHash " +
  "4. Format: 'Payment processed successfully. Transaction: [txHash]'"
```

#### DataAnalyzer Agent (`index.js` lines 171-188)
**Current:** Generic analytics instructions
**Update:** Fetch trading signals from Go API

**New Instructions:**
```javascript
instructions: "You are a data analytics agent. When requested for trading signals: " +
  "1. Fetch trading signal from Go API: GET /api/trading-signal?trader_id=[openai_trader/qwen_trader] " +
  "2. Parse the response and extract: decisions, chain_of_thought, input_prompt, account_state " +
  "3. Format response clearly showing: " +
  "   - Decisions (most important): [LONG/SHORT/WAIT actions with symbols/quantities] " +
  "   - Chain of thought (AI reasoning) " +
  "   - Input prompt (context) " +
  "   - Account state (equity, PnL, positions) " +
  "4. Return formatted signal: 'Trading Signal for [model]: [decisions summary]. Full details: [JSON]'"
```

**Implementation:**
- DataAnalyzer needs access to `TRADING_API_URL`
- Make internal HTTP call to Go API
- Parse and format response
- Return via A2A protocol

#### TradeExecutor Agent (`index.js` lines 191-210)
**Current:** Mock execution with simple acknowledgment
**Keep:** Current mock implementation is fine

**Instructions (already good):**
```javascript
instructions: "You are a trade execution agent. When you receive a trading signal with decisions, " +
  "respond with 'Received signal: [ACTION] [SYMBOL] [QUANTITY]'. " +
  "Extract action, symbol, and quantity from the decisions array in the signal."
```

---

## 📝 Implementation Steps

### Phase 1: Backend Refactor
1. ✅ Remove `get_trading_signal` tool
2. ✅ Update system prompt with orchestration workflow
3. ✅ Add enhanced SSE events (`agent_conversation`, `agent_response`, `workflow_step`)
4. ✅ Update `send_message_to_agent` to include phase tracking
5. ✅ Test agent discovery → payment → signal → execution flow

### Phase 2: Agent Updates
1. ✅ Update PaymentProcessor instructions
2. ✅ Update DataAnalyzer to fetch from Go API (needs internal HTTP client)
3. ✅ Test each agent independently

### Phase 3: Frontend Refactor
1. ✅ Remove payment and execute trade buttons
2. ✅ Simplify `handlePurchase()` function
3. ✅ Add new event handlers for agent conversations
4. ✅ Update response display UI
5. ✅ Remove payment state management

### Phase 4: Testing & Polish
1. ✅ End-to-end test: Purchase button → Complete workflow
2. ✅ Verify all agent conversations are logged
3. ✅ Test error handling at each phase
4. ✅ UI/UX polish

---

## 🔍 Key Design Decisions

### Decision 1: DataAnalyzer Internal API Call
**Option A:** DataAnalyzer agent makes internal HTTP call to Go API
- ✅ Keeps A2A protocol clean
- ✅ DataAnalyzer is the interface to trading signals
- ❌ Requires DataAnalyzer to have HTTP client

**Option B:** Orchestrator calls Go API directly, then sends to DataAnalyzer
- ✅ Simpler DataAnalyzer implementation
- ❌ Breaks A2A abstraction

**Choice:** Option A - Keep A2A protocol pure

### Decision 2: Payment Flow
**Option A:** PaymentProcessor handles Hedera transaction
- ✅ True agent-based payment
- ❌ PaymentProcessor needs wallet access

**Option B:** Orchestrator handles payment, PaymentProcessor just verifies
- ✅ Simpler PaymentProcessor
- ❌ Less agent autonomy

**Choice:** Option A - PaymentProcessor handles full payment

### Decision 3: Error Handling
**Strategy:** Each phase reports errors via `respond_to_user`
- If payment fails → Stop workflow, report error
- If signal fetch fails → Stop workflow, report error
- If execution fails → Report error, but payment/signal already done

### Decision 4: Context Management
**Strategy:** Maintain separate contextId for each agent
- `paymentContextId` - PaymentProcessor conversations
- `signalContextId` - DataAnalyzer conversations  
- `executionContextId` - TradeExecutor conversations

This allows independent conversation tracking.

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Agent discovery returns all three agents
- [ ] PaymentProcessor processes payment correctly
- [ ] DataAnalyzer fetches and formats trading signal
- [ ] TradeExecutor acknowledges signal correctly

### Integration Tests
- [ ] Full workflow: Discovery → Payment → Signal → Execution
- [ ] Error handling at each phase
- [ ] SSE events are sent correctly
- [ ] ContextId management works

### End-to-End Tests
- [ ] Frontend Purchase button → Complete workflow
- [ ] All agent conversations visible in UI
- [ ] Final status shows "Trade Executed"
- [ ] Error messages display correctly

---

## 📊 Expected User Experience

### Before (Current)
```
1. User selects models
2. User clicks "💳 Pay" button → Waits for payment
3. User clicks "📡 Get AI Signal" button → Waits for signal
4. User clicks "⚡ Execute Trade" button → Waits for execution
5. Done
```

### After (New)
```
1. User selects models
2. User clicks "Purchase" button
3. User watches real-time logs:
   🔍 Discovering agents...
   💬 Orchestrator → PaymentProcessor: Process payment for OpenAI
   📨 PaymentProcessor: Payment processed. Tx: abc123...
   💬 Orchestrator → DataAnalyzer: Get trading signal from OpenAI
   📨 DataAnalyzer: Trading Signal - LONG BTCUSDT 100...
   💬 Orchestrator → TradeExecutor: Execute trades [signal data]
   📨 TradeExecutor: Received signal: LONG BTCUSDT 100
   ✅ Complete! Trade executed successfully.
4. Done
```

---

## 🚨 Potential Challenges

### Challenge 1: DataAnalyzer HTTP Access
**Problem:** DataAnalyzer needs to call Go API internally
**Solution:** Add axios to DataAnalyzer's handler or pass through server

### Challenge 2: PaymentProcessor Wallet Access
**Problem:** PaymentProcessor needs Hedera wallet
**Solution:** Share wallet instance or pass through server's payment endpoint

### Challenge 3: Agent Response Parsing
**Problem:** Need to extract structured data from agent text responses
**Solution:** Use structured response format in agent instructions

### Challenge 4: Error Recovery
**Problem:** What if payment succeeds but signal fetch fails?
**Solution:** Report partial completion, allow retry of failed phase

---

## 📚 Additional Notes

### A2A Message Format
Each agent-to-agent message should be structured:
```json
{
  "kind": "message",
  "role": "user",
  "parts": [{"kind": "text", "text": "Process payment for OpenAI model"}],
  "messageId": "uuid",
  "contextId": "ctx_123",
  "metadata": {
    "fromUser": false,
    "fromOrchestrator": true,
    "workflowPhase": "payment"
  }
}
```

### Response Format Expectations
Agents should return structured responses that orchestrator can parse:
```
PaymentProcessor: "Payment processed. Transaction: 0xabc123"
DataAnalyzer: "Trading Signal: LONG BTCUSDT 100. Decisions: [JSON]"
TradeExecutor: "Received signal: LONG BTCUSDT 100"
```

---

## ✅ Success Criteria

1. ✅ Single "Purchase" button triggers complete workflow
2. ✅ All agent-to-agent communication visible in real-time
3. ✅ Payment, Signal, Execution happen in sequence automatically
4. ✅ No direct API calls bypass A2A protocol
5. ✅ User sees clear logs of agent conversations
6. ✅ Final status clearly indicates completion or errors

---

## 🎯 Next Steps

1. **Review this plan** - Discuss any concerns or changes
2. **Start with backend** - Remove `get_trading_signal`, update prompt
3. **Update agents** - Enhance PaymentProcessor and DataAnalyzer
4. **Frontend changes** - Simplify to single button
5. **Test thoroughly** - End-to-end verification

Ready to proceed with implementation?

