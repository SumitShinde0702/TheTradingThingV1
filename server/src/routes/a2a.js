import express from "express";
import { HEDERA_CONFIG } from "../config/hedera.js";

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
   * 
   * Includes payment middleware to check and verify payments before processing A2A requests
   */
  router.use("/agents/:agentId/a2a", async (req, res, next) => {
    try {
      const { agentId } = req.params;
      const agent = agentManager.getAgent(agentId);

      if (!agent) {
        return res.status(404).json({
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32601,
            message: "Agent not found",
          },
        });
      }

      const agentRouter = a2aService.getAgentRouter(agentId);
      if (!agentRouter) {
        return res.status(404).json({
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32601,
            message: "Agent A2A router not found",
          },
        });
      }

      // Payment middleware: Check if agent requires payment
      if (agent.requiresPayment) {
        const x402Service = agentManager.getX402Service();

        // Extract payment proof from:
        // 1. HTTP header: X-Payment
        // 2. JSON-RPC message metadata: params.message.metadata.payment
        const paymentHeader = req.headers["x-payment"] || req.headers["payment"];
        const paymentMetadata =
          req.body?.params?.message?.metadata?.payment;
        const txHash = paymentHeader || paymentMetadata?.txHash;

        // If no payment proof provided, return HTTP 402 + JSON-RPC error
        if (!txHash) {
          const recipient =
            agent.walletAddress ||
            HEDERA_CONFIG.OWNER_EVM_ADDRESS ||
            HEDERA_CONFIG.EVM_ADDRESS;

          const paymentRequestHeaders = x402Service.generatePaymentRequest({
            amount: agent.paymentAmount || "1",
            token: "HBAR",
            recipient: recipient,
            requestId: `req_${Date.now()}_${agentId}`,
            description: `Payment for ${agent.name} A2A service`,
          });

          // Mix HTTP 402 (transport) + JSON-RPC error (protocol)
          res.status(402);
          res.set("Payment-Required", paymentRequestHeaders["Payment-Required"]);
          res.set("Payment-Address", paymentRequestHeaders["Payment-Address"]);
          res.set("Payment-Amount", paymentRequestHeaders["Payment-Amount"]);
          res.set("Payment-Token", paymentRequestHeaders["Payment-Token"]);

          return res.json({
            jsonrpc: "2.0",
            id: req.body?.id || null,
            error: {
              code: -32099, // Custom: Payment Required
              message: "Payment required",
              data: {
                payment: JSON.parse(paymentRequestHeaders["Payment-Required"]),
              },
            },
          });
        }

        // Payment proof provided - verify it
        const paymentRequest =
          paymentMetadata ||
          (paymentHeader
            ? {
                amount: agent.paymentAmount || "1",
                token: "HBAR",
                address:
                  agent.walletAddress ||
                  HEDERA_CONFIG.OWNER_EVM_ADDRESS ||
                  HEDERA_CONFIG.EVM_ADDRESS,
              }
            : null);

        if (paymentRequest) {
          const verification = await x402Service.verifyPayment(
            txHash,
            paymentRequest
          );

          if (!verification.verified) {
            // Payment verification failed
            return res.status(402).json({
              jsonrpc: "2.0",
              id: req.body?.id || null,
              error: {
                code: -32098, // Custom: Payment Verification Failed
                message: "Payment verification failed",
                data: {
                  reason:
                    verification.error ||
                    verification.reason ||
                    "Transaction not found or invalid",
                  txHash: txHash,
                },
              },
            });
          }

          // Payment verified ✅ - inject into message metadata for executor
          if (!req.body.params?.message?.metadata) {
            if (!req.body.params) {
              req.body.params = {};
            }
            if (!req.body.params.message) {
              req.body.params.message = {};
            }
            req.body.params.message.metadata = {};
          }
          req.body.params.message.metadata.paymentVerified = true;
          req.body.params.message.metadata.paymentRequestId =
            paymentRequest.requestId || `req_${Date.now()}`;
          req.body.params.message.metadata.paymentTxHash = txHash;
        }
      }

      // Payment OK or not required - pass to A2A router
      // The A2A router will handle the request normally (HTTP 200 + JSON-RPC response)
      agentRouter(req, res, next);
    } catch (error) {
      console.error("[A2A Payment Middleware] Error:", error);
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

