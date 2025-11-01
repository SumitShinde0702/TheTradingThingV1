/**
 * Example: Agent-to-Agent communication using A2A protocol
 *
 * This demonstrates how two agents can communicate using the A2A protocol.
 * TradingAgent sends a message to PaymentProcessor via A2A.
 *
 * Usage:
 *   node src/examples/a2a-agent-communication-example.js
 */

import { A2AClient } from "@a2a-js/sdk/client";
import axios from "axios";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:8443";

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

    console.log("   Sending A2A message/send request...");
    // Use the client's sendMessage method with params object
    const response = await client.sendMessage(params);

    console.log("\n   ✅ Response received:");
    console.log("   Response type:", response.result?.kind || "unknown");

    if (response.result?.kind === "message") {
      const responseText = response.result.parts
        .filter((p) => p.kind === "text")
        .map((p) => p.text)
        .join("\n");
      console.log(`   Agent response: "${responseText}"\n`);
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

    console.log(
      "✨ Example complete! TradingAgent successfully communicated with PaymentProcessor using A2A protocol.\n"
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

main();
