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
    const { query } = req.body;

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

    // Helper to send SSE events
    const sendEvent = (type, data) => {
      console.log(`[AI-PURCHASE] 📤 SSE Event [${type}]:`, JSON.stringify(data));
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Initialize Groq model
      console.log("[AI-PURCHASE] 🤖 Initializing Groq model...");
      const model = new ChatGroq({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        apiKey: GROQ_CONFIG.API_KEY,
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

      const getTradingSignalTool = tool(
        async (input) => {
          const { traderId } = input;
          console.log(`[AI-PURCHASE] 🛠️  [get_trading_signal] Starting...`);
          console.log(`[AI-PURCHASE]    Input: { traderId: "${traderId}" }`);
          
          sendEvent("tool", {
            tool: "get_trading_signal",
            status: "starting",
            input: { traderId }
          });

          try {
            // Map model names to trader_ids (both use "groq" model, so must use trader_id)
            let actualTraderId = traderId.toLowerCase().trim();
            
            // Handle various input formats - always map to correct trader_id
            if (actualTraderId.includes("openai") || actualTraderId === "openai") {
              actualTraderId = "openai_trader";
            } else if (actualTraderId.includes("qwen") || actualTraderId === "qwen") {
              actualTraderId = "qwen_trader";
            } else if (actualTraderId === "openai_trader" || actualTraderId === "qwen_trader") {
              // Already correct format
            } else {
              // Try to fetch available traders to see what's available
              try {
                const tradersResponse = await axios.get(`${TRADING_API_URL}/api/traders`, { timeout: 5000 });
                const traders = tradersResponse.data || [];
                console.log(`[AI-PURCHASE]    📋 Available traders: ${JSON.stringify(traders.map(t => t.trader_id))}`);
                // Use the provided traderId as-is if it matches a known trader
                const matchedTrader = traders.find(t => 
                  t.trader_id === traderId || 
                  t.trader_id.toLowerCase() === actualTraderId ||
                  t.trader_name.toLowerCase().includes(actualTraderId)
                );
                if (matchedTrader) {
                  actualTraderId = matchedTrader.trader_id;
                } else if (traders.length > 0) {
                  // Default to first trader if no match
                  actualTraderId = traders[0].trader_id;
                  console.log(`[AI-PURCHASE]    ⚠️  No match found, using default: ${actualTraderId}`);
                }
              } catch (e) {
                console.log(`[AI-PURCHASE]    ⚠️  Could not fetch traders list: ${e.message}`);
              }
            }
            
            const url = `${TRADING_API_URL}/api/trading-signal?trader_id=${actualTraderId}`;
            console.log(`[AI-PURCHASE]    📡 Fetching trading signal from: ${url}`);
            
            const response = await axios.get(url, { timeout: 10000 });
            const signal = response.data;
            
            console.log(`[AI-PURCHASE]    ✅ Trading signal retrieved`);
            console.log(`[AI-PURCHASE]    Trader: ${signal.trader_name || actualTraderId}`);
            console.log(`[AI-PURCHASE]    Cycle: ${signal.cycle_number || 'N/A'}`);
            
            sendEvent("tool", {
              tool: "get_trading_signal",
              status: "completed",
              result: { traderId: actualTraderId, hasSignal: true }
            });

            return JSON.stringify({
              success: true,
              traderId: actualTraderId,
              traderName: signal.trader_name,
              aiModel: signal.ai_model,
              timestamp: signal.timestamp,
              cycleNumber: signal.cycle_number,
              chainOfThought: signal.chain_of_thought || "No chain of thought available",
              inputPrompt: signal.input_prompt || "No input prompt available",
              rawResponse: signal.raw_response || "No raw response available",
              decisions: signal.decisions || [],
              accountState: signal.account_state || {},
              errorMessage: signal.error_message || null
            });
          } catch (error) {
            console.error(`[AI-PURCHASE]    ❌ Error: ${error.message}`);
            sendEvent("tool", {
              tool: "get_trading_signal",
              status: "error",
              error: error.message
            });
            return JSON.stringify({
              success: false,
              error: error.response?.data?.error || error.message,
              traderId: traderId
            });
          }
        },
        {
          name: "get_trading_signal",
          description:
            "Get the latest trading SIGNAL (the trading decision: long/short/wait) from a trading AI model. " +
            "This returns the actual trading decision so the user can copy what to do at that moment. " +
            "Returns: decisions (the main output - long/short/wait with symbols, quantities, leverage), " +
            "plus chain_of_thought (AI reasoning) and input_prompt (context). " +
            "Use this when the user asks for trading signals, decisions, or what to do from OpenAI or Qwen models. " +
            "IMPORTANT: Always use trader_id parameter (e.g., 'openai_trader', 'qwen_trader') since both traders use 'groq' as the model name. " +
            "The traderId can be 'openai_trader', 'qwen_trader', or just 'openai'/'qwen' (will be mapped automatically to trader_id).",
          schema: z.object({
            traderId: z
              .string()
              .describe(
                "Trader ID or name. Examples: 'openai_trader', 'qwen_trader', 'openai', 'qwen'. " +
                "Will be automatically mapped to the correct trader_id. Note: Both traders use 'groq' model, so always use trader_id, not model name."
              ),
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
          console.log(`[AI-PURCHASE] 🛠️  [send_message_to_agent] Starting...`);
          console.log(`[AI-PURCHASE]    Message: ${message}`);
          console.log(`[AI-PURCHASE]    Input: { agentId: "${agentId}", message: "${message.substring(0, 50)}..." }`);
          
          sendEvent("tool", {
            tool: "send_message_to_agent",
            status: "starting",
            input: { agentId, message: message.substring(0, 100) }
          });

          try {
            let agentName = `Agent ${agentId}`;
            let a2aEndpoint = `${SERVER_URL}/api/agents/${agentId}/a2a`;

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
                console.log("[AI-PURCHASE]    ✅ Response received from agent");

                const responseText = extractResponseText(JSON.stringify({
                  success: true,
                  response: response
                }));

                sendEvent("response", {
                  type: "agent_response",
                  agentName: agentName,
                  message: responseText,
                  fullResponse: response
                });

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

            const response = httpResponse.data;
            console.log("[AI-PURCHASE]    ✅ Response received from agent");

            const responseText = extractResponseText(JSON.stringify({
              success: true,
              response: response
            }));

            sendEvent("response", {
              type: "agent_response",
              agentName: agentName,
              message: responseText,
              fullResponse: response
            });

            return JSON.stringify({
              success: true,
              agentId: agentId,
              agentName: agentName,
              contextId: contextId,
              paymentTxHash: paymentTxHash,
              response: response,
            });
          } catch (error) {
            console.error(`[AI-PURCHASE]    ❌ Error: ${error.message}`);
            if (error.response) {
              console.error(`[AI-PURCHASE]    Status: ${error.response.status}`);
              console.error(`[AI-PURCHASE]    Data: ${JSON.stringify(error.response.data)}`);
            }
            sendEvent("error", {
              tool: "send_message_to_agent",
              error: error.message
            });
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

      // System prompt
      const systemPrompt = `You are a User Agent that helps users discover and communicate with specialized agents 
on the Hedera blockchain using the A2A (Agent-to-Agent) protocol.

Your workflow:
1. When a user asks about trading signals, decisions, or what to do (long/short/wait) from AI models (like OpenAI or Qwen):
   - FIRST, use get_trading_signal with the trader_id (e.g., "openai_trader" or "qwen_trader") to get the ACTUAL trading signal
   - This tool returns the real trading decision (long/short/wait) so the user can copy what to do at that moment
   - The trading signal includes: decisions (actual trading actions - THIS IS THE MOST IMPORTANT - long/short/wait with symbols and quantities)
   - Also includes: input_prompt, chain_of_thought (AI reasoning), and raw_response for context
   - ALWAYS highlight the DECISIONS prominently at the end - show what the AI decided: long, short, or wait, with symbols, quantities, and leverage
   - The user wants to see the trading decision so they can copy it - make this the main focus

2. When a user asks a question or makes a request that's NOT about trading signals:
   - First, try to use discover_agents to find relevant agents. This will first check for local agents on the server, 
     and fall back to blockchain discovery if needed.
   - If blockchain discovery fails due to rate limits, use the local agents that are returned.
   - The user's query often mentions specific AI models (like OpenAI or Qwen) - look for agents with matching names or capabilities.
   - Analyze the discovered agents to select the most appropriate one based on the user's request.

3. Get detailed information about the selected agent (if needed):
   - Use get_agent_card with the agent's ID to understand its capabilities, endpoint, and description
   - This helps you understand if the agent is suitable for the user's request
   - If the agent card fetch fails, you can still try to communicate with the agent using its ID

4. Communicate with the agent (if needed):
   - Use send_message_to_agent to send the user's message (or a refined version based on the agent's capabilities)
   - Include any necessary context from the conversation
   - The tool handles payment automatically if required
   - For follow-up messages to the same agent, use the same contextId to maintain conversation context

5. Handle responses and communicate with the user:
   - When you get trading signal data, present it clearly showing:
     * The input prompt that was sent to the AI
     * The chain of thought (AI's reasoning process)
     * The final decisions (long/short/wait actions with symbols, quantities, etc.) - THIS IS THE MOST IMPORTANT PART
     * Any account state information (equity, PnL, positions)
   - Use respond_to_user to relay all information to the user
   - Format trading data nicely - highlight the decisions prominently since that's what the user wants to see
   - Always end with respond_to_user - never just call a tool without following up

Key points:
- For trading signal requests: ALWAYS use get_trading_signal FIRST (this gets REAL trading signal from the Go API server at ${TRADING_API_URL})
- The trading signal contains DECISIONS (long/short/wait actions) - THIS IS WHAT THE USER WANTS TO SEE
- The user wants to copy the trading decision (long/short/wait) at that moment - show the decisions prominently
- The decisions array contains: action (long/short/wait), symbol, quantity, leverage, price - format this clearly
- Also show chain_of_thought and input_prompt for context, but DECISIONS should be the main focus
- Local agents are preferred and checked first - these are agents registered on the local server
- If blockchain discovery fails due to rate limits, work with local agents or inform the user
- Communication happens via A2A (Agent-to-Agent) protocol over JSON-RPC
- Some agents require payment (handled automatically by send_message_to_agent)
- Use contextId to maintain conversation state across multiple messages
- Always use respond_to_user to communicate with the user - this is how you provide answers and ask questions
- After every tool call, use respond_to_user to relay the results to the user
- Present trading decisions clearly - the user wants to see what the AI decided (long/short/wait) at the end of your response`;

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
          getTradingSignalTool, // NEW: Tool to get actual trading signals from Go API
          respondToUserTool,
          sendMessageToAgentTool,
        ],
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

