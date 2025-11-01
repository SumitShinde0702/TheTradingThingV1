import express from "express";

/**
 * Payment routes for x402 integration
 */
export function createPaymentRoutes(agentManager) {
  const router = express.Router();
  const x402Service = agentManager.getX402Service();

  /**
   * Request payment
   * POST /api/payments/request
   */
  router.post("/request", (req, res) => {
    try {
      const { amount, token, recipient, description } = req.body;
      
      if (!amount || !recipient) {
        return res.status(400).json({
          success: false,
          error: "amount and recipient are required"
        });
      }

      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const paymentRequest = x402Service.generatePaymentRequest({
        amount,
        token: token || "HBAR",
        recipient,
        requestId,
        description: description || "Payment request"
      });

      const paymentDetails = JSON.parse(paymentRequest["Payment-Required"]);
      
      res.status(402).json({
        success: false,
        paymentRequired: true,
        ...paymentDetails
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Execute payment
   * POST /api/payments/execute
   */
  router.post("/execute", async (req, res) => {
    try {
      const { recipient, amount, token } = req.body;
      
      if (!recipient || !amount) {
        return res.status(400).json({
          success: false,
          error: "recipient and amount are required"
        });
      }

      const result = await x402Service.executePayment({
        recipient,
        amount,
        token: token || "HBAR"
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Verify payment
   * POST /api/payments/verify
   */
  router.post("/verify", async (req, res) => {
    try {
      const { txHash, requestId } = req.body;
      
      if (!txHash) {
        return res.status(400).json({
          success: false,
          error: "txHash is required"
        });
      }

      const payment = requestId ? x402Service.getPaymentStatus(requestId) : null;
      
      if (!payment) {
        return res.status(400).json({
          success: false,
          error: "Payment request not found or invalid"
        });
      }

      const verified = await x402Service.verifyPayment(txHash, payment);

      res.json({
        success: true,
        verified,
        txHash,
        requestId
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get payment status
   * GET /api/payments/status/:requestId
   */
  router.get("/status/:requestId", (req, res) => {
    try {
      const { requestId } = req.params;
      const status = x402Service.getPaymentStatus(requestId);
      
      if (!status) {
        return res.status(404).json({
          success: false,
          error: "Payment request not found"
        });
      }

      res.json({
        success: true,
        ...status
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get account balance
   * GET /api/payments/balance/:address
   */
  router.get("/balance/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const balance = await x402Service.getBalance(address);
      
      res.json({
        success: true,
        address,
        balance,
        unit: "HBAR"
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

