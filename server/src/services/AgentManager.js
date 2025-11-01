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
    this.erc8004Service = new ERC8004Service();
    this.x402Service = new X402Service();
    this.groqService = new GroqService();
    
    // Capability index for discovery
    this.capabilityIndex = new Map(); // capability -> Set of agentIds
  }

  /**
   * Register a new agent
   * @param {Object} agentConfig - Agent configuration
   * @returns {Promise<Agent>}
   */
  async registerAgent(agentConfig) {
    try {
      const agent = new Agent(agentConfig);
      
      // Register with ERC-8004 if not already registered
      if (!agent.registered && !agent.id) {
        const registration = await agent.register(this.erc8004Service);
        agent.id = registration.agentId;
      }
      
      // Add to manager
      this.agents.set(agent.id, agent);
      if (agent.name) {
        this.agentsByName.set(agent.name, agent);
      }
      
      // Index capabilities
      agent.getCapabilities().forEach(capability => {
        if (!this.capabilityIndex.has(capability)) {
          this.capabilityIndex.set(capability, new Set());
        }
        this.capabilityIndex.get(capability).add(agent.id);
      });
      
      console.log(`✅ Agent registered: ${agent.name} (ID: ${agent.id})`);
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
      .map(id => this.agents.get(id))
      .filter(agent => agent && agent.status === "online");
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
      agent.getCapabilities().forEach(capability => {
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
   * Get ERC-8004 service
   */
  getERC8004Service() {
    return this.erc8004Service;
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

    try {
      return await this.groqService.processAgentMessage({
        agent,
        message,
        fromAgentId,
        context
      });
    } catch (error) {
      console.error(`Error processing AI message for agent ${agentId}:`, error);
      // Fallback response if AI fails
      return `Agent ${agent.name} received your message: ${message}. (AI processing unavailable)`;
    }
  }
}

