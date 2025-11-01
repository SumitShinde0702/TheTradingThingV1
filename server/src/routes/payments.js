import express from "express";
import { ethers } from "ethers";
import { HEDERA_CONFIG } from "../config/hedera.js";

/**
 * Payment routes for x402 integration
 */
export function createPaymentRoutes(agentManager) {
  const router = express.Router();
  const x402Service = agentManager.getX402Service();
  
  // Lazy-load client wallet only when needed to avoid connection issues at startup
  let clientWallet = null;
  let currentProvider = null;
  
  const getClientWallet = async () => {
    if (!clientWallet) {
      // Use explicit network config (same as x402-client-example.js) to avoid connection issues
      const network = {
        name: "hedera-testnet",
        chainId: HEDERA_CONFIG.CHAIN_ID
      };
      
      // Try primary RPC first
      let provider = new ethers.JsonRpcProvider(HEDERA_CONFIG.JSON_RPC_URL, network);
      
      // Test connection (but don't fail if it doesn't connect - just use the provider)
      try {
        await Promise.race([
          provider.getNetwork(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("RPC connection timeout")), 3000)
          )
        ]);
        currentProvider = provider;
      } catch (error) {
        console.warn(`⚠️  Primary RPC connection test failed: ${error.message}`);
        console.warn(`   Will still attempt transactions (may succeed on retry)`);
        // Continue anyway - the provider is created, just connection test failed
        currentProvider = provider;
      }
      
      clientWallet = new ethers.Wallet(
        HEDERA_CONFIG.CLIENT_PRIVATE_KEY,
        currentProvider
      );
    }
    return clientWallet;
  };

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

  /**
   * Pay for AI model access
   * POST /api/payments/model-payment
   * Charges 1 HBAR from client wallet to payment agent
   */
  router.post("/model-payment", async (req, res) => {
    try {
      const { modelName } = req.body; // e.g., "OpenAI" or "Qwen"
      
      if (!modelName) {
        return res.status(400).json({
          success: false,
          error: "modelName is required"
        });
      }

      // Get payment agent (should be agent ID 14 based on initialization)
      const paymentAgent = agentManager.getAllAgents().find(a => a.name === "PaymentProcessor");
      
      if (!paymentAgent) {
        return res.status(404).json({
          success: false,
          error: "Payment agent not found. Please ensure PaymentProcessor agent is registered."
        });
      }

      console.log(`💳 Processing model payment for ${modelName}...`);
      console.log(`   From: Client wallet (${HEDERA_CONFIG.CLIENT_EVM_ADDRESS})`);
      console.log(`   To: PaymentProcessor agent (ID: ${paymentAgent.id})`);
      console.log(`   Amount: 1 HBAR`);

      // Execute payment from client wallet to payment agent
      const recipientAddress = HEDERA_CONFIG.EVM_ADDRESS; // Payment agent receives payment
      const amount = "1";
      
      console.log(`   Sending ${amount} HBAR to ${recipientAddress}...`);
      
      // Get client wallet (lazy-loaded, will try fallbacks)
      let wallet;
      try {
        wallet = await getClientWallet();
      } catch (rpcError) {
        console.error("   ❌ All RPC endpoints failed:", rpcError.message);
        
        // If test mode enabled, simulate payment
        if (HEDERA_CONFIG.TEST_MODE) {
          console.warn("   🧪 TEST MODE: Simulating payment (RPC unavailable)");
          const mockTxHash = `0x${Date.now().toString(16)}${Math.random().toString(16).substring(2, 18)}`;
          
          return res.json({
            success: true,
            modelName,
            payment: {
              amount: "1",
              token: "HBAR",
              txHash: mockTxHash,
              hashscanUrl: `https://hashscan.io/testnet/transaction/${mockTxHash}`,
              recipient: paymentAgent.name,
              recipientId: paymentAgent.id,
              status: "completed",
              testMode: true,
              warning: "TEST MODE: This is a simulated payment. Real blockchain transaction was not executed."
            },
            timestamp: Date.now()
          });
        }
        
        console.error("   💡 Tip: Set TEST_MODE=true in environment to enable mock payments");
        return res.status(503).json({
          success: false,
          error: `Hedera RPC connection failed: ${rpcError.message}. The Hedera testnet RPC endpoints may be down or unreachable. Please try again later or enable TEST_MODE for development.`,
          modelName: modelName,
          timestamp: Date.now()
        });
      }
      
      // Send transaction with retry logic (same as x402-client-example.js)
      let tx, receipt, txHash;
      const maxRetries = 5;
      let lastError;
      
      try {
        // Retry sending transaction
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`   📤 Attempting transaction (attempt ${attempt}/${maxRetries})...`);
            tx = await wallet.sendTransaction({
              to: recipientAddress,
              value: ethers.parseEther(amount),
            });
            break; // Success
          } catch (error) {
            lastError = error;
            if (attempt === maxRetries) {
              throw error;
            }
            // Exponential backoff: 2s, 4s, 8s, 16s
            const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
            console.log(`   ⚠️  Attempt ${attempt} failed: ${error.message}`);
            console.log(`   ⏳ Retrying in ${delay/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        console.log(`   📤 Transaction sent: ${tx.hash}`);
        console.log(`   ⏳ Waiting for confirmation...`);

        receipt = await Promise.race([
          tx.wait(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Transaction timeout")), 30000)
          ),
        ]);

        txHash = receipt.hash;
        console.log(`✅ Payment completed: ${txHash}`);
        console.log(`   View on HashScan: https://hashscan.io/testnet/transaction/${txHash}`);

        res.json({
          success: true,
          modelName,
          payment: {
            amount: "1",
            token: "HBAR",
            txHash: txHash,
            hashscanUrl: `https://hashscan.io/testnet/transaction/${txHash}`,
            recipient: paymentAgent.name,
            recipientId: paymentAgent.id,
            status: "completed"
          },
          timestamp: Date.now()
        });
      } catch (txError) {
        console.error("   ❌ Transaction error:", txError.message);
        if (tx && tx.hash) {
          // Transaction was sent but confirmation failed
          return res.status(500).json({
            success: false,
            error: `Transaction sent but confirmation failed: ${txError.message}. Transaction hash: ${tx.hash}`,
            txHash: tx.hash,
            modelName: modelName
          });
        }
        // Transaction send failed
        throw txError;
      }
    } catch (error) {
      console.error("Model payment error:", error);
      // Always return JSON, never HTML
      const errorMessage = error.message || "Unknown error occurred";
      console.error("   📝 Returning error response as JSON");
      
      res.status(500).json({
        success: false,
        error: errorMessage,
        modelName: modelName || "Unknown",
        timestamp: Date.now()
      });
    }
  });

  return router;
}

