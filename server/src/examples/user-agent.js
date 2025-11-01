/**
 * User Agent - Discovers and communicates with agents via A2A protocol
 *
 * This program:
 * 1. Takes user input from command line
 * 2. Discovers relevant agents from blockchain (ERC-8004)
 * 3. Selects best agent based on query
 * 4. Communicates via A2A (handles payment automatically)
 * 5. Shows all output including tool calls
 *
 * Usage:
 *   node src/examples/user-agent.js [query]
 *
 * Interactive mode (no args):
 *   node src/examples/user-agent.js
 */

import readline from "readline";
import axios from "axios";
import { ethers } from "ethers";
import { A2AClient } from "@a2a-js/sdk/client";
import { ERC8004Service } from "../services/ERC8004Service.js";
import { HEDERA_CONFIG } from "../config/hedera.js";
// UUID generation
async function generateUUID() {
  const { v4: uuidv4 } = await import("uuid");
  return uuidv4();
}

const SERVER_URL = process.env.SERVER_URL || "http://localhost:8443";

// Payer wallet (user's wallet for payments)
const payerWallet = new ethers.Wallet(
  HEDERA_CONFIG.CLIENT_PRIVATE_KEY,
  new ethers.JsonRpcProvider(HEDERA_CONFIG.JSON_RPC_URL)
);

// ERC-8004 service for discovery
const erc8004Service = new ERC8004Service();

// Conversation contexts (contextId -> { agentId, txHash })
const conversations = new Map();

/**
 * Extract capabilities from user query (simple keyword matching)
 */
function extractCapabilities(query) {
  const queryLower = query.toLowerCase();
  const capabilityKeywords = {
    payment: ["payment", "pay", "transaction", "transfer", "send money"],
    trading: ["trade", "trading", "market", "buy", "sell", "order"],
    analyze: ["analyze", "analysis", "data", "report", "insight"],
    verify: ["verify", "verification", "check", "validate"],
  };

  const matched = [];
  for (const [capability, keywords] of Object.entries(capabilityKeywords)) {
    if (keywords.some((keyword) => queryLower.includes(keyword))) {
      matched.push(capability);
    }
  }

  return matched.length > 0 ? matched : null;
}

/**
 * Discover agents from blockchain
 */
async function discoverAgents(capabilities = null) {
  console.log("🔍 Discovering agents from blockchain...\n");

  const options = {
    limit: 20,
    capabilities: capabilities,
    includeDetails: true,
  };

  try {
    const agents = await erc8004Service.discoverAgents(options);
    console.log(`   Found ${agents.length} agent(s)\n`);
    return agents;
  } catch (error) {
    console.error(`   ❌ Discovery error: ${error.message}`);
    throw error;
  }
}

/**
 * Select best agent for query
 */
function selectAgent(query, discoveredAgents) {
  if (discoveredAgents.length === 0) {
    return null;
  }

  // Extract capabilities from query
  const queryCapabilities = extractCapabilities(query);

  // Score agents based on capability match
  const scoredAgents = discoveredAgents.map((agent) => {
    let score = 0;
    const agentCaps = (agent.capabilities || []).map((c) => c.toLowerCase());

    if (queryCapabilities) {
      for (const queryCap of queryCapabilities) {
        if (
          agentCaps.some((ac) => ac.includes(queryCap) || queryCap.includes(ac))
        ) {
          score += 10;
        }
      }
    }

    // Boost score if name matches query keywords
    const queryLower = query.toLowerCase();
    const agentName = (agent.name || "").toLowerCase();
    if (queryLower.includes(agentName) || agentName.includes(queryLower)) {
      score += 5;
    }

    return { agent, score };
  });

  // Sort by score and return best match
  scoredAgents.sort((a, b) => b.score - a.score);
  return scoredAgents[0].agent;
}

/**
 * Get agent card from agent info
 */
async function getAgentCard(agentInfo) {
  try {
    // First, try to find agent by agentId in local server
    try {
      const agentsResponse = await axios.get(`${SERVER_URL}/api/agents`);
      const localAgents = agentsResponse.data.agents || [];

      // Find agent by blockchain agentId (if it matches local agent's ERC-8004 ID)
      const localAgent = localAgents.find(
        (a) =>
          a.id === agentInfo.agentId ||
          a.id.toString() === agentInfo.agentId.toString()
      );

      if (localAgent) {
        // Use local server's agent card endpoint
        const cardUrl = `${SERVER_URL}/api/agents/${localAgent.id}/.well-known/agent-card.json`;
        const response = await axios.get(cardUrl);
        return response.data;
      }
    } catch (localError) {
      // Continue to fallback
      console.log(`   ⚠️  Could not find local agent, trying tokenURI...`);
    }

    // Fallback: try to get agent card from tokenURI
    const tokenURI = agentInfo.tokenURI || agentInfo.endpoint;
    if (!tokenURI) {
      throw new Error("No tokenURI or endpoint available");
    }

    // Extract base URL from tokenURI (it might be a full URL or just a path)
    let baseUrl;
    if (tokenURI.startsWith("http://") || tokenURI.startsWith("https://")) {
      // Full URL - extract base
      try {
        const url = new URL(tokenURI);
        baseUrl = `${url.protocol}//${url.host}`;
      } catch {
        // If URL parsing fails, try to extract manually
        const match = tokenURI.match(/^(https?:\/\/[^\/]+)/);
        baseUrl = match ? match[1] : SERVER_URL;
      }
    } else {
      // Relative path - use server URL
      baseUrl = SERVER_URL;
    }

    // Try agent card endpoint
    const cardUrl = `${baseUrl}/.well-known/agent-card.json`;
    try {
      const response = await axios.get(cardUrl);
      return response.data;
    } catch {
      // Try constructing from agentId if we have it
      if (agentInfo.agentId) {
        const altCardUrl = `${SERVER_URL}/api/agents/${agentInfo.agentId}/.well-known/agent-card.json`;
        try {
          const response = await axios.get(altCardUrl);
          return response.data;
        } catch {
          // Last resort: use default pattern
          throw new Error(
            `Could not fetch agent card from ${cardUrl} or ${altCardUrl}`
          );
        }
      }
      throw new Error(`Could not fetch agent card from ${cardUrl}`);
    }
  } catch (error) {
    console.error(`   ⚠️  Could not fetch agent card: ${error.message}`);
    return null;
  }
}

