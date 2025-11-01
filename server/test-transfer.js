/**
 * Quick test script for A2A transfers
 * Run from server/ directory: node test-transfer.js <fromAgentId> <toAgentId> <amount>
 */

import axios from "axios";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:8443";

const api = axios.create({
  baseURL: SERVER_URL
});

const args = process.argv.slice(2);

if (args.length < 3) {
  console.log("Usage: node test-transfer.js <fromAgentId> <toAgentId> <amount>");
  console.log("Example: node test-transfer.js 13 14 0.1");
  process.exit(1);
}

const [fromAgentId, toAgentId, amount] = args;

console.log(`\n🔄 Transferring ${amount} HBAR from agent ${fromAgentId} to agent ${toAgentId}...\n`);

try {
  const response = await api.post("/api/transfers/a2a", {
    fromAgentId,
    toAgentId,
    amount,
    token: "HBAR",
    description: `A2A transfer from agent ${fromAgentId} to agent ${toAgentId}`
  });

  if (response.data.success) {
    console.log("✅ Transfer successful!");
    console.log(`   Transaction Hash: ${response.data.transfer.txHash}`);
    console.log(`   From: ${response.data.transfer.fromAgent.name} (ID: ${response.data.transfer.fromAgent.id})`);
    console.log(`   To: ${response.data.transfer.toAgent.name} (ID: ${response.data.transfer.toAgent.id})`);
    console.log(`   Amount: ${response.data.transfer.amount} ${response.data.transfer.token}`);
    console.log(`\n   View on HashScan: https://hashscan.io/testnet/transaction/${response.data.transfer.txHash}`);
  } else {
    console.error("❌ Transfer failed:", response.data);
  }
} catch (error) {
  console.error("❌ Error:", error.response?.data || error.message);
  if (error.response?.status === 404) {
    console.log("\n💡 Make sure both agents exist. List agents with: curl http://localhost:8443/api/agents");
  }
  process.exit(1);
}

