package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
)

func main() {
	// Get database URL from environment or use config.json value
	dbURL := os.Getenv("SUPABASE_DATABASE_URL")
	if dbURL == "" {
		// Use transaction mode (port 6543) instead of session mode (port 5432)
		dbURL = "postgresql://postgres.gboezrzwcsdktdmzmjwn:8%23SdwpNZp67%25Je@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
	}

	fmt.Println("🔌 Connecting to Supabase...")
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}
	fmt.Println("✅ Connected to Supabase")
	fmt.Println()

	fmt.Println("📊 Current Database State:")
	fmt.Println("=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=")
	
	traderIDs := []string{"openai_trader", "qwen_trader"}
	
	for _, traderID := range traderIDs {
		fmt.Printf("\n%s:\n", traderID)
		fmt.Println("  " + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-" + "-")
		
		var count int
		var minCycle, maxCycle sql.NullInt64
		var latestBalance sql.NullFloat64
		var latestCycle int64
		
		err := db.QueryRow(`
			SELECT 
				COUNT(*), 
				MIN(cycle_number), 
				MAX(cycle_number),
				MAX(cycle_number),
				(SELECT account_total_balance FROM decisions WHERE trader_id = $1 ORDER BY cycle_number DESC LIMIT 1)
			FROM decisions 
			WHERE trader_id = $1
		`, traderID).Scan(&count, &minCycle, &maxCycle, &latestCycle, &latestBalance)
		
		if err != nil {
			log.Printf("⚠️  Error checking %s: %v\n", traderID, err)
			fmt.Printf("  Status: ❌ Error querying database\n")
			continue
		}
		
		if count == 0 {
			fmt.Printf("  Status: ⚠️  NO RECORDS FOUND (database is empty)\n")
			fmt.Printf("  Action: Need to seed cycle #0 with 10000 USDT\n")
		} else {
			fmt.Printf("  Total Records: %d\n", count)
			fmt.Printf("  Cycle Range: #%d to #%d\n", minCycle.Int64, maxCycle.Int64)
			fmt.Printf("  Latest Cycle: #%d\n", latestCycle)
			
			if latestBalance.Valid {
				fmt.Printf("  Latest Balance: %.2f USDT\n", latestBalance.Float64)
				
				// Check if it's around 10000 (within 100)
				diff := latestBalance.Float64 - 10000.0
				if diff < 100 && diff > -100 {
					fmt.Printf("  ⚠️  Balance is close to 10000 USDT - likely reset occurred!\n")
				} else {
					fmt.Printf("  Current Balance: %.2f USDT (diff from 10000: %+.2f)\n", 
						latestBalance.Float64, diff)
				}
			} else {
				fmt.Printf("  Latest Balance: Unable to determine\n")
			}
			
			// Check cycle #0
			var cycle0Balance sql.NullFloat64
			err := db.QueryRow(`
				SELECT account_total_balance 
				FROM decisions 
				WHERE trader_id = $1 AND cycle_number = 0
			`, traderID).Scan(&cycle0Balance)
			
			if err == sql.ErrNoRows {
				fmt.Printf("  ⚠️  Cycle #0 (seed record) NOT FOUND\n")
				fmt.Printf("  Action: Need to create cycle #0 with 10000 USDT\n")
			} else if err != nil {
				fmt.Printf("  ⚠️  Error checking cycle #0: %v\n", err)
			} else {
				fmt.Printf("  Cycle #0 Balance: %.2f USDT\n", cycle0Balance.Float64)
				if cycle0Balance.Float64 != 10000.0 {
					fmt.Printf("  ⚠️  Cycle #0 balance is not 10000 USDT - should be reset!\n")
				}
			}
		}
	}
	
	fmt.Println()
	fmt.Println("=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=" + "=")
	fmt.Println()
	fmt.Println("💡 To reset to 10000 USDT, run:")
	fmt.Println("   go run tools/reset_supabase_to_10000.go")
}

