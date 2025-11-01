/**
 * Agent Testing Script
 * Tests if agents are alive and working properly
 * 
 * Usage: node test-agents.js [options]
 */

import axios from "axios";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:8443";

// Create axios instance that ignores SSL errors (for self-signed certs)
const api = axios.create({
  baseURL: SERVER_URL,
  httpsAgent: process.env.INSECURE_HTTPS === "true" ? {
    rejectUnauthorized: false
  } : undefined,
  timeout: 30000
});

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function warning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

async function testHealth() {
  info("\n1. Testing Server Health...");
  try {
    const response = await api.get("/health");
    success(`Server is healthy. ${response.data.agents} agents registered.`);
    return true;
  } catch (err) {
    error(`Server health check failed: ${err.message}`);
    return false;
  }
}

async function testListAgents() {
  info("\n2. Testing Agent List...");
  try {
    const response = await api.get("/api/agents");
    const agents = response.data.agents || [];
    
    if (agents.length === 0) {
      warning("No agents found. Agents may not have registered successfully.");
      return null;
    }
    
    success(`Found ${agents.length} agents:`);
    agents.forEach(agent => {
      console.log(`   - ${agent.name} (ID: ${agent.id})`);
      console.log(`     Status: ${agent.status}`);
      console.log(`     AI Enabled: ${agent.aiEnabled ? 'Yes' : 'No'}`);
      console.log(`     Capabilities: ${agent.capabilities?.join(', ') || 'None'}`);
    });
    
    return agents;
  } catch (err) {
    error(`Failed to list agents: ${err.message}`);
    return null;
  }
}

async function testAgentDiscovery(agents) {
  info("\n3. Testing Agent Discovery...");
  if (!agents || agents.length === 0) {
    warning("Skipping discovery test - no agents available");
    return false;
  }

  try {
    // Get a capability from first agent
    const capability = agents[0].capabilities?.[0];
    if (!capability) {
      warning("No capabilities found for testing");
      return false;
    }

    const response = await api.get("/api/agents/discover", {
      params: { capability }
    });
    
    success(`Found ${response.data.count} agents with capability "${capability}"`);
    return true;
  } catch (err) {
    error(`Agent discovery failed: ${err.message}`);
    return false;
  }
}

async function testAIMessage(agent) {
  info(`\n4. Testing A2A Communication with ${agent.name}...`);
  
  try {
    const testMessage = "Hello! Can you tell me about yourself?";
    info(`Sending message: "${testMessage}"`);
    
    const response = await api.post(`/api/agents/${agent.id}/message`, {
      message: testMessage,
      fromAgentId: "test-client",
      payment: { required: false }
    });
    
    if (response.data.success) {
      success("Message sent successfully!");
      console.log(`   Response: ${response.data.response?.substring(0, 200)}...`);
      if (response.data.aiEnabled) {
        success("AI is enabled and responding!");
      } else {
        warning("AI is not enabled for this agent");
      }
      return true;
    } else {
      error("Message failed");
      return false;
    }
  } catch (err) {
    if (err.response?.status === 402) {
      warning("Payment required - this is expected behavior for paid services");
      return true;
    }
    error(`A2A communication failed: ${err.message}`);
    if (err.response?.data) {
      console.log(`   Error details: ${JSON.stringify(err.response.data, null, 2)}`);
    }
    return false;
  }
}

async function testAIDirect() {
  info("\n5. Testing AI Service Directly...");
  
  try {
    const response = await api.post("/api/ai/test", {
      message: "Say hello and confirm you're working",
      systemPrompt: "You are a helpful AI assistant."
    });
    
    if (response.data.success) {
      success("AI service is working!");
      console.log(`   AI Response: ${response.data.response?.substring(0, 200)}...`);
      return true;
    } else {
      error("AI test failed");
      return false;
    }
  } catch (err) {
    error(`AI test failed: ${err.message}`);
    if (err.response?.data) {
      console.log(`   Error: ${JSON.stringify(err.response.data, null, 2)}`);
    }
    return false;
  }
}

async function testAIModels() {
  info("\n6. Testing Available AI Models...");
  
  try {
    const response = await api.get("/api/ai/models");
    
    if (response.data.success) {
      success(`Found ${response.data.models.length} available models:`);
      response.data.models.forEach(model => {
        console.log(`   - ${model}`);
      });
      return true;
    } else {
      error("Failed to get models");
      return false;
    }
  } catch (err) {
    error(`Failed to get AI models: ${err.message}`);
    return false;
  }
}

async function testPaymentBalance() {
  info("\n7. Testing Payment Service (Balance Check)...");
  
  try {
    const address = "0x1fef1c22bbf2e66bc575c8b433d75588ab2aea92";
    const response = await api.get(`/api/payments/balance/${address}`);
    
    if (response.data.success) {
      success(`Balance check successful: ${response.data.balance} ${response.data.unit || 'HBAR'}`);
      return true;
    } else {
      error("Balance check failed");
      return false;
    }
  } catch (err) {
    error(`Balance check failed: ${err.message}`);
    return false;
  }
}

async function runAllTests() {
  log("\n" + "=".repeat(60), colors.blue);
  log("🧪 AGENT TESTING SUITE", colors.blue);
  log("=".repeat(60), colors.blue);
  
  const results = {
    health: false,
    listAgents: false,
    discovery: false,
    aiMessage: false,
    aiDirect: false,
    aiModels: false,
    payment: false
  };

  // Test 1: Health
  results.health = await testHealth();
  if (!results.health) {
    error("\n⚠️  Server is not responding. Make sure it's running on " + SERVER_URL);
    return;
  }

  // Test 2: List Agents
  const agents = await testListAgents();
  results.listAgents = agents !== null && agents.length > 0;

  // Test 3: Discovery
  results.discovery = await testAgentDiscovery(agents);

  // Test 4: A2A Communication (use first agent if available)
  if (agents && agents.length > 0) {
    results.aiMessage = await testAIMessage(agents[0]);
  } else {
    warning("\nSkipping A2A test - no agents available");
  }

  // Test 5: AI Direct
  results.aiDirect = await testAIDirect();

  // Test 6: AI Models
  results.aiModels = await testAIModels();

  // Test 7: Payment
  results.payment = await testPaymentBalance();

  // Summary
  log("\n" + "=".repeat(60), colors.blue);
  log("📊 TEST SUMMARY", colors.blue);
  log("=".repeat(60), colors.blue);
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([test, result]) => {
    const status = result ? "✅ PASS" : "❌ FAIL";
    const color = result ? colors.green : colors.red;
    log(`${test.padEnd(20)} ${status}`, color);
  });
  
  log("\n" + "=".repeat(60), colors.blue);
  log(`Results: ${passed}/${total} tests passed`, passed === total ? colors.green : colors.yellow);
  
  if (passed === total) {
    success("\n🎉 All tests passed! Your agents are working correctly!");
  } else {
    warning("\n⚠️  Some tests failed. Check the errors above.");
  }
}

// Run tests
runAllTests().catch(err => {
  error(`\nFatal error: ${err.message}`);
  process.exit(1);
});

