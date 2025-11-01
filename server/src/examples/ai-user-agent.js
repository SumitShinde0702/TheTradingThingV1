/**
 * AI User Agent - Autonomous agent that discovers and communicates with agents via A2A
 *
 * This agent uses LangChain + Groq to:
 * 1. Discover agents from blockchain (ERC-8004)
 * 2. Select appropriate agents based on user queries
 * 3. Communicate with agents via A2A protocol
 * 4. Handle payments automatically
 * 5. Maintain conversation context for multi-turn interactions
 *
 * Usage:
 *   node src/examples/ai-user-agent.js [query]
 *
 * Interactive mode (no args):
 *   node src/examples/ai-user-agent.js
 */

import "dotenv/config"; // Load environment variables
import { createAgent, tool } from "langchain";
import { ChatGroq } from "@langchain/groq";
import * as z from "zod";
import axios from "axios";
import { ethers } from "ethers";
import readline from "readline";
import { ERC8004Service } from "../services/ERC8004Service.js";
import { HEDERA_CONFIG } from "../config/hedera.js";
import { GROQ_CONFIG } from "../config/groq.js";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:8443";

// Payer wallet for payments
const payerWallet = new ethers.Wallet(
  HEDERA_CONFIG.CLIENT_PRIVATE_KEY,
  new ethers.JsonRpcProvider(HEDERA_CONFIG.JSON_RPC_URL)
);

// ERC-8004 service for discovery
const erc8004Service = new ERC8004Service();

// Conversation contexts (contextId -> { agentId, paymentTxHash, agentName })
const conversations = new Map();

// UUID generation helper
async function generateUUID() {
  const { v4: uuidv4 } = await import("uuid");
  return uuidv4();
}

/**
 * Tool 1: Discover agents from blockchain
 */
