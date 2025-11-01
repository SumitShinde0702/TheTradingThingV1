import express from "express";

/**
 * AI-related routes for agents
 */
export function createAIRoutes(agentManager) {
  const router = express.Router();
  const groqService = agentManager.getGroqService();

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

  return router;
}

