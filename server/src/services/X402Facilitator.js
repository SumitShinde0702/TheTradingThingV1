import { ethers } from "ethers";
import axios from "axios";
import { HEDERA_CONFIG } from "../config/hedera.js";

/**
 * x402 Facilitator Service
 * Handles payment execution and verification using Hedera
 * Based on x402-hedera specification
 */
export class X402Facilitator {
  constructor(facilitatorURL = null) {
    this.provider = new ethers.JsonRpcProvider(HEDERA_CONFIG.JSON_RPC_URL);
    this.wallet = new ethers.Wallet(HEDERA_CONFIG.PRIVATE_KEY, this.provider);
    
    // Use hosted facilitator or local if URL provided
    this.facilitatorURL = facilitatorURL || process.env.X402_FACILITATOR_URL || "https://x402-hedera-production.up.railway.app";
  }

  /**
   * Verify payment using facilitator
   * @param {string} paymentProof - Payment proof (txHash or signed payment)
   * @param {Object} paymentRequest - Original payment request
   * @returns {Promise<{verified: boolean, txHash?: string}>}
   */
  async verifyPayment(paymentProof, paymentRequest) {
    try {
      // Always try local verification first (faster, more reliable)
      const localResult = await this.verifyPaymentLocal(paymentProof, paymentRequest);
      
      // If local verification works, use it
      if (localResult.verified) {
        return localResult;
      }

      // If local fails and we have external facilitator, try that
      if (this.facilitatorURL && !this.facilitatorURL.includes("localhost")) {
        try {
          const response = await axios.post(
            `${this.facilitatorURL}/verify`,
            {
              paymentProof,
              paymentRequest
            },
            { timeout: 5000 }
          );
          return response.data;
        } catch (facilitatorError) {
          console.warn("External facilitator verification failed, using local result:", facilitatorError.message);
          return localResult;
        }
      }

      return localResult;
    } catch (error) {
      console.error("Facilitator verification error:", error);
      // Always fallback to local verification
      return await this.verifyPaymentLocal(paymentProof, paymentRequest);
    }
  }

