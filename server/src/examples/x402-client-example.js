/**
 * x402 Client Example
 * Demonstrates proper x402 payment flow:
 * 1. Request service → Get 402
 * 2. Make payment
 * 3. Retry with X-Payment header
 */

import axios from "axios";
import { ethers } from "ethers";
import { HEDERA_CONFIG } from "../config/hedera.js";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:8443";

const api = axios.create({
  baseURL: SERVER_URL
});

// Payer wallet (client making payment - uses client account)
const PAYER_PRIVATE_KEY = process.env.PAYER_PRIVATE_KEY || HEDERA_CONFIG.CLIENT_PRIVATE_KEY;
const payerWallet = new ethers.Wallet(PAYER_PRIVATE_KEY, new ethers.JsonRpcProvider(HEDERA_CONFIG.JSON_RPC_URL));

async function requestServiceWithPayment(agentId, message, paymentAmount = "0.1") {
  console.log(`\n🔄 Step 1: Requesting service from agent ${agentId}...\n`);

  try {
    // First request - should return 402
    const response = await api.post(`/api/agents/${agentId}/message`, {
      message,
      fromAgentId: "x402-client",
      payment: {
        required: true,
        amount: paymentAmount,
        token: "HBAR"
      }
    });

    // If we get 200, payment might not be required
    if (response.status === 200) {
      console.log("✅ Service accessible without payment");
      return response.data;
    }

    return null; // Should never reach here if payment required
  } catch (error) {
    if (error.response?.status === 402) {
      // Got 402 Payment Required - this is expected!
      const paymentDetails = error.response.data.payment;
      const headers = error.response.headers;
      
      console.log("💳 Received 402 Payment Required");
      console.log(`   Amount: ${paymentDetails.amount} ${paymentDetails.token}`);
      
      // Get address from payment details or headers
      const address = paymentDetails.address || paymentDetails.recipient || headers["payment-address"];
      if (!address || address === "undefined") {
        // Fallback to config address
        paymentDetails.address = HEDERA_CONFIG.EVM_ADDRESS;
        console.log(`   Address: ${paymentDetails.address} (using fallback)`);
      } else {
        paymentDetails.address = address;
        console.log(`   Address: ${paymentDetails.address}`);
      }
      
      console.log(`   Request ID: ${paymentDetails.requestId}\n`);

      // Also check headers
      console.log("📋 x402 Headers:");
      if (headers["payment-required"]) {
        console.log(`   Payment-Required: ${headers["payment-required"]}`);
      }
      if (headers["payment-address"]) {
        console.log(`   Payment-Address: ${headers["payment-address"]}`);
      }
      if (headers["payment-amount"]) {
        console.log(`   Payment-Amount: ${headers["payment-amount"]}`);
      }

      return paymentDetails;
    }
    throw error;
  }
}

async function executePayment(paymentDetails) {
  console.log(`\n💰 Step 2: Executing payment...\n`);

  try {
    // Get recipient address - use address from payment or header (owner address - agents receive payments)
    const recipient = paymentDetails.address || paymentDetails.recipient || HEDERA_CONFIG.OWNER_EVM_ADDRESS || HEDERA_CONFIG.EVM_ADDRESS;
    
    if (!recipient || recipient === "undefined") {
      throw new Error("No recipient address provided in payment details. Using default.");
    }

    console.log(`   Recipient: ${recipient}`);
    console.log(`   Amount: ${paymentDetails.amount} HBAR\n`);

    // Execute payment on Hedera
    const tx = await payerWallet.sendTransaction({
      to: recipient,
      value: ethers.parseEther(paymentDetails.amount)
    });

    console.log(`   Transaction sent: ${tx.hash}`);
    console.log(`   Waiting for confirmation (this may take 5-10 seconds)...\n`);

    // Wait for confirmation with timeout
    const receipt = await Promise.race([
      tx.wait(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Transaction timeout - check HashScan manually")), 30000)
      )
    ]);

    console.log(`✅ Payment confirmed!`);
    console.log(`   Transaction Hash: ${receipt.hash}`);
    console.log(`\n⏳ Waiting 15 seconds for mirror node to index transaction...`);
    console.log(`   (Hedera mirror node needs time to index new transactions)`);
    
    // Wait for mirror node to index (Hedera mirror node typically takes 10-30 seconds)
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    console.log(`   Ready for verification!\n`);

    return receipt.hash;
  } catch (error) {
    console.error("❌ Payment failed:", error.message);
    if (error.transaction) {
      console.error(`   Transaction hash: ${error.transaction.hash}`);
      console.error(`   Check status: https://hashscan.io/testnet/transaction/${error.transaction.hash}`);
    }
    throw error;
  }
}

async function retryWithPaymentProof(agentId, message, paymentDetails, txHash) {
  console.log(`\n🔄 Step 3: Retrying request with payment proof...\n`);

  try {
    // Retry request with X-Payment header (x402 standard)
    // Include full payment details for verification
    const response = await api.post(
      `/api/agents/${agentId}/message`,
      {
        message,
        fromAgentId: "x402-client",
        payment: {
          requestId: paymentDetails.requestId,
          txHash: txHash,
          amount: paymentDetails.amount, // Include amount for verification
          address: paymentDetails.address || paymentDetails.recipient, // Include recipient address
          token: paymentDetails.token || "HBAR"
        }
      },
      {
        headers: {
          "X-Payment": txHash // x402 standard header
        }
      }
    );

    if (response.status === 200) {
      console.log("✅ Service accessed successfully!");
      console.log(`   Agent Response: ${response.data.response?.substring(0, 200)}...\n`);
      return response.data;
    }
  } catch (error) {
    if (error.response?.status === 402) {
      console.error("❌ Payment verification failed");
      console.error("   Error:", error.response.data);
      return null;
    }
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: node x402-client-example.js <agentId> <message> [amount]");
    console.log("\nExample:");
    console.log("  node x402-client-example.js 13 \"Hello\" 0.1");
    process.exit(1);
  }

  const agentId = args[0];
  const message = args[1];
  const amount = args[2] || "0.1";

  console.log("🤖 x402 Payment Flow Example");
  console.log(`   Agent: ${agentId}`);
  console.log(`   Message: ${message}`);
  console.log(`   Amount: ${amount} HBAR\n`);

  try {
    // Step 1: Request service (get 402)
    const paymentDetails = await requestServiceWithPayment(agentId, message, amount);

    if (!paymentDetails) {
      console.log("⚠️  Payment not required or request failed");
      return;
    }

    // Step 2: Execute payment
    const txHash = await executePayment(paymentDetails);

    // Step 3: Retry with payment proof
    await retryWithPaymentProof(agentId, message, paymentDetails, txHash);

    console.log("\n✨ x402 flow complete!");
    console.log(`\n   View transaction: https://hashscan.io/testnet/transaction/${txHash}`);

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.response?.data) {
      console.error("   Details:", error.response.data);
    }
    process.exit(1);
  }
}

main();