/**
 * Execute payment on Hedera
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
 * Send message to agent via A2A with payment handling
 */
async function sendMessageToAgent(agentInfo, query, contextId = null) {
  const agentName = agentInfo.name || `Agent ${agentInfo.agentId}`;
  console.log(`\n📤 Sending message to ${agentName}...\n`);

  // Get agent card to find A2A endpoint
  const agentCard = await getAgentCard(agentInfo);

  if (!agentCard) {
    throw new Error("Could not fetch agent card. Agent may not support A2A.");
  }

  // Determine A2A endpoint
  let a2aEndpoint;
  if (agentCard.url) {
    a2aEndpoint = agentCard.url.endsWith("/a2a")
      ? agentCard.url
      : `${agentCard.url}/a2a`;
  } else {
    // Fallback: construct from agentId
    a2aEndpoint = `${SERVER_URL}/api/agents/${agentInfo.agentId}/a2a`;
  }

  console.log(`   A2A Endpoint: ${a2aEndpoint}`);

  // Get or create context
  if (!contextId) {
    contextId = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    conversations.set(contextId, {
      agentId: agentInfo.agentId,
      agentName: agentName,
    });
  }

  const conversation = conversations.get(contextId);
  const paymentTxHash = conversation?.paymentTxHash || null;

  console.log(`   Context ID: ${contextId}`);
  if (paymentTxHash) {
    console.log(`   💳 Payment already verified for this context\n`);
  } else {
    console.log();
  }

  // Create message
  const messageId = await generateUUID();
  const params = {
    message: {
      kind: "message",
      role: "user",
      parts: [{ kind: "text", text: query }],
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

  try {
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
      console.log("💳 Payment required\n");
      const jsonRpcResponse = httpResponse.data;
      const paymentDetails = jsonRpcResponse.error?.data?.payment;

      if (paymentDetails) {
        console.log(
          `   Amount: ${paymentDetails.amount} ${paymentDetails.token}`
        );
        console.log(`   Address: ${paymentDetails.address}\n`);

        const txHash = await executePayment(paymentDetails);
        console.log(`   ✅ Payment executed! TxHash: ${txHash}\n`);

        // Store payment in conversation context
        const currentConv = conversations.get(contextId) || {};
        currentConv.paymentTxHash = txHash;
        conversations.set(contextId, currentConv);

        // Wait for indexing
        console.log(
          "   ⏳ Waiting 10 seconds for transaction to be indexed...\n"
        );
        await new Promise((resolve) => setTimeout(resolve, 10000));

        // Retry with payment proof
        console.log("   🔄 Retrying with payment proof...\n");
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

        return retryResponse.data;
      } else {
        throw new Error("Payment required but no payment details provided");
      }
    }

    return httpResponse.data;
  } catch (error) {
    if (error.response?.status === 402) {
      throw new Error(
        `Payment required: ${JSON.stringify(error.response.data)}`
      );
    }
    throw error;
  }
}

/**
 * Display response including tool calls
 */
function displayResponse(response, agentName) {
  const result = response.result;

  if (!result) {
    console.log("   ⚠️  No response received\n");
    return;
  }

  // Handle different response types
  if (result.kind === "status-update") {
    const status = result.status;
    console.log(`   📊 Status: ${status.state}\n`);

    if (status.message) {
      displayMessage(status.message, agentName);
    }
  } else if (result.kind === "task") {
    console.log(`   📋 Task ID: ${result.id}`);
    console.log(`   📊 Status: ${result.status?.state}\n`);

    if (result.status?.message) {
      displayMessage(result.status.message, agentName);
    }
  } else if (result.kind === "message") {
    displayMessage(result, agentName);
  }
}

/**
 * Display message parts (including tool calls)
 */
function displayMessage(message, agentName) {
  if (!message.parts || message.parts.length === 0) {
    return;
  }

  for (const part of message.parts) {
    if (part.kind === "text") {
      console.log(`   💬 ${agentName}: ${part.text}\n`);
    } else if (part.kind === "data") {
      // Tool call or structured data
      console.log(`   🛠️  Tool/Data:`);
      console.log(`   ${JSON.stringify(part.data, null, 6)}`);
      console.log();
    } else if (part.kind === "file") {
      // File part
      console.log(
        `   📁 File: ${part.name || "unnamed"} (${
          part.mimeType || "unknown type"
        })`
      );
      if (part.uri) {
        console.log(`      URI: ${part.uri}`);
      }
      console.log();
    } else if (part.function_call || part.functionCall) {
      // Function call (check both property names)
      const funcCall = part.function_call || part.functionCall;
      console.log(
        `   🛠️  Function Call: ${funcCall.name || funcCall.function}`
      );
      if (funcCall.arguments) {
        try {
          const args =
            typeof funcCall.arguments === "string"
              ? JSON.parse(funcCall.arguments)
              : funcCall.arguments;
          console.log(`   Arguments:`);
          console.log(`   ${JSON.stringify(args, null, 6)}`);
        } catch {
          console.log(`   Arguments: ${funcCall.arguments}`);
        }
      }
      console.log();
    } else if (part.function_response || part.functionResponse) {
      // Function response
      const funcResp = part.function_response || part.functionResponse;
      console.log(
        `   ⚡ Function Response: ${funcResp.name || funcResp.function}`
      );
      if (funcResp.response) {
        try {
          const response =
            typeof funcResp.response === "string"
              ? JSON.parse(funcResp.response)
              : funcResp.response;
          console.log(`   Result:`);
          console.log(`   ${JSON.stringify(response, null, 6)}`);
        } catch {
          console.log(`   Result: ${funcResp.response}`);
        }
      }
      console.log();
    } else {
      // Unknown part type - display raw
      console.log(`   📦 Unknown part type: ${part.kind || "unknown"}`);
      console.log(`   ${JSON.stringify(part, null, 6)}`);
      console.log();
    }
  }
}

/**
 * Process user query
 */
async function processQuery(query) {
  if (!query || query.trim().length === 0) {
    console.log("   ⚠️  Empty query\n");
    return;
  }

  try {
    // Discover agents
    const capabilities = extractCapabilities(query);
    console.log(
      `🔍 Query: "${query}"${
        capabilities ? ` (capabilities: ${capabilities.join(", ")})` : ""
      }\n`
    );

    const discoveredAgents = await discoverAgents(capabilities);

    if (discoveredAgents.length === 0) {
      console.log("   ❌ No agents found matching your query\n");
      return;
    }

    // Select best agent
    const selectedAgent = selectAgent(query, discoveredAgents);
    if (!selectedAgent) {
      console.log("   ❌ Could not select an agent\n");
      return;
    }

    const agentName = selectedAgent.name || `Agent ${selectedAgent.agentId}`;
    console.log(`   ✅ Selected: ${agentName}`);
    if (selectedAgent.capabilities && selectedAgent.capabilities.length > 0) {
      console.log(`   Capabilities: ${selectedAgent.capabilities.join(", ")}`);
    }
    if (selectedAgent.tokenURI) {
      console.log(`   Endpoint: ${selectedAgent.tokenURI}`);
    }
    console.log();

    // Get or create conversation context
    const contextId =
      Array.from(conversations.keys()).find(
        (ctxId) => conversations.get(ctxId).agentId === selectedAgent.agentId
      ) || null;

    // Send message
    const response = await sendMessageToAgent(selectedAgent, query, contextId);

    // Display response
    displayResponse(response, agentName);

    // Store/update conversation context (use contextId from request or response)
    const finalContextId =
      contextId || response.result?.contextId || response.result?.taskId;
    if (finalContextId) {
      const existingConv = conversations.get(finalContextId) || {};
      conversations.set(finalContextId, {
        agentId: selectedAgent.agentId,
        agentName: agentName,
        paymentTxHash: existingConv.paymentTxHash || null,
      });
    }
  } catch (error) {
    console.error(`\n   ❌ Error: ${error.message}\n`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}\n`);
    }
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  console.log("🤖 User Agent - A2A Agent Discovery & Communication");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
  );

  // Single query mode
  if (args.length > 0) {
    const query = args.join(" ");
    await processQuery(query);
    process.exit(0);
  }

  // Interactive mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question("> ", async (query) => {
      if (
        query.trim().toLowerCase() === "exit" ||
        query.trim().toLowerCase() === "quit"
      ) {
        console.log("\n👋 Goodbye!\n");
        rl.close();
        process.exit(0);
        return;
      }

      if (query.trim().toLowerCase() === "help") {
        console.log("\nCommands:");
        console.log(
          "  <query>  - Ask a question (auto-discovers and selects agent)"
        );
        console.log("  exit     - Exit the program");
        console.log("  help     - Show this help\n");
        prompt();
        return;
      }

      await processQuery(query);
      prompt();
    });
  };

  console.log("Enter your query (type 'help' for commands, 'exit' to quit):\n");
  prompt();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