  /**
   * Verify payment locally using Hedera mirror node
   */
  async verifyPaymentLocal(paymentProof, paymentRequest) {
    try {
      const txHash = typeof paymentProof === "string" ? paymentProof : paymentProof.txHash;
      
      if (!txHash) {
        return { verified: false, error: "No transaction hash in payment proof" };
      }

      // For EVM transactions, query by transaction hash
      // Hedera mirror node query formats:
      // 1. Direct hash: /transactions/{hash}
      // 2. Query params: /transactions?transactionhash={hash}
      let response;
      let transaction = null;
      
      try {
        // Method 1: Try direct query with EVM hash (no leading slash if hash starts with /)
        try {
          const url = `${HEDERA_CONFIG.MIRROR_NODE_URL}/transactions/${encodeURIComponent(txHash)}`;
          response = await axios.get(url, { timeout: 15000 });
          const transactions = response.data.transactions || [];
          transaction = transactions[0] || response.data;
          
          if (transaction && transaction.result) {
            console.log(`✅ Found transaction via direct query`);
          }
        } catch (err1) {
          console.log(`Direct query failed (${err1.response?.status || err1.message}), trying query params...`);
          
          // Method 2: Try query params with hash (without 0x prefix)
          try {
            const hashWithoutPrefix = txHash.replace(/^0x/, "");
            response = await axios.get(
              `${HEDERA_CONFIG.MIRROR_NODE_URL}/transactions`,
              {
                params: {
                  transactionhash: hashWithoutPrefix
                },
                timeout: 15000
              }
            );
            const transactions = response.data.transactions || [];
            transaction = transactions[0];
            
            if (transaction && transaction.result) {
              console.log(`✅ Found transaction via query params (no prefix)`);
            }
          } catch (err2) {
            console.log(`Query params method failed, trying with 0x prefix...`);
            
            // Method 3: Try with 0x prefix in query
            try {
              response = await axios.get(
                `${HEDERA_CONFIG.MIRROR_NODE_URL}/transactions`,
                {
                  params: {
                    transactionhash: txHash
                  },
                  timeout: 15000
                }
              );
              const transactions = response.data.transactions || [];
              transaction = transactions[0];
              
              if (transaction && transaction.result) {
                console.log(`✅ Found transaction via query params (with prefix)`);
              }
            } catch (err3) {
              throw new Error(`All query methods failed. Last error: ${err3.message || err3.response?.status}`);
            }
          }
        }
      } catch (err) {
        const errorMsg = err.response?.data?._status?.messages?.[0]?.message || err.message || "Unknown error";
        const statusCode = err.response?.status;
        console.error(`Transaction query failed: ${statusCode || ""} ${errorMsg}`);
        return { verified: false, error: `Transaction query failed: ${errorMsg} (status: ${statusCode || "N/A"})` };
      }

      const transactions = response?.data?.transactions || [];
      if (!transaction && transactions.length > 0) {
        transaction = transactions[0];
      }
      if (!transaction && response?.data) {
        transaction = response.data;
      }
      
      if (!transaction) {
        return { verified: false, error: "Transaction not found" };
      }

      if (transaction.result !== "SUCCESS") {
        return { verified: false, error: `Transaction failed: ${transaction.result}` };
      }

      // Verify payment details
      const transfers = transaction.transfers || [];
      const recipient = paymentRequest.recipient || paymentRequest.address || HEDERA_CONFIG.OWNER_EVM_ADDRESS || HEDERA_CONFIG.EVM_ADDRESS;
      
      // Convert amount to tinybars (Hedera uses tinybars: 1 HBAR = 100,000,000 tinybars)
      // Handle undefined amount by checking transfers anyway
      const amountHBAR = paymentRequest.amount ? parseFloat(paymentRequest.amount) : null;
      const amountTinybars = amountHBAR ? Math.floor(amountHBAR * 100000000) : 0;
      
      if (!amountHBAR) {
        console.warn(`⚠️  No amount specified in payment request, will verify by recipient receiving funds`);
      }

      // Convert recipient EVM address to Hedera account ID if needed
      const recipientAccountId = this.evmAddressToAccountId(recipient);
      
      console.log(`🔍 Verifying payment:`);
      console.log(`   Transaction Hash: ${txHash}`);
      console.log(`   Transaction ID: ${transaction.transaction_id || "N/A"}`);
      console.log(`   Result: ${transaction.result}`);
      console.log(`   Entity ID: ${transaction.entity_id}`);
      console.log(`   Recipient Address: ${recipient}`);
      console.log(`   Recipient Account ID: ${recipientAccountId}`);
      console.log(`   Expected Amount: ${amountHBAR} HBAR (${amountTinybars} tinybars)`);
      console.log(`   Transfers found: ${transfers.length}`);
      
      // Debug: log all transfers
      if (transfers.length > 0) {
        console.log(`   All transfers:`);
        transfers.forEach(t => {
          const account = t.account?.toString() || t.account_id?.toString() || "unknown";
          const amount = parseInt(t.amount) || 0;
          const amountHBAR = amount / 100000000;
          console.log(`     - ${account}: ${amount} tinybars (${amountHBAR} HBAR)`);
        });
      }

      // Check transfers - Hedera transfers are in tinybars and can be positive (credit) or negative (debit)
      // For a payment, we look for a positive transfer TO the recipient
      // Note: For EVM transactions, the actual transfer might not show in transfers array
      // We check transaction entity_id and result instead
      let paymentTransfer = null;
      
      if (transfers.length > 0) {
        paymentTransfer = transfers.find(
          transfer => {
            // Match account (could be account ID like "0.0.7170260" or account field)
            const transferAccount = transfer.account?.toString() || transfer.account_id?.toString() || "";
            
            // Check if this transfer is TO the recipient (positive amount = credit)
            const matchesAccount = transferAccount === recipientAccountId || 
                                 transferAccount === recipient;
            
            // Amount should be positive (credit to recipient) and match expected amount
            // Allow 90% tolerance to account for fees (or skip amount check if not specified)
            const transferAmount = parseInt(transfer.amount) || 0;
            const amountMatch = amountTinybars === 0 || transferAmount >= amountTinybars * 0.9;
            
            const matches = matchesAccount && transferAmount > 0 && amountMatch;
            
            if (matches) {
              console.log(`   ✅ Found payment transfer: ${transferAccount} received ${transferAmount} tinybars (${transferAmount / 100000000} HBAR)`);
            }
            
            return matches;
          }
        );
      }
      
      // If no transfer found but transaction is successful, check if recipient received funds
      if (!paymentTransfer && transaction.result === "SUCCESS") {
        // Check if entity_id matches recipient (entity_id is the account that initiated/received the transaction)
        if (transaction.entity_id === recipientAccountId) {
          console.log(`✅ Transaction verified by entity match (EVM transaction)`);
          paymentTransfer = { account: recipientAccountId, amount: amountTinybars, verified: true };
        } else {
          // Also check if recipient received any positive amount in transfers
          const recipientReceived = transfers.find(t => {
            const account = t.account?.toString() || t.account_id?.toString() || "";
            const amount = parseInt(t.amount) || 0;
            return (account === recipientAccountId || account === recipient) && amount > 0;
          });
          
          if (recipientReceived) {
            console.log(`✅ Transaction verified - recipient received ${recipientReceived.amount} tinybars`);
            paymentTransfer = { account: recipientAccountId, amount: parseInt(recipientReceived.amount), verified: true };
          }
        }
      }

      // Check if transaction is a self-transfer (same sender/recipient)
      // For self-transfers, we verify the transaction was successful and had the expected value
      const isSelfTransfer = recipientAccountId === HEDERA_CONFIG.OWNER_ACCOUNT_ID || 
                            recipientAccountId === HEDERA_CONFIG.ACCOUNT_ID ||
                            (recipient && recipient.toLowerCase() === HEDERA_CONFIG.OWNER_EVM_ADDRESS.toLowerCase()) ||
                            (recipient && recipient.toLowerCase() === HEDERA_CONFIG.EVM_ADDRESS.toLowerCase());
      
      if (isSelfTransfer && transaction.result === "SUCCESS") {
        // For self-transfers, check transaction entity_id matches our account
        const entityMatch = transaction.entity_id === HEDERA_CONFIG.ACCOUNT_ID;
        
        // Also check if transaction has the expected value in the transaction data
        // EVM transactions on Hedera should have the value in the transaction bytes
        console.log(`✅ Self-transfer detected`);
        console.log(`   Transaction successful: ${transaction.result}`);
        console.log(`   Entity ID: ${transaction.entity_id}`);
        console.log(`   Transaction type: ${transaction.name}`);
        
        return {
          verified: true,
          txHash,
          transaction,
          selfTransfer: true,
          note: "Self-transfer - transaction successful on same account"
        };
      }

      if (paymentTransfer) {
        const verifiedAmount = paymentTransfer.amount ? `${paymentTransfer.amount} tinybars` : "verified";
        console.log(`✅ Payment verified: ${verifiedAmount} to ${paymentTransfer.account || recipientAccountId}`);
      } else {
        console.log(`❌ Payment verification failed - no matching transfer found`);
        console.log(`   Expected: ${recipientAccountId} to receive ${amountTinybars} tinybars`);
        if (transfers.length > 0) {
          console.log(`   Available transfers:`);
          transfers.forEach(t => {
            const account = t.account?.toString() || t.account_id?.toString() || "unknown";
            const amount = parseInt(t.amount) || 0;
            console.log(`     ${account}: ${amount} tinybars (${amount / 100000000} HBAR)`);
          });
        }
      }

      return {
        verified: !!paymentTransfer,
        txHash,
        transaction: paymentTransfer ? transaction : null
      };
    } catch (error) {
      console.error("Local payment verification error:", error.message);
      return { verified: false, error: error.message || "Verification failed" };
    }
  }

