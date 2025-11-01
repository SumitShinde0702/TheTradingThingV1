/**
 * x402 Payment Middleware
 * Automatically handles 402 responses and payment verification
 */

export function x402PaymentMiddleware(agentManager) {
  return async (req, res, next) => {
    // Check if this endpoint requires payment
    // This would be configured per route or agent
    const requiresPayment = req.route?.x402Required || false;

    if (!requiresPayment) {
      return next();
    }

    const x402Service = agentManager.getX402Service();

    // Check for X-Payment header (x402 standard)
    const paymentHeader = req.headers["x-payment"] || req.headers["payment"];

    if (!paymentHeader) {
      // Return 402 Payment Required
      const agent = req.agent; // Set by agent middleware
      const paymentRequest = x402Service.generatePaymentRequest({
        amount: req.route?.x402Amount || "0.1",
        token: req.route?.x402Token || "HBAR",
        recipient: agent?.walletAddress,
        requestId: `req_${Date.now()}_${req.path}`,
        description: `Payment required for ${req.path}`
      });

      res.status(402);
      res.set("Payment-Required", paymentRequest["Payment-Required"]);
      res.set("Payment-Address", paymentRequest["Payment-Address"]);
      res.set("Payment-Amount", paymentRequest["Payment-Amount"]);
      res.set("Payment-Token", paymentRequest["Payment-Token"]);

      return res.json({
        success: false,
        paymentRequired: true,
        payment: JSON.parse(paymentRequest["Payment-Required"])
      });
    }

    // Verify payment
    const paymentProof = x402Service.parsePaymentHeader(paymentHeader);
    if (paymentProof) {
      // Payment verification would happen here
      // For now, continue to next middleware
      req.paymentVerified = true;
      req.paymentProof = paymentProof;
    }

    next();
  };
}

