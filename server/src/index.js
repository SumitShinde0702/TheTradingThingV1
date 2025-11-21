import "dotenv/config"; // Load environment variables from .env file
import express from "express";
import cors from "cors";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AgentManager } from "./services/AgentManager.js";
import { A2AService } from "./services/A2AService.js";
import { createAgentRoutes } from "./routes/agents.js";
import { createPaymentRoutes } from "./routes/payments.js";
import { createAIRoutes } from "./routes/ai.js";
import { createTransferRoutes } from "./routes/transfers.js";
import { createA2ARoutes } from "./routes/a2a.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8443;

// Middleware
app.use(cors({
  origin: true, // Allow all origins (for development)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Payment']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize agent manager
const agentManager = new AgentManager();

// Initialize A2A service
const a2aService = new A2AService(agentManager, PORT);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: Date.now(),
    agents: agentManager.getAllAgents().length,
  });
});

// API Routes
app.use("/api/agents", createAgentRoutes(agentManager));
app.use("/api/payments", createPaymentRoutes(agentManager));
app.use("/api/ai", createAIRoutes(agentManager));
app.use("/api/transfers", createTransferRoutes(agentManager));

// A2A Routes (Agent-to-Agent protocol)
app.use("/api", createA2ARoutes(agentManager, a2aService));

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "Hedera Agent Server",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      agents: "/api/agents",
      payments: "/api/payments",
      ai: "/api/ai",
      transfers: "/api/transfers",
    },
    agents: agentManager.getAllAgents().length,
    aiEnabled: true,
  });
});

// Load SSL certificates (for HTTPS)
// In development, you can use self-signed certificates
// In production, use proper SSL certificates
const httpsOptions = {
  key: null,
  cert: null,
};

// Try to load SSL certificates if they exist
const keyPath = path.join(__dirname, "../certs/key.pem");
const certPath = path.join(__dirname, "../certs/cert.pem");

try {
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    httpsOptions.key = fs.readFileSync(keyPath);
    httpsOptions.cert = fs.readFileSync(certPath);
    console.log("✅ SSL certificates loaded");
  }
} catch (error) {
  console.warn("⚠️  SSL certificates not found. Using HTTP mode.");
  console.warn(
    "   To enable HTTPS, place key.pem and cert.pem in the certs/ directory"
  );
}

// Start server
if (httpsOptions.key && httpsOptions.cert) {
  // HTTPS server
  const server = https.createServer(httpsOptions, app);
  server.listen(PORT, () => {
    console.log(`🚀 Hedera Agent Server running on https://localhost:${PORT}`);
    console.log(`📡 Agents endpoint: https://localhost:${PORT}/api/agents`);
    console.log(`💳 Payments endpoint: https://localhost:${PORT}/api/payments`);
  });
} else {
  // HTTP server (fallback)
  app.listen(PORT, () => {
    console.log(`🚀 Hedera Agent Server running on http://localhost:${PORT}`);
    console.log(
      `⚠️  WARNING: Running in HTTP mode. For production, use HTTPS.`
    );
    console.log(`📡 Agents endpoint: http://localhost:${PORT}/api/agents`);
    console.log(`💳 Payments endpoint: http://localhost:${PORT}/api/payments`);
    console.log(
      `🤝 A2A endpoints: http://localhost:${PORT}/api/agents/:agentId/.well-known/agent-card.json`
    );
  });
}

