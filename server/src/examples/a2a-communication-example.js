/**
 * Example: Agent-to-Agent communication with payment
 * 
 * Usage:
 *   node src/examples/a2a-communication-example.js <agentId> <message>
 */

import axios from "axios";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:8443";
const INSECURE_HTTPS = process.env.INSECURE_HTTPS === "true";

// Create axios instance that ignores SSL errors (for self-signed certs)
const api = axios.create({
  baseURL: SERVER_URL,
  httpsAgent: INSECURE_HTTPS ? {
    rejectUnauthorized: false
  } : undefined
});

async function discoverAgents(capability) {
  console.log(`🔍 Discovering agents with capability: ${capability}...\n`);
  
  try {
    const response = await api.get("/api/agents/discover", {
      params: { capability }
    });
    
    console.log(`✅ Found ${response.data.count} agents:`);
    response.data.agents.forEach(agent => {
      console.log(`   - ${agent.name} (ID: ${agent.id})`);
      console.log(`     Status: ${agent.status}`);
      console.log(`     Endpoint: ${agent.endpoint}\n`);
    });
    
    return response.data.agents;
  } catch (error) {
    console.error("❌ Error discovering agents:", error.response?.data || error.message);
    return [];
  }
}

async function sendMessage(agentId, message, fromAgentId = "example") {
  console.log(`💬 Sending message to agent ${agentId}...\n`);
  
  try {
    const response = await api.post(`/api/agents/${agentId}/message`, {
      message,
      fromAgentId,
      payment: {
        required: false
      }
    });
    
    console.log("✅ Message sent successfully!");
    console.log("   Response:", response.data.response);
    
    return response.data;
  } catch (error) {
    if (error.response?.status === 402) {
      console.log("💳 Payment required!");
      console.log("   Payment details:", error.response.data.payment);
      
      // In a real scenario, you would execute the payment here
      console.log("\n   To complete payment, execute:");
      console.log(`   curl -X POST ${SERVER_URL}/api/payments/execute \\`);
      console.log(`     -H "Content-Type: application/json" \\`);
      console.log(`     -d '{"recipient":"${error.response.data.payment.recipient}","amount":"${error.response.data.payment.amount}"}'`);
      
      return error.response.data;
    } else {
      console.error("❌ Error sending message:", error.response?.data || error.message);
      return null;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log("Usage: node a2a-communication-example.js <capability> [message]");
    console.log("\nExample:");
    console.log("  node a2a-communication-example.js trade");
    console.log("  node a2a-communication-example.js trade 'Hello, trading agent!'");
    process.exit(1);
  }
  
  const capability = args[0];
  const message = args[1] || "Hello from example client!";
  
  console.log("🤖 Agent-to-Agent Communication Example\n");
  console.log(`   Server: ${SERVER_URL}`);
  console.log(`   Capability: ${capability}`);
  console.log(`   Message: ${message}\n`);
  
  // Discover agents
  const agents = await discoverAgents(capability);
  
  if (agents.length === 0) {
    console.log("⚠️  No agents found with that capability.");
    console.log("   Make sure the server is running and agents are registered.");
    process.exit(1);
  }
  
  // Send message to first agent
  const targetAgent = agents[0];
  await sendMessage(targetAgent.id, message, "example-client");
  
  console.log("\n✨ Example complete!");
}

main();

