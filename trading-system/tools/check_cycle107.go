package main

import (
	"database/sql"
	"fmt"
	"log"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func main() {
	traderIDs := []string{"openai_trader", "qwen_trader"}
	targetCycle := 107

	fmt.Printf("🔍 Checking database state for cycle #%d\n\n", targetCycle)

	for _, traderID := range traderIDs {
		dbPath := filepath.Join("decision_logs", traderID, "decisions.db")

		db, err := sql.Open("sqlite", dbPath+"?mode=ro")
		if err != nil {
			log.Printf("❌ Failed to open %s: %v\n", traderID, err)
			continue
		}
		defer db.Close()

		var minCycle, maxCycle int
		var count int
		err = db.QueryRow("SELECT MIN(cycle_number), MAX(cycle_number), COUNT(*) FROM decisions").Scan(&minCycle, &maxCycle, &count)
		if err != nil {
			log.Printf("❌ Failed to query %s: %v\n", traderID, err)
			continue
		}

		// Get equity for targetCycle
		var equity float64
		var timestamp string
		err = db.QueryRow("SELECT account_total_balance, timestamp FROM decisions WHERE cycle_number = ?", targetCycle).Scan(&equity, &timestamp)
		if err == sql.ErrNoRows {
			fmt.Printf("❌ [%s] Cycle #%d NOT FOUND\n", traderID, targetCycle)
			fmt.Printf("   Current cycles: %d to %d (total: %d records)\n", minCycle, maxCycle, count)
		} else if err != nil {
			log.Printf("❌ Failed to get equity for cycle #%d for %s: %v\n", targetCycle, traderID, err)
		} else {
			fmt.Printf("✅ [%s] Found cycle #%d\n", traderID, targetCycle)
			fmt.Printf("   Equity: %.2f USDT\n", equity)
			fmt.Printf("   Timestamp: %s\n", timestamp)
			fmt.Printf("   Current cycles: %d to %d (total: %d records)\n", minCycle, maxCycle, count)
		}
		fmt.Println()
	}
}

