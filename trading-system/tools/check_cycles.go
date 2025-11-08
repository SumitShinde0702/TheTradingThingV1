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

	for _, traderID := range traderIDs {
		dbPath := filepath.Join("decision_logs", traderID, "decisions.db")

		db, err := sql.Open("sqlite", dbPath+"?mode=ro")
		if err != nil {
			log.Printf("❌ Failed to open %s: %v\n", traderID, err)
			continue
		}

		var minCycle, maxCycle int
		var count int
		err = db.QueryRow("SELECT MIN(cycle_number), MAX(cycle_number), COUNT(*) FROM decisions").Scan(&minCycle, &maxCycle, &count)
		if err != nil {
			log.Printf("❌ Failed to query %s: %v\n", traderID, err)
			db.Close()
			continue
		}

		// Get equity for cycle 6
		var equity6 float64
		err = db.QueryRow("SELECT account_total_balance FROM decisions WHERE cycle_number = 6").Scan(&equity6)
		if err == sql.ErrNoRows {
			equity6 = -1
		} else if err != nil {
			equity6 = -1
		}

		fmt.Printf("%s:\n", traderID)
		fmt.Printf("  Cycles: %d to %d (total: %d records)\n", minCycle, maxCycle, count)
		if equity6 > 0 {
			fmt.Printf("  Cycle #6 equity: %.2f USDT\n", equity6)
		} else {
			fmt.Printf("  Cycle #6: NOT FOUND\n")
		}
		fmt.Println()

		db.Close()
	}
}

