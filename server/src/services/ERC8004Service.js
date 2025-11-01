import { ethers } from "ethers";
import { HEDERA_CONFIG } from "../config/hedera.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ERC-8004 Service for Agent Registration and Discovery
 */
export class ERC8004Service {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(HEDERA_CONFIG.JSON_RPC_URL);
    this.wallet = new ethers.Wallet(HEDERA_CONFIG.PRIVATE_KEY, this.provider);
    
    // Load contract ABIs
    this.identityRegistryABI = this.loadABI("IdentityRegistryUpgradeable");
    this.reputationRegistryABI = this.loadABI("ReputationRegistryUpgradeable");
    this.validationRegistryABI = this.loadABI("ValidationRegistryUpgradeable");
    
    // Initialize contracts
    this.identityRegistry = new ethers.Contract(
      HEDERA_CONFIG.IDENTITY_REGISTRY,
      this.identityRegistryABI,
      this.wallet
    );
    
    this.reputationRegistry = new ethers.Contract(
      HEDERA_CONFIG.REPUTATION_REGISTRY,
      this.reputationRegistryABI,
      this.wallet
    );
    
    this.validationRegistry = new ethers.Contract(
      HEDERA_CONFIG.VALIDATION_REGISTRY,
      this.validationRegistryABI,
      this.wallet
    );
  }

  loadABI(contractName) {
    const abiPath = path.join(
      __dirname,
      "../../../erc-8004-contracts/artifacts/contracts",
      `${contractName}.sol/${contractName}.json`
    );
    
    try {
      const artifact = JSON.parse(fs.readFileSync(abiPath, "utf8"));
      return artifact.abi;
    } catch (error) {
      console.error(`Error loading ABI for ${contractName}:`, error.message);
      return [];
    }
  }

  /**
   * Register an agent with ERC-8004 Identity Registry
   * @param {string} tokenURI - IPFS or HTTP URI for agent metadata
   * @returns {Promise<{agentId: number, txHash: string}>}
   */
  async registerAgent(tokenURI = "") {
    try {
      console.log(`Registering agent with URI: ${tokenURI}`);
      
      let tx;
      if (tokenURI) {
        // Explicitly use the "register(string)" function signature to avoid ambiguity
        const registerWithURI = this.identityRegistry.getFunction("register(string)");
        tx = await registerWithURI(tokenURI);
      } else {
        // Use the "register()" function signature
        const registerNoArgs = this.identityRegistry.getFunction("register()");
        tx = await registerNoArgs();
      }
      
      const receipt = await tx.wait();
      
      // Extract agentId from events
      let agentId = null;
      
      for (const log of receipt.logs) {
        try {
          const parsed = this.identityRegistry.interface.parseLog(log);
          if (parsed && parsed.name === "Registered") {
            agentId = parsed.args.agentId.toString();
            break;
          }
        } catch (e) {
          // Continue to next log
          continue;
        }
      }
      
      // If event parsing failed, try to get from transaction receipt
      if (!agentId && receipt.logs.length > 0) {
        // Try to decode without interface - look for Registered event
        // Event signature: Registered(uint256,string,address)
        const eventTopic = ethers.id("Registered(uint256,string,address)");
        const registeredLog = receipt.logs.find(log => log.topics[0] === eventTopic);
        
        if (registeredLog && registeredLog.topics.length > 1) {
          // agentId is in topics[1] (indexed parameter)
          agentId = BigInt(registeredLog.topics[1]).toString();
        }
      }
      
      if (!agentId) {
        throw new Error("Could not extract agentId from transaction");
      }
      
      console.log(`✅ Agent registered with ID: ${agentId}`);
      
      return {
        agentId,
        txHash: receipt.hash,
        owner: HEDERA_CONFIG.EVM_ADDRESS
      };
    } catch (error) {
      console.error("Error registering agent:", error);
      throw error;
    }
  }

  /**
   * Get agent owner
   * @param {string} agentId - Agent ID
   * @returns {Promise<string>}
   */
  async getAgentOwner(agentId) {
    try {
      return await this.identityRegistry.ownerOf(agentId);
    } catch (error) {
      console.error(`Error getting agent owner for ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get agent URI
   * @param {string} agentId - Agent ID
   * @returns {Promise<string>}
   */
  async getAgentURI(agentId) {
    try {
      return await this.identityRegistry.tokenURI(agentId);
    } catch (error) {
      console.error(`Error getting agent URI for ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Check if agent exists
   * @param {string} agentId - Agent ID
   * @returns {Promise<boolean>}
   */
  async agentExists(agentId) {
    try {
      const owner = await this.getAgentOwner(agentId);
      return owner !== ethers.ZeroAddress;
    } catch {
      return false;
    }
  }

  /**
   * Get agent reputation summary
   * @param {string} agentId - Agent ID
   * @param {string[]} clientAddresses - Optional filter by client addresses
   * @param {string} tag1 - Optional tag1 filter
   * @param {string} tag2 - Optional tag2 filter
   * @returns {Promise<{count: number, averageScore: number}>}
   */
  async getAgentReputation(agentId, clientAddresses = [], tag1 = "0x0", tag2 = "0x0") {
    try {
      const result = await this.reputationRegistry.getSummary(
        agentId,
        clientAddresses,
        tag1 === "0x0" ? ethers.ZeroHash : tag1,
        tag2 === "0x0" ? ethers.ZeroHash : tag2
      );
      
      return {
        count: result.count.toString(),
        averageScore: result.averageScore.toString()
      };
    } catch (error) {
      console.error(`Error getting reputation for agent ${agentId}:`, error);
      return { count: "0", averageScore: "0" };
    }
  }

  /**
   * Discover agents by querying the registry
   * Note: This is a simplified discovery - in production, you'd index events
   * @param {number} limit - Maximum number of agents to return
   * @returns {Promise<Array>}
   */
  async discoverAgents(limit = 10) {
    // This is a placeholder - in production, you'd need to:
    // 1. Index Registered events from the IdentityRegistry
    // 2. Maintain a local database of registered agents
    // 3. Filter by capabilities/attributes
    
    console.log("Agent discovery - using event indexing in production");
    return [];
  }

  /**
   * Update agent URI
   * @param {string} agentId - Agent ID
   * @param {string} newURI - New URI
   * @returns {Promise<string>}
   */
  async updateAgentURI(agentId, newURI) {
    try {
      const tx = await this.identityRegistry.setAgentUri(agentId, newURI);
      const receipt = await tx.wait();
      return receipt.hash;
    } catch (error) {
      console.error(`Error updating agent URI for ${agentId}:`, error);
      throw error;
    }
  }
}

