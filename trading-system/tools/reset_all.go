package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

func main() {
	traderIDs := []string{"openai_trader", "qwen_trader"}

	fmt.Println("🔄 Complete Reset - Starting fresh from 10000 USDT")
	fmt.Println("=" + strings.Repeat("=", 60))
	fmt.Println()

	for _, traderID := range traderIDs {
		fmt.Printf("📊 Resetting %s...\n", traderID)
		
		// Delete database
		dbPath := filepath.Join("decision_logs", traderID, "decisions.db")
		if _, err := os.Stat(dbPath); err == nil {
			// Close any open connections first
			db, err := sql.Open("sqlite", dbPath+"?mode=rw")
			if err == nil {
				db.Close()
			}
			
			if err := os.Remove(dbPath); err != nil {
				log.Printf("  ⚠️  Failed to remove database: %v\n", err)
			} else {
				fmt.Printf("  ✅ Deleted database\n")
			}
		}

		// Also remove WAL and SHM files
		for _, ext := range []string{".db-wal", ".db-shm"} {
			walPath := dbPath + ext
			if _, err := os.Stat(walPath); err == nil {
				os.Remove(walPath)
			}
		}

		// Delete all JSON files
		logDir := filepath.Join("decision_logs", traderID)
		files, err := os.ReadDir(logDir)
		if err == nil {
			deletedCount := 0
			for _, file := range files {
				if !file.IsDir() && filepath.Ext(file.Name()) == ".json" {
					filePath := filepath.Join(logDir, file.Name())
					if err := os.Remove(filePath); err == nil {
						deletedCount++
					}
				}
			}
			if deletedCount > 0 {
				fmt.Printf("  ✅ Deleted %d JSON files\n", deletedCount)
			}
		}
		fmt.Println()
	}

	fmt.Println("✅ Complete reset finished!")
	fmt.Println()
	fmt.Println("📝 Next steps:")
	fmt.Println("   1. Restart the backend")
	fmt.Println("   2. It will start from cycle #1 with 10000 USDT")
	fmt.Println("   3. All new data will be collected from this fresh start")
}