const discoverAgentsTool = tool(
  async (input) => {
    const { capabilities, limit = 20 } = input;

    console.log("\n🛠️  [discover_agents] Starting...");
    console.log(`   Input: ${JSON.stringify({ capabilities, limit })}`);

    try {
      const options = {
        limit,
        capabilities:
          capabilities && capabilities.length > 0 ? capabilities : null,
        includeDetails: true,
      };

      const agents = await erc8004Service.discoverAgents(options);

      console.log(`   ✅ Found ${agents.length} agent(s)`);
      if (agents.length > 0) {
        console.log(
          `   Agents: ${agents
            .map((a) => `${a.name || `Agent ${a.agentId}`} (ID: ${a.agentId})`)
            .join(", ")}`
        );
      }
      console.log("✅ [discover_agents] Completed\n");

      return JSON.stringify({
        success: true,
        count: agents.length,
        agents: agents.map((agent) => ({
          agentId: agent.agentId.toString(),
          name: agent.name || `Agent ${agent.agentId}`,
          capabilities: agent.capabilities || [],
          endpoint: agent.endpoint || agent.tokenURI,
          description: agent.description || "No description available",
        })),
      });
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      console.log("✅ [discover_agents] Completed with error\n");
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: "discover_agents",
    description:
      "Discover agents from the ERC-8004 blockchain registry. " +
      "Optionally filter by capabilities (e.g., ['payment', 'trading', 'analysis']). " +
      "Returns a list of agents with their ID, name, capabilities, and endpoint.",
    schema: z.object({
      capabilities: z
        .array(z.string())
        .optional()
        .describe(
          "Optional array of capability strings to filter agents. " +
            "Examples: ['payment', 'trading', 'analysis']. " +
            "If not provided, returns all available agents."
        ),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of agents to return (default: 20)"),
    }),
  }
);

/**
 * Tool 2: Get agent card
 */
const getAgentCardTool = tool(
  async (input) => {
    const { agentId } = input;

    console.log("\n🛠️  [get_agent_card] Starting...");
    console.log(`   Input: { agentId: "${agentId}" }`);

    try {
      // First, try to find agent by agentId in local server
      let agentCard = null;

      try {
        const agentsResponse = await axios.get(`${SERVER_URL}/api/agents`);
        const localAgents = agentsResponse.data.agents || [];

        const localAgent = localAgents.find(
          (a) => a.id === agentId || a.id.toString() === agentId.toString()
        );

        if (localAgent) {
          const cardUrl = `${SERVER_URL}/api/agents/${localAgent.id}/.well-known/agent-card.json`;
          console.log(`   📇 Fetching agent card from: ${cardUrl}`);
          const response = await axios.get(cardUrl);
          agentCard = response.data;
        }
      } catch (localError) {
        // Continue to fallback
        console.log(`   ⚠️  Could not find local agent, trying tokenURI...`);
      }

      // Fallback: try to get agent card from discovered agents
      if (!agentCard) {
        const discoveredAgents = await erc8004Service.discoverAgents({
          limit: 100,
          includeDetails: true,
        });

        const agent = discoveredAgents.find(
          (a) => a.agentId.toString() === agentId.toString()
        );

        if (agent && agent.tokenURI) {
          let baseUrl;
          const tokenURI = agent.tokenURI;

          if (
            tokenURI.startsWith("http://") ||
            tokenURI.startsWith("https://")
          ) {
            try {
              const url = new URL(tokenURI);
              baseUrl = `${url.protocol}//${url.host}`;
            } catch {
              const match = tokenURI.match(/^(https?:\/\/[^\/]+)/);
              baseUrl = match ? match[1] : SERVER_URL;
            }
          } else {
            baseUrl = SERVER_URL;
          }

          const cardUrl = `${baseUrl}/.well-known/agent-card.json`;
          console.log(`   📇 Fetching agent card from: ${cardUrl}`);
          try {
            const response = await axios.get(cardUrl);
            agentCard = response.data;
          } catch {
            // Try alternative endpoint
            const altCardUrl = `${SERVER_URL}/api/agents/${agentId}/.well-known/agent-card.json`;
            console.log(`   📇 Trying alternative endpoint: ${altCardUrl}`);
            const response = await axios.get(altCardUrl);
            agentCard = response.data;
          }
        }
      }

      if (!agentCard) {
        throw new Error(`Could not fetch agent card for agent ${agentId}`);
      }

      console.log(`   ✅ Agent Card: ${agentCard.name || "Unknown"}`);
      console.log(`   Description: ${agentCard.description || "N/A"}`);
      console.log(`   URL: ${agentCard.url || "N/A"}`);
      console.log("✅ [get_agent_card] Completed\n");

      return JSON.stringify({
        success: true,
        agentId: agentId,
        name: agentCard.name,
        description: agentCard.description,
        url: agentCard.url,
        skills: agentCard.skills || [],
        capabilities: agentCard.capabilities || [],
      });
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      console.log("✅ [get_agent_card] Completed with error\n");
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: "get_agent_card",
    description:
      "Get an agent's A2A card to understand its capabilities, endpoint, and description. " +
      "The agent card contains information about how to communicate with the agent via A2A protocol.",
    schema: z.object({
      agentId: z
        .string()
        .describe(
          "The agent ID to fetch the card for. " +
            "This is typically the agent's blockchain ID or local server ID."
        ),
    }),
  }
);

/**
 * Tool 3: Execute payment on Hedera
 */
async function executePayment(paymentDetails) {
  const recipient =
    paymentDetails.address ||
    paymentDetails.recipient ||
    HEDERA_CONFIG.OWNER_EVM_ADDRESS;
  const amount = paymentDetails.amount || "0.1";

  console.log(`   💰 Executing payment: ${amount} HBAR to ${recipient}`);

  const tx = await payerWallet.sendTransaction({
    to: recipient,
    value: ethers.parseEther(amount),
  });

  console.log(`   📤 Transaction sent: ${tx.hash}`);
  console.log(`   ⏳ Waiting for confirmation...`);

  const receipt = await Promise.race([
    tx.wait(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Transaction timeout")), 30000)
    ),
  ]);

  return receipt.hash;
}

/**
 * Tool 4: Respond directly to the user
 * This allows the agent to communicate with the user without needing to call another agent
 */
const respondToUserTool = tool(
  async (input) => {
    const { message } = input;

    console.log("\n🛠️  [respond_to_user] Starting...");
    console.log(`   Input: { message: "${message.substring(0, 100)}..." }`);

    // This tool just returns the message - the main function will display it
    console.log(`   💬 Message to user: ${message}`);
    console.log("✅ [respond_to_user] Completed\n");

    return JSON.stringify({
      success: true,
      message: message,
    });
  },
  {
    name: "respond_to_user",
    description:
      "Respond directly to the user. Use this when you need to communicate information, " +
      "ask for clarification, or provide updates without calling another agent. " +
      "For example, use this when an agent you contacted needs more information from the user, " +
      "or when you need to explain something to the user.",
    schema: z.object({
      message: z
        .string()
        .describe(
          "The message to send to the user. This should be clear and helpful."
        ),
    }),
  }
);

/**
 * Tool 5: Send message to agent via A2A
 */
const sendMessageToAgentTool = tool(
  async (input) => {
    const { agentId, message, contextId: providedContextId } = input;

    console.log("\n🛠️  [send_message_to_agent] Starting...");
    console.log(`\nMessage: ${message}`);
    console.log(
      `   Input: { agentId: "${agentId}", message: "${message.substring(
        0,
        50
      )}..." }`
    );

    try {
      // Try to get agent name and endpoint from local server or construct directly
      let agentName = `Agent ${agentId}`;
      let a2aEndpoint = `${SERVER_URL}/api/agents/${agentId}/a2a`;

      // Try to get agent info from local server first
      try {
        const agentsResponse = await axios.get(`${SERVER_URL}/api/agents`);
        const localAgents = agentsResponse.data.agents || [];
        const localAgent = localAgents.find(
          (a) => a.id === agentId || a.id.toString() === agentId.toString()
        );

        if (localAgent) {
          agentName = localAgent.name || agentName;
          a2aEndpoint = `${SERVER_URL}/api/agents/${agentId}/a2a`;
        } else {
          // Try to get from agent card endpoint
          try {
            const cardUrl = `${SERVER_URL}/api/agents/${agentId}/.well-known/agent-card.json`;
            const cardResponse = await axios.get(cardUrl);
            const agentCard = cardResponse.data;
            agentName = agentCard.name || agentName;
            if (agentCard.url) {
              a2aEndpoint = agentCard.url.endsWith("/a2a")
                ? agentCard.url
                : `${agentCard.url}/a2a`;
            }
          } catch (cardError) {
            // Use default endpoint
            console.log(
              `   ⚠️  Could not fetch agent card, using default endpoint`
            );
          }
        }
      } catch (error) {
        // Use default endpoint
        console.log(
          `   ⚠️  Could not fetch agent info, using default endpoint`
        );
      }

      console.log(`   📤 A2A Endpoint: ${a2aEndpoint}`);

      // Get or create context
      let contextId = providedContextId;
      if (!contextId) {
        contextId = `ctx_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        conversations.set(contextId, {
          agentId: agentId,
          agentName: agentName,
        });
      }

      const conversation = conversations.get(contextId);
      const paymentTxHash = conversation?.paymentTxHash || null;

      console.log(`   🔗 Context ID: ${contextId}`);
      if (paymentTxHash) {
        console.log(`   💳 Payment already verified for this context`);
      }

      // Create message
      const messageId = await generateUUID();
      const params = {
        message: {
          kind: "message",
          role: "user",
          parts: [{ kind: "text", text: message }],
          messageId: messageId,
          contextId: contextId,
          metadata: {
            fromUser: true,
            ...(paymentTxHash
              ? {
                  payment: {
                    txHash: paymentTxHash,
                  },
                }
              : {}),
          },
        },
      };

      // Send message
      const httpResponse = await axios.post(
        a2aEndpoint,
        {
          jsonrpc: "2.0",
          id: messageId,
          method: "message/send",
          params: params,
        },
        {
          validateStatus: (status) => status === 200 || status === 402,
        }
      );

      // Handle payment requirement
      if (httpResponse.status === 402) {
        console.log("   💳 Payment required");
        const jsonRpcResponse = httpResponse.data;
        const paymentDetails = jsonRpcResponse.error?.data?.payment;

        if (paymentDetails) {
          console.log(
            `   Amount: ${paymentDetails.amount} ${paymentDetails.token}`
          );
          console.log(`   Address: ${paymentDetails.address}`);

          const txHash = await executePayment(paymentDetails);
          console.log(`   ✅ Payment executed! TxHash: ${txHash}`);

          // Store payment in conversation context
          const currentConv = conversations.get(contextId) || {};
          currentConv.paymentTxHash = txHash;
          conversations.set(contextId, currentConv);

          // Wait for indexing
          console.log(
            "   ⏳ Waiting 10 seconds for transaction to be indexed..."
          );
          await new Promise((resolve) => setTimeout(resolve, 10000));

          // Retry with payment proof
          console.log("   🔄 Retrying with payment proof...");
          const retryParams = {
            ...params,
            message: {
              ...params.message,
              metadata: {
                ...params.message.metadata,
                payment: {
                  requestId: paymentDetails.requestId,
                  txHash: txHash,
                  amount: paymentDetails.amount,
                  token: paymentDetails.token,
                },
              },
            },
          };

          const retryResponse = await axios.post(
            a2aEndpoint,
            {
              jsonrpc: "2.0",
              id: messageId,
              method: "message/send",
              params: retryParams,
            },
            {
              headers: {
                "X-Payment": txHash,
              },
            }
          );

          const response = retryResponse.data;
          console.log("   ✅ Response received from agent");

          // Log the response content
          if (response.result) {
            const result = response.result;
            if (result.kind === "message" && result.parts) {
              const textParts = result.parts
                .filter((p) => p.kind === "text")
                .map((p) => p.text);
              if (textParts.length > 0) {
                console.log(`   📝 Response text: ${textParts.join(" ")}`);
              }
            } else if (
              result.kind === "status-update" &&
              result.status?.message
            ) {
              const textParts = result.status.message.parts
                .filter((p) => p.kind === "text")
                .map((p) => p.text);
              if (textParts.length > 0) {
                console.log(`   📝 Response text: ${textParts.join(" ")}`);
              }
            } else if (result.kind === "task" && result.status?.message) {
              const textParts = result.status.message.parts
                .filter((p) => p.kind === "text")
                .map((p) => p.text);
              if (textParts.length > 0) {
                console.log(`   📝 Response text: ${textParts.join(" ")}`);
              }
            }
            console.log(`   📊 Response type: ${result.kind}`);
          }

          console.log("✅ [send_message_to_agent] Completed\n");

          return JSON.stringify({
            success: true,
            agentId: agentId,
            agentName: agentName,
            contextId: contextId,
            paymentTxHash: txHash,
            response: response,
          });
        } else {
          throw new Error("Payment required but no payment details provided");
        }
      }

      // Normal response
      const response = httpResponse.data;
      console.log("   ✅ Response received from agent");

      // Log the response content
      if (response.result) {
        const result = response.result;
        if (result.kind === "message" && result.parts) {
          const textParts = result.parts
            .filter((p) => p.kind === "text")
            .map((p) => p.text);
          if (textParts.length > 0) {
            console.log(`   📝 Response text: ${textParts.join(" ")}`);
          }
        } else if (result.kind === "status-update" && result.status?.message) {
          const textParts = result.status.message.parts
            .filter((p) => p.kind === "text")
            .map((p) => p.text);
          if (textParts.length > 0) {
            console.log(`   📝 Response text: ${textParts.join(" ")}`);
          }
        } else if (result.kind === "task" && result.status?.message) {
          const textParts = result.status.message.parts
            .filter((p) => p.kind === "text")
            .map((p) => p.text);
          if (textParts.length > 0) {
            console.log(`   📝 Response text: ${textParts.join(" ")}`);
          }
        }
        console.log(`   📊 Response type: ${result.kind}`);
      }

      console.log("✅ [send_message_to_agent] Completed\n");

      return JSON.stringify({
        success: true,
        agentId: agentId,
        agentName: agentName,
        contextId: contextId,
        paymentTxHash: paymentTxHash,
        response: response,
      });
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Data: ${JSON.stringify(error.response.data)}`);
      }
      console.log("✅ [send_message_to_agent] Completed with error\n");
      return JSON.stringify({
        success: false,
        error: error.message,
      });
    }
  },
  {
    name: "send_message_to_agent",
    description:
      "Send a message to an agent via the A2A (Agent-to-Agent) protocol. " +
      "This tool handles payment automatically if required. " +
      "For follow-up messages to the same agent, use the same contextId to maintain conversation context.",
    schema: z.object({
      agentId: z
        .string()
        .describe(
          "The agent ID to send the message to. " +
            "This should be obtained from discover_agents or get_agent_card."
        ),
      message: z
        .string()
        .describe(
          "The message text to send to the agent. " +
            "This should be the user's request or question."
        ),
      contextId: z
        .string()
        .optional()
        .describe(
          "Optional conversation context ID for multi-turn conversations. " +
            "If sending a follow-up message to the same agent, use the same contextId " +
            "to maintain conversation context and avoid re-payment."
        ),
    }),
  }
);

/**
 * System prompt for the agent
 */
const systemPrompt = `You are a User Agent that helps users discover and communicate with specialized agents 
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

4. Handle agent responses and communicate with the user:
   - When an agent responds, use respond_to_user to relay the information to the user
   - If the agent asks for more information, use respond_to_user to ask the user for that information
   - Don't try to answer the agent's questions yourself - always ask the user using respond_to_user
   - Present agent responses clearly and naturally using respond_to_user
   - Always end with respond_to_user to communicate back to the user - never just call send_message_to_agent without following up with respond_to_user

Key points:
- Agents are discovered from the ERC-8004 blockchain registry
- Communication happens via A2A (Agent-to-Agent) protocol over JSON-RPC
- Some agents require payment (handled automatically by send_message_to_agent)
- Use contextId to maintain conversation state across multiple messages
- Always use respond_to_user to communicate with the user - this is how you provide answers and ask questions
- If an agent asks for more information, use respond_to_user to ask the user for that information
- After every send_message_to_agent call, use respond_to_user to relay the agent's response to the user
- If an agent doesn't respond appropriately, you can try discovering different agents`;

/**
 * Helper function to extract text from agent response
 */
function extractResponseText(responseJson) {
  try {
    const response = JSON.parse(responseJson);
    if (!response.success || !response.response?.result) {
      return "No response received from agent.";
    }

    const result = response.response.result;

    if (result.kind === "message" && result.parts) {
      return result.parts
        .filter((p) => p.kind === "text")
        .map((p) => p.text)
        .join("\n");
    } else if (result.kind === "status-update" && result.status?.message) {
      return result.status.message.parts
        .filter((p) => p.kind === "text")
        .map((p) => p.text)
        .join("\n");
    } else if (result.kind === "task" && result.status?.message) {
      return result.status.message.parts
        .filter((p) => p.kind === "text")
        .map((p) => p.text)
        .join("\n");
    }

    return JSON.stringify(result, null, 2);
  } catch (error) {
    return responseJson;
  }
}

/**
 * Main function
 */
async function main() {
  console.log("🤖 AI User Agent - Autonomous Agent Discovery & Communication");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
  );

  if (!GROQ_CONFIG.API_KEY) {
    console.error("❌ Error: GROQ_API_KEY not set in environment");
    console.error(
      "   Please set GROQ_API_KEY in your .env file or environment\n"
    );
    process.exit(1);
  }

  try {
    // Initialize Groq model
    const model = new ChatGroq({
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      apiKey: GROQ_CONFIG.API_KEY,
    });

    console.log("✅ Groq model initialized\n");

    // Create agent with all tools
    const agent = createAgent({
      model: model,
      systemPrompt: systemPrompt,
      tools: [
        discoverAgentsTool,
        getAgentCardTool,
        respondToUserTool,
        sendMessageToAgentTool,
      ],
    });

    console.log("✅ Agent created with tools:");
    console.log("   - discover_agents");
    console.log("   - get_agent_card");
    console.log("   - respond_to_user");
    console.log("   - send_message_to_agent\n");

    // Get query from args or interactive mode
    const args = process.argv.slice(2);

    if (args.length > 0) {
      // Single query mode
      const query = args.join(" ");
      console.log(`📝 User: ${query}\n`);
      console.log("🤔 Agent thinking...\n");

      const response = await agent.invoke({
        messages: [{ role: "user", content: query }],
      });

      console.log("\n📤 Agent Response:\n");
      if (response.messages && response.messages.length > 0) {
        // Extract responses from tool results and assistant messages
        for (const msg of response.messages) {
          if (msg.role === "tool") {
            try {
              const toolResult = JSON.parse(msg.content);

              // Handle respond_to_user tool
              if (toolResult.success && toolResult.message) {
                console.log(`   💬 ${toolResult.message}\n`);
                continue;
              }

              // Handle send_message_to_agent tool result
              if (toolResult.success && toolResult.response?.result) {
                const result = toolResult.response.result;
                if (result.kind === "message" && result.parts) {
                  const textParts = result.parts
                    .filter((p) => p.kind === "text")
                    .map((p) => p.text);
                  if (textParts.length > 0) {
                    console.log(
                      `   💬 ${
                        toolResult.agentName || "Agent"
                      }: ${textParts.join(" ")}\n`
                    );
                  }
                } else if (
                  result.kind === "status-update" &&
                  result.status?.message
                ) {
                  const textParts = result.status.message.parts
                    .filter((p) => p.kind === "text")
                    .map((p) => p.text);
                  if (textParts.length > 0) {
                    console.log(
                      `   💬 ${
                        toolResult.agentName || "Agent"
                      }: ${textParts.join(" ")}\n`
                    );
                  }
                } else if (result.kind === "task" && result.status?.message) {
                  const textParts = result.status.message.parts
                    .filter((p) => p.kind === "text")
                    .map((p) => p.text);
                  if (textParts.length > 0) {
                    console.log(
                      `   💬 ${
                        toolResult.agentName || "Agent"
                      }: ${textParts.join(" ")}\n`
                    );
                  }
                }
              }
            } catch (e) {
              // Ignore parse errors
            }
          } else if (msg.role === "assistant") {
            console.log(`   ${msg.content}\n`);
          }
        }
      } else {
        console.log(`   ${JSON.stringify(response, null, 2)}\n`);
      }

      process.exit(0);
    } else {
      // Interactive mode
      console.log(
        "💬 Interactive Mode - Enter your questions (type 'exit' to quit):\n"
      );

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      // Track conversation context for multi-turn
      let currentContextId = null;
      let currentAgentId = null;

      const askQuestion = () => {
        rl.question("> ", async (userQuery) => {
          if (
            userQuery.trim().toLowerCase() === "exit" ||
            userQuery.trim().toLowerCase() === "quit"
          ) {
            console.log("\n👋 Goodbye!\n");
            rl.close();
            process.exit(0);
            return;
          }

          if (!userQuery.trim()) {
            askQuestion();
            return;
          }

          try {
            console.log(`\n📝 User: ${userQuery}\n`);
            console.log("🤔 Agent thinking...\n");

            const response = await agent.invoke({
              messages: [{ role: "user", content: userQuery }],
            });

            console.log("\n📤 Agent Response:\n");
            if (response.messages && response.messages.length > 0) {
              // Extract responses from tool results and assistant messages
              for (const msg of response.messages) {
                if (msg.role === "tool") {
                  try {
                    const toolResult = JSON.parse(msg.content);

                    // Handle respond_to_user tool
                    if (toolResult.success && toolResult.message) {
                      console.log(`   💬 ${toolResult.message}\n`);
                      continue;
                    }

                    // Handle send_message_to_agent tool result
                    if (toolResult.success) {
                      if (toolResult.contextId) {
                        currentContextId = toolResult.contextId;
                        currentAgentId = toolResult.agentId;
                      }

                      // Extract and display agent response from tool result
                      if (toolResult.response?.result) {
                        const result = toolResult.response.result;
                        if (result.kind === "message" && result.parts) {
                          const textParts = result.parts
                            .filter((p) => p.kind === "text")
                            .map((p) => p.text);
                          if (textParts.length > 0) {
                            console.log(
                              `   💬 ${
                                toolResult.agentName || "Agent"
                              }: ${textParts.join(" ")}\n`
                            );
                          }
                        } else if (
                          result.kind === "status-update" &&
                          result.status?.message
                        ) {
                          const textParts = result.status.message.parts
                            .filter((p) => p.kind === "text")
                            .map((p) => p.text);
                          if (textParts.length > 0) {
                            console.log(
                              `   💬 ${
                                toolResult.agentName || "Agent"
                              }: ${textParts.join(" ")}\n`
                            );
                          }
                        } else if (
                          result.kind === "task" &&
                          result.status?.message
                        ) {
                          const textParts = result.status.message.parts
                            .filter((p) => p.kind === "text")
                            .map((p) => p.text);
                          if (textParts.length > 0) {
                            console.log(
                              `   💬 ${
                                toolResult.agentName || "Agent"
                              }: ${textParts.join(" ")}\n`
                            );
                          }
                        }
                      }
                    }
                  } catch (e) {
                    // Ignore parse errors
                  }
                } else if (msg.role === "assistant") {
                  console.log(`   ${msg.content}\n`);
                }
              }
            } else {
              console.log(`   ${JSON.stringify(response, null, 2)}\n`);
            }
          } catch (error) {
            console.error(`\n❌ Error: ${error.message}\n`);
            if (error.stack) {
              console.error(`Stack: ${error.stack}\n`);
            }
          }

          askQuestion();
        });
      };

      askQuestion();
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.stack) {
      console.error("\nStack:", error.stack);
    }
    process.exit(1);
  }
}

main();
