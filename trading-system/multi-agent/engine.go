package multiagent

import (
	"fmt"
	"lia/decision"
	"lia/mcp"
	"log"
	"sync"
	"time"
)

// GetMultiAgentDecision gets trading decision from multiple agents using consensus
func GetMultiAgentDecision(ctx *decision.Context, config *MultiAgentConfig) (*decision.FullDecision, error) {
	if !config.Enabled || len(config.Agents) == 0 {
		return nil, fmt.Errorf("multi-agent not enabled or no agents configured")
	}

	log.Printf("🤖 [Multi-Agent] Starting decision with %d agents (mode: %s)", len(config.Agents), config.ConsensusMode)

	// 1. Create MCP clients for each agent
	clients := make([]*mcp.Client, len(config.Agents))
	for i, agent := range config.Agents {
		client := mcp.New()

		switch agent.Model {
		case "groq":
			client.SetGroqAPIKey(agent.APIKey, agent.GroqModel)
		case "qwen":
			// Qwen via Groq or direct - for now assume Groq
			client.SetGroqAPIKey(agent.APIKey, agent.GroqModel)
		case "deepseek":
			client.SetDeepSeekAPIKey(agent.APIKey)
		case "custom":
			// Would need custom API URL - skip for now
			log.Printf("⚠️  Agent %s: Custom API not fully supported yet", agent.ID)
			continue
		}

		clients[i] = client
	}

	// 2. Call all agents in parallel
	resultsChan := make(chan AgentResult, len(config.Agents))
	var wg sync.WaitGroup

	startTime := time.Now()

	for i, client := range clients {
		if client == nil {
			continue // Skip invalid clients
		}

		wg.Add(1)
		go func(idx int, c *mcp.Client, agentID string) {
			defer wg.Done()

			// Clone context for this agent to avoid concurrent map writes
			agentCtx := cloneContext(ctx)

			agentStart := time.Now()
			decision, err := decision.GetFullDecision(agentCtx, c)
			agentDuration := time.Since(agentStart)

			log.Printf("✅ Agent %s completed in %.2fs", agentID, agentDuration.Seconds())

			resultsChan <- AgentResult{
				Decision: decision,
				Err:      err,
				AgentID:  agentID,
				AgentIdx: idx,
			}
		}(i, client, config.Agents[i].ID)
	}

	// 3. Collect results with timeout (if fast-first enabled)
	var results []AgentResult
	timeout := time.After(time.Duration(config.MaxWaitTime) * time.Second)

	// Wait for results
	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	// Collect results
	done := false
	for !done && len(results) < len(config.Agents) {
		select {
		case result, ok := <-resultsChan:
			if !ok {
				// Channel closed, all agents finished
				done = true
				break
			}
			if result.Err == nil && result.Decision != nil {
				results = append(results, result)
				log.Printf("📥 Received decision from agent %s (%d/%d)",
					result.AgentID, len(results), len(config.Agents))

				// Fast-First: If we have enough, proceed immediately
				if config.FastFirst && len(results) >= config.MinAgents {
					log.Printf("⚡ Fast-First: Proceeding with %d agents (not waiting for all)", len(results))
					done = true
					break
				}
			} else {
				log.Printf("⚠️  Agent %s returned error: %v", result.AgentID, result.Err)
			}
		case <-timeout:
			log.Printf("⏱️  Timeout reached (%ds), using %d/%d agent responses",
				config.MaxWaitTime, len(results), len(config.Agents))
			done = true
		}
	}

	totalDuration := time.Since(startTime)
	log.Printf("⏱️  Total multi-agent time: %.2fs (collected %d/%d responses)",
		totalDuration.Seconds(), len(results), len(config.Agents))

	if len(results) == 0 {
		return nil, fmt.Errorf("no agents returned valid decisions")
	}

	// 4. Apply consensus logic
	finalDecision, err := ApplyConsensus(results, config)
	if err != nil {
		return nil, fmt.Errorf("consensus failed: %w", err)
	}

	log.Printf("✅ Consensus reached: %d decisions merged", len(finalDecision.Decisions))
	return finalDecision, nil
}

// createAgentClient creates an MCP client for an agent (helper function)
func createAgentClient(agent AgentConfig) *mcp.Client {
	client := mcp.New()

	switch agent.Model {
	case "groq":
		client.SetGroqAPIKey(agent.APIKey, agent.GroqModel)
	case "qwen":
		// For now, use Groq with Qwen model
		client.SetGroqAPIKey(agent.APIKey, agent.GroqModel)
	case "deepseek":
		client.SetDeepSeekAPIKey(agent.APIKey)
	}

	return client
}

// cloneContext creates a deep copy of the Context to avoid concurrent map writes
// Each agent gets its own context with separate maps to prevent race conditions
func cloneContext(original *decision.Context) *decision.Context {
	// Copy slices (shallow copy is fine, they're not modified)
	positions := make([]decision.PositionInfo, len(original.Positions))
	copy(positions, original.Positions)

	candidateCoins := make([]decision.CandidateCoin, len(original.CandidateCoins))
	copy(candidateCoins, original.CandidateCoins)

	// Create new context - maps will be populated by fetchMarketDataForContext
	// This ensures each agent has its own map instances, avoiding concurrent writes
	cloned := &decision.Context{
		CurrentTime:     original.CurrentTime,
		RuntimeMinutes:  original.RuntimeMinutes,
		CallCount:       original.CallCount,
		Account:         original.Account, // Struct copy
		Positions:       positions,
		CandidateCoins:  candidateCoins,
		MarketDataMap:   nil,                  // Will be created by fetchMarketDataForContext
		OITopDataMap:    nil,                  // Will be created by fetchMarketDataForContext
		Performance:     original.Performance, // Interface, shared is fine (read-only)
		BTCETHLeverage:  original.BTCETHLeverage,
		AltcoinLeverage: original.AltcoinLeverage,
	}

	return cloned
}
