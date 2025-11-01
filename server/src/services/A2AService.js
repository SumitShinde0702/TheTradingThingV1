// import { AgentCard, AgentSkill, AgentCapabilities } from "@a2a-js/sdk";
import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import express from "express";
import { HederaAgentExecutor } from "./A2AAgentExecutor.js";

/**
 * A2A Service - Manages A2A protocol integration for agents
 */
export class A2AService {
  constructor(agentManager, serverPort, serverUrl = null) {
    this.agentManager = agentManager;
    this.serverPort = serverPort;
    this.serverUrl = serverUrl || `http://localhost:${serverPort}`;
    this.agentApps = new Map(); // agentId -> { app, handler, executor }
  }

  /**
   * Create Agent Card from Agent model
   */
  createAgentCard(agent) {
    // Convert capabilities to skills
    const skills = agent.capabilities.map((cap) => {
      return {
        id: cap.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        name: cap.charAt(0).toUpperCase() + cap.slice(1),
        description: `Agent capability: ${cap}`,
        tags: [cap, ...agent.capabilities],
        examples: [`Use ${cap}`, `Help with ${cap}`],
      };
    });

    // If no capabilities, create a default skill
    if (skills.length === 0) {
      skills.push({
        id: "general",
        name: "General Assistance",
        description: agent.description || "General purpose agent",
        tags: ["general"],
        examples: ["Help me", "What can you do?"],
      });
    }

    const agentCard = {
      name: agent.name,
      description: agent.description || `${agent.name} agent`,
      url: `${this.serverUrl}/api/agents/${agent.id}/a2a`,
      version: agent.metadata?.version || "1.0.0",
      defaultInputModes: ["text"],
      defaultOutputModes: ["text"],
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      skills: skills,
      supportsAuthenticatedExtendedCard: false,
    };

    return agentCard;
  }

  /**
   * Setup A2A endpoints for an agent
   * Returns a router that can be mounted
   */
  setupAgentA2A(agent) {
    if (this.agentApps.has(agent.id)) {
      // Already set up
      return this.agentApps.get(agent.id).router;
    }

    // Create executor
    const executor = new HederaAgentExecutor(agent, this.agentManager);

    // Create task store
    const taskStore = new InMemoryTaskStore();

    // Create agent card
    const agentCard = this.createAgentCard(agent);

    // Create request handler
    const requestHandler = new DefaultRequestHandler(
      agentCard,
      taskStore,
      executor
    );

    // Create Express router for this agent
    const agentRouter = express.Router();

    // Setup A2A routes on the router (base path is empty since we'll mount it)
    const appBuilder = new A2AExpressApp(requestHandler);
    appBuilder.setupRoutes(agentRouter, "");

    // Store for later use
    this.agentApps.set(agent.id, {
      router: agentRouter,
      handler: requestHandler,
      executor: executor,
      card: agentCard,
    });

    return agentRouter;
  }

  /**
   * Get agent card for an agent
   */
  getAgentCard(agentId) {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent) {
      return null;
    }

    const cached = this.agentApps.get(agentId);
    if (cached) {
      return cached.card;
    }

    // Create card on the fly
    return this.createAgentCard(agent);
  }

  /**
   * Get A2A Express router for an agent
   */
  getAgentRouter(agentId) {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent) {
      return null;
    }

    return this.setupAgentA2A(agent);
  }

  /**
   * Setup A2A for all registered agents
   */
  setupAllAgents() {
    const agents = this.agentManager.getAllAgents();
    agents.forEach((agent) => {
      this.setupAgentA2A(agent);
    });
    console.log(`✅ A2A setup complete for ${agents.length} agents`);
  }
}
