import { Agent } from "../models/Agent.js";
import { ERC8004Service } from "./ERC8004Service.js";
import { X402Service } from "./X402Service.js";
import { GroqService } from "./GroqService.js";

/**
 * Agent Manager - Manages multiple agents on the server
 */
export class AgentManager {
  constructor() {
    this.agents = new Map(); // agentId -> Agent
    this.agentsByName = new Map(); // name -> Agent
    // Lazy-load services to avoid connection issues at startup
    this._erc8004Service = null;
    this.x402Service = new X402Service();
    this.groqService = new GroqService();

    // Capability index for discovery
    this.capabilityIndex = new Map(); // capability -> Set of agentIds
  }

  /**
   * Lazy-load ERC8004Service to avoid connection issues at startup
   */
  getERC8004Service() {
    if (!this._erc8004Service) {
      this._erc8004Service = new ERC8004Service();
    }
    return this._erc8004Service;
  }

  /**
   * Find existing agent on-chain by endpoint URI
   * @param {string} endpoint - Agent endpoint URI
   * @param {string} ownerAddress - Owner address to filter by
   * @returns {Promise<string|null>} AgentId if found, null otherwise
   */
  async findExistingAgentByEndpoint(endpoint, ownerAddress) {
    try {
      const ercService = this.getERC8004Service();
      // Query recent Registered events for the owner
      const currentBlock = await ercService.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000); // Last 100k blocks

      const events = await ercService.identityRegistry.queryFilter(
        "Registered",
        fromBlock,
        "latest"
      );

      // Extract agent type from endpoint (e.g., "trading", "payment", "analyzer")
      // This is the last part of the path after "/api/agents/"
      const extractAgentType = (uri) => {
        const match = uri.match(/\/api\/agents\/([^\/\?]+)/);
        return match ? match[1].toLowerCase() : null;
      };

      const targetAgentType = extractAgentType(endpoint);

      if (!targetAgentType) {
        // Can't determine agent type from endpoint, skip check
        return null;
      }

      // Find event where owner matches and endpoint contains same agent type
      for (const event of events) {
        try {
          const parsed = event.args;
          if (parsed.owner.toLowerCase() === ownerAddress.toLowerCase()) {
            const tokenURI = parsed.tokenURI || "";
            const uriAgentType = extractAgentType(tokenURI);

            // Match if agent type matches (e.g., both are "trading")
            if (uriAgentType && uriAgentType === targetAgentType) {
              const agentId = parsed.agentId.toString();

              // Verify agent still exists and owner still matches
              try {
                const ercService = this.getERC8004Service();
                const currentOwner = await ercService.getAgentOwner(
                  agentId
                );
                if (currentOwner.toLowerCase() === ownerAddress.toLowerCase()) {
                  return agentId;
                }
              } catch {
                // Agent might have been burned/transferred, skip
                continue;
              }
            }
          }
        } catch (error) {
          continue;
        }
      }

      return null;
    } catch (error) {
      console.warn(`Error finding existing agent:`, error.message);
      return null;
    }
  }

  /**
   * Register a new agent or load existing one
   * @param {Object} agentConfig - Agent configuration
   * @param {boolean} skipOnChainCheck - Skip checking for existing on-chain agent (default: false)
   * @returns {Promise<Agent>}
   */
  async registerAgent(agentConfig, skipOnChainCheck = false) {
    try {
      const agent = new Agent(agentConfig);

      // Register with ERC-8004 if not already registered
      if (!agent.registered && !agent.id) {
        // Check if agent with this endpoint already exists on-chain
        if (!skipOnChainCheck && agentConfig.endpoint) {
          const { HEDERA_CONFIG } = await import("../config/hedera.js");
          const ownerAddress =
            HEDERA_CONFIG.OWNER_EVM_ADDRESS || HEDERA_CONFIG.EVM_ADDRESS;

          const existingAgentId = await this.findExistingAgentByEndpoint(
            agentConfig.endpoint,
            ownerAddress
          );

          if (existingAgentId) {
            console.log(
              `🔍 Found existing on-chain agent for ${agent.name}: ID ${existingAgentId}`
            );
            agent.id = existingAgentId;
            agent.registered = true;
            // Verify agent exists
            try {
              const ercService = this.getERC8004Service();
              const owner = await ercService.getAgentOwner(
                existingAgentId
              );
              agent.walletAddress = owner;
            } catch (error) {
              console.warn(
                `Agent ${existingAgentId} not found on-chain, will register new`
              );
              agent.id = null;
              agent.registered = false;
            }
          }
        }

        // Only register on-chain if we didn't find an existing agent AND we're not skipping on-chain registration
        if (!agent.id && !skipOnChainCheck) {
          try {
            const ercService = this.getERC8004Service();
            const registration = await agent.register(ercService);
            agent.id = registration.agentId;
          } catch (error) {
            console.warn(`Failed to register agent ${agent.name} on-chain: ${error.message}`);
            console.warn(`   Agent will work locally with temporary ID`);
            // Generate a temporary local ID if blockchain registration fails
            agent.id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            agent.registered = false;
          }
        } else if (!agent.id) {
          // Skip on-chain registration, use local ID
          agent.id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          agent.registered = false;
        }
      }

      // Add to manager
      this.agents.set(agent.id, agent);
      if (agent.name) {
        this.agentsByName.set(agent.name, agent);
      }

      // Index capabilities
      agent.getCapabilities().forEach((capability) => {
        if (!this.capabilityIndex.has(capability)) {
          this.capabilityIndex.set(capability, new Set());
        }
        this.capabilityIndex.get(capability).add(agent.id);
      });

      const action = agent.registered ? "loaded" : "registered";
      console.log(`✅ Agent ${action}: ${agent.name} (ID: ${agent.id})`);
      return agent;
    } catch (error) {
      console.error("Error registering agent:", error);
      throw error;
    }
  }

  /**
   * Get agent by ID
   * @param {string} agentId - Agent ID
   * @returns {Agent|null}
   */
  getAgent(agentId) {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get agent by name
   * @param {string} name - Agent name
   * @returns {Agent|null}
   */
  getAgentByName(name) {
    return this.agentsByName.get(name) || null;
  }

  /**
   * Get all agents
   * @returns {Array<Agent>}
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Discover agents by capability
   * @param {string} capability - Required capability
   * @returns {Array<Agent>}
   */
  discoverAgentsByCapability(capability) {
    const agentIds = this.capabilityIndex.get(capability) || new Set();
    return Array.from(agentIds)
      .map((id) => this.agents.get(id))
      .filter((agent) => agent && agent.status === "online");
  }

  /**
   * Update agent status
   * @param {string} agentId - Agent ID
   * @param {string} status - New status
   */
  updateAgentStatus(agentId, status) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.setStatus(status);
    }
  }

  /**
   * Remove agent
   * @param {string} agentId - Agent ID
   */
  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      // Remove from capability index
      agent.getCapabilities().forEach((capability) => {
        const agentSet = this.capabilityIndex.get(capability);
        if (agentSet) {
          agentSet.delete(agentId);
        }
      });

      this.agents.delete(agentId);
      if (agent.name) {
        this.agentsByName.delete(agent.name);
      }
    }
  }

  /**
   * Get x402 service
   */
  getX402Service() {
    return this.x402Service;
  }

  /**
   * Get Groq AI service
   */
  getGroqService() {
    return this.groqService;
  }

  /**
   * Get A2A client for sending messages to other agents
   * Returns null if agent not found
   */
  getA2AClient(agentId) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return null;
    }
    // Return the agent's A2A endpoint URL
    // The actual client will be created by A2AService
    return {
      agentId: agent.id,
      agentName: agent.name,
      endpoint: agent.endpoint,
      a2aEndpoint: agent.endpoint
        .replace("/api/agents/", "/api/agents/")
        .replace(/\/[^\/]+$/, `/${agent.id}/a2a`),
    };
  }

  /**
   * Process message with AI
   * @param {string} agentId - Agent ID
   * @param {string} message - Message content
   * @param {string} fromAgentId - Sender agent ID
   * @param {Object} context - Additional context
   * @returns {Promise<string>}
   */
  async processMessageWithAI(agentId, message, fromAgentId, context = {}) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error("Agent not found");
    }

    if (!agent.aiEnabled) {
      return `Agent ${agent.name} received: ${message}`;
    }

    // SPECIAL HANDLING: DataAnalyzer agent - fetch real trading signals
    if (agent.name === "DataAnalyzer" && message.toLowerCase().includes("trading signal")) {
      try {
        const tradingSignal = await this.fetchTradingSignalForDataAnalyzer(message);
        if (tradingSignal) {
          // Include real signal data in context so AI can format it
          context.realTradingSignal = tradingSignal;
          console.log(`[AgentManager] Fetched real trading signal for DataAnalyzer: ${tradingSignal.trader_id || 'unknown'}`);
        }
      } catch (error) {
        console.error(`[AgentManager] Error fetching trading signal for DataAnalyzer:`, error.message);
        // Continue without signal - let AI handle error
      }
    }

    try {
      return await this.groqService.processAgentMessage({
        agent,
        message,
        fromAgentId,
        context,
      });
    } catch (error) {
      console.error(`Error processing AI message for agent ${agentId}:`, error);
      // Fallback response if AI fails
      return `Agent ${agent.name} received your message: ${message}. (AI processing unavailable)`;
    }
  }

  /**
   * Fetch trading signal for DataAnalyzer agent
   * Extracts model name from message and fetches from Go API
   */
  async fetchTradingSignalForDataAnalyzer(message) {
    const TRADING_API_URL = process.env.TRADING_API_URL || "http://172.23.240.1:8080";
    const axios = (await import("axios")).default;
    
    // Extract model name from message
    let traderId = null;
    const messageLower = message.toLowerCase();
    
    if (messageLower.includes("openai")) {
      traderId = "openai_trader";
    } else if (messageLower.includes("qwen")) {
      traderId = "qwen_trader";
    } else {
      // Try to find model name in message
      const openaiMatch = message.match(/openai/i);
      const qwenMatch = message.match(/qwen/i);
      if (openaiMatch) traderId = "openai_trader";
      else if (qwenMatch) traderId = "qwen_trader";
    }
    
    if (!traderId) {
      console.log(`[AgentManager] Could not extract trader_id from message: ${message.substring(0, 100)}`);
      return null;
    }
    
    try {
      const url = `${TRADING_API_URL}/api/trading-signal?trader_id=${traderId}`;
      console.log(`[AgentManager] Fetching trading signal from: ${url}`);
      
      const response = await axios.get(url, { timeout: 10000 });
      
      if (response.data && response.data.success !== false) {
        console.log(`[AgentManager] ✅ Trading signal retrieved: ${traderId}`);
        return response.data;
      } else {
        console.warn(`[AgentManager] Trading signal API returned error for ${traderId}`);
        return null;
      }
    } catch (error) {
      console.error(`[AgentManager] Error fetching trading signal:`, error.message);
      throw error;
    }
  }
}
