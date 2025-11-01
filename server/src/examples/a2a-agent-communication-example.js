/**
 * Example: Multi-turn Agent-to-Agent communication using A2A protocol with payment
 *
 * This demonstrates a multi-turn conversation between agents using the A2A protocol,
 * including handling payment requirements via x402 protocol.
 *
 * Flow:
 * 1. TradingAgent sends first message to PaymentProcessor → Payment required → Payment made
 * 2. PaymentProcessor replies (turn 1 response)
 * 3. TradingAgent sends second message (same context, no payment needed) → PaymentProcessor replies
 *
 * This demonstrates context-based payment verification - once a context is verified,
 * subsequent messages in that context don't require payment again.
 *
 * Usage:
 *   node src/examples/a2a-agent-communication-example.js
 */

import { A2AClient } from "@a2a-js/sdk/client";
import axios from "axios";
import { ethers } from "ethers";
import { HEDERA_CONFIG } from "../config/hedera.js";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:8443";

// Payer wallet (client making payment - uses client account)
const payerWallet = new ethers.Wallet(
  HEDERA_CONFIG.CLIENT_PRIVATE_KEY,
  new ethers.JsonRpcProvider(HEDERA_CONFIG.JSON_RPC_URL)
);

async function main() {
  console.log("🤝 A2A Agent-to-Agent Communication Example\n");
  console.log(`   Server: ${SERVER_URL}\n`);

  try {
    // Step 1: Get agent IDs (in a real scenario, these would be discovered)
    // For this example, we'll use the IDs that are registered at startup
    // TradingAgent is typically ID 40, PaymentProcessor is ID 41
    // But we'll fetch them dynamically
    console.log("📋 Step 1: Discovering agents...");
    const agentsResponse = await axios.get(`${SERVER_URL}/api/agents`);
    const agents = agentsResponse.data.agents || [];

    const tradingAgent = agents.find((a) => a.name === "TradingAgent");
    const paymentAgent = agents.find((a) => a.name === "PaymentProcessor");

    if (!tradingAgent || !paymentAgent) {
      console.error(
        "❌ Error: Could not find TradingAgent and PaymentProcessor"
      );
      console.log(
        "   Available agents:",
        agents.map((a) => `${a.name} (${a.id})`).join(", ")
      );
      process.exit(1);
    }

    console.log(`   ✅ Found TradingAgent: ID ${tradingAgent.id}`);
    console.log(`   ✅ Found PaymentProcessor: ID ${paymentAgent.id}\n`);

    // Step 2: Fetch PaymentProcessor's Agent Card
    console.log("📇 Step 2: Fetching PaymentProcessor's Agent Card...");
    const agentCardUrl = `${SERVER_URL}/api/agents/${paymentAgent.id}/.well-known/agent-card.json`;
    console.log(`   URL: ${agentCardUrl}`);

    const cardResponse = await axios.get(agentCardUrl);
    const agentCard = cardResponse.data;
    console.log(`   ✅ Agent Card retrieved:`);
    console.log(`      Name: ${agentCard.name}`);
    console.log(`      Description: ${agentCard.description}`);
    console.log(`      URL: ${agentCard.url}`);
    console.log(
      `      Skills: ${
        agentCard.skills?.map((s) => s.name).join(", ") || "None"
      }\n`
    );

    // Step 3: Create A2A Client
    console.log("🔧 Step 3: Creating A2A Client...");

    // Initialize client with agent's base URL
    const clientBaseUrl = agentCard.url.replace("/a2a", "");
    const client = new A2AClient(clientBaseUrl);
    console.log(`   ✅ A2A Client created for ${clientBaseUrl}\n`);

    // Step 4: Generate contextId for multi-turn conversation
    const { v4: uuidv4 } = await import("uuid");
    const contextId = `ctx_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    console.log(
      `🔗 Step 4: Generated context ID for conversation: ${contextId}\n`
    );

    // ========================================
    // TURN 1: First message (requires payment)
    // ========================================
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
    console.log("💬 TURN 1: TradingAgent → PaymentProcessor");
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    );

    const message1 =
      "Hello! I'm TradingAgent. Can you help me process a payment of 1 HBAR for a trading service?";
    console.log(`   Message: "${message1}"\n`);

    // Helper function to send message with payment handling
    async function sendMessageWithPayment(
      messageText,
      contextId,
      paymentTxHash = null
    ) {
      const messageId = uuidv4();
      const params = {
        message: {
          kind: "message",
          role: "user",
          parts: [{ kind: "text", text: messageText }],
          messageId: messageId,
          contextId: contextId, // Use same contextId for multi-turn
          metadata: {
            fromAgentId: tradingAgent.id,
            fromAgentName: tradingAgent.name,
            ...(paymentTxHash
              ? {
                  payment: {
                    txHash: paymentTxHash,
                  },
                }
              : {}),
          },
        },
      };

      try {
        const httpResponse = await axios.post(
          `${SERVER_URL}/api/agents/${paymentAgent.id}/a2a`,
          {
            jsonrpc: "2.0",
            id: messageId,
            method: "message/send",
            params: params,
          },
          {
            validateStatus: (status) => status === 200 || status === 402,
          }
        );

        // Check if payment is required (HTTP 402)
        if (httpResponse.status === 402) {
          const jsonRpcResponse = httpResponse.data;
          const paymentDetails = jsonRpcResponse.error?.data?.payment;

          if (paymentDetails) {
            console.log("💳 Payment required!\n");
            console.log("📋 Payment Details:");
            console.log(
              `   Amount: ${paymentDetails.amount} ${paymentDetails.token}`
            );
            console.log(`   Address: ${paymentDetails.address}`);
            console.log(`   Request ID: ${paymentDetails.requestId}\n`);

            // Execute payment
            console.log("💰 Executing payment...");
            const txHash = await executePayment(paymentDetails);
            console.log(`   ✅ Payment executed! TxHash: ${txHash}\n`);

            // Wait for transaction to be indexed
            console.log(
              "⏳ Waiting 10 seconds for transaction to be indexed...\n"
            );
            await new Promise((resolve) => setTimeout(resolve, 10000));

            // Retry request with payment proof
            console.log("🔄 Retrying request with payment proof...");
            const retryParams = {
              ...params,
              message: {
                ...params.message,
                metadata: {
                  ...params.message.metadata,
                  payment: {
                    requestId: paymentDetails.requestId,
                    txHash: txHash,
                    amount: paymentDetails.amount,
                    token: paymentDetails.token,
                  },
                },
              },
            };

            const retryResponse = await axios.post(
              `${SERVER_URL}/api/agents/${paymentAgent.id}/a2a`,
              {
                jsonrpc: "2.0",
                id: messageId,
                method: "message/send",
                params: retryParams,
              },
              {
                headers: {
                  "X-Payment": txHash,
                },
              }
            );

            return { response: retryResponse.data, txHash };
          } else {
            throw new Error("Payment required but no payment details provided");
          }
        } else {
          // Normal 200 response
          return { response: httpResponse.data, txHash: paymentTxHash };
        }
      } catch (error) {
        if (error.response?.status === 402) {
          throw new Error(
            `Payment required: ${JSON.stringify(error.response.data)}`
          );
        }
        throw error;
      }
    }

    // Helper function to extract and display response
    function displayResponse(response, turnNumber) {
      console.log(`\n   ✅ Turn ${turnNumber} Response:`);
      console.log(`   Response type: ${response.result?.kind || "unknown"}`);

      if (response.result?.kind === "message") {
        const responseText = response.result.parts
          .filter((p) => p.kind === "text")
          .map((p) => p.text)
          .join("\n");
        console.log(`   PaymentProcessor: "${responseText}"\n`);
      } else if (response.result?.kind === "status-update") {
        const statusUpdate = response.result;
        console.log(`   Status: ${statusUpdate.status?.state}`);

        if (statusUpdate.status?.message) {
          const responseText = statusUpdate.status.message.parts
            .filter((p) => p.kind === "text")
            .map((p) => p.text)
            .join("\n");
          console.log(`   PaymentProcessor: "${responseText}"\n`);
        }
      } else if (response.result?.kind === "task") {
        const task = response.result;
        console.log(`   Task ID: ${task.id}`);
        console.log(`   Task state: ${task.status?.state}`);

        if (task.status?.message) {
          const responseText = task.status.message.parts
            .filter((p) => p.kind === "text")
            .map((p) => p.text)
            .join("\n");
          console.log(`   PaymentProcessor: "${responseText}"\n`);
        }
      } else {
        console.log("   Full response:", JSON.stringify(response, null, 2));
      }
    }

    // Send first message
    console.log("   Sending A2A message/send request...\n");
    const turn1Result = await sendMessageWithPayment(message1, contextId);
    const paymentTxHash = turn1Result.txHash;
    displayResponse(turn1Result.response, 1);

    // Wait a moment between turns
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // ========================================
    // TURN 2: Second message (same context, NO payment needed)
    // ========================================
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
    console.log("💬 TURN 2: TradingAgent → PaymentProcessor (Same Context)");
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    );

    const message2 =
      "Thank you! Can you also check my payment history and confirm the transaction was successful?";
    console.log(`   Message: "${message2}"\n`);
    console.log(
      `   ⚡ Using same contextId (${contextId}) - payment already verified!\n`
    );

    // Send second message with same contextId and paymentTxHash
    // Server should recognize context is already verified and skip payment check
    console.log("   Sending A2A message/send request...\n");
    const turn2Result = await sendMessageWithPayment(
      message2,
      contextId,
      paymentTxHash
    );
    displayResponse(turn2Result.response, 2);

    // Final summary
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
    console.log("✨ Multi-Turn Conversation Complete!");
    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    );
    console.log(`   Context ID: ${contextId}`);
    console.log(`   Payment TxHash: ${paymentTxHash}`);
    console.log(
      `   ✅ Turn 1: Required payment, verified context ${contextId}`
    );
    console.log(
      `   ✅ Turn 2: Context already verified, no payment required\n`
    );
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.response) {
      console.error("   Status:", error.response.status);
      console.error("   Data:", JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error("\nStack trace:", error.stack);
    }
    process.exit(1);
  }
}

/**
 * Execute payment on Hedera network
 */
async function executePayment(paymentDetails) {
  try {
    const recipient =
      paymentDetails.address ||
      paymentDetails.recipient ||
      HEDERA_CONFIG.OWNER_EVM_ADDRESS;
    const amount = paymentDetails.amount || "0.1";

    console.log(`   Recipient: ${recipient}`);
    console.log(`   Amount: ${amount} HBAR`);

    // Execute payment on Hedera
    const tx = await payerWallet.sendTransaction({
      to: recipient,
      value: ethers.parseEther(amount),
    });

    console.log(`   Transaction sent: ${tx.hash}`);
    console.log(`   Waiting for confirmation...`);

    // Wait for confirmation
    const receipt = await Promise.race([
      tx.wait(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Transaction timeout")), 30000)
      ),
    ]);

    return receipt.hash;
  } catch (error) {
    console.error("   ❌ Payment execution failed:", error.message);
    throw error;
  }
}

main();
