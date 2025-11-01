/**
 * Groq API Configuration
 * API_KEY must be set in environment variable GROQ_API_KEY
 */
export const GROQ_CONFIG = {
  API_KEY: process.env.GROQ_API_KEY,
  API_URL: "https://api.groq.com/openai/v1",
  
  // Default models for different agent types
  DEFAULT_MODEL: "llama-3.3-70b-versatile",
  
  // Model options
  MODELS: {
    VERSATILE: "llama-3.3-70b-versatile",     // Best for most tasks
    FAST: "llama-3.1-8b-instant",             // Fast responses
    REASONING: "llama-3.3-70b-versatile",     // Complex reasoning
    MIXTRAL: "mixtral-8x7b-32768"             // Mixtral model
  }
};

