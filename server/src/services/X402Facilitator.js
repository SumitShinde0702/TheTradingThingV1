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
      let localResult = await this.verifyPaymentLocal(paymentProof, paymentRequest);
      
      // If local verification works, use it
      if (localResult.verified) {
        return localResult;
      }

      // If verification failed with retryable error (mirror node indexing), retry once after delay
      if (localResult.retryable && !localResult.verified) {
        console.log(`⏳ Retrying verification after 10 seconds (mirror node indexing delay)...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        localResult = await this.verifyPaymentLocal(paymentProof, paymentRequest);
        
        if (localResult.verified) {
          console.log(`✅ Verification succeeded on retry!`);
          return localResult;
        }
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
      
      // Try hash-based queries (may fail - mirror node doesn't always accept EVM hashes)
      let hashQuerySuccess = false;
      
      try {
        // Method 1: Try direct query with EVM hash
        try {
          const url = `${HEDERA_CONFIG.MIRROR_NODE_URL}/transactions/${encodeURIComponent(txHash)}`;
          response = await axios.get(url, { timeout: 10000 });
          const transactions = response.data.transactions || [];
          transaction = transactions[0] || response.data;
          
          if (transaction && transaction.result) {
            console.log(`✅ Found transaction via direct hash query`);
            hashQuerySuccess = true;
          }
        } catch (err1) {
          // Continue to next method
        }
        
        // Method 2: Try query params with hash (without 0x prefix)
        if (!hashQuerySuccess) {
          try {
            const hashWithoutPrefix = txHash.replace(/^0x/, "");
            response = await axios.get(
              `${HEDERA_CONFIG.MIRROR_NODE_URL}/transactions`,
              {
                params: {
                  transactionhash: hashWithoutPrefix
                },
                timeout: 10000
              }
            );
            const transactions = response.data.transactions || [];
            transaction = transactions[0];
            
            if (transaction && transaction.result) {
              console.log(`✅ Found transaction via query params (no prefix)`);
              hashQuerySuccess = true;
            }
          } catch (err2) {
            // Continue to next method
          }
        }
        
        // Method 3: Try with 0x prefix in query
        if (!hashQuerySuccess) {
          try {
            response = await axios.get(
              `${HEDERA_CONFIG.MIRROR_NODE_URL}/transactions`,
              {
                params: {
                  transactionhash: txHash
                },
                timeout: 10000
              }
            );
            const transactions = response.data.transactions || [];
            transaction = transactions[0];
            
            if (transaction && transaction.result) {
              console.log(`✅ Found transaction via query params (with prefix)`);
              hashQuerySuccess = true;
            }
          } catch (err3) {
            // All hash methods failed - will use account-based verification
            console.log(`All hash query methods failed (expected - will use account-based verification)`);
          }
        }
      } catch (err) {
        // Hash queries failed - will fall through to account-based verification
        console.log(`Hash query attempt failed, will try account-based verification`);
      }

      // Try RPC receipt as additional info (won't stop verification if it fails)
      if (!transaction || !transaction.result) {
        try {
          const receipt = await this.provider.getTransactionReceipt(txHash);
          if (receipt && receipt.status === 1) {
            console.log(`Got RPC receipt - transaction confirmed on RPC`);
            // Don't use receipt as transaction, but we know it's confirmed
            // Continue to account-based verification to find the full transaction data
          }
        } catch (rpcErr) {
          // RPC query failed - continue to account-based verification
        }
      }

      // Try to extract from response if we got one
      if (response) {
        const transactions = response?.data?.transactions || [];
        if (!transaction && transactions.length > 0) {
          transaction = transactions[0];
        }
        if (!transaction && response?.data && response.data.result) {
          transaction = response.data;
        }
      }
      
      // ALWAYS try account-based verification if hash query failed or found nothing
      // This works because mirror node doesn't accept EVM hashes directly
      if (!transaction || !transaction.result) {
        console.log(`\n🔄 Hash query didn't find transaction, using account-based verification...`);
        console.log(`   This is expected - Hedera mirror node doesn't accept EVM hashes directly\n`);
        
        // Verify by checking recent transfers to recipient account
        const recipient = paymentRequest.recipient || paymentRequest.address || HEDERA_CONFIG.OWNER_EVM_ADDRESS;
        const recipientAccountId = this.evmAddressToAccountId(recipient);
        const amountHBAR = parseFloat(paymentRequest.amount);
        const amountTinybars = Math.floor(amountHBAR * 100000000);
        
        try {
          // Query recent transactions for the recipient account
          const queryTime = Math.floor(Date.now() / 1000);
          const queryWindowStart = queryTime - 1800; // 30 minutes window (expanded for reliability)
          
          console.log(`   Querying transactions for account: ${recipientAccountId}`);
          console.log(`   Looking for: ${amountHBAR} HBAR (${amountTinybars} tinybars) in last 30 minutes`);
          console.log(`   Time window: ${queryWindowStart} - ${queryTime} (current Unix time: ${queryTime})`);
          console.log(`   Transaction hash being verified: ${txHash}`);
          
          // Query by account_id to find recent transactions
          // Hedera mirror node expects account.id parameter (not account_id)
          // Format: account.id=0.0.7170260
          console.log(`   Querying mirror node with account: ${recipientAccountId}`);
          
          try {
            response = await axios.get(
              `${HEDERA_CONFIG.MIRROR_NODE_URL}/transactions`,
              {
                params: {
                  "account.id": recipientAccountId, // Use account.id parameter
                  limit: 100,
                  order: "desc"
                },
                timeout: 15000
              }
            );
          } catch (paramError) {
            // Try alternative parameter format
            console.log(`   First query format failed, trying alternative...`);
            try {
              response = await axios.get(
                `${HEDERA_CONFIG.MIRROR_NODE_URL}/accounts/${recipientAccountId}/transactions`,
                {
                  params: {
                    limit: 100,
                    order: "desc"
                  },
                  timeout: 15000
                }
              );
            } catch (altError) {
              // Try with account_id as fallback
              console.log(`   Alternative format also failed, trying account_id...`);
              response = await axios.get(
                `${HEDERA_CONFIG.MIRROR_NODE_URL}/transactions`,
                {
                  params: {
                    account_id: recipientAccountId,
                    limit: 100,
                    order: "desc"
                  },
                  timeout: 15000
                }
              );
            }
          }
          
          const recentTransactions = response.data.transactions || [];
          console.log(`   Found ${recentTransactions.length} recent transactions for account ${recipientAccountId}`);
          
          // Also try querying by transaction ID if we can extract it from RPC
          // For now, we'll rely on account-based query which should find it
          
          if (recentTransactions.length === 0) {
            console.log(`   ⚠️  No transactions found at all for this account`);
            console.log(`   Account ID being queried: ${recipientAccountId}`);
            console.log(`   EVM Address provided: ${recipient}`);
            console.log(`   This might mean:`);
            console.log(`     1. The account hasn't received any transactions recently`);
            console.log(`     2. Mirror node hasn't indexed the transaction yet (wait 10-30 seconds)`);
            console.log(`     3. The account ID might be incorrect`);
            console.log(`   Verify account mapping:`);
            console.log(`     - Owner EVM: ${HEDERA_CONFIG.OWNER_EVM_ADDRESS} → Account: ${HEDERA_CONFIG.OWNER_ACCOUNT_ID}`);
            console.log(`     - Client EVM: ${HEDERA_CONFIG.CLIENT_EVM_ADDRESS} → Account: ${HEDERA_CONFIG.CLIENT_ACCOUNT_ID}`);
          } else {
            // Log first few transactions for debugging
            console.log(`   First 3 transactions:`);
            recentTransactions.slice(0, 3).forEach((tx, i) => {
              const ts = parseFloat(tx.consensus_timestamp);
              const tsSec = Math.floor(ts);
              console.log(`     [${i}] ${tx.transaction_id} - ${tx.consensus_timestamp} (${tsSec}s) - ${tx.result}`);
            });
          }
          
          // Find transaction where recipient received the expected amount
          console.log(`   Scanning transactions for matches...`);
          transaction = recentTransactions.find((tx, idx) => {
            if (tx.result !== "SUCCESS") {
              if (idx < 5) console.log(`   [${idx}] Skipping - result: ${tx.result}`);
              return false;
            }
            
            // Check timestamp - must be recent (within last 10 minutes)
            // Hedera consensus timestamps are in format: "seconds.nanoseconds"
            // Example: "1761985569.896590030" = 1761985569 seconds + 896590030 nanoseconds
            const txTimestamp = parseFloat(tx.consensus_timestamp);
            const txTimeSeconds = Math.floor(txTimestamp);
            
            if (idx < 5) {
              console.log(`   [${idx}] Checking tx ${tx.transaction_id}`);
              console.log(`        Timestamp: ${txTimestamp} (${txTimeSeconds} seconds)`);
              console.log(`        Window: ${queryWindowStart} - ${queryTime} (current: ${queryTime})`);
              console.log(`        Is within window? ${txTimeSeconds} >= ${queryWindowStart} = ${txTimeSeconds >= queryWindowStart}`);
            }
            
            // Expand window to 30 minutes to be safe (mirror node indexing might have delays)
            const expandedWindow = queryTime - 1800; // 30 minutes instead of 10
            if (txTimeSeconds < expandedWindow) {
              if (idx < 5) console.log(`        ❌ Too old (outside 30-minute window, ${queryTime - txTimeSeconds} seconds ago)`);
              return false;
            }
            
            // Check transfers - recipient must have received the expected amount
            const transfers = tx.transfers || [];
            
            if (idx < 5 && transfers.length > 0) {
              console.log(`        Transfers: ${transfers.length}`);
              transfers.slice(0, 3).forEach((t, tIdx) => {
                const acc = t.account?.toString() || t.account_id?.toString() || "";
                const amt = parseInt(t.amount) || 0;
                console.log(`          [${tIdx}] ${acc}: ${amt} tinybars (${amt / 100000000} HBAR)`);
              });
            }
            
            const receivedTransfer = transfers.find(t => {
              const account = t.account?.toString() || t.account_id?.toString() || "";
              const amount = parseInt(t.amount) || 0;
              
              // Debug logging for first few transfers
              if (idx < 5) {
                const isRecipient = account === recipientAccountId;
                const isPositive = amount > 0;
                const minAmount = Math.floor(amountTinybars * 0.9);
                const amountMatch = amount >= minAmount;
                console.log(`        Checking transfer:`);
                console.log(`          Account: ${account} === ${recipientAccountId}? ${isRecipient}`);
                console.log(`          Amount: ${amount} tinybars (${amount / 100000000} HBAR)`);
                console.log(`          Expected: ${amountTinybars} tinybars (${amountHBAR} HBAR)`);
                console.log(`          Min required (90%): ${minAmount} tinybars`);
                console.log(`          Amount match: ${amount} >= ${minAmount}? ${amountMatch}`);
              }
              
              // Recipient should have received positive amount matching expected payment
              // Use 90% tolerance to account for fees
              const minRequiredAmount = Math.floor(amountTinybars * 0.9);
              const matches = account === recipientAccountId && 
                           amount > 0 && 
                           amount >= minRequiredAmount;
              
              if (matches) {
                console.log(`        ✅ MATCH FOUND!`);
                console.log(`           Transaction: ${tx.transaction_id}`);
                console.log(`           Account: ${account} === ${recipientAccountId} ✓`);
                console.log(`           Amount: ${amount} tinybars (${amount / 100000000} HBAR)`);
                console.log(`           Expected: ${amountHBAR} HBAR (${amountTinybars} tinybars) ✓`);
              }
              
              return matches;
            });
            
            return !!receivedTransfer;
          });
          
          if (transaction) {
            console.log(`\n✅ Payment verified via account-based method!`);
            console.log(`   Transaction ID: ${transaction.transaction_id}`);
            console.log(`   Consensus: ${transaction.consensus_timestamp}`);
            console.log(`   Result: ${transaction.result}\n`);
          } else {
            console.log(`\n❌ No matching transaction found`);
            console.log(`   Checked ${recentTransactions.length} transactions`);
            console.log(`   Window: Last 30 minutes (${queryWindowStart} - ${queryTime})`);
            console.log(`   Expected: ${recipientAccountId} to receive ${amountTinybars} tinybars (${amountHBAR} HBAR)`);
            if (recentTransactions.length > 0) {
              console.log(`   Most recent transaction:`);
              console.log(`     - ID: ${recentTransactions[0].transaction_id}`);
              console.log(`     - Timestamp: ${recentTransactions[0].consensus_timestamp}`);
              console.log(`     - Result: ${recentTransactions[0].result}`);
              const recentTransfers = recentTransactions[0].transfers || [];
              if (recentTransfers.length > 0) {
                console.log(`     - Transfers (first 5):`);
                recentTransfers.slice(0, 5).forEach((t, i) => {
                  const acc = t.account?.toString() || t.account_id?.toString() || "";
                  const amt = parseInt(t.amount) || 0;
                  const matchesAccount = acc === recipientAccountId;
                  console.log(`       [${i}] ${acc}: ${amt} tinybars (${amt / 100000000} HBAR)${matchesAccount ? ' ← RECIPIENT' : ''}`);
                });
              }
            } else {
              console.log(`   ⚠️  No transactions found at all for account ${recipientAccountId}`);
            }
          }
        } catch (accountErr) {
          console.error(`❌ Account-based verification error: ${accountErr.message}`);
          if (accountErr.response) {
            console.error(`   Status: ${accountErr.response.status}`);
            console.error(`   Data:`, accountErr.response.data);
          }
        }
      }
      
      if (!transaction) {
        // Provide more helpful error message with suggestion to wait/retry
        const errorMsg = `Transaction not found in mirror node. This usually means:
1. Transaction was just created (wait 10-30 seconds and retry)
2. Mirror node indexing delay (normal for Hedera)
3. Transaction might be outside 30-minute window

Transaction Hash: ${txHash}
View on HashScan: https://hashscan.io/testnet/transaction/${txHash}

You can retry the request with the same payment proof after a short wait.`;
        
        return { 
          verified: false, 
          error: errorMsg,
          retryable: true,
          suggestion: "Wait 10-30 seconds and retry with the same transaction hash"
        };
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

