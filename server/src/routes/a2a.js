import express from "express";

/**
 * A2A routes for agent-to-agent communication
 */
export function createA2ARoutes(agentManager, a2aService) {
  const router = express.Router();

  /**
   * Get Agent Card for a specific agent
   * GET /agents/:agentId/.well-known/agent-card.json
   */
  router.get("/agents/:agentId/.well-known/agent-card.json", (req, res) => {
    try {
      const { agentId } = req.params;
      const agentCard = a2aService.getAgentCard(agentId);

      if (!agentCard) {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      // Convert AgentCard to JSON
      res.json(agentCard);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Mount A2A JSON-RPC endpoint for a specific agent
   * This will handle all A2A methods: message/send, message/stream, tasks/get, etc.
   * POST /agents/:agentId/a2a
   */
  router.use("/agents/:agentId/a2a", (req, res, next) => {
    try {
      const { agentId } = req.params;
      const agentRouter = a2aService.getAgentRouter(agentId);

      if (!agentRouter) {
        return res.status(404).json({
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32601,
            message: "Agent not found",
          },
        });
      }

      // Mount the agent's A2A router
      agentRouter(req, res, next);
    } catch (error) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: {
          code: -32603,
          message: error.message || "Internal error",
        },
      });
    }
  });

  return router;
}

