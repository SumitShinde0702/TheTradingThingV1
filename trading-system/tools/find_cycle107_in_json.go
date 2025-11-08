package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"path/filepath"
	"strings"
)

type DecisionRecord struct {
	CycleNumber  int     `json:"cycle_number"`
	AccountState struct {
		TotalBalance float64 `json:"total_balance"`
	} `json:"account_state"`
	Timestamp string `json:"timestamp"`
}

func main() {
	traderIDs := []string{"openai_trader", "qwen_trader"}
	targetCycle := 107

	fmt.Printf("🔍 Searching JSON files for cycle #%d\n\n", targetCycle)

	for _, traderID := range traderIDs {
		logDir := filepath.Join("decision_logs", traderID)
		
		files, err := ioutil.ReadDir(logDir)
		if err != nil {
			fmt.Printf("❌ Failed to read %s: %v\n", logDir, err)
			continue
		}

		var foundCycle *DecisionRecord
		var foundFile string

		for _, file := range files {
			if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") {
				continue
			}

			filePath := filepath.Join(logDir, file.Name())
			data, err := ioutil.ReadFile(filePath)
			if err != nil {
				continue
			}

			var record DecisionRecord
			if err := json.Unmarshal(data, &record); err != nil {
				continue
			}

			if record.CycleNumber == targetCycle {
				foundCycle = &record
				foundFile = file.Name()
				break
			}
		}

		if foundCycle == nil {
			fmt.Printf("❌ [%s] Cycle #%d not found in JSON files\n", traderID, targetCycle)
		} else {
			fmt.Printf("✅ [%s] Found cycle #%d\n", traderID, targetCycle)
			fmt.Printf("   File: %s\n", foundFile)
			fmt.Printf("   Equity: %.2f USDT\n", foundCycle.AccountState.TotalBalance)
			fmt.Printf("   Timestamp: %s\n", foundCycle.Timestamp)
		}
		fmt.Println()
	}
}

