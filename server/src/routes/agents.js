import express from "express";

/**
 * Agent routes for A2A communication and management
 */
export function createAgentRoutes(agentManager) {
  const router = express.Router();

  /**
   * Get all agents
   * GET /api/agents
   */
  router.get("/", (req, res) => {
    try {
      const agents = agentManager.getAllAgents();
      res.json({
        success: true,
        count: agents.length,
        agents: agents.map((agent) => agent.toJSON()),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Register a new agent
   * POST /api/agents/register
   */
  router.post("/register", async (req, res) => {
    try {
      const agentConfig = req.body;
      const agent = await agentManager.registerAgent(agentConfig);

      res.json({
        success: true,
        agent: agent.toJSON(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Discover agents by capability (in-memory)
   * GET /api/agents/discover?capability=<capability>
   * IMPORTANT: This must come BEFORE /:agentId route to avoid route conflicts
   */
  router.get("/discover", (req, res) => {
    try {
      const { capability } = req.query;

      if (!capability) {
        return res.status(400).json({
          success: false,
          error: "capability query parameter required",
        });
      }

      const agents = agentManager.discoverAgentsByCapability(capability);

      res.json({
        success: true,
        capability,
        count: agents.length,
        agents: agents.map((agent) => agent.toJSON()),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Discover agents from ERC-8004 blockchain registry
   * GET /api/agents/discover-blockchain?limit=10&fromBlock=0&capabilities=trade,analyze
   * Query parameters:
   *   - limit: Maximum number of agents to return (default: 10)
   *   - fromBlock: Block number to start querying from (optional, defaults to recent 100k blocks)
   *   - toBlock: Block number to end at (optional, defaults to latest)
   *   - capabilities: Comma-separated list of capabilities to filter by (optional)
   *   - includeDetails: Whether to include owner/URI details (default: true)
   */
  router.get("/discover-blockchain", async (req, res) => {
    try {
      const erc8004Service = agentManager.getERC8004Service();

      // Parse query parameters
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
      const fromBlock = req.query.fromBlock
        ? parseInt(req.query.fromBlock, 10)
        : null;
      const toBlock =
        req.query.toBlock === "latest"
          ? "latest"
          : req.query.toBlock
          ? parseInt(req.query.toBlock, 10)
          : "latest";
      const includeDetails = req.query.includeDetails !== "false";

      // Parse capabilities filter (comma-separated)
      let capabilities = null;
      if (req.query.capabilities) {
        capabilities = req.query.capabilities
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c);
      }

      const options = {
        limit,
        fromBlock,
        toBlock,
        capabilities,
        includeDetails,
      };

      const agents = await erc8004Service.discoverAgents(options);

      res.json({
        success: true,
        source: "blockchain",
        count: agents.length,
        options,
        agents,
      });
    } catch (error) {
      console.error("Error discovering agents from blockchain:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Get agent by ID
   * GET /api/agents/:agentId
   * IMPORTANT: This must come AFTER /discover to avoid route conflicts
   */
  router.get("/:agentId", (req, res) => {
    try {
      const agent = agentManager.getAgent(req.params.agentId);

      if (!agent) {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      res.json({
        success: true,
        agent: agent.toJSON(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * A2A Communication endpoint
   * POST /api/agents/:agentId/message
   */
  router.post("/:agentId/message", async (req, res) => {
    try {
      const { agentId } = req.params;
      const { message, fromAgentId, payment } = req.body;

      const agent = agentManager.getAgent(agentId);
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      const x402Service = agentManager.getX402Service();

      // Check for X-Payment header (x402 standard - client includes payment proof)
      const paymentHeader = req.headers["x-payment"] || req.headers["payment"];
      let paymentVerified = false;

      if (paymentHeader) {
        // x402 flow: Client has included payment proof in header
        const paymentProof = x402Service.parsePaymentHeader(paymentHeader);

        if (paymentProof) {
          // Get payment request from body - ensure all required fields are present
          const paymentRequest = payment || {};
          paymentRequest.requestId =
            paymentRequest.requestId ||
            paymentProof.requestId ||
            `req_${Date.now()}`;
          paymentRequest.amount =
            paymentRequest.amount || paymentProof.amount || payment.amount;
          paymentRequest.address =
            paymentRequest.address ||
            paymentRequest.recipient ||
            agent.walletAddress ||
            HEDERA_CONFIG.OWNER_EVM_ADDRESS;
          paymentRequest.recipient =
            paymentRequest.recipient ||
            paymentRequest.address ||
            agent.walletAddress ||
            HEDERA_CONFIG.OWNER_EVM_ADDRESS;
          paymentRequest.token =
            paymentRequest.token || paymentProof.token || "HBAR";

          // Log for debugging
          console.log(`📋 Payment request details:`, {
            requestId: paymentRequest.requestId,
            amount: paymentRequest.amount,
            address: paymentRequest.address,
            token: paymentRequest.token,
          });

          // Verify payment using facilitator
          const verification = await x402Service.verifyPayment(
            paymentProof,
            paymentRequest
          );

          if (!verification.verified) {
            console.error("Payment verification failed:", verification.error);
            console.error("Payment proof:", paymentProof);
            console.error("Payment request:", paymentRequest);

            return res.status(402).json({
              success: false,
              error: "Payment verification failed",
              details: verification.error || "Invalid payment proof",
              txHash: paymentProof.txHash || paymentProof,
            });
          }

          console.log(`✅ Payment verified successfully`);
          paymentVerified = true;
        }
      }

      // Check if payment is required (and not yet provided/verified)
      if (payment && payment.required && !paymentVerified) {
        // Ensure we have a valid recipient address (owner receives payments)
        const recipient =
          agent.walletAddress ||
          HEDERA_CONFIG.OWNER_EVM_ADDRESS ||
          HEDERA_CONFIG.EVM_ADDRESS;

        const paymentRequestHeaders = x402Service.generatePaymentRequest({
          amount: payment.amount,
          token: payment.token || "HBAR",
          recipient: recipient, // Use agent wallet or fallback to main account
          requestId: `req_${Date.now()}_${fromAgentId}`,
          description:
            payment.description || `Payment for ${agent.name} service`,
        });

        // Return 402 with x402 standard headers
        res.status(402);
        res.set("Payment-Required", paymentRequestHeaders["Payment-Required"]);
        res.set("Payment-Address", paymentRequestHeaders["Payment-Address"]);
        res.set("Payment-Amount", paymentRequestHeaders["Payment-Amount"]);
        res.set("Payment-Token", paymentRequestHeaders["Payment-Token"]);

        return res.json({
          success: false,
          paymentRequired: true,
          payment: JSON.parse(paymentRequestHeaders["Payment-Required"]),
          message:
            "Include X-Payment header with payment proof (txHash) in next request",
        });
      }

      // Legacy support: payment in body
      if (payment && payment.txHash && !paymentVerified) {
        const verification = await x402Service.verifyPayment(
          payment.txHash,
          payment.requestId
            ? x402Service.getPaymentStatus(payment.requestId)
            : payment
        );

        if (!verification.verified) {
          return res.status(402).json({
            success: false,
            error: "Payment verification failed",
          });
        }
        paymentVerified = true;
      }

      // Process message with AI
      let aiResponse;
      const context = {
        payment: paymentVerified ? { verified: true } : null,
        timestamp: Date.now(),
      };

      try {
        aiResponse = await agentManager.processMessageWithAI(
          agentId,
          message,
          fromAgentId || "unknown",
          context
        );
      } catch (error) {
        console.error("Error processing message with AI:", error);
        aiResponse = `Agent ${agent.name} received your message: ${message}`;
      }

      const response = {
        success: true,
        agentId,
        agentName: agent.name,
        message: `Message received by ${agent.name}`,
        response: aiResponse,
        aiEnabled: agent.aiEnabled,
        timestamp: Date.now(),
      };

      res.json(response);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Update agent status
   * PATCH /api/agents/:agentId/status
   */
  router.patch("/:agentId/status", (req, res) => {
    try {
      const { agentId } = req.params;
      const { status } = req.body;

      if (!["online", "offline", "busy"].includes(status)) {
        return res.status(400).json({
          success: false,
          error: "Invalid status. Must be: online, offline, or busy",
        });
      }

      agentManager.updateAgentStatus(agentId, status);

      res.json({
        success: true,
        agentId,
        status,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
}
