import express from "express";
import { HEDERA_CONFIG } from "../config/hedera.js";

/**
 * Agent-to-Agent Transfer Routes
 * Enables agents to transfer HBAR/tokens to each other
 */
export function createTransferRoutes(agentManager) {
  const router = express.Router();
  const x402Service = agentManager.getX402Service();
  const erc8004Service = agentManager.getERC8004Service();

  /**
   * Transfer from one agent to another
   * POST /api/transfers/a2a
   * 
   * Body:
   * {
   *   "fromAgentId": "13",
   *   "toAgentId": "14",
   *   "amount": "1",
   *   "token": "HBAR",
   *   "description": "Payment for service"
   * }
   */
  router.post("/a2a", async (req, res) => {
    try {
      const { fromAgentId, toAgentId, amount, token = "HBAR", description } = req.body;

      // Validate inputs
      if (!fromAgentId || !toAgentId || !amount) {
        return res.status(400).json({
          success: false,
          error: "fromAgentId, toAgentId, and amount are required"
        });
      }

      // Get agent objects
      const fromAgent = agentManager.getAgent(fromAgentId);
      const toAgent = agentManager.getAgent(toAgentId);

      if (!fromAgent) {
        return res.status(404).json({
          success: false,
          error: `From agent ${fromAgentId} not found`
        });
      }

      if (!toAgent) {
        return res.status(404).json({
          success: false,
          error: `To agent ${toAgentId} not found`
        });
      }

      if (fromAgentId === toAgentId) {
        return res.status(400).json({
          success: false,
          error: "Cannot transfer to the same agent"
        });
      }

      // Get wallet addresses
      // Note: Currently all agents share the same wallet (HEDERA_CONFIG.EVM_ADDRESS)
      // In production, each agent would have its own wallet address
      // The ERC-721 token (agentId) represents the agent's identity, but the wallet
      // that owns that token can be different from the agent's operational wallet
      const recipientAddress = toAgent.walletAddress || HEDERA_CONFIG.EVM_ADDRESS;
      
      // For now, we'll use the main wallet, but log which agent is initiating
      console.log(`🔄 A2A Transfer: Agent ${fromAgent.name} (${fromAgentId}) → Agent ${toAgent.name} (${toAgentId})`);
      console.log(`   Amount: ${amount} ${token}`);

      // Execute transfer
      const result = await x402Service.executePayment({
        recipient: recipientAddress,
        amount,
        token
      });

      // Log transaction
      console.log(`✅ Transfer completed: ${result.txHash}`);

      res.json({
        success: true,
        transfer: {
          fromAgent: {
            id: fromAgent.id,
            name: fromAgent.name
          },
          toAgent: {
            id: toAgent.id,
            name: toAgent.name
          },
          amount,
          token,
          description: description || `Transfer from ${fromAgent.name} to ${toAgent.name}`,
          txHash: result.txHash,
          status: result.status
        },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("A2A transfer error:", error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get transfer history for an agent
   * GET /api/transfers/history/:agentId
   */
  router.get("/history/:agentId", (req, res) => {
    try {
      const agent = agentManager.getAgent(req.params.agentId);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: "Agent not found"
        });
      }

      // TODO: In production, this would query on-chain transactions
      // For now, return placeholder
      res.json({
        success: true,
        agentId: agent.id,
        agentName: agent.name,
        transfers: [],
        message: "Transfer history will be tracked on-chain in production"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Request a transfer (payment request)
   * POST /api/transfers/request
   * Similar to payment request but agent-aware
   */
  router.post("/request", (req, res) => {
    try {
      const { fromAgentId, toAgentId, amount, token = "HBAR", description } = req.body;

      if (!fromAgentId || !toAgentId || !amount) {
        return res.status(400).json({
          success: false,
          error: "fromAgentId, toAgentId, and amount are required"
        });
      }

      const toAgent = agentManager.getAgent(toAgentId);
      if (!toAgent) {
        return res.status(404).json({
          success: false,
          error: `Agent ${toAgentId} not found`
        });
      }

      const requestId = `transfer_${Date.now()}_${fromAgentId}_${toAgentId}`;
      
      const paymentRequest = x402Service.generatePaymentRequest({
        amount,
        token,
        recipient: toAgent.walletAddress || HEDERA_CONFIG.EVM_ADDRESS,
        requestId,
        description: description || `Transfer from agent ${fromAgentId} to agent ${toAgentId}`
      });

      const paymentDetails = JSON.parse(paymentRequest["Payment-Required"]);

      res.status(402).json({
        success: false,
        paymentRequired: true,
        fromAgentId,
        toAgentId,
        ...paymentDetails
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

