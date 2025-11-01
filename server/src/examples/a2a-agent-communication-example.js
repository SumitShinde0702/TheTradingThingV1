/**
 * Example: Agent-to-Agent communication using A2A protocol with payment
 *
 * This demonstrates how two agents can communicate using the A2A protocol,
 * including handling payment requirements via x402 protocol.
 * TradingAgent sends a message to PaymentProcessor via A2A, handles payment,
 * and retries with payment proof.
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

    // Step 4: Send message from TradingAgent to PaymentProcessor
    console.log(
      "💬 Step 4: TradingAgent sending message to PaymentProcessor..."
    );
    const message =
      "Hello! I'm TradingAgent. Can you help me process a payment of 1 HBAR for a trading service?";
    console.log(`   Message: "${message}"\n`);

    const { v4: uuidv4 } = await import("uuid");

    // Create MessageSendParams object with message property
    const params = {
      message: {
        kind: "message",
        role: "user",
        parts: [{ kind: "text", text: message }],
        messageId: uuidv4(),
        metadata: {
          fromAgentId: tradingAgent.id,
          fromAgentName: tradingAgent.name,
        },
      },
    };

    console.log("   Sending A2A message/send request...\n");

    // Make direct HTTP call to handle 402 payment responses properly
    // (A2A client may not expose HTTP status codes directly)
    let response;
    let paymentTxHash = null;

    try {
      const httpResponse = await axios.post(
        `${SERVER_URL}/api/agents/${paymentAgent.id}/a2a`,
        {
          jsonrpc: "2.0",
          id: params.message.messageId,
          method: "message/send",
          params: params,
        },
        {
          validateStatus: (status) => status === 200 || status === 402, // Accept both 200 and 402
        }
      );

      // Check if payment is required (HTTP 402)
      if (httpResponse.status === 402) {
        console.log("💳 Payment required!\n");

        const jsonRpcResponse = httpResponse.data;
        const paymentDetails = jsonRpcResponse.error?.data?.payment;

        if (paymentDetails) {
          console.log("📋 Payment Details:");
          console.log(
            `   Amount: ${paymentDetails.amount} ${paymentDetails.token}`
          );
          console.log(`   Address: ${paymentDetails.address}`);
          console.log(`   Request ID: ${paymentDetails.requestId}\n`);

          // Execute payment
          console.log("💰 Executing payment...");
          paymentTxHash = await executePayment(paymentDetails);
          console.log(`   ✅ Payment executed! TxHash: ${paymentTxHash}\n`);

          // Wait a bit for transaction to be indexed by Hedera mirror node
          console.log(
            "⏳ Waiting 10 seconds for transaction to be indexed...\n"
          );
          await new Promise((resolve) => setTimeout(resolve, 10000));

          // Retry request with payment proof
          console.log("🔄 Retrying request with payment proof...");
          const retryResponse = await axios.post(
            `${SERVER_URL}/api/agents/${paymentAgent.id}/a2a`,
            {
              jsonrpc: "2.0",
              id: params.message.messageId,
              method: "message/send",
              params: {
                ...params,
                message: {
                  ...params.message,
                  metadata: {
                    ...params.message.metadata,
                    payment: {
                      requestId: paymentDetails.requestId,
                      txHash: paymentTxHash,
                      amount: paymentDetails.amount,
                      token: paymentDetails.token,
                    },
                  },
                },
              },
            },
            {
              headers: {
                "X-Payment": paymentTxHash, // Payment proof in header
              },
            }
          );

          response = retryResponse.data;
        } else {
          throw new Error("Payment required but no payment details provided");
        }
      } else {
        // Normal 200 response (no payment required)
        response = httpResponse.data;
      }
    } catch (error) {
      if (error.response?.status === 402) {
        // Handle 402 that wasn't caught above (shouldn't happen, but just in case)
        throw new Error(
          `Payment required: ${JSON.stringify(error.response.data)}`
        );
      }
      throw error;
    }

    // Process response
    console.log("\n   ✅ Response received:");
    console.log("   Response type:", response.result?.kind || "unknown");

    if (response.result?.kind === "message") {
      const responseText = response.result.parts
        .filter((p) => p.kind === "text")
        .map((p) => p.text)
        .join("\n");
      console.log(`   Agent response: "${responseText}"\n`);
    } else if (response.result?.kind === "status-update") {
      const statusUpdate = response.result;
      console.log(`   Status: ${statusUpdate.status?.state}`);

      if (statusUpdate.status?.message) {
        const responseText = statusUpdate.status.message.parts
          .filter((p) => p.kind === "text")
          .map((p) => p.text)
          .join("\n");
        console.log(`   Agent response: "${responseText}"\n`);
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
        console.log(`   Agent response: "${responseText}"\n`);
      }
    } else {
      console.log("   Full response:", JSON.stringify(response, null, 2));
    }

    if (paymentTxHash) {
      console.log(
        "✨ Example complete! TradingAgent successfully communicated with PaymentProcessor using A2A protocol with payment.\n"
      );
    } else {
      console.log(
        "✨ Example complete! TradingAgent successfully communicated with PaymentProcessor using A2A protocol.\n"
      );
    }
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
