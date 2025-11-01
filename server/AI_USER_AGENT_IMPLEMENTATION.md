# Full AI User Agent Implementation Plan

## Overview

Create an autonomous AI agent using LangChain + Groq that can:
1. **Autonomously discover** agents from blockchain (ERC-8004)
2. **Select appropriate agents** based on user queries
3. **Communicate** with agents via A2A protocol
4. **Handle payments** automatically when required
5. **Maintain conversation context** for multi-turn interactions
6. **Log all tool calls** and responses transparently

## Architecture

### File Structure
- **File**: `src/examples/ai-user-agent.js`
- **Dependencies**: 
  - `langchain` (createAgent, tool)
  - `@langchain/groq` (ChatGroq)
  - `zod` (tool schemas)
  - Existing services: ERC8004Service, ethers, axios, A2AClient

### Tools Required

#### 1. `discover_agents`
- **Purpose**: Query blockchain for agents matching capabilities
- **Input**: Optional array of capability strings
- **Output**: List of agents with ID, name, capabilities, endpoint
- **Implementation**: Wraps `ERC8004Service.discoverAgents()`
- **Logging**: Show discovered agents count and names

#### 2. `get_agent_card`
- **Purpose**: Fetch agent's A2A card to get endpoint and metadata
- **Input**: Agent ID
- **Output**: Agent card JSON with URL, skills, description
- **Implementation**: HTTP GET to `/.well-known/agent-card.json`
- **Logging**: Show agent name, description, endpoint

#### 3. `send_message_to_agent`
- **Purpose**: Send message via A2A protocol with automatic payment handling
- **Input**: agentId, message text, optional contextId
- **Output**: Agent response (message/status-update/task)
- **Implementation**: 
  - Creates A2A JSON-RPC request
  - Handles HTTP 402 payment requirement
  - Executes payment if needed
  - Retries with payment proof
  - Manages conversation context
- **Logging**: Show message sent, payment status, response received

### Conversation Context Management

- **Storage**: Map of `contextId -> { agentId, paymentTxHash, agentName }`
- **Usage**: 
  - First message: Generate new `contextId`
  - Subsequent messages: Reuse `contextId` to avoid re-payment
  - Store `paymentTxHash` for verified contexts

### Payment Flow

1. Send initial A2A message
2. If HTTP 402: Extract payment details from error response
3. Execute Hedera transaction using `ethers.js`
4. Wait for transaction indexing (10 seconds)
5. Retry message with `X-Payment` header and `payment` metadata
6. Store `paymentTxHash` in conversation context
7. Subsequent messages in same context skip payment check

## System Prompt

```
You are a User Agent that helps users discover and communicate with specialized agents 
on the Hedera blockchain using the A2A (Agent-to-Agent) protocol.

Your workflow:
1. When a user asks a question or makes a request:
   - First, use discover_agents to find relevant agents based on the user's needs
   - You can filter by capabilities if the user's query suggests specific requirements
   - Analyze the discovered agents to select the most appropriate one

2. Get detailed information about the selected agent:
   - Use get_agent_card with the agent's ID to understand its capabilities, endpoint, and description
   - This helps you understand if the agent is suitable for the user's request

3. Communicate with the agent:
   - Use send_message_to_agent to send the user's message (or a refined version)
   - Include any necessary context from the conversation
   - The tool handles payment automatically if required
   - For follow-up messages to the same agent, use the same contextId to maintain conversation context

4. Return the agent's response to the user:
   - Present the response clearly
   - If the agent returned tool calls or data, explain what happened
   - If more information is needed, ask the user

Key points:
- Agents are discovered from the ERC-8004 blockchain registry
- Communication happens via A2A (Agent-to-Agent) protocol over JSON-RPC
- Some agents require payment (handled automatically by send_message_to_agent)
- Use contextId to maintain conversation state across multiple messages
- Always be transparent about what you're doing (discovering agents, selecting, sending messages)
- If an agent doesn't respond appropriately, you can try discovering different agents
```

