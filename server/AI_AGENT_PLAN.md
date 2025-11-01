# AI Agent with LangChain + Groq - Implementation Plan

## Overview

Create an AI agent using LangChain/LangGraph that can:
1. Dynamically call tools based on user input
2. Discover agents from blockchain (ERC-8004)
3. Select and communicate with agents via A2A
4. Handle payments automatically
5. Show tool calls and reasoning in terminal

## Architecture

### Phase 1: Simple Test Agent ✅
**File**: `src/examples/test-langchain-agent.js`
- Use LangChain's `createAgent` with Groq
- One simple tool (e.g., weather, calculator) - **unrelated to server**
- Test that LangChain + Groq integration works
- Verify tool calling works

### Phase 2: Full User Agent 🤖
**File**: `src/examples/ai-user-agent.js`
- Use LangChain with Groq
- Tools for:
  - `discover_agents` - Query blockchain for agents
  - `get_agent_card` - Fetch agent's A2A card
  - `send_message_to_agent` - Send A2A message (handles payment)
  - `execute_payment` - Execute payment on Hedera
- System prompt explaining agent discovery and A2A communication
- Memory/checkpointer for conversation state
- CLI interface showing all tool calls and responses

## Implementation Steps

### Step 1: Install Dependencies
```bash
npm install langchain @langchain/groq zod
```

### Step 2: Create Simple Test Agent
- One tool (e.g., `calculate` or `get_time`)
- Test LangChain + Groq
- Verify tool calling works

### Step 3: Create Full Agent with Server Tools
- Tools that wrap existing server services:
  - `discover_agents(capabilities?)` → Uses ERC8004Service
  - `get_agent_card(agentId)` → Fetches A2A agent card
  - `send_a2a_message(agentId, message, contextId?)` → Sends via A2A, handles payment
- System prompt explaining the workflow
- Memory for conversation context

## Tool Definitions

### Tool 1: discover_agents
```typescript
tool(
  async (input) => {
    // Call ERC8004Service.discoverAgents()
    // Return list of agents with capabilities
  },
  {
    name: "discover_agents",
    description: "Discover agents from blockchain (ERC-8004) by capabilities",
    schema: z.object({
      capabilities: z.array(z.string()).optional().describe("Filter by capabilities"),
    }),
  }
);
```

### Tool 2: get_agent_card
```typescript
tool(
  async (input) => {
    // Fetch agent card from /.well-known/agent-card.json
    // Return agent card with A2A endpoint info
  },
  {
    name: "get_agent_card",
    description: "Get agent's A2A card to understand its capabilities and endpoint",
    schema: z.object({
      agentId: z.string().describe("The agent ID to get card for"),
    }),
  }
);
```

### Tool 3: send_a2a_message
```typescript
tool(
  async (input) => {
    // Send message via A2A protocol
    // Handle payment if required
    // Return agent response
  },
  {
    name: "send_a2a_message",
    description: "Send a message to an agent via A2A protocol. Handles payment automatically.",
    schema: z.object({
      agentId: z.string().describe("Agent ID to send message to"),
      message: z.string().describe("Message to send"),
      contextId: z.string().optional().describe("Conversation context ID for multi-turn"),
    }),
  }
);
```

## System Prompt

```
You are a User Agent that helps users discover and communicate with specialized agents on the Hedera blockchain.

Your workflow:
1. When user asks a question, first discover relevant agents using discover_agents tool
2. Get agent card using get_agent_card to understand the agent's capabilities
3. Send message to agent using send_a2a_message (this handles payment automatically)
4. Return the agent's response to the user

Key points:
- Agents are discovered from ERC-8004 blockchain registry
- Communication happens via A2A (Agent-to-Agent) protocol
- Some agents require payment (handled automatically)
- Use contextId to maintain conversation across multiple messages with same agent
- Always show what you're doing (discovering, selecting, sending, etc.)
```

## Example Flow

```
User: "I need help processing a payment"

Agent thinks:
  → Should discover agents with "payment" capability
  → Calls discover_agents({ capabilities: ["payment"] })
  → Gets list of payment agents
  → Calls get_agent_card({ agentId: "41" })
  → Calls send_a2a_message({ agentId: "41", message: "I need help processing a payment" })
  → Payment handled automatically
  → Returns agent response
```

