package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run delete_cycles_before.go <cycle_number> [trader_id1] [trader_id2]")
		fmt.Println("Example: go run delete_cycles_before.go 95 openai_trader qwen_trader")
		os.Exit(1)
	}

	var cycleNumber int
	fmt.Sscanf(os.Args[1], "%d", &cycleNumber)

	traderIDs := []string{"openai_trader", "qwen_trader"}
	if len(os.Args) >= 3 {
		traderIDs = os.Args[2:]
	}

	fmt.Printf("🗑️  Deleting all records with cycle_number < %d from %d traders\n", cycleNumber, len(traderIDs))
	fmt.Println()

	for _, traderID := range traderIDs {
		dbPath := filepath.Join("decision_logs", traderID, "decisions.db")

		if _, err := os.Stat(dbPath); os.IsNotExist(err) {
			log.Printf("⚠️  Database not found: %s (skipping)\n", dbPath)
			continue
		}

		db, err := sql.Open("sqlite", dbPath+"?mode=rw")
		if err != nil {
			log.Printf("❌ Failed to open database %s: %v\n", traderID, err)
			continue
		}

		// Check how many records will be deleted
		var count int
		err = db.QueryRow("SELECT COUNT(*) FROM decisions WHERE cycle_number < ?", cycleNumber).Scan(&count)
		if err != nil {
			log.Printf("❌ Failed to count records for %s: %v\n", traderID, err)
			db.Close()
			continue
		}

		if count == 0 {
			fmt.Printf("✅ %s: No records to delete (already cleaned)\n", traderID)
			db.Close()
			continue
		}

		// Delete records
		tx, err := db.Begin()
		if err != nil {
			log.Printf("❌ Failed to begin transaction for %s: %v\n", traderID, err)
			db.Close()
			continue
		}

		result, err := tx.Exec("DELETE FROM decisions WHERE cycle_number < ?", cycleNumber)
		if err != nil {
			tx.Rollback()
			log.Printf("❌ Failed to delete from %s: %v\n", traderID, err)
			db.Close()
			continue
		}

		deleted, _ := result.RowsAffected()
		if err := tx.Commit(); err != nil {
			log.Printf("❌ Failed to commit transaction for %s: %v\n", traderID, err)
			tx.Rollback()
			db.Close()
			continue
		}

		fmt.Printf("✅ %s: Deleted %d records (now starts from cycle #%d)\n", traderID, deleted, cycleNumber)
		db.Close()
	}

	fmt.Println("\n✅ All databases cleaned!")
}
