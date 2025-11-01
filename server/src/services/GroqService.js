import axios from "axios";
import { GROQ_CONFIG } from "../config/groq.js";

/**
 * Groq AI Service - Powers agents with AI intelligence
 * Supports multiple Groq models for different agent types
 */
export class GroqService {
  constructor() {
    this.apiKey = GROQ_CONFIG.API_KEY;
    this.apiUrl = "https://api.groq.com/openai/v1/chat/completions";
    
    if (!this.apiKey) {
      console.warn("⚠️  GROQ_API_KEY not set. Agents will run without AI capabilities.");
    }
  }

  /**
   * Generate AI response using Groq
   * @param {Object} params - Chat parameters
   * @param {string} params.systemPrompt - System prompt for the agent
   * @param {string} params.userMessage - User message
   * @param {string} params.model - Groq model to use (default: llama-3.3-70b-versatile)
   * @param {number} params.temperature - Temperature (0-2)
   * @param {number} params.maxTokens - Max tokens to generate
   * @returns {Promise<string>}
   */
  async generateResponse({
    systemPrompt = "You are a helpful AI agent.",
    userMessage,
    model = "llama-3.3-70b-versatile",
    temperature = 0.7,
    maxTokens = 1000
  }) {
    if (!this.apiKey) {
      throw new Error("GROQ_API_KEY not configured");
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model,
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: userMessage
            }
          ],
          temperature,
          max_tokens: maxTokens
        },
        {
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error("Groq API error:", error.response?.data || error.message);
      throw new Error(`Groq API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Get appropriate model for agent type
   * @param {string} agentType - Type of agent (trading, payment, analytics, etc.)
   * @returns {string} - Model name
   */
  getModelForAgentType(agentType) {
    const modelMap = {
      trading: "llama-3.3-70b-versatile",      // Best for reasoning and analysis
      payment: "llama-3.3-70b-versatile",     // Versatile for various tasks
      analytics: "llama-3.3-70b-versatile",   // Good for data analysis
      general: "llama-3.3-70b-versatile",     // Default versatile model
      fast: "llama-3.1-8b-instant",           // Faster, smaller model
      reasoning: "llama-3.3-70b-versatile"    // Best for complex reasoning
    };

    return modelMap[agentType.toLowerCase()] || modelMap.general;
  }

  /**
   * Process agent message with context
   * @param {Object} params
   * @param {Object} params.agent - Agent object
   * @param {string} params.message - Incoming message
   * @param {string} params.fromAgentId - ID of agent sending message
   * @param {Object} params.context - Additional context (payment info, etc.)
   * @returns {Promise<string>}
   */
  async processAgentMessage({ agent, message, fromAgentId, context = {} }) {
    const agentType = agent.metadata?.type || "general";
    const model = this.getModelForAgentType(agentType);

    // Build system prompt based on agent
    const systemPrompt = this.buildSystemPrompt(agent, context);

    // Build user message with context
    const userPrompt = this.buildUserPrompt(message, fromAgentId, context);

    return await this.generateResponse({
      systemPrompt,
      userMessage: userPrompt,
      model,
      temperature: agent.metadata?.temperature || 0.7
    });
  }

  /**
   * Build system prompt for agent
   * @param {Object} agent - Agent object
   * @param {Object} context - Context information
   * @returns {string}
   */
  buildSystemPrompt(agent, context) {
    const basePrompt = `You are ${agent.name}, an autonomous AI agent. ${agent.description}`;

    let prompt = basePrompt;

    // Add capabilities
    if (agent.capabilities && agent.capabilities.length > 0) {
      prompt += `\n\nYour capabilities include: ${agent.capabilities.join(", ")}.`;
    }

    // Add agent-specific instructions
    if (agent.metadata?.instructions) {
      prompt += `\n\n${agent.metadata.instructions}`;
    }

    // Add type-specific instructions
    const type = agent.metadata?.type || "general";
    switch (type) {
      case "trading":
        prompt += `\n\nYou are a trading agent. You can analyze market conditions, provide trading insights, and help with trading decisions. Be professional and data-driven in your responses.`;
        break;
      case "payment":
        prompt += `\n\nYou are a payment processing agent. You handle payment requests, verify transactions, and provide payment-related information. Be clear and precise about payment details.`;
        break;
      case "analytics":
        prompt += `\n\nYou are a data analytics agent. You analyze data, provide insights, and help with data-driven decisions. Provide detailed and actionable analysis.`;
        break;
    }

    // Add context about blockchain/Hedera if relevant
    if (context.payment || context.blockchain) {
      prompt += `\n\nYou operate on the Hedera blockchain network. Payments may be required for services, and transactions are verifiable on-chain.`;
    }

    prompt += `\n\nAlways be helpful, professional, and concise in your responses.`;

    return prompt;
  }

  /**
   * Build user prompt with context
   * @param {string} message - Original message
   * @param {string} fromAgentId - Sender agent ID
   * @param {Object} context - Additional context
   * @returns {string}
   */
  buildUserPrompt(message, fromAgentId, context) {
    let prompt = `Message from agent ${fromAgentId}: ${message}`;

    if (context.payment) {
      if (context.payment.verified) {
        prompt += `\n\nNote: Payment has been verified and received.`;
      } else if (context.payment.required) {
        prompt += `\n\nNote: Payment is required for this service.`;
      }
    }

    if (context.timestamp) {
      prompt += `\n\nTimestamp: ${new Date(context.timestamp).toISOString()}`;
    }

    return prompt;
  }

  /**
   * Get available models
   * @returns {Array<string>}
   */
  getAvailableModels() {
    return [
      "llama-3.3-70b-versatile",    // Best overall, versatile
      "llama-3.1-8b-instant",        // Fast, smaller
      "llama-3.1-70b-versatile",     // Versatile, previous gen
      "mixtral-8x7b-32768"           // Mixtral model
    ];
  }
}

