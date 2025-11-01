/**
 * Example: Register a new agent with ERC-8004
 * 
 * Usage:
 *   node src/examples/register-agent-example.js
 */

import { ERC8004Service } from "../services/ERC8004Service.js";

async function main() {
  console.log("🚀 Registering example agent...\n");
  
  const erc8004Service = new ERC8004Service();
  
  try {
    // Register agent with metadata URI
    const result = await erc8004Service.registerAgent(
      "https://example.com/agent-metadata.json"
    );
    
    console.log("\n✅ Agent Registration Successful!");
    console.log("   Agent ID:", result.agentId);
    console.log("   Transaction Hash:", result.txHash);
    console.log("   Owner:", result.owner);
    
    // Verify agent exists
    console.log("\n🔍 Verifying agent registration...");
    const exists = await erc8004Service.agentExists(result.agentId);
    console.log("   Agent exists:", exists);
    
    if (exists) {
      const owner = await erc8004Service.getAgentOwner(result.agentId);
      const uri = await erc8004Service.getAgentURI(result.agentId);
      console.log("   Owner:", owner);
      console.log("   URI:", uri);
    }
    
  } catch (error) {
    console.error("\n❌ Error registering agent:", error.message);
    process.exit(1);
  }
}

main();

