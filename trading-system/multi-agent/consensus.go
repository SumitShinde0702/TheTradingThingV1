package multiagent

import (
	"fmt"
	"lia/decision"
	"log"
)

// AgentResult represents a single agent's decision result
// Exported so it can be used in engine.go
type AgentResult struct {
	Decision *decision.FullDecision
	Err      error
	AgentID  string
	AgentIdx int
}

// ApplyConsensus applies consensus logic to combine multiple agent decisions
func ApplyConsensus(results []AgentResult, config *MultiAgentConfig) (*decision.FullDecision, error) {
	if len(results) == 0 {
		return nil, fmt.Errorf("no results to apply consensus")
	}

	// Filter out nil decisions
	validResults := make([]AgentResult, 0)
	for _, r := range results {
		if r.Decision != nil && len(r.Decision.Decisions) > 0 {
			validResults = append(validResults, r)
		}
	}

	if len(validResults) == 0 {
		// All agents said wait or had errors - return a wait decision
		return &decision.FullDecision{
			Decisions: []decision.Decision{
				{
					Symbol:    "ALL",
					Action:    "wait",
					Reasoning: "All agents recommended waiting",
				},
			},
		}, nil
	}

	// If only one valid result, return it
	if len(validResults) == 1 {
		return validResults[0].Decision, nil
	}

	// Apply consensus based on mode
	switch config.ConsensusMode {
	case "voting":
		return votingConsensus(validResults, config)
	case "weighted":
		return weightedConsensus(validResults, config)
	case "unanimous":
		return unanimousConsensus(validResults, config)
	case "best":
		return bestConsensus(validResults, config)
	default:
		return votingConsensus(validResults, config) // Default to voting
	}
}

// votingConsensus uses majority voting
func votingConsensus(results []AgentResult, config *MultiAgentConfig) (*decision.FullDecision, error) {
	log.Printf("🗳️  Applying voting consensus with %d agents", len(results))

	// Group decisions by symbol+action
	type decisionKey struct {
		symbol string
		action string
	}
	votes := make(map[decisionKey]int)
	decisionMap := make(map[decisionKey]*decision.Decision)

	// Count votes
	for _, result := range results {
		for _, d := range result.Decision.Decisions {
			key := decisionKey{symbol: d.Symbol, action: d.Action}
			votes[key]++
			if votes[key] == 1 {
				// Store first occurrence as template
				decisionMap[key] = &d
			}
		}
	}

	// Find decisions with majority vote
	majorityThreshold := len(results) / 2
	if majorityThreshold == 0 {
		majorityThreshold = 1
	}

	finalDecisions := make([]decision.Decision, 0)
	for key, voteCount := range votes {
		if voteCount > majorityThreshold {
			finalDecisions = append(finalDecisions, *decisionMap[key])
			log.Printf("✅ Consensus: %s %s (votes: %d/%d)", key.symbol, key.action, voteCount, len(results))
		}
	}

	// If no majority, return wait
	if len(finalDecisions) == 0 {
		log.Printf("⚠️  No majority consensus, defaulting to wait")
		return &decision.FullDecision{
			Decisions: []decision.Decision{
				{
					Symbol:    "ALL",
					Action:    "wait",
					Reasoning: "No majority consensus reached",
				},
			},
		}, nil
	}

	// Combine chain of thought from all agents
	combinedCoT := ""
	for i, result := range results {
		if result.Decision.CoTTrace != "" {
			combinedCoT += fmt.Sprintf("=== Agent %s ===\n%s\n\n", result.AgentID, result.Decision.CoTTrace)
		}
		if i >= 2 {
			// Limit to first 3 agents to avoid too long
			break
		}
	}

	return &decision.FullDecision{
		Decisions:   finalDecisions,
		CoTTrace:    combinedCoT,
		UserPrompt:  results[0].Decision.UserPrompt, // Use first agent's prompt
		RawResponse: fmt.Sprintf("Consensus from %d agents", len(results)),
	}, nil
}

