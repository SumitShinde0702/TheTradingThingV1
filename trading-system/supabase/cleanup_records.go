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
		dbURL = "postgresql://postgres.gboezrzwcsdktdmzmjwn:8%23SdwpNZp67%25Je@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
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

	// Delete all records
	fmt.Println("\n🗑️  Deleting all records from Supabase...")
	
	// Delete in order: decision_actions, positions, decisions (due to foreign keys)
	var result sql.Result
	var count int64

	// Delete decision_actions
	result, err = db.Exec("DELETE FROM decision_actions")
	if err != nil {
		log.Fatalf("Failed to delete decision_actions: %v", err)
	}
	count, _ = result.RowsAffected()
	fmt.Printf("   Deleted %d decision_actions\n", count)

	// Delete positions
	result, err = db.Exec("DELETE FROM positions")
	if err != nil {
		log.Fatalf("Failed to delete positions: %v", err)
	}
	count, _ = result.RowsAffected()
	fmt.Printf("   Deleted %d positions\n", count)

	// Delete decisions
	result, err = db.Exec("DELETE FROM decisions")
	if err != nil {
		log.Fatalf("Failed to delete decisions: %v", err)
	}
	count, _ = result.RowsAffected()
	fmt.Printf("   Deleted %d decisions\n", count)

	fmt.Println("\n✅ All records deleted. Supabase is now clean.")
	fmt.Println("💡 You can now start lia.exe and it will begin from 10000 USDT")
}