// Register example agents on startup
async function initializeAgents() {
  try {
    console.log("\n📝 Initializing example agents...");

    // Example Agent 1: Trading Agent
    // Skip on-chain check during initialization to avoid connection issues
    const tradingAgent = await agentManager.registerAgent({
      name: "TradingAgent",
      description: "Autonomous trading agent for cryptocurrency markets",
      capabilities: ["trade", "analyze", "execute"],
      endpoint: `https://localhost:${PORT}/api/agents/trading`,
      aiEnabled: true,
      metadata: {
        type: "trading",
        version: "1.0.0",
        instructions:
          "You are an expert trading agent. Provide insightful market analysis and trading recommendations based on data and trends.",
      },
    }, true); // skipOnChainCheck = true

    tradingAgent.setStatus("online");
    console.log(
      `✅ ${tradingAgent.name} registered with ID: ${tradingAgent.id}`
    );

    // Example Agent 2: Payment Processor (requires payment)
    const paymentAgent = await agentManager.registerAgent({
      name: "PaymentProcessor",
      description: "Handles payment processing and verification",
      capabilities: ["process_payment", "verify", "escrow"],
      endpoint: `https://localhost:${PORT}/api/agents/payment`,
      aiEnabled: true,
      requiresPayment: true, // This agent requires payment for A2A requests
      paymentAmount: "0.1", // 0.1 HBAR
      metadata: {
        type: "payment",
        version: "1.0.0",
        instructions:
          "You are a PaymentProcessor agent. When you receive a payment request message like 'Process payment for model access. Model: [OpenAI/Qwen]. Amount: 1 HBAR': " +
          "1. Acknowledge the payment request: 'Payment request received for [modelName]. Processing...' " +
          "2. Note: The actual payment is handled by the server's payment endpoint, not by you. " +
          "3. Return a confirmation message: 'Payment processed successfully for [modelName]. Transaction hash: [mock_tx_hash_abc123...]' " +
          "4. Format your response clearly indicating payment completion. " +
          "Since payment is server-side, your role is to acknowledge and confirm the payment request.",
      },
    }, true); // skipOnChainCheck = true

    paymentAgent.setStatus("online");
    console.log(
      `✅ ${paymentAgent.name} registered with ID: ${paymentAgent.id}`
    );

    // Example Agent 3: Data Analyzer
    const analyzerAgent = await agentManager.registerAgent({
      name: "DataAnalyzer",
      description: "Analyzes market data and provides insights",
      capabilities: ["analyze", "predict", "report"],
      endpoint: `https://localhost:${PORT}/api/agents/analyzer`,
      aiEnabled: true,
      metadata: {
        type: "analytics",
        version: "1.0.0",
        instructions:
          "You are a DataAnalyzer agent. When you receive a request to get trading signals like 'Get the latest trading signal from [OpenAI/Qwen] AI trading model', you must: " +
          "1. Map the model name to trader_id: 'OpenAI' → 'openai_trader', 'Qwen' → 'qwen_trader' " +
          "2. Fetch the trading signal from the Go API: GET http://172.23.240.1:8080/api/trading-signal?trader_id=[trader_id] " +
          "3. Parse the response and extract: decisions (long/short/wait actions with symbols/quantities), chain_of_thought, input_prompt, account_state " +
          "4. Format your response clearly: " +
          "   'Trading Signal for [modelName]: " +
          "   Decisions: [action] [symbol] [quantity] " +
          "   Chain of Thought: [reasoning] " +
          "   Input Prompt: [context] " +
          "   Account State: [equity, PnL, positions] " +
          "   Full Signal Data: [JSON of complete signal]' " +
          "5. The decisions array is the MOST IMPORTANT part - show it prominently. " +
          "6. Return the complete signal data so the orchestrator can forward it to TradeExecutor.",
      },
    }, true); // skipOnChainCheck = true

    analyzerAgent.setStatus("online");
    console.log(
      `✅ ${analyzerAgent.name} registered with ID: ${analyzerAgent.id}`
    );

    // Example Agent 4: Trade Executor (executes trades based on signals)
    const tradeExecutor = await agentManager.registerAgent({
      name: "TradeExecutor",
      description: "Executes trades on exchanges based on trading signals",
      capabilities: ["execute", "trade", "exchange"],
      endpoint: `https://localhost:${PORT}/api/agents/trade-executor`,
      aiEnabled: true,
      metadata: {
        type: "execution",
        version: "1.0.0",
        instructions:
          "You are a trade execution agent. When you receive a trading signal with decisions (long/short/wait actions), respond with 'Received signal: [ACTION] [SYMBOL] [QUANTITY]'. " +
          "For example: 'Received signal: SHORT BTCUSDT 100', 'Received signal: LONG ETHUSDT 50', 'Received signal: WAIT'. " +
          "For now, you are in MOCK mode - just acknowledge the signal you received. Extract the action, symbol, and quantity from the decisions array in the signal.",
      },
    }, true); // skipOnChainCheck = true

    tradeExecutor.setStatus("online");
    console.log(
      `✅ ${tradeExecutor.name} registered with ID: ${tradeExecutor.id}`
    );

    console.log(
      `\n✨ All agents initialized. Total: ${
        agentManager.getAllAgents().length
      }\n`
    );

    // Setup A2A endpoints for all agents
    console.log("🔗 Setting up A2A endpoints...");
    a2aService.setupAllAgents();
    console.log("✅ A2A endpoints ready!\n");
    console.log("   Example Agent Card URLs:");
    agentManager.getAllAgents().forEach((agent) => {
      console.log(
        `   - ${agent.name}: http://localhost:${PORT}/api/agents/${agent.id}/.well-known/agent-card.json`
      );
      console.log(
        `     A2A endpoint: http://localhost:${PORT}/api/agents/${agent.id}/a2a`
      );
    });
  } catch (error) {
    console.error("Error initializing agents:", error);
  }
}

// Initialize agents after a short delay to ensure server is ready
setTimeout(initializeAgents, 1000);

export { app, agentManager };