// weightedConsensus uses weighted voting based on agent weights
func weightedConsensus(results []AgentResult, config *MultiAgentConfig) (*decision.FullDecision, error) {
	log.Printf("⚖️  Applying weighted consensus with %d agents", len(results))

	// Create map of agent ID to weight
	agentWeights := make(map[string]float64)
	totalWeight := 0.0
	for _, agent := range config.Agents {
		weight := agent.Weight
		if weight == 0 {
			weight = 1.0 / float64(len(config.Agents)) // Equal weight if not specified
		}
		agentWeights[agent.ID] = weight
		totalWeight += weight
	}

	// Normalize weights
	for id := range agentWeights {
		agentWeights[id] /= totalWeight
	}

	// Group decisions by symbol+action with weighted votes
	type decisionKey struct {
		symbol string
		action string
	}
	weightedVotes := make(map[decisionKey]float64)
	decisionMap := make(map[decisionKey]*decision.Decision)
	confidenceSum := make(map[decisionKey]float64)

	for _, result := range results {
		weight := agentWeights[result.AgentID]
		for _, d := range result.Decision.Decisions {
			key := decisionKey{symbol: d.Symbol, action: d.Action}
			weightedVotes[key] += weight
			confidenceSum[key] += float64(d.Confidence) * weight
			if weightedVotes[key] == weight {
				// First occurrence
				decisionMap[key] = &d
			}
		}
	}

	// Find decisions with >50% weighted vote
	finalDecisions := make([]decision.Decision, 0)
	for key, voteWeight := range weightedVotes {
		if voteWeight > 0.5 {
			d := *decisionMap[key]
			// Average confidence
			if confidenceSum[key] > 0 {
				d.Confidence = int(confidenceSum[key] / voteWeight)
			}
			finalDecisions = append(finalDecisions, d)
			log.Printf("✅ Weighted consensus: %s %s (weight: %.2f%%)", key.symbol, key.action, voteWeight*100)
		}
	}

	if len(finalDecisions) == 0 {
		return &decision.FullDecision{
			Decisions: []decision.Decision{
				{
					Symbol:    "ALL",
					Action:    "wait",
					Reasoning: "No weighted consensus reached",
				},
			},
		}, nil
	}

	combinedCoT := ""
	for i, result := range results {
		if result.Decision.CoTTrace != "" {
			combinedCoT += fmt.Sprintf("=== Agent %s (weight: %.1f%%) ===\n%s\n\n",
				result.AgentID, agentWeights[result.AgentID]*100, result.Decision.CoTTrace)
		}
		if i >= 2 {
			break
		}
	}

	return &decision.FullDecision{
		Decisions:   finalDecisions,
		CoTTrace:    combinedCoT,
		UserPrompt:  results[0].Decision.UserPrompt,
		RawResponse: fmt.Sprintf("Weighted consensus from %d agents", len(results)),
	}, nil
}

// unanimousConsensus requires all agents to agree
func unanimousConsensus(results []AgentResult, config *MultiAgentConfig) (*decision.FullDecision, error) {
	log.Printf("🤝 Applying unanimous consensus (all %d agents must agree)", len(results))

	// Check if all agents have the same decisions
	if len(results) == 0 {
		return nil, fmt.Errorf("no results")
	}

	firstDecisions := results[0].Decision.Decisions
	if len(firstDecisions) == 0 {
		return &decision.FullDecision{
			Decisions: []decision.Decision{
				{
					Symbol:    "ALL",
					Action:    "wait",
					Reasoning: "First agent recommended waiting",
				},
			},
		}, nil
	}

	// Check if all other agents have matching decisions
	for i := 1; i < len(results); i++ {
		otherDecisions := results[i].Decision.Decisions
		if !decisionsMatch(firstDecisions, otherDecisions) {
			log.Printf("⚠️  Agents disagree - no unanimous consensus")
			return &decision.FullDecision{
				Decisions: []decision.Decision{
					{
						Symbol:    "ALL",
						Action:    "wait",
						Reasoning: "Agents did not reach unanimous agreement",
					},
				},
			}, nil
		}
	}

	log.Printf("✅ Unanimous consensus reached!")
	return results[0].Decision, nil
}

// bestConsensus picks the decision with highest confidence
// Prioritizes actual trades over "wait" decisions
func bestConsensus(results []AgentResult, config *MultiAgentConfig) (*decision.FullDecision, error) {
	log.Printf("🏆 Applying best consensus (highest confidence)")

	bestDecision := results[0].Decision
	bestConfidence := 0
	hasActualTrade := false

	// First pass: Find best actual trade (not "wait")
	// Prioritize any action over "wait", even if confidence is 0
	for _, result := range results {
		for _, d := range result.Decision.Decisions {
			// Prioritize actual trades over "wait" (include close actions)
			isTrade := d.Action != "wait" && d.Symbol != "ALL" &&
				(d.Action == "open_long" || d.Action == "open_short" ||
					d.Action == "close_long" || d.Action == "close_short" ||
					d.Action == "hold")
			// Accept trades even with confidence 0 (close actions often don't have confidence)
			if isTrade {
				// If this is a trade and has higher confidence, or if we haven't found a trade yet
				if !hasActualTrade || d.Confidence > bestConfidence {
					bestConfidence = d.Confidence
					bestDecision = result.Decision
					hasActualTrade = true
				}
			}
		}
	}

	// If no actual trades found, pick best "wait" decision
	if !hasActualTrade {
		bestConfidence = 0
		for _, result := range results {
			for _, d := range result.Decision.Decisions {
				if d.Confidence > bestConfidence {
					bestConfidence = d.Confidence
					bestDecision = result.Decision
				}
			}
		}
		log.Printf("⚠️  No trades found, selected best 'wait' decision (confidence: %d)", bestConfidence)
	} else {
		log.Printf("✅ Best trade selected (confidence: %d)", bestConfidence)
	}

	return bestDecision, nil
}

// decisionsMatch checks if two decision arrays match
func decisionsMatch(d1, d2 []decision.Decision) bool {
	if len(d1) != len(d2) {
		return false
	}

	// Create maps for comparison
	m1 := make(map[string]decision.Decision)
	m2 := make(map[string]decision.Decision)

	for _, d := range d1 {
		key := d.Symbol + "_" + d.Action
		m1[key] = d
	}
	for _, d := range d2 {
		key := d.Symbol + "_" + d.Action
		m2[key] = d
	}

	// Check if all keys match
	for key := range m1 {
		if _, ok := m2[key]; !ok {
			return false
		}
	}
	for key := range m2 {
		if _, ok := m1[key]; !ok {
			return false
		}
	}

	return true
}
