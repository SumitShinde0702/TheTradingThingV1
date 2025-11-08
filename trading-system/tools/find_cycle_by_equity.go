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

	fmt.Println("🔍 Searching for cycles with specific equity values\n")
	fmt.Println("Looking for:")
	fmt.Println("  OpenAI: ~10000 USDT (0% PnL)")
	fmt.Println("  Qwen: ~11016 USDT (+10.17% PnL)")
	fmt.Println()

	for _, traderID := range traderIDs {
		dbPath := filepath.Join("decision_logs", traderID, "decisions.db")

		db, err := sql.Open("sqlite", dbPath+"?mode=ro")
		if err != nil {
			log.Printf("❌ Failed to open %s: %v\n", traderID, err)
			continue
		}
		defer db.Close()

		// Check if database has any records
		var count int
		err = db.QueryRow("SELECT COUNT(*) FROM decisions").Scan(&count)
		if err != nil {
			log.Printf("❌ Failed to check %s: %v\n", traderID, err)
			continue
		}

		if count == 0 {
			fmt.Printf("⚠️  [%s] Database is empty (no records)\n\n", traderID)
			continue
		}

		var minCycle, maxCycle int
		err = db.QueryRow("SELECT MIN(cycle_number), MAX(cycle_number) FROM decisions").Scan(&minCycle, &maxCycle)
		if err != nil {
			log.Printf("❌ Failed to query %s: %v\n", traderID, err)
			continue
		}

		fmt.Printf("[%s]: Cycles %d to %d (%d records)\n", traderID, minCycle, maxCycle, count)

		// Search for cycles around target equity
		rows, err := db.Query(`
			SELECT cycle_number, account_total_balance, timestamp
			FROM decisions
			ORDER BY cycle_number ASC
			LIMIT 10
		`)
		if err != nil {
			log.Printf("❌ Failed to query recent cycles for %s: %v\n", traderID, err)
			continue
		}

		fmt.Printf("  First 10 cycles:\n")
		for rows.Next() {
			var cycleNum int
			var equity float64
			var timestamp string
			if err := rows.Scan(&cycleNum, &equity, &timestamp); err == nil {
				fmt.Printf("    Cycle #%d: %.2f USDT (%s)\n", cycleNum, equity, timestamp[:19])
			}
		}
		rows.Close()

		// Search for cycle with equity close to 10000 (OpenAI) or 11016 (Qwen)
		targetEquity := 10000.0
		if traderID == "qwen_trader" {
			targetEquity = 11016.0
		}

		var cycleNum int
		var equity float64
		err = db.QueryRow(`
			SELECT cycle_number, account_total_balance
			FROM decisions
			WHERE ABS(account_total_balance - ?) < 50
			ORDER BY cycle_number ASC
			LIMIT 1
		`, targetEquity).Scan(&cycleNum, &equity)

		if err == sql.ErrNoRows {
			fmt.Printf("  ❌ No cycle found with equity close to %.2f\n", targetEquity)
		} else if err != nil {
			log.Printf("  ❌ Error searching: %v\n", err)
		} else {
			fmt.Printf("  ✅ Found cycle #%d with equity %.2f USDT (target: ~%.2f)\n", cycleNum, equity, targetEquity)
		}
		fmt.Println()
	}
}

