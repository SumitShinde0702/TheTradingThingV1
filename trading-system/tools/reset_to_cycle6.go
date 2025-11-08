package main

import (
	"database/sql"
	"fmt"
	"log"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func main() {
	// We want to keep cycle 6 as the starting point
	// If cycle 6 exists in DB, delete everything before it
	// If it doesn't, we need to check what cycle corresponds to the screenshot point
	
	traderIDs := []string{"openai_trader", "qwen_trader"}
	targetCycle := 6

	fmt.Printf("🔍 Resetting databases to start from cycle #%d\n\n", targetCycle)

	for _, traderID := range traderIDs {
		dbPath := filepath.Join("decision_logs", traderID, "decisions.db")

		db, err := sql.Open("sqlite", dbPath+"?mode=rw")
		if err != nil {
			log.Printf("❌ Failed to open %s: %v\n", traderID, err)
			continue
		}

		// Check if target cycle exists
		var exists int
		err = db.QueryRow("SELECT COUNT(*) FROM decisions WHERE cycle_number = ?", targetCycle).Scan(&exists)
		if err != nil {
			log.Printf("❌ Failed to check cycle %d in %s: %v\n", targetCycle, traderID, err)
			db.Close()
			continue
		}

		if exists == 0 {
			// Cycle 6 doesn't exist - need to find the earliest cycle with ~10000 equity
			var cycleNum int
			var equity float64
			err = db.QueryRow(`
				SELECT cycle_number, account_total_balance 
				FROM decisions 
				WHERE account_total_balance >= 9900 AND account_total_balance <= 10100
				ORDER BY cycle_number ASC 
				LIMIT 1
			`).Scan(&cycleNum, &equity)
			
			if err == sql.ErrNoRows {
				fmt.Printf("⚠️  %s: No cycle found with equity ~10000\n", traderID)
				db.Close()
				continue
			} else if err != nil {
				log.Printf("❌ Failed to find starting cycle for %s: %v\n", traderID, err)
				db.Close()
				continue
			}

			fmt.Printf("📊 %s: Found cycle #%d with equity %.2f (using as new cycle #%d)\n", 
				traderID, cycleNum, equity, targetCycle)

			// Delete everything before this cycle, then renumber
			tx, err := db.Begin()
			if err != nil {
				log.Printf("❌ Failed to begin transaction for %s: %v\n", traderID, err)
				db.Close()
				continue
			}

			// Delete records before cycleNum
			_, err = tx.Exec("DELETE FROM decisions WHERE cycle_number < ?", cycleNum)
			if err != nil {
				tx.Rollback()
				log.Printf("❌ Failed to delete from %s: %v\n", traderID, err)
				db.Close()
				continue
			}

			// Renumber: subtract (cycleNum - targetCycle) from all cycle numbers
			offset := cycleNum - targetCycle
			if offset != 0 {
				_, err = tx.Exec("UPDATE decisions SET cycle_number = cycle_number - ?", offset)
				if err != nil {
					tx.Rollback()
					log.Printf("❌ Failed to renumber cycles in %s: %v\n", traderID, err)
					db.Close()
					continue
				}
			}

			if err := tx.Commit(); err != nil {
				log.Printf("❌ Failed to commit for %s: %v\n", traderID, err)
				tx.Rollback()
				db.Close()
				continue
			}

			fmt.Printf("✅ %s: Reset to start from cycle #%d\n", traderID, targetCycle)
		} else {
			// Cycle 6 exists, just delete everything before it
			tx, err := db.Begin()
			if err != nil {
				log.Printf("❌ Failed to begin transaction for %s: %v\n", traderID, err)
				db.Close()
				continue
			}

			result, err := tx.Exec("DELETE FROM decisions WHERE cycle_number < ?", targetCycle)
			if err != nil {
				tx.Rollback()
				log.Printf("❌ Failed to delete from %s: %v\n", traderID, err)
				db.Close()
				continue
			}

			deleted, _ := result.RowsAffected()
			if err := tx.Commit(); err != nil {
				log.Printf("❌ Failed to commit for %s: %v\n", traderID, err)
				tx.Rollback()
				db.Close()
				continue
			}

			fmt.Printf("✅ %s: Deleted %d records, now starts from cycle #%d\n", 
				traderID, deleted, targetCycle)
		}

		db.Close()
	}

	fmt.Println("\n✅ Reset complete!")
}