## Tool Definitions (Zod Schemas)

### discover_agents
```javascript
z.object({
  capabilities: z.array(z.string()).optional().describe(
    "Optional array of capability strings to filter agents. " +
    "Examples: ['payment', 'trading', 'analysis']. " +
    "If not provided, returns all available agents."
  ),
  limit: z.number().optional().describe(
    "Maximum number of agents to return (default: 20)"
  )
})
```

### get_agent_card
```javascript
z.object({
  agentId: z.string().describe(
    "The agent ID to fetch the card for. " +
    "This is typically the agent's blockchain ID or local server ID."
  )
})
```

### send_message_to_agent
```javascript
z.object({
  agentId: z.string().describe(
    "The agent ID to send the message to. " +
    "This should be obtained from discover_agents or get_agent_card."
  ),
  message: z.string().describe(
    "The message text to send to the agent. " +
    "This should be the user's request or question, possibly refined based on the agent's capabilities."
  ),
  contextId: z.string().optional().describe(
    "Optional conversation context ID for multi-turn conversations. " +
    "If sending a follow-up message to the same agent, use the same contextId " +
    "to maintain conversation context and avoid re-payment."
  )
})
```

## Example Flow

```
User: "I need help processing a payment"

Agent Reasoning:
  1. User needs payment help → should discover agents with "payment" capability
  2. Call discover_agents({ capabilities: ["payment"] })
     → Log: "🔍 Discovering agents with capabilities: payment"
     → Log: "✅ Found 3 agents: PaymentProcessor, PaymentGateway, EscrowAgent"
  3. Select PaymentProcessor (best match)
  4. Call get_agent_card({ agentId: "41" })
     → Log: "📇 Fetching agent card for PaymentProcessor..."
     → Log: "✅ Agent Card: PaymentProcessor - Handles payment processing"
  5. Call send_message_to_agent({ 
       agentId: "41", 
       message: "I need help processing a payment" 
     })
     → Log: "📤 Sending message to PaymentProcessor..."
     → Log: "💳 Payment required: 0.1 HBAR"
     → Log: "💰 Executing payment..."
     → Log: "✅ Payment executed: 0xabc123..."
     → Log: "✅ Response received from PaymentProcessor"
  6. Return agent's response to user

User: "Can you check if it went through?"

Agent Reasoning:
  1. This is a follow-up to previous conversation
  2. Use same contextId from previous interaction
  3. Call send_message_to_agent({
       agentId: "41",
       message: "Can you check if it went through?",
       contextId: "ctx_123..." // from previous conversation
     })
     → Log: "📤 Sending follow-up message (context already verified, no payment needed)"
     → Log: "✅ Response received"
  4. Return agent's response
```

## Implementation Details

### Logging Format

All tool calls should log:
```
🛠️  [Tool Name] Starting...
   Input: { ... }
   ...
✅ [Tool Name] Completed
   Output: { ... }
```

### Error Handling

- **Discovery fails**: Return error message, suggest trying without capability filter
- **Agent card fetch fails**: Try alternative endpoints, log warning
- **Payment fails**: Show detailed error, suggest retry
- **A2A communication fails**: Show HTTP status and error details

### Context Management

```javascript
// Store context
const conversations = new Map(); // contextId -> { agentId, paymentTxHash, agentName }

// Generate contextId for new conversation
const contextId = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Store context after first message
conversations.set(contextId, {
  agentId: agentId,
  paymentTxHash: txHash, // if payment was made
  agentName: agentName
});
```

## Testing Strategy

1. **Test discovery**: Query for different capabilities
2. **Test agent selection**: Verify correct agent is chosen
3. **Test payment flow**: Ensure payment is handled automatically
4. **Test multi-turn**: Verify context is maintained
5. **Test error cases**: Discovery failures, payment failures, etc.

## Next Steps

1. ✅ Create test agent (done)
2. Implement full agent with all tools
3. Add comprehensive logging
4. Test with real agents on server
5. Refine system prompt based on agent behavior

