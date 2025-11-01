# User Agent Orchestrator - Implementation Plan

## Overview

Create a **User Agent** that acts as an intermediary between users and specialized agents. The User Agent:
1. Discovers agents on the blockchain (ERC-8004)
2. Selects relevant agents based on user queries
3. Handles payment via x402 protocol
4. Communicates via A2A protocol
5. Returns responses to the user
6. Provides a CLI interface for interaction

## Architecture

### Components

1. **UserAgentService** (`src/services/UserAgentService.js`)
   - Orchestrates discovery, selection, payment, and communication
   - Uses existing services: ERC8004Service, A2AClient, X402Service
   - Manages conversation context per agent

2. **CLI Tool** (`src/cli/user-agent-cli.js` or `src/examples/user-agent-cli.js`)
   - Interactive command-line interface
   - Commands for querying, discovery, listing
   - Pretty output formatting

### Flow

```
User Input (CLI)
    ↓
UserAgentService
    ↓
1. Discover Agents (ERC-8004 blockchain)
    ↓
2. Select Relevant Agent (by capabilities/query)
    ↓
3. Fetch Agent Card (verify A2A support)
    ↓
4. Send Message via A2A
    ↓
5. Handle Payment (if required)
    ↓
6. Return Response
    ↓
Display to User (CLI)
```

## Implementation Details

### UserAgentService API

```javascript
class UserAgentService {
  constructor(serverUrl, config) {
    this.serverUrl = serverUrl;
    this.erc8004Service = new ERC8004Service();
    this.x402Service = new X402Service();
    this.conversations = new Map(); // contextId -> conversation state
  }

  // Discover agents from blockchain
  async discoverAgents(options) {
    // Use ERC8004Service.discoverAgents()
  }

  // Select best agent for a query
  async selectAgent(userQuery, discoveredAgents) {
    // Extract capabilities from query
    // Match against agent capabilities
    // Return best match
  }

  // Send message to agent with payment handling
  async sendMessage(agentInfo, userQuery, contextId = null) {
    // 1. Fetch agent card
    // 2. Create A2A client
    // 3. Send message
    // 4. Handle payment if needed
    // 5. Return response
  }

  // Get or create conversation context
  getConversationContext(agentId) {
    // Return existing context or create new one
  }
}
```

### CLI Interface

```
$ node src/cli/user-agent-cli.js

🤖 User Agent CLI - Agent Discovery & Communication
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commands:
  ask <query>              - Ask a question (auto-discovers and selects agent)
  discover [capability]    - Discover agents on blockchain
  list                     - List discovered agents
  select <agentId>         - Select a specific agent for conversation
  history                  - Show conversation history
  help                     - Show this help
  exit                     - Exit CLI

Examples:
  > ask "I need help processing a payment"
  > discover payment
  > discover trade,analyze
  > select 41
  > history
```

### CLI Workflow

**Option 1: Auto-discovery (Recommended)**
```
User: ask "I need to process a payment"
  → Discover agents with "payment" capability
  → Select best match
  → Fetch agent card
  → Send message
  → Handle payment if needed
  → Display response
```

**Option 2: Manual selection**
```
User: discover payment
  → Show list of payment agents
User: select 41
  → Set active agent
User: ask "Process 1 HBAR payment"
  → Use selected agent
  → Handle payment
  → Display response
```

## File Structure

```
server/
├── src/
│   ├── services/
│   │   └── UserAgentService.js       # NEW: Orchestration logic
│   ├── cli/
│   │   └── user-agent-cli.js         # NEW: CLI interface
│   └── examples/
│       └── user-agent-cli.js         # ALTERNATIVE: Put CLI in examples
```

## Key Features

### 1. Agent Discovery
- Query ERC-8004 blockchain for registered agents
- Filter by capabilities
- Include agent metadata (capabilities, endpoint, etc.)

### 2. Agent Selection
- Parse user query to extract intent
- Match against agent capabilities
- Use simple keyword matching or could use AI to improve selection

### 3. Payment Handling
- Auto-detect if agent requires payment
- Execute payment via X402Service
- Maintain context for multi-turn conversations

### 4. A2A Communication
- Fetch agent card from `/.well-known/agent-card.json`
- Create A2AClient
- Send messages with proper context
- Handle responses (tasks, messages, status updates)

### 5. CLI Features
- **Interactive mode**: REPL-style interface
- **Commands**: ask, discover, list, select, history, help, exit
- **Pretty output**: Colored, formatted responses
- **Context management**: Remember conversation history
- **Multi-turn**: Support follow-up questions

## Implementation Steps

1. **Create UserAgentService**
   - Import existing services
   - Implement discovery using ERC8004Service
   - Implement agent selection logic
   - Implement A2A communication with payment handling

2. **Create CLI Tool**
   - Use `readline` or `inquirer` for input
   - Implement command parsing
   - Integrate with UserAgentService
   - Add pretty formatting

3. **Add Helper Functions**
   - Query parsing (extract capabilities from natural language)
   - Agent card fetching
   - Response formatting

4. **Test & Refine**
   - Test with different agents
   - Test payment flow
   - Test multi-turn conversations

## Dependencies

Already available:
- `@a2a-js/sdk/client` - A2A client
- `ethers` - Blockchain interaction
- `axios` - HTTP requests

Additional (if needed):
- `readline` - Built-in Node.js for CLI
- `chalk` - Optional: colored output
- `inquirer` - Optional: better CLI UX

## Example Usage

```bash
$ node src/cli/user-agent-cli.js

🤖 User Agent CLI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> discover payment
🔍 Discovering agents with 'payment' capability...

Found 2 agents:
  1. PaymentProcessor (ID: 41)
     Capabilities: process_payment, verify, escrow
     Endpoint: http://localhost:8443/api/agents/payment
     Payment required: Yes (0.1 HBAR)

  2. PaymentGateway (ID: 42)
     Capabilities: process_payment, verify
     Endpoint: http://localhost:8443/api/agents/gateway
     Payment required: Yes (0.2 HBAR)

> ask "I need to process a payment of 1 HBAR"
🤔 Selecting best agent for your query...
✅ Selected: PaymentProcessor (ID: 41)

📤 Sending message to PaymentProcessor...
💳 Payment required: 0.1 HBAR
💰 Executing payment...
✅ Payment executed! TxHash: 0xabc123...
⏳ Waiting for verification...
✅ Payment verified!

💬 PaymentProcessor: "I can help you process a payment of 1 HBAR. 
   Would you like me to proceed with the transaction?"

> "Yes, please proceed"
💬 PaymentProcessor: "Payment of 1 HBAR has been processed successfully. 
   Transaction ID: 0xdef456..."

> exit
👋 Goodbye!
```

## Future Enhancements

- AI-powered agent selection (use GroqService to understand intent)
- Multi-agent orchestration (coordinate multiple agents)
- Conversation memory across sessions
- Agent reputation integration
- Cost estimation before payment

