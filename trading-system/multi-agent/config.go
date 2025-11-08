package multiagent

import "fmt"

// AgentConfig configuration for a single agent in multi-agent system
type AgentConfig struct {
	ID        string  `json:"id"`         // Unique agent ID
	Name      string  `json:"name"`       // Agent display name
	Model     string  `json:"model"`      // "groq", "qwen", "deepseek", or "custom"
	APIKey    string  `json:"api_key"`    // API key for this agent
	GroqModel string  `json:"groq_model,omitempty"` // Groq model name (if using Groq)
	Role      string  `json:"role,omitempty"`       // Agent role: "technical", "momentum", "risk", "trend"
	Weight    float64 `json:"weight,omitempty"`     // Weight for weighted consensus (0.0-1.0)
}

// MultiAgentConfig configuration for multi-agent system
type MultiAgentConfig struct {
	Enabled       bool          `json:"enabled"`        // Enable multi-agent mode
	ConsensusMode string        `json:"consensus_mode"` // "voting", "weighted", "unanimous", "best"
	FastFirst     bool          `json:"fast_first"`    // Use fast-first (don't wait for all)
	MinAgents     int           `json:"min_agents"`    // Minimum agents needed (for fast-first)
	MaxWaitTime   int           `json:"max_wait_time"` // Max wait time in seconds
	Agents        []AgentConfig `json:"agents"`        // List of agents
}

// Validate validates multi-agent configuration
func (c *MultiAgentConfig) Validate() error {
	if !c.Enabled {
		return nil // Not enabled, skip validation
	}

	if len(c.Agents) == 0 {
		return fmt.Errorf("at least one agent must be configured")
	}

	if len(c.Agents) < c.MinAgents {
		return fmt.Errorf("min_agents (%d) cannot be greater than total agents (%d)", c.MinAgents, len(c.Agents))
	}

	validModes := map[string]bool{
		"voting":    true,
		"weighted":  true,
		"unanimous": true,
		"best":      true,
	}
	if !validModes[c.ConsensusMode] {
		return fmt.Errorf("invalid consensus_mode: %s (must be: voting, weighted, unanimous, best)", c.ConsensusMode)
	}

	// Validate each agent
	agentIDs := make(map[string]bool)
	for i, agent := range c.Agents {
		if agent.ID == "" {
			return fmt.Errorf("agent[%d]: ID cannot be empty", i)
		}
		if agentIDs[agent.ID] {
			return fmt.Errorf("agent[%d]: duplicate ID '%s'", i, agent.ID)
		}
		agentIDs[agent.ID] = true

		if agent.Name == "" {
			return fmt.Errorf("agent[%d]: Name cannot be empty", i)
		}

		validModels := map[string]bool{
			"groq":     true,
			"qwen":     true,
			"deepseek": true,
			"custom":   true,
		}
		if !validModels[agent.Model] {
			return fmt.Errorf("agent[%d]: invalid model '%s'", i, agent.Model)
		}

		if agent.APIKey == "" {
			return fmt.Errorf("agent[%d]: API key cannot be empty", i)
		}

		if agent.Weight < 0 || agent.Weight > 1 {
			return fmt.Errorf("agent[%d]: weight must be between 0.0 and 1.0", i)
		}
	}

	return nil
}