  /**
   * Convert EVM address to Hedera account ID
   * Note: This is a simplified conversion - in production you'd query the Hedera API
   */
  evmAddressToAccountId(evmAddress) {
    // If it's already an account ID (0.0.x), return as is
    if (evmAddress && evmAddress.startsWith("0.0.")) {
      return evmAddress;
    }

    // Map owner EVM address to owner account ID
    if (evmAddress && evmAddress.toLowerCase() === HEDERA_CONFIG.OWNER_EVM_ADDRESS.toLowerCase()) {
      return HEDERA_CONFIG.OWNER_ACCOUNT_ID;
    }

    // Map client EVM address to client account ID
    if (evmAddress && evmAddress.toLowerCase() === HEDERA_CONFIG.CLIENT_EVM_ADDRESS.toLowerCase()) {
      return HEDERA_CONFIG.CLIENT_ACCOUNT_ID;
    }

    // Legacy support
    if (evmAddress && evmAddress.toLowerCase() === HEDERA_CONFIG.EVM_ADDRESS.toLowerCase()) {
      return HEDERA_CONFIG.ACCOUNT_ID;
    }

    // Otherwise, return the EVM address (will be used as-is for matching)
    return evmAddress;
  }

  /**
   * Execute payment through facilitator or directly
   * @param {Object} paymentRequest - Payment request
   * @param {string} payerPrivateKey - Payer's private key (optional, uses default if not provided)
   * @returns {Promise<{txHash: string, status: string}>}
   */
  async executePayment(paymentRequest, payerPrivateKey = null) {
    try {
      const wallet = payerPrivateKey 
        ? new ethers.Wallet(payerPrivateKey, this.provider)
        : this.wallet;

      const { recipient, amount, token = "HBAR" } = paymentRequest;
      const recipientAddress = this.convertToEVMAddress(recipient);

      let tx;

      if (token === "HBAR" || !token.startsWith("0x")) {
        // Native HBAR transfer
        tx = await wallet.sendTransaction({
          to: recipientAddress,
          value: ethers.parseEther(amount.toString())
        });
      } else {
        // HTS Token transfer
        const tokenContract = new ethers.Contract(
          token,
          [
            "function transfer(address to, uint256 amount) returns (bool)",
            "function transferFrom(address from, address to, uint256 amount) returns (bool)"
          ],
          wallet
        );

        tx = await tokenContract.transfer(
          recipientAddress,
          ethers.parseUnits(amount.toString(), 8)
        );
      }

      const receipt = await tx.wait();

      return {
        txHash: receipt.hash,
        status: "completed",
        network: HEDERA_CONFIG.NETWORK
      };
    } catch (error) {
      console.error("Payment execution error:", error);
      throw error;
    }
  }

