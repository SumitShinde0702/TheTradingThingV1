import express from "express";
import { ethers } from "ethers";
import { HEDERA_CONFIG } from "../config/hedera.js";

/**
 * Payment routes for x402 integration
 */
export function createPaymentRoutes(agentManager) {
  const router = express.Router();
  const x402Service = agentManager.getX402Service();
  
  // Multiple RPC endpoints for fallback
  const RPC_ENDPOINTS = [
    HEDERA_CONFIG.JSON_RPC_URL,
    "https://testnet.hashio.io/api",
    "https://testnet.hedera.com",
    "https://testnet.hashio.io/api/v1/accounts",
  ].filter((url, index, self) => self.indexOf(url) === index);
  
  // Aggressively suppress ethers.js provider warnings by intercepting stderr
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  let stderrSuppressed = false;
  
  const suppressEthersWarnings = () => {
    if (stderrSuppressed) return;
    process.stderr.write = (chunk, encoding, fd) => {
      const message = chunk?.toString() || '';
      if (message.includes('JsonRpcProvider failed to detect network') || 
          message.includes('cannot start up; retry in')) {
        return true; // Suppress - don't write to stderr
      }
      return originalStderrWrite(chunk, encoding, fd);
    };
    stderrSuppressed = true;
  };
  
  const restoreConsoleError = () => {
    if (stderrSuppressed) {
      process.stderr.write = originalStderrWrite;
      stderrSuppressed = false;
    }
  };
  
  // Create fresh wallet with specific RPC endpoint
  const createWallet = (rpcUrl = null) => {
    const network = {
      name: "hedera-testnet",
      chainId: HEDERA_CONFIG.CHAIN_ID
    };
    
    const url = rpcUrl || RPC_ENDPOINTS[0];
    
    // Suppress ethers warnings temporarily
    suppressEthersWarnings();
    
    try {
      // Create provider with staticNetwork to skip auto-detection (prevents spam)
      const provider = new ethers.JsonRpcProvider(url, network, {
        staticNetwork: true
      });
      
      return new ethers.Wallet(HEDERA_CONFIG.CLIENT_PRIVATE_KEY, provider);
    } finally {
      restoreConsoleError();
    }
  };
  
  const getClientWallet = async () => {
    // Always create fresh wallet to avoid stale provider connections
    return createWallet();
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
    // Extract modelName early so it's always available in error handlers
    const modelName = req.body?.modelName || "Unknown"; // e.g., "OpenAI" or "Qwen"
    
    try {
      if (!req.body?.modelName) {
        return res.status(400).json({
          success: false,
          error: "modelName is required",
          modelName: "Unknown"
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
      
      // Check if test mode first
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
      
      // Send transaction with retry logic and RPC endpoint fallback
      // More aggressive retries for HashIO (5 tries with exponential backoff)
      let tx, receipt, txHash;
      let lastError;
      let successfulEndpoint = null;
      
      try {
        // Try each RPC endpoint until one works
        for (let endpointIndex = 0; endpointIndex < RPC_ENDPOINTS.length; endpointIndex++) {
          const rpcUrl = RPC_ENDPOINTS[endpointIndex];
          const endpointName = rpcUrl.includes('hashio') ? 'HashIO' : 
                               rpcUrl.includes('hedera.com') ? 'Hedera Official' : 'Primary';
          
          // HashIO gets more retries (5), others get 3
          const maxRetriesPerEndpoint = endpointName === 'HashIO' ? 5 : 3;
          
          console.log(`   🔄 Trying ${endpointName} RPC endpoint (${maxRetriesPerEndpoint} attempts)...`);
          
          // Retry sending transaction with this endpoint
          for (let attempt = 1; attempt <= maxRetriesPerEndpoint; attempt++) {
            try {
              console.log(`   📤 Attempt ${attempt}/${maxRetriesPerEndpoint} on ${endpointName}...`);
              
              // Suppress ethers warnings during transaction
              suppressEthersWarnings();
              
              try {
                // Create fresh wallet for THIS endpoint
                const freshWallet = createWallet(rpcUrl);
                
                // Add timeout to prevent hanging
                tx = await Promise.race([
                  freshWallet.sendTransaction({
                    to: recipientAddress,
                    value: ethers.parseEther(amount),
                  }),
                  new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Transaction send timeout (10s)")), 10000)
                  )
                ]);
              } finally {
                restoreConsoleError();
              }
              
              successfulEndpoint = endpointName;
              break; // Success - exit both loops
            } catch (error) {
              lastError = error;
              const isConnectionError = error.message?.includes('ECONNRESET') || 
                                       error.message?.includes('timeout') ||
                                       error.code === 'ECONNRESET' ||
                                       error.code === 'ETIMEDOUT';
              
              if (attempt < maxRetriesPerEndpoint && isConnectionError) {
                // Exponential backoff: 2s, 4s, 8s, 16s (for HashIO with 5 tries)
                // For 3 tries: 2s, 4s, 8s
                const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
                console.log(`   ⚠️  Attempt ${attempt} failed: ${error.message.substring(0, 50)}...`);
                console.log(`   ⏳ Retrying in ${delay/1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                console.log(`   ❌ ${endpointName} failed after ${attempt} attempts: ${error.message.substring(0, 50)}...`);
                break; // Try next endpoint
              }
            }
          }
          
          // If we got a transaction, break out of endpoint loop
          if (tx) break;
          
          // If this was the last endpoint, throw error
          if (endpointIndex === RPC_ENDPOINTS.length - 1) {
            throw lastError || new Error("All RPC endpoints failed");
          }
          
          // Small delay before switching endpoints
          console.log(`   ⚠️  ${endpointName} unavailable, trying next endpoint...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (!tx) {
          throw lastError || new Error("Failed to send transaction after all retries");
        }

        console.log(`   📤 Transaction sent via ${successfulEndpoint}: ${tx.hash}`);
        console.log(`   ⏳ Waiting for confirmation...`);

        // Suppress warnings during confirmation
        suppressEthersWarnings();
        try {
          receipt = await Promise.race([
            tx.wait(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Transaction timeout")), 30000)
            ),
          ]);
        } finally {
          restoreConsoleError();
        }

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
        modelName: modelName, // Now always defined
        timestamp: Date.now()
      });
    }
  });

  return router;
}

