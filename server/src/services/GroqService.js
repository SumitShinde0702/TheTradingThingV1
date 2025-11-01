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

    // For trading agents, fetch latest trading signal from nofx API if payment is verified
    let tradingData = null;
    if (agentType === "trading" && context.paymentVerified) {
      try {
        tradingData = await this.fetchTradingSignal(agent);
        console.log(`[GroqService] Fetched trading signal for ${agent.name}`);
      } catch (error) {
        console.error(`[GroqService] Failed to fetch trading signal: ${error.message}`);
        // Continue without trading data if fetch fails
      }
    }

    // Build system prompt based on agent
    const systemPrompt = this.buildSystemPrompt(agent, context, tradingData);

    // Build user message with context
    const userPrompt = this.buildUserPrompt(message, fromAgentId, context, tradingData);

    return await this.generateResponse({
      systemPrompt,
      userMessage: userPrompt,
      model,
      temperature: agent.metadata?.temperature || 0.7
    });
  }

  /**
   * Fetch latest trading signal from nofx API
   * @param {Object} agent - Trading agent object
   * @returns {Promise<Object|null>} Trading signal data or null if unavailable
   */
  async fetchTradingSignal(agent) {
    // Get nofx API URL from environment or agent metadata
    const nofxApiUrl = 
      agent.metadata?.nofxApiUrl || 
      process.env.NOFX_API_URL || 
      "http://localhost:8080"; // Default nofx API port
    
    // Get trader ID or model from agent metadata
    const traderId = agent.metadata?.traderId || agent.metadata?.trader_id;
    const model = agent.metadata?.model;
    
    let apiUrl;
    if (traderId) {
      apiUrl = `${nofxApiUrl}/api/trading-signal?trader_id=${traderId}`;
    } else if (model) {
      apiUrl = `${nofxApiUrl}/api/trading-signal?model=${model}`;
    } else {
      // Default: try to get first trader (if nofx only has one trader)
      apiUrl = `${nofxApiUrl}/api/trading-signal?trader_id=default_trader`;
    }

    try {
      const response = await axios.get(apiUrl, {
        timeout: 10000, // 10 second timeout
        validateStatus: (status) => status === 200 || status === 404
      });

      if (response.status === 404) {
        console.warn(`[GroqService] Trading signal not found at ${apiUrl}`);
        return null;
      }

      return response.data;
    } catch (error) {
      console.error(`[GroqService] Error fetching trading signal from ${apiUrl}:`, error.message);
      throw error;
    }
  }

  /**
   * Build system prompt for agent
   * @param {Object} agent - Agent object
   * @param {Object} context - Context information
   * @param {Object} tradingData - Trading signal data (optional)
   * @returns {string}
   */
  buildSystemPrompt(agent, context, tradingData = null) {
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
        if (tradingData) {
          prompt += `\n\nYou have access to real-time trading decision data from the NOFX trading system. When presenting this data to users, format it clearly and provide actionable insights.`;
        }
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
   * @param {Object} tradingData - Trading signal data (optional)
   * @returns {string}
   */
  buildUserPrompt(message, fromAgentId, context, tradingData = null) {
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

    // Include trading data in the prompt if available
    if (tradingData) {
      prompt += `\n\n=== LATEST TRADING SIGNAL FROM NOFX SYSTEM ===`;
      prompt += `\nTrader: ${tradingData.trader_name || tradingData.trader_id || 'Unknown'}`;
      prompt += `\nAI Model: ${tradingData.ai_model || 'Unknown'}`;
      prompt += `\nCycle #${tradingData.cycle_number || 'N/A'}`;
      prompt += `\nTimestamp: ${tradingData.timestamp || 'N/A'}`;
      
      if (tradingData.chain_of_thought) {
        prompt += `\n\nChain of Thought:`;
        prompt += `\n${tradingData.chain_of_thought}`;
      }
      
      if (tradingData.decisions && Array.isArray(tradingData.decisions)) {
        prompt += `\n\nTrading Decisions (${tradingData.decisions.length}):`;
        tradingData.decisions.forEach((decision, idx) => {
          prompt += `\n  [${idx + 1}] ${decision.symbol || 'ALL'}: ${decision.action || 'N/A'}`;
          if (decision.reasoning || decision.error) {
            prompt += ` - ${decision.reasoning || decision.error}`;
          }
        });
      }
      
      if (tradingData.account_state) {
        prompt += `\n\nAccount State:`;
        prompt += `\n  Total Equity: ${tradingData.account_state.total_equity || 'N/A'} USDT`;
        prompt += `\n  Available Balance: ${tradingData.account_state.available_balance || 'N/A'} USDT`;
        prompt += `\n  Position Count: ${tradingData.account_state.position_count || 0}`;
        prompt += `\n  Margin Used: ${tradingData.account_state.margin_used_pct || 0}%`;
      }
      
      prompt += `\n\n=== END TRADING SIGNAL ===`;
      prompt += `\n\nBased on this real-time trading data, provide a helpful response to the user's query. If the user is asking about trading signals, decisions, or market analysis, use this data to provide accurate and up-to-date information.`;
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

