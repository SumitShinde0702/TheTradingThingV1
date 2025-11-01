/**
 * Example: Agent-to-Agent Transfer
 * 
 * Run from the server/ directory:
 *   node src/examples/a2a-transfer-example.js <fromAgentId> <toAgentId> <amount>
 * 
 * Or from project root:
 *   node server/src/examples/a2a-transfer-example.js <fromAgentId> <toAgentId> <amount>
 * 
 * Example:
 *   cd server
 *   node src/examples/a2a-transfer-example.js 13 14 0.1
 */

import axios from "axios";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:8443";
const INSECURE_HTTPS = process.env.INSECURE_HTTPS === "true";

const api = axios.create({
  baseURL: SERVER_URL,
  httpsAgent: INSECURE_HTTPS ? {
    rejectUnauthorized: false
  } : undefined
});

async function getAgentInfo(agentId) {
  try {
    const response = await api.get(`/api/agents/${agentId}`);
    return response.data.agent;
  } catch (error) {
    console.error(`Error getting agent ${agentId}:`, error.response?.data || error.message);
    return null;
  }
}

async function getBalance(address) {
  try {
    const response = await api.get(`/api/payments/balance/${address}`);
    return response.data.balance;
  } catch (error) {
    console.error("Error getting balance:", error.response?.data || error.message);
    return null;
  }
}

async function transferA2A(fromAgentId, toAgentId, amount, description) {
  console.log(`\n🔄 Initiating A2A Transfer...\n`);
  console.log(`   From: Agent ${fromAgentId}`);
  console.log(`   To: Agent ${toAgentId}`);
  console.log(`   Amount: ${amount} HBAR`);
  if (description) {
    console.log(`   Description: ${description}\n`);
  }

  try {
    const response = await api.post("/api/transfers/a2a", {
      fromAgentId,
      toAgentId,
      amount,
      token: "HBAR",
      description
    });

    if (response.data.success) {
      console.log("✅ Transfer successful!\n");
      console.log("   Transaction Hash:", response.data.transfer.txHash);
      console.log("   From Agent:", response.data.transfer.fromAgent.name);
      console.log("   To Agent:", response.data.transfer.toAgent.name);
      console.log("   Amount:", response.data.transfer.amount, response.data.transfer.token);
      
      return response.data;
    } else {
      console.error("❌ Transfer failed:", response.data);
      return null;
    }
  } catch (error) {
    if (error.response?.status === 402) {
      console.log("💳 Payment required!");
      console.log("   Payment details:", error.response.data);
      return error.response.data;
    }
    console.error("❌ Transfer error:", error.response?.data || error.message);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log("Usage: node a2a-transfer-example.js <fromAgentId> <toAgentId> <amount> [description]");
    console.log("\nExample:");
    console.log("  node a2a-transfer-example.js 13 14 0.1");
    console.log("  node a2a-transfer-example.js 13 14 0.5 \"Payment for trading service\"");
    process.exit(1);
  }

  const fromAgentId = args[0];
  const toAgentId = args[1];
  const amount = args[2];
  const description = args[3] || `Transfer from agent ${fromAgentId} to agent ${toAgentId}`;

  console.log("🤖 Agent-to-Agent Transfer Example\n");
  console.log(`   Server: ${SERVER_URL}\n`);

  // Get agent info
  console.log("📋 Fetching agent information...\n");
  const fromAgent = await getAgentInfo(fromAgentId);
  const toAgent = await getAgentInfo(toAgentId);

  if (!fromAgent) {
    console.error(`❌ Agent ${fromAgentId} not found`);
    process.exit(1);
  }

  if (!toAgent) {
    console.error(`❌ Agent ${toAgentId} not found`);
    process.exit(1);
  }

  console.log(`✅ From Agent: ${fromAgent.name} (ID: ${fromAgent.id})`);
  console.log(`   Status: ${fromAgent.status}`);
  console.log(`   Wallet: ${fromAgent.walletAddress || "Not set"}\n`);
  
  console.log(`✅ To Agent: ${toAgent.name} (ID: ${toAgent.id})`);
  console.log(`   Status: ${toAgent.status}`);
  console.log(`   Wallet: ${toAgent.walletAddress || "Not set"}\n`);

  // Check balances (if addresses available)
  if (fromAgent.walletAddress) {
    const balance = await getBalance(fromAgent.walletAddress);
    if (balance) {
      console.log(`💰 From Agent Balance: ${balance} HBAR\n`);
    }
  }

  // Confirm transfer
  console.log(`⚠️  Ready to transfer ${amount} HBAR from ${fromAgent.name} to ${toAgent.name}`);
  console.log("   Press Ctrl+C to cancel, or wait 3 seconds to proceed...\n");
  
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Execute transfer
  const result = await transferA2A(fromAgentId, toAgentId, amount, description);

  if (result && result.success) {
    console.log("\n✨ Transfer complete!");
    console.log(`\n   View transaction: https://hashscan.io/testnet/transaction/${result.transfer.txHash}`);
  } else {
    console.log("\n⚠️  Transfer may have failed. Check the errors above.");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("\n❌ Fatal error:", err.message);
  process.exit(1);
});

