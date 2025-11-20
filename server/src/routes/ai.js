import express from "express";
import { createAgent, tool } from "langchain";
import { ChatGroq } from "@langchain/groq";
import * as z from "zod";
import axios from "axios";
import { ethers } from "ethers";
import { ERC8004Service } from "../services/ERC8004Service.js";
import { HEDERA_CONFIG } from "../config/hedera.js";
import { GROQ_CONFIG } from "../config/groq.js";

/**
 * AI-related routes for agents
 */
export function createAIRoutes(agentManager) {
  const router = express.Router();
  const groqService = agentManager.getGroqService();
  
  const SERVER_URL = process.env.SERVER_URL || "http://localhost:8443";
  // Trading API URL (Go server with trading signals)
  // Default: http://172.23.240.1:8080 (current network IP)
  // Can be overridden with TRADING_API_URL env var
  const TRADING_API_URL = process.env.TRADING_API_URL || "http://172.23.240.1:8080";
  
  // Lazy-load payer wallet to avoid connection issues at startup
  let payerWallet = null;
  const getPayerWallet = () => {
    if (!payerWallet) {
      payerWallet = new ethers.Wallet(
        HEDERA_CONFIG.CLIENT_PRIVATE_KEY,
        new ethers.JsonRpcProvider(HEDERA_CONFIG.JSON_RPC_URL)
      );
    }
    return payerWallet;
  };
  
  // ERC-8004 service for discovery (will connect when first used)
  let erc8004Service = null;
  const getERC8004Service = () => {
    if (!erc8004Service) {
      erc8004Service = new ERC8004Service();
    }
    return erc8004Service;
  };

  /**
   * Get available Groq models
   * GET /api/ai/models
   */
  router.get("/models", (req, res) => {
    try {
      const models = groqService.getAvailableModels();
      res.json({
        success: true,
        models,
        default: "llama-3.3-70b-versatile"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Test AI response
   * POST /api/ai/test
   */
  router.post("/test", async (req, res) => {
    try {
      const { message, model, systemPrompt } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          error: "message is required"
        });
      }

      const response = await groqService.generateResponse({
        systemPrompt: systemPrompt || "You are a helpful AI assistant.",
        userMessage: message,
        model: model || "llama-3.3-70b-versatile"
      });

      res.json({
        success: true,
        message,
        response,
        model: model || "llama-3.3-70b-versatile"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get agent AI status
   * GET /api/ai/agent/:agentId/status
   */
  router.get("/agent/:agentId/status", (req, res) => {
    try {
      const agent = agentManager.getAgent(req.params.agentId);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: "Agent not found"
        });
      }

      res.json({
        success: true,
        agentId: agent.id,
        agentName: agent.name,
        aiEnabled: agent.aiEnabled,
        aiModel: agent.aiModel || groqService.getModelForAgentType(agent.metadata?.type || "general")
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // UUID generation helper
  async function generateUUID() {
    const { v4: uuidv4 } = await import("uuid");
    return uuidv4();
  }

  // Conversation contexts (contextId -> { agentId, paymentTxHash, agentName })
  const conversations = new Map();

  // Helper function to extract text from agent response
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

  // Execute payment on Hedera
  async function executePayment(paymentDetails) {
    console.log(`[AI-PURCHASE] 💰 Executing payment: ${paymentDetails.amount} ${paymentDetails.token} to ${paymentDetails.address}`);
    
    const recipient =
      paymentDetails.address ||
      paymentDetails.recipient ||
      HEDERA_CONFIG.OWNER_EVM_ADDRESS;
    const amount = paymentDetails.amount || "0.1";

    console.log(`[AI-PURCHASE] 💰 Sending ${amount} HBAR to ${recipient}`);

    const wallet = getPayerWallet();
    const tx = await wallet.sendTransaction({
      to: recipient,
      value: ethers.parseEther(amount),
    });

    console.log(`[AI-PURCHASE] 📤 Transaction sent: ${tx.hash}`);
    console.log(`[AI-PURCHASE] ⏳ Waiting for confirmation...`);

    const receipt = await Promise.race([
      tx.wait(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Transaction timeout")), 30000)
      ),
    ]);

    console.log(`[AI-PURCHASE] ✅ Payment confirmed: ${receipt.hash}`);
    return receipt.hash;
  }

  /**
   * AI Agent Purchase with SSE streaming
   * POST /api/ai/purchase
   */
  router.post("/purchase", async (req, res) => {
    const { query, traderId: selectedTraderId, traderName: selectedTraderName } = req.body || {};

    console.log(`[AI-PURCHASE] ==========================================`);
    console.log(`[AI-PURCHASE] 🚀 Starting AI agent purchase`);
    console.log(`[AI-PURCHASE] Query: ${query || 'No query provided'}`);
    console.log(`[AI-PURCHASE] ==========================================`);

    if (!GROQ_CONFIG.API_KEY) {
      console.error("[AI-PURCHASE] ❌ Error: GROQ_API_KEY not set");
      res.status(500).json({
        success: false,
        error: "GROQ_API_KEY not set in environment"
      });
      return;
    }

    if (!query) {
      console.error("[AI-PURCHASE] ❌ Error: query is required");
      res.status(400).json({
        success: false,
        error: "query is required"
      });
      return;
    }

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    const targetTraderLabel = selectedTraderName || selectedTraderId || "selected trader";
    const signalEndpointHint = selectedTraderId
      ? `${TRADING_API_URL}/api/decisions/latest?trader_id=${selectedTraderId}`
      : `${TRADING_API_URL}/api/decisions/latest?trader_id=<TRADER_ID>`;

    // Helper to send SSE events
    const sendEvent = (type, data) => {
      console.log(`[AI-PURCHASE] 📤 SSE Event [${type}]:`, JSON.stringify(data));
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isConnectionResetError = (error) => {
      if (!error) return false;
      if (error.code === "ECONNRESET") return true;
      const message =
        error.message ||
        error?.cause?.message ||
        error?.response?.data?.error ||
        "";
      return /ECONNRESET|socket hang up|ECONNABORTED/i.test(message);
    };

    const appendSignalContext = (baseMessage) => {
      const contextLines = [
        "Trading Context:",
        `- Trader: ${targetTraderLabel}`,
        selectedTraderId
          ? `- Trader ID: ${selectedTraderId}`
          : "- Trader ID was not provided. Use the trader_id from the user query.",
        `- Fetch the live Binance futures decision JSON from: ${signalEndpointHint}`,
        "- This system trades crypto perpetual futures only (pairs like BTCUSDT, SOLUSDT, ETHUSDT).",
        "- NEVER mention equities or stocks (e.g., AAPL, GOOG).",
        "- Include the exact JSON payload you retrieved in your response.",
      ];
      return `${baseMessage}\n\n${contextLines.join("\n")}`;
    };

    try {
      // Initialize Groq model
      console.log("[AI-PURCHASE] 🤖 Initializing Groq model...");
      const model = new ChatGroq({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        apiKey: GROQ_CONFIG.API_KEY,
        // Ensure tool calling is enabled
        maxTokens: 4096,
      });

      sendEvent("status", { 
        type: "initializing", 
        message: "Initializing AI agent..." 
      });

      // Define tools (same as ai-user-agent.js)
      const discoverAgentsTool = tool(
        async (input) => {
          const { capabilities, limit = 20 } = input;
          console.log(`[AI-PURCHASE] 🛠️  [discover_agents] Starting...`);
          console.log(`[AI-PURCHASE]    Input: ${JSON.stringify({ capabilities, limit })}`);
          
          sendEvent("workflow_step", {
            step: "discovery",
            status: "starting",
            message: "Discovering ERC-8004 agents"
          });

          sendEvent("tool", {
            tool: "discover_agents",
            status: "starting",
            input: { capabilities, limit }
          });

          try {
            // First try to get local agents from server
            let agents = [];
            
            try {
              const agentsResponse = await axios.get(`${SERVER_URL}/api/agents`);
              const localAgents = agentsResponse.data.agents || [];
              
              if (localAgents.length > 0) {
                console.log(`[AI-PURCHASE]    ✅ Found ${localAgents.length} local agent(s)`);
                agents = localAgents.map((agent) => ({
                  agentId: agent.id.toString(),
                  name: agent.name || `Agent ${agent.id}`,
                  capabilities: agent.capabilities || [],
                  endpoint: agent.endpoint || `${SERVER_URL}/api/agents/${agent.id}/a2a`,
                  description: agent.description || "No description available",
                }));
                
                sendEvent("tool", {
                  tool: "discover_agents",
                  status: "completed",
                  result: { count: agents.length, agents, source: "local" }
                });

                sendEvent("workflow_step", {
                  step: "discovery",
                  status: "completed",
                  message: `Agent discovery complete via local registry (${agents.length} agent${agents.length === 1 ? "" : "s"})`
                });

                return JSON.stringify({
                  success: true,
                  count: agents.length,
                  agents: agents,
                  source: "local"
                });
              }
            } catch (localError) {
              console.log(`[AI-PURCHASE]    ⚠️  Could not fetch local agents: ${localError.message}`);
            }

            // Fallback: Try blockchain discovery, but handle rate limits gracefully
            try {
              const options = {
                limit,
                capabilities:
                  capabilities && capabilities.length > 0 ? capabilities : null,
                includeDetails: false, // Don't fetch details to reduce calls
              };

              const ercService = getERC8004Service();
              const blockchainAgents = await ercService.discoverAgents(options);
              
              console.log(`[AI-PURCHASE]    ✅ Found ${blockchainAgents.length} blockchain agent(s)`);
              agents = blockchainAgents.map((agent) => ({
                agentId: agent.agentId.toString(),
                name: agent.name || `Agent ${agent.agentId}`,
                capabilities: agent.capabilities || [],
                endpoint: agent.endpoint || agent.tokenURI,
                description: agent.description || "No description available",
              }));

              sendEvent("tool", {
                tool: "discover_agents",
                status: "completed",
                result: { count: agents.length, agents, source: "blockchain" }
              });

                sendEvent("workflow_step", {
                  step: "discovery",
                  status: "completed",
                  message: `Agent discovery complete via ERC-8004 (${agents.length} agent${agents.length === 1 ? "" : "s"})`
                });

              return JSON.stringify({
                success: true,
                count: agents.length,
                agents: agents,
                source: "blockchain"
              });
            } catch (blockchainError) {
              // Check if it's a rate limit error
              const isRateLimit = blockchainError.message?.includes("Rate limit") || 
                                  blockchainError.message?.includes("rate limit") ||
                                  blockchainError.info?.error?.message?.includes("Rate limit");
              
              if (isRateLimit) {
                console.log(`[AI-PURCHASE]    ⚠️  Rate limit exceeded, using local agents fallback`);
                sendEvent("tool", {
                  tool: "discover_agents",
                  status: "warning",
                  message: "Blockchain rate limit exceeded, using local agents",
                  error: blockchainError.message
                });
                sendEvent("workflow_step", {
                  step: "discovery",
                  status: "warning",
                  message: "ERC-8004 discovery rate-limited. Using local cache."
                });
                
                // Return empty agents list - agent will need to work with what's available
                return JSON.stringify({
                  success: true,
                  count: 0,
                  agents: [],
                  source: "local",
                  warning: "Blockchain rate limit exceeded. Try using local agents directly."
                });
              }
              
              throw blockchainError;
            }
          } catch (error) {
            console.error(`[AI-PURCHASE]    ❌ Error: ${error.message}`);
            sendEvent("tool", {
              tool: "discover_agents",
              status: "error",
              error: error.message
            });
            sendEvent("workflow_step", {
              step: "discovery",
              status: "error",
              message: error.message
            });
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

      const getAgentCardTool = tool(
        async (input) => {
          const { agentId } = input;
          console.log(`[AI-PURCHASE] 🛠️  [get_agent_card] Starting...`);
          console.log(`[AI-PURCHASE]    Input: { agentId: "${agentId}" }`);
          
          sendEvent("tool", {
            tool: "get_agent_card",
            status: "starting",
            input: { agentId }
          });

          try {
            let agentCard = null;

            try {
              const agentsResponse = await axios.get(`${SERVER_URL}/api/agents`);
              const localAgents = agentsResponse.data.agents || [];
              const localAgent = localAgents.find(
                (a) => a.id === agentId || a.id.toString() === agentId.toString()
              );

              if (localAgent) {
                const cardUrl = `${SERVER_URL}/api/agents/${localAgent.id}/.well-known/agent-card.json`;
                console.log(`[AI-PURCHASE]    📇 Fetching agent card from: ${cardUrl}`);
                const response = await axios.get(cardUrl);
                agentCard = response.data;
              }
            } catch (localError) {
              console.log(`[AI-PURCHASE]    ⚠️  Could not find local agent, trying tokenURI...`);
            }

            if (!agentCard) {
              const ercService = getERC8004Service();
              const discoveredAgents = await ercService.discoverAgents({
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
                console.log(`[AI-PURCHASE]    📇 Fetching agent card from: ${cardUrl}`);
                try {
                  const response = await axios.get(cardUrl);
                  agentCard = response.data;
                } catch {
                  const altCardUrl = `${SERVER_URL}/api/agents/${agentId}/.well-known/agent-card.json`;
                  console.log(`[AI-PURCHASE]    📇 Trying alternative endpoint: ${altCardUrl}`);
                  const response = await axios.get(altCardUrl);
                  agentCard = response.data;
                }
              }
            }

            if (!agentCard) {
              throw new Error(`Could not fetch agent card for agent ${agentId}`);
            }

            console.log(`[AI-PURCHASE]    ✅ Agent Card: ${agentCard.name || "Unknown"}`);
            sendEvent("tool", {
              tool: "get_agent_card",
              status: "completed",
              result: {
                agentId: agentId,
                name: agentCard.name,
                description: agentCard.description,
                url: agentCard.url,
                skills: agentCard.skills || [],
                capabilities: agentCard.capabilities || [],
              }
            });

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
            console.error(`[AI-PURCHASE]    ❌ Error: ${error.message}`);
            sendEvent("tool", {
              tool: "get_agent_card",
              status: "error",
              error: error.message
            });
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

      // REMOVED: get_trading_signal tool - now handled by DataAnalyzer agent via A2A

      // Payment processing tool (server-side, not agent-based)
      const processPaymentTool = tool(
        async (input) => {
          const { modelName } = input;
          console.log(`[AI-PURCHASE] 🛠️  [process_payment] Starting...`);
          console.log(`[AI-PURCHASE]    Model: ${modelName}`);
          
          sendEvent("workflow_step", {
            step: "payment",
            status: "starting",
            message: `Processing payment for ${modelName}`
          });
          
          sendEvent("tool", {
            tool: "process_payment",
            status: "starting",
            input: { modelName }
          });
          
          try {
            // Call payment endpoint directly (server-side payment, not agent-based)
            const paymentUrl = `${SERVER_URL}/api/payments/model-payment`;
            console.log(`[AI-PURCHASE]    📡 Calling payment endpoint: ${paymentUrl}`);
            
            const response = await axios.post(paymentUrl, { modelName }, {
              headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.data.success && response.data.payment) {
              const { txHash, hashscanUrl } = response.data.payment;
              console.log(`[AI-PURCHASE]    ✅ Payment processed! TxHash: ${txHash}`);
              
              sendEvent("workflow_step", {
                step: "payment",
                status: "completed",
                message: `Payment completed for ${modelName}: ${txHash.substring(0, 16)}...`
              });
              
              sendEvent("tool", {
                tool: "process_payment",
                status: "completed",
                result: { txHash, hashscanUrl, modelName }
              });
              
              return JSON.stringify({
                success: true,
                modelName,
                txHash,
                hashscanUrl,
                message: `Payment processed successfully for ${modelName}. Transaction: ${txHash.substring(0, 16)}...`
              });
            } else {
              throw new Error(response.data.error || "Payment failed");
            }
          } catch (error) {
            console.error(`[AI-PURCHASE]    ❌ Error: ${error.message}`);
            sendEvent("workflow_step", {
              step: "payment",
              status: "error",
              message: `Payment failed for ${modelName}: ${error.message}`
            });
            sendEvent("tool", {
              tool: "process_payment",
              status: "error",
              error: error.message
            });
            return JSON.stringify({
              success: false,
              error: error.response?.data?.error || error.message
            });
          }
        },
        {
          name: "process_payment",
          description:
            "Process payment for model access. This calls the server's payment endpoint to create a Hedera transaction. " +
            "Payment is handled server-side (not by PaymentProcessor agent). " +
            "Returns a JSON string with fields: {success: true, modelName: string, txHash: string, hashscanUrl: string}. " +
            "You MUST parse this JSON and extract the txHash value (it starts with '0x'). " +
            "Use this actual txHash value in your messages - do NOT use placeholder text. " +
            "After payment succeeds, you should notify PaymentProcessor agent for acknowledgment. " +
            "This tool should be called for each model (OpenAI, Qwen) that needs payment.",
          schema: z.object({
            modelName: z
              .string()
              .describe("Model name: 'OpenAI' or 'Qwen'")
          }),
        }
      );

      const respondToUserTool = tool(
        async (input) => {
          const { message } = input;
          console.log(`[AI-PURCHASE] 🛠️  [respond_to_user] Starting...`);
          console.log(`[AI-PURCHASE]    💬 Message to user: ${message}`);
          
          sendEvent("response", {
            type: "message",
            message: message
          });

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

      const sendMessageToAgentTool = tool(
        async (input) => {
          const { agentId, message, contextId: providedContextId } = input;

          // Determine workflow phase based on agent name
          let phase = "general";
          const agentIdLower = agentId.toLowerCase();
          if (agentIdLower.includes("payment")) {
            phase = "payment";
          } else if (agentIdLower.includes("dataanalyzer") || agentIdLower.includes("analyzer")) {
            phase = "signal";
          } else if (agentIdLower.includes("tradeexecutor") || agentIdLower.includes("executor")) {
            phase = "execution";
          }

          let outgoingMessage = message;
          if (phase === "signal") {
            outgoingMessage = appendSignalContext(message);
          }

          console.log(`[AI-PURCHASE] 🛠️  [send_message_to_agent] Starting...`);
          console.log(`[AI-PURCHASE]    Message: ${outgoingMessage}`);
          console.log(
            `[AI-PURCHASE]    Input: { agentId: "${agentId}", message: "${outgoingMessage.substring(0, 50)}..." }`
          );
          
          sendEvent("tool", {
            tool: "send_message_to_agent",
            status: "starting",
            input: { agentId, message: outgoingMessage.substring(0, 100) }
          });
          
          // Send agent conversation event
          sendEvent("agent_conversation", {
            from: "Orchestrator",
            to: agentId,
            message: outgoingMessage.substring(0, 200),
            phase: phase
          });
          
          // Send workflow step event
          if (phase !== "general") {
            sendEvent("workflow_step", {
              step: phase,
              status: "starting",
              message: `Starting ${phase} phase with ${agentId}`
            });
          }

          try {
            let agentName = `Agent ${agentId}`;
            let a2aEndpoint = `${SERVER_URL}/api/agents/${agentId}/a2a`;

            try {
              const agentsResponse = await axios.get(`${SERVER_URL}/api/agents`);
              const localAgents = agentsResponse.data.agents || [];
              // Try to find agent by ID first, then by name (case-insensitive)
              const localAgent = localAgents.find(
                (a) => a.id === agentId || 
                       a.id.toString() === agentId.toString() ||
                       a.name?.toLowerCase() === agentId.toLowerCase()
              );

              if (localAgent) {
                agentName = localAgent.name || agentName;
                // Use the actual agent ID from the local agent, not the provided agentId
                const actualAgentId = localAgent.id.toString();
                a2aEndpoint = `${SERVER_URL}/api/agents/${actualAgentId}/a2a`;
                console.log(`[AI-PURCHASE]    ✅ Found local agent: ${agentName} (ID: ${actualAgentId})`);
              } else {
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
                  console.log(`[AI-PURCHASE]    ⚠️  Could not fetch agent card, using default endpoint`);
                }
              }
            } catch (error) {
              console.log(`[AI-PURCHASE]    ⚠️  Could not fetch agent info, using default endpoint`);
            }

            console.log(`[AI-PURCHASE]    📤 A2A Endpoint: ${a2aEndpoint}`);

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

            console.log(`[AI-PURCHASE]    🔗 Context ID: ${contextId}`);
            if (paymentTxHash) {
              console.log(`[AI-PURCHASE]    💳 Payment already verified for this context`);
            }

            const messageId = await generateUUID();
            const params = {
              message: {
                kind: "message",
                role: "user",
                parts: [{ kind: "text", text: outgoingMessage }],
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

            const postToAgent = async (payload, axiosOptions = {}) => {
              const maxAttempts = 2;
              for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                  return await axios.post(
                    a2aEndpoint,
                    payload,
                    {
                      timeout: 45000,
                      ...axiosOptions,
                    }
                  );
                } catch (error) {
                  if (isConnectionResetError(error) && attempt < maxAttempts) {
                    const retryMsg = `Agent connection reset during ${phase} phase. Retrying (${attempt}/${maxAttempts - 1})...`;
                    console.warn(`[AI-PURCHASE] ⚠️ ${retryMsg}`);
                    sendEvent("status", {
                      type: "retrying",
                      message: retryMsg
                    });
                    if (phase !== "general") {
                      sendEvent("workflow_step", {
                        step: phase,
                        status: "warning",
                        message: retryMsg
                      });
                    }
                    await sleep(1200 * attempt);
                    continue;
                  }
                  throw error;
                }
              }
            };

            const httpResponse = await postToAgent(
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

            if (httpResponse.status === 402) {
              console.log("[AI-PURCHASE]    💳 Payment required");
              sendEvent("payment", {
                status: "required",
                message: "Payment required to continue"
              });

              const jsonRpcResponse = httpResponse.data;
              const paymentDetails = jsonRpcResponse.error?.data?.payment;

              if (paymentDetails) {
                console.log(`[AI-PURCHASE]    Amount: ${paymentDetails.amount} ${paymentDetails.token}`);
                console.log(`[AI-PURCHASE]    Address: ${paymentDetails.address}`);

                sendEvent("payment", {
                  status: "processing",
                  amount: paymentDetails.amount,
                  token: paymentDetails.token,
                  address: paymentDetails.address
                });

                const txHash = await executePayment(paymentDetails);
                console.log(`[AI-PURCHASE]    ✅ Payment executed! TxHash: ${txHash}`);

                const currentConv = conversations.get(contextId) || {};
                currentConv.paymentTxHash = txHash;
                conversations.set(contextId, currentConv);

                sendEvent("payment", {
                  status: "completed",
                  txHash: txHash
                });

                console.log("[AI-PURCHASE]    ⏳ Waiting 10 seconds for transaction to be indexed...");
                sendEvent("status", {
                  type: "waiting",
                  message: "Waiting for transaction to be indexed..."
                });
                await new Promise((resolve) => setTimeout(resolve, 10000));

                console.log("[AI-PURCHASE]    🔄 Retrying with payment proof...");
                sendEvent("status", {
                  type: "retrying",
                  message: "Retrying with payment proof..."
                });

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

                const retryResponse = await postToAgent(
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
                console.log("[AI-PURCHASE]    ✅ Response received from agent");

                const responseText = extractResponseText(JSON.stringify({
                  success: true,
                  response: response
                }));

                // Send agent response event
                sendEvent("agent_response", {
                  from: agentName,
                  response: responseText,
                  phase: phase,
                  fullResponse: response
                });
                
                // Send workflow step completion event
                if (phase !== "general") {
                  sendEvent("workflow_step", {
                    step: phase,
                    status: "completed",
                    message: `${phase} phase completed with ${agentName}`
                  });
                }

                sendEvent("response", {
                  type: "agent_response",
                  agentName: agentName,
                  message: responseText,
                  fullResponse: response
                });

                // Return structured JSON with extracted response text for easier parsing by agent
                const retryResponseData = {
                  success: true,
                  agentId: agentId,
                  agentName: agentName,
                  contextId: contextId,
                  paymentTxHash: txHash,
                  responseText: responseText,
                  fullResponse: response,
                };
                
                // For DataAnalyzer responses, include the full signal data prominently
                if (phase === "signal" && responseText) {
                  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
                  if (jsonMatch) {
                    try {
                      const signalData = JSON.parse(jsonMatch[1]);
                      retryResponseData.signalData = signalData;
                    } catch (e) {
                      retryResponseData.signalDataRaw = jsonMatch[1];
                    }
                  }
                }
                
                return JSON.stringify(retryResponseData);
              } else {
                throw new Error("Payment required but no payment details provided");
              }
            }

            const response = httpResponse.data;
            console.log("[AI-PURCHASE]    ✅ Response received from agent");

            const responseText = extractResponseText(JSON.stringify({
              success: true,
              response: response
            }));

            // Send agent response event
            sendEvent("agent_response", {
              from: agentName,
              response: responseText,
              phase: phase,
              fullResponse: response
            });
            
            // Send workflow step completion event
            if (phase !== "general") {
              sendEvent("workflow_step", {
                step: phase,
                status: "completed",
                message: `${phase} phase completed with ${agentName}`
              });
            }

            sendEvent("response", {
              type: "agent_response",
              agentName: agentName,
              message: responseText,
              fullResponse: response
            });

            // Return structured JSON with extracted response text for easier parsing by agent
            const responseData = {
              success: true,
              agentId: agentId,
              agentName: agentName,
              contextId: contextId,
              paymentTxHash: paymentTxHash,
              responseText: responseText, // Extracted text for easy reading
              fullResponse: response, // Full JSON-RPC response for data extraction
            };
            
            // For DataAnalyzer responses, include the full signal data prominently
            if (phase === "signal" && responseText) {
              // Try to extract JSON signal data from responseText
              const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
              if (jsonMatch) {
                try {
                  const signalData = JSON.parse(jsonMatch[1]);
                  responseData.signalData = signalData; // Include parsed signal for easy access
                } catch (e) {
                  // If parsing fails, include raw JSON text
                  responseData.signalDataRaw = jsonMatch[1];
                }
              }
            }
            
            return JSON.stringify(responseData);
          } catch (error) {
            console.error(`[AI-PURCHASE]    ❌ Error: ${error.message}`);
            if (error.response) {
              console.error(`[AI-PURCHASE]    Status: ${error.response.status}`);
              console.error(`[AI-PURCHASE]    Data: ${JSON.stringify(error.response.data)}`);
            }

            const connectionReset = isConnectionResetError(error);
            const friendlyMessage = connectionReset
              ? `Agent connection reset during ${phase} phase. Please retry once the agents are reachable.`
              : (error.response?.data?.error || error.message || "Unknown error");

            if (phase !== "general") {
              sendEvent("workflow_step", {
                step: phase,
                status: connectionReset ? "warning" : "error",
                message: friendlyMessage
              });
            }

            sendEvent("error", {
              tool: "send_message_to_agent",
              error: friendlyMessage,
              details: error.message,
              step: phase
            });
            return JSON.stringify({
              success: false,
              error: friendlyMessage,
            });
          }
        },
        {
          name: "send_message_to_agent",
          description:
            "Send a message to an agent via the A2A (Agent-to-Agent) protocol. " +
            "Returns a JSON string with fields: {success: true, agentId: string, agentName: string, responseText: string, fullResponse: object}. " +
            "For DataAnalyzer responses, the JSON also includes signalData field containing the parsed trading signal JSON. " +
            "You MUST parse this JSON response to extract the actual responseText or signalData values. " +
            "DO NOT use placeholder text in your messages - extract and use the actual values from the tool response. " +
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


      // System prompt - Orchestrator Agent Workflow
      const traderContextSection = selectedTraderId
        ? `CURRENT TARGET TRADER:
- Name: ${selectedTraderName || selectedTraderId}
- Trader ID: ${selectedTraderId}
- Signal Endpoint: ${signalEndpointHint}
- Asset Class: Binance perpetual futures (crypto pairs such as BTCUSDT, SOLUSDT, ETHUSDT). Stocks like AAPL/GOOG are NOT valid.`
        : `CURRENT TARGET TRADER:
- Name: ${targetTraderLabel}
- Trader ID: Not provided (derive from the user's request)
- Signal Endpoint Pattern: ${signalEndpointHint}
- Asset Class: Binance perpetual futures (crypto pairs ending with USDT). NEVER mention equities.`;

      const systemPrompt = `You are an Orchestrator Agent that coordinates a complete trading workflow using A2A (Agent-to-Agent) protocol.

${traderContextSection}

**WORKFLOW EXECUTION MODEL:**
- You are executing a SEQUENTIAL workflow - one step at a time, in order
- Call ONE tool, get its result, process the result, then call the NEXT tool
- NEVER call multiple tools at the same time - always wait for tool result before proceeding
- Tool results are JSON strings - parse them to extract actual values (txHash, signal data)
- After parsing a tool result, use the extracted values in your next message (not placeholders)
- Phase order: Discovery → Payment → Signal → Execution → Completion
- Complete each phase 100% before starting the next phase
- If you see placeholder text like "[ACTUAL_TXHASH_FROM_TOOL]" in your messages, you made an error - you must extract real values from tool responses

When a user requests to purchase trading signals and execute trades, you MUST follow this exact workflow:

**PHASE 1: DISCOVERY**
1. Use discover_agents to find these three agents:
   - PaymentProcessor (capabilities: ["process_payment", "verify", "escrow"])
   - DataAnalyzer (capabilities: ["analyze", "predict", "report"])
   - TradeExecutor (capabilities: ["execute", "trade", "exchange"])
2. Verify all three agents are found. If any are missing, use respond_to_user to inform the user.

**PHASE 2: PAYMENT**
1. Extract the model name(s) from the user's request (OpenAI, Qwen, or both)
2. For EACH model:
   a. Call process_payment tool with modelName
   b. WAIT for the tool result - it returns JSON with success, txHash fields
   c. Parse the JSON response and extract the txHash value (it starts with "0x")
3. AFTER all process_payment calls complete, send ONE A2A message to PaymentProcessor:
   "Payment processed for [list all models]. Transactions: [list all txHashes]. Please acknowledge."
4. WAIT for PaymentProcessor's acknowledgment
5. Use respond_to_user ONCE: "✅ Payment complete for [all models]"
6. IMMEDIATELY proceed to Phase 3 (do NOT wait or pause)
7. If payment fails, stop immediately and inform the user via respond_to_user.

**PHASE 3: SIGNAL RETRIEVAL**
1. ONLY start this phase AFTER Phase 2 is completely finished (all payments confirmed)
2. For EACH model, complete this ENTIRE sequence:
   a. Send A2A message to DataAnalyzer: "Get the latest trading signal from [modelName] AI trading model (trader_id: ${selectedTraderId || 'USE_THE_USER_PROVIDED_TRADER_ID'}). Use the Go trading API endpoint ${signalEndpointHint} to fetch the JSON. I need the complete signal including: decisions (long/short/wait actions with symbols and quantities), chain_of_thought, input_prompt, and account_state. These signals must be Binance perpetual futures pairs (no equities)."
   b. WAIT for DataAnalyzer's complete response
   c. Parse the response - the send_message_to_agent tool returns JSON with responseText and possibly signalData
   d. Extract the FULL JSON signal data - look for signalData field in the tool response, or parse the JSON block from responseText
   e. Store this complete JSON data as a variable - you MUST send this exact JSON string to TradeExecutor later (not placeholder text)
   f. If the response mentions equities (AAPL/GOOG/etc.) or anything outside Binance futures, ask DataAnalyzer to correct it using the proper endpoint.
   g. Format a summary of decisions (e.g., "HYPEUSDT close_long, ALL wait")
   h. Use respond_to_user ONCE: "📊 Trading signal retrieved for [modelName]: [YOUR_FORMATTED_SUMMARY]"
3. CRITICAL: Only proceed to Phase 4 AFTER all signals are retrieved and stored

**PHASE 4: TRADE EXECUTION**
1. ONLY start this phase AFTER Phase 3 is completely finished (all signals retrieved)
2. You should have stored the complete JSON signal data from DataAnalyzer responses (from signalData field or parsed from responseText)
3. Send A2A message to TradeExecutor: "Execute trades based on the following trading signals: [PASTE_THE_ACTUAL_JSON_STRING_YOU_STORED]"
4. IMPORTANT: The message should contain the actual JSON data as a string, not placeholder text like "[PASTE_THE_COMPLETE_JSON_DATA_YOU_STORED]"
5. Example format: "Execute trades based on the following trading signals: {\"trader_id\":\"qwen_trader\",\"decisions\":[...],...}"
6. WAIT for TradeExecutor's response before continuing
7. Use respond_to_user ONCE: "🚀 Trade execution initiated. TradeExecutor received and processed the signals."

**PHASE 5: COMPLETION**
1. Use respond_to_user ONCE with final summary:
   "✅ Complete! All trades executed successfully based on [modelNames] trading signals.
   📊 Signals retrieved and processed.
   🚀 TradeExecutor has received and executed the trades according to the AI trading model decisions."
2. CRITICAL: After sending the completion message, STOP. Do NOT call any more tools. The workflow is complete.

**CRITICAL EXECUTION RULES:**
- EXECUTE PHASES SEQUENTIALLY - complete Phase 1 FULLY, THEN Phase 2 FULLY, THEN Phase 3 FULLY, THEN Phase 4 FULLY, THEN Phase 5 ONCE
- NEVER start a phase before the previous phase is completely finished
- NEVER call tools from multiple phases at the same time
- ALWAYS WAIT for tool responses before proceeding - tools return JSON strings that you must parse
- When a tool returns a result, parse the JSON string to extract actual values (txHash, signal data, etc.)
- Use the ACTUAL extracted values in your messages - never use placeholder text like "[ACTUAL_TXHASH_FROM_TOOL]"
- Maintain separate contextId for each agent conversation
- If any phase fails, stop immediately and inform the user
- Use respond_to_user ONCE per phase completion (not multiple times)
- After Phase 5 completion message, STOP - do not call any more tools

**CRITICAL DATA EXTRACTION RULES:**
- When process_payment returns a result, EXTRACT the actual txHash value (not abc123)
- When DataAnalyzer responds, EXTRACT the actual JSON signal data from the response (look for JSON blocks or parse the response)
- When sending to TradeExecutor, INCLUDE the actual extracted JSON signal data (not placeholder text)
- Always use REAL data from tool responses, never use placeholder or example text
- The format [something] in instructions means replace this with actual data, not include this literal text

**Message Format for respond_to_user:**
- Do NOT add "💬 Orchestrator →" or "📨" prefixes in respond_to_user messages
- Use REAL data: "✅ Payment processed for OpenAI. Transaction: [ACTUAL_TXHASH_FROM_TOOL]"
- The system will automatically format agent conversations from send_message_to_agent calls`;

      console.log("[AI-PURCHASE] ✅ Groq model initialized");
      sendEvent("status", { 
        type: "ready", 
        message: "AI agent ready. Processing your request..." 
      });

      // Create agent with all tools
      console.log("[AI-PURCHASE] 🛠️  Creating agent with tools...");
      const agent = createAgent({
        model: model,
        systemPrompt: systemPrompt,
        tools: [
          discoverAgentsTool,
          getAgentCardTool,
          processPaymentTool, // Server-side payment processing
          // getTradingSignalTool REMOVED - now handled by DataAnalyzer agent via A2A
          respondToUserTool,
          sendMessageToAgentTool,
        ],
        // Prevent infinite loops and ensure sequential execution
        recursionLimit: 50, // Increase from default 25 to allow full workflow
        maxIterations: 50, // Maximum tool calls before stopping
      });

      console.log("[AI-PURCHASE] ✅ Agent created");
      console.log("[AI-PURCHASE] 🤔 Agent thinking...");

      sendEvent("status", { 
        type: "thinking", 
        message: "Agent is processing your request..." 
      });

      // Invoke agent with retry logic (Groq API can have connection issues)
      // Reduced retries and faster delays for better UX
      let response;
      const maxRetries = 2; // Reduced from 3 to 2
      let lastError;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[AI-PURCHASE] 📡 Invoking agent (attempt ${attempt}/${maxRetries})...`);
          response = await agent.invoke({
            messages: [{ role: "user", content: query }],
          });
          break; // Success
        } catch (error) {
          lastError = error;
          
          // Log detailed error information for tool_use_failed errors
          if (error.message?.includes("tool_use_failed") || error.message?.includes("Failed to call a function")) {
            console.error(`[AI-PURCHASE] ❌ Tool calling error detected:`);
            console.error(`[AI-PURCHASE]    Error: ${error.message}`);
            if (error.response?.data) {
              console.error(`[AI-PURCHASE]    Response data:`, JSON.stringify(error.response.data, null, 2));
            }
          }
          
          if (attempt === maxRetries) {
            throw error;
          }
          const delay = 1000; // Faster retry: 1s instead of 2s, 4s
          console.log(`[AI-PURCHASE] ⚠️  Attempt ${attempt} failed: ${error.message}`);
          console.log(`[AI-PURCHASE] ⏳ Retrying in ${delay/1000} seconds...`);
          sendEvent("status", {
            type: "retrying",
            message: `Connection issue, retrying... (attempt ${attempt}/${maxRetries})`
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      console.log("[AI-PURCHASE] ✅ Agent completed processing");

      // Extract and send final responses
      if (response.messages && response.messages.length > 0) {
        for (const msg of response.messages) {
          if (msg.role === "tool") {
            try {
              const toolResult = JSON.parse(msg.content);

              if (toolResult.success && toolResult.message) {
                sendEvent("response", {
                  type: "final",
                  message: toolResult.message
                });
              }

              if (toolResult.success && toolResult.response?.result) {
                const result = toolResult.response.result;
                if (result.kind === "message" && result.parts) {
                  const textParts = result.parts
                    .filter((p) => p.kind === "text")
                    .map((p) => p.text);
                  if (textParts.length > 0) {
                    sendEvent("response", {
                      type: "agent_final",
                      agentName: toolResult.agentName || "Agent",
                      message: textParts.join(" ")
                    });
                  }
                }
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      console.log("[AI-PURCHASE] ✅ All responses sent");
      sendEvent("complete", { 
        success: true,
        message: "Agent processing complete"
      });

    } catch (error) {
      console.error("[AI-PURCHASE] ❌ Error:", error.message);
      if (error.stack) {
        console.error("[AI-PURCHASE] Stack:", error.stack);
      }
      sendEvent("error", {
        type: "fatal",
        error: error.message,
        stack: error.stack
      });
    } finally {
      console.log("[AI-PURCHASE] ==========================================");
      console.log("[AI-PURCHASE] 🏁 Closing SSE connection");
      console.log("[AI-PURCHASE] ==========================================");
      res.end();
    }
  });

  return router;
}

