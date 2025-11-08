package trader

import (
	"lia/config"
	multiagent "lia/multi-agent"
)

// convertToMultiAgentConfig converts config.MultiAgentConfig to multiagent.MultiAgentConfig
func convertToMultiAgentConfig(cfg *config.MultiAgentConfig) *multiagent.MultiAgentConfig {
	if cfg == nil {
		return nil
	}
	
	agents := make([]multiagent.AgentConfig, len(cfg.Agents))
	for i, agent := range cfg.Agents {
		agents[i] = multiagent.AgentConfig{
			ID:        agent.ID,
			Name:      agent.Name,
			Model:     agent.Model,
			APIKey:    agent.APIKey,
			GroqModel: agent.GroqModel,
			Role:      agent.Role,
			Weight:    agent.Weight,
		}
	}
	
	return &multiagent.MultiAgentConfig{
		Enabled:       cfg.Enabled,
		ConsensusMode: cfg.ConsensusMode,
		FastFirst:     cfg.FastFirst,
		MinAgents:     cfg.MinAgents,
		MaxWaitTime:   cfg.MaxWaitTime,
		Agents:        agents,
	}
}

