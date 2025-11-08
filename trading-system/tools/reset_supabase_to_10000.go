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
		// Use transaction mode instead of session mode to avoid connection limits
		// Change pooler.supabase.com to direct connection or use transaction mode
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

	// Check current state before reset
	fmt.Println("📊 Checking current state...")
	traderIDs := []string{"openai_trader", "qwen_trader"}
	
	for _, traderID := range traderIDs {
		var count int
		var latestCycle int
		var latestBalance float64
		
		err := db.QueryRow(`
			SELECT COUNT(*), COALESCE(MAX(cycle_number), 0), 
			       COALESCE(MAX(account_total_balance), 0)
			FROM decisions 
			WHERE trader_id = $1
		`, traderID).Scan(&count, &latestCycle, &latestBalance)
		
		if err != nil {
			log.Printf("⚠️  Error checking %s: %v\n", traderID, err)
		} else {
			fmt.Printf("   %s: %d records, latest cycle #%d, balance: %.2f USDT\n", 
				traderID, count, latestCycle, latestBalance)
		}
	}
	fmt.Println()

	// Confirm reset
	fmt.Println("⚠️  WARNING: This will delete ALL records and reset to 10000 USDT")
	fmt.Println("Press Enter to continue or Ctrl+C to cancel...")
	fmt.Scanln()
	fmt.Println()

	// Delete all records
	fmt.Println("🗑️  Deleting all records from Supabase...")
	
	// Delete in order: decision_actions, positions, decisions (due to foreign keys)
	var result sql.Result
	var count int64

	// Delete decision_actions
	result, err = db.Exec("DELETE FROM decision_actions")
	if err != nil {
		log.Fatalf("Failed to delete decision_actions: %v", err)
	}
	count, _ = result.RowsAffected()
	fmt.Printf("   ✅ Deleted %d decision_actions\n", count)

	// Delete positions
	result, err = db.Exec("DELETE FROM positions")
	if err != nil {
		log.Fatalf("Failed to delete positions: %v", err)
	}
	count, _ = result.RowsAffected()
	fmt.Printf("   ✅ Deleted %d positions\n", count)

	// Delete decisions
	result, err = db.Exec("DELETE FROM decisions")
	if err != nil {
		log.Fatalf("Failed to delete decisions: %v", err)
	}
	count, _ = result.RowsAffected()
	fmt.Printf("   ✅ Deleted %d decisions\n", count)
	fmt.Println()

	// Seed initial balance records (cycle #0) with 10000 USDT
	fmt.Println("🌱 Seeding initial balance records (cycle #0) with 10000 USDT...")
	
	for _, traderID := range traderIDs {
		_, err := db.Exec(`
			INSERT INTO decisions (
				trader_id, 
				timestamp, 
				cycle_number, 
				input_prompt, 
				cot_trace, 
				decision_json, 
				raw_response,
				success, 
				error_message,
				account_total_balance, 
				account_available_balance, 
				account_unrealized_profit,
				account_position_count, 
				account_margin_used_pct,
				execution_log, 
				candidate_coins
			) VALUES ($1, CURRENT_TIMESTAMP, 0, 'Initial seed record', '', '{"seed": true}', '', true, NULL, 10000.0, 10000.0, 0.0, 0, 0.0, '[]', '[]')
			ON CONFLICT (trader_id, cycle_number) DO UPDATE SET
				account_total_balance = 10000.0,
				account_available_balance = 10000.0,
				account_unrealized_profit = 0.0,
				account_position_count = 0,
				account_margin_used_pct = 0.0,
				timestamp = CURRENT_TIMESTAMP
		`, traderID)
		
		if err != nil {
			log.Printf("❌ Failed to seed %s: %v\n", traderID, err)
		} else {
			fmt.Printf("   ✅ Seeded %s with 10000 USDT (cycle #0)\n", traderID)
		}
	}
	fmt.Println()

	// Verify seed
	fmt.Println("✅ Verification:")
	for _, traderID := range traderIDs {
		var balance float64
		err := db.QueryRow(`
			SELECT account_total_balance 
			FROM decisions 
			WHERE trader_id = $1 AND cycle_number = 0
		`, traderID).Scan(&balance)
		
		if err != nil {
			log.Printf("   ⚠️  %s: Verification failed: %v\n", traderID, err)
		} else {
			fmt.Printf("   ✅ %s: Balance = %.2f USDT (cycle #0)\n", traderID, balance)
		}
	}
	fmt.Println()

	fmt.Println("✅ Reset complete! Database is now reset to 10000 USDT starting balance.")
	fmt.Println()
	fmt.Println("📝 Next steps:")
	fmt.Println("   1. Restart the backend on Render (or redeploy)")
	fmt.Println("   2. The system will restore from cycle #0 and start with 10000 USDT")
	fmt.Println("   3. New cycles will start from #1")
}