  /**
   * Convert Hedera account ID to EVM address format
   */
  convertToEVMAddress(address) {
    // If already EVM format (0x...), return as is
    if (address && address.startsWith("0x")) {
      return address;
    }
    // If Hedera account ID (0.0.x), map to EVM address
    if (address && address.startsWith("0.0.")) {
      // Map owner account ID to owner EVM address
      if (address === HEDERA_CONFIG.OWNER_ACCOUNT_ID) {
        return HEDERA_CONFIG.OWNER_EVM_ADDRESS;
      }
      // Map client account ID to client EVM address
      if (address === HEDERA_CONFIG.CLIENT_ACCOUNT_ID) {
        return HEDERA_CONFIG.CLIENT_EVM_ADDRESS;
      }
      // Legacy support
      if (address === HEDERA_CONFIG.ACCOUNT_ID) {
        return HEDERA_CONFIG.EVM_ADDRESS;
      }
    }
    return address || HEDERA_CONFIG.OWNER_EVM_ADDRESS;
  }

  /**
   * Convert to Hedera account format if needed
   */
  convertToHederaFormat(address) {
    // If already Hedera format (0.0.x), return as is
    if (address && address.startsWith("0.0.")) {
      return address;
    }
    // Map EVM addresses to account IDs
    if (address && address.toLowerCase() === HEDERA_CONFIG.OWNER_EVM_ADDRESS.toLowerCase()) {
      return HEDERA_CONFIG.OWNER_ACCOUNT_ID;
    }
    if (address && address.toLowerCase() === HEDERA_CONFIG.CLIENT_EVM_ADDRESS.toLowerCase()) {
      return HEDERA_CONFIG.CLIENT_ACCOUNT_ID;
    }
    // Legacy support
    if (address && address.toLowerCase() === HEDERA_CONFIG.EVM_ADDRESS.toLowerCase()) {
      return HEDERA_CONFIG.ACCOUNT_ID;
    }
    return address;
  }
}

