/**
 * Agent Model - Represents an autonomous agent in the system
 */
export class Agent {
  constructor(config) {
    this.id = config.id || null; // ERC-8004 agentId
    this.name = config.name || "Unnamed Agent";
    this.description = config.description || "";
    this.capabilities = config.capabilities || [];
    this.endpoint = config.endpoint || ""; // HTTP endpoint for A2A communication
    this.walletAddress = config.walletAddress || "";
    this.registered = config.registered || false;
    this.metadata = config.metadata || {};
    this.createdAt = config.createdAt || Date.now();

    // Agent state
    this.status = config.status || "offline"; // online, offline, busy
    this.activeRequests = new Set();

    // AI configuration
    this.aiEnabled = config.aiEnabled !== false; // Enable AI by default
    this.aiModel = config.aiModel || null; // Specific model override

    // Payment configuration
    this.requiresPayment = config.requiresPayment || false;
    this.paymentAmount = config.paymentAmount || "1"; // Default 1 HBAR
  }

  /**
   * Register agent with ERC-8004
   */
  async register(erc8004Service) {
    try {
      const tokenURI =
        this.endpoint || `https://agent.${this.name}.local/metadata`;
      const result = await erc8004Service.registerAgent(tokenURI);

      this.id = result.agentId;
      this.registered = true;
      this.walletAddress = result.owner;

      return result;
    } catch (error) {
      console.error(`Error registering agent ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Get agent capabilities
   */
  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Check if agent can perform a capability
   */
  canPerform(capability) {
    return this.capabilities.includes(capability);
  }

  /**
   * Add capability
   */
  addCapability(capability) {
    if (!this.capabilities.includes(capability)) {
      this.capabilities.push(capability);
    }
  }

  /**
   * Update status
   */
  setStatus(status) {
    this.status = status;
  }

  /**
   * Add active request
   */
  addRequest(requestId) {
    this.activeRequests.add(requestId);
  }

  /**
   * Remove active request
   */
  removeRequest(requestId) {
    this.activeRequests.delete(requestId);
  }

  /**
   * Get agent info as JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      capabilities: this.capabilities,
      endpoint: this.endpoint,
      walletAddress: this.walletAddress,
      registered: this.registered,
      status: this.status,
      metadata: this.metadata,
      createdAt: this.createdAt,
      activeRequests: Array.from(this.activeRequests).length,
      aiEnabled: this.aiEnabled,
      aiModel: this.aiModel,
      requiresPayment: this.requiresPayment,
      paymentAmount: this.paymentAmount,
    };
  }
}
