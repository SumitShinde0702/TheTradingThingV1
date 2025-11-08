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
		fmt.Println("Usage: go run find_and_reset_cycles.go <trader_id1> <trader_id2> [target_equity]")
		fmt.Println("Example: go run find_and_reset_cycles.go openai_trader qwen_trader 10000")
		os.Exit(1)
	}

	traderID1 := os.Args[1]
	traderID2 := os.Args[2]
	targetEquity := 10000.0

	if len(os.Args) >= 4 {
		fmt.Sscanf(os.Args[3], "%f", &targetEquity)
	}

	fmt.Printf("🔍 Searching for cycle where both traders have equity close to %.2f\n", targetEquity)
	fmt.Printf("   Trader 1: %s\n", traderID1)
	fmt.Printf("   Trader 2: %s\n", traderID2)
	fmt.Println()

	// Find database files
	dbPath1 := filepath.Join("decision_logs", traderID1, "decisions.db")
	dbPath2 := filepath.Join("decision_logs", traderID2, "decisions.db")

	// Check if databases exist
	if _, err := os.Stat(dbPath1); os.IsNotExist(err) {
		log.Fatalf("❌ Database not found for trader 1: %s", dbPath1)
	}
	if _, err := os.Stat(dbPath2); os.IsNotExist(err) {
		log.Fatalf("❌ Database not found for trader 2: %s", dbPath2)
	}

	// Open databases
	db1, err := sql.Open("sqlite", dbPath1+"?mode=rw")
	if err != nil {
		log.Fatalf("❌ Failed to open database 1: %v", err)
	}
	defer db1.Close()

	db2, err := sql.Open("sqlite", dbPath2+"?mode=rw")
	if err != nil {
		log.Fatalf("❌ Failed to open database 2: %v", err)
	}
	defer db2.Close()

	// Find cycles where both traders have equity close to target
	// We'll look for cycles where equity is within 1% of target (between 9900 and 10100)
	tolerance := 0.01 // 1% tolerance
	minEquity := targetEquity * (1 - tolerance)
	maxEquity := targetEquity * (1 + tolerance)

	query := `
		SELECT cycle_number, account_total_balance, timestamp
		FROM decisions
		WHERE account_total_balance >= ? AND account_total_balance <= ?
		ORDER BY cycle_number ASC
	`

	rows1, err := db1.Query(query, minEquity, maxEquity)
	if err != nil {
		log.Fatalf("❌ Failed to query database 1: %v", err)
	}
	defer rows1.Close()

	type CycleInfo struct {
		CycleNumber int
		Equity      float64
		Timestamp   string
	}

	var trader1Cycles []CycleInfo
	for rows1.Next() {
		var info CycleInfo
		err := rows1.Scan(&info.CycleNumber, &info.Equity, &info.Timestamp)
		if err != nil {
			continue
		}
		trader1Cycles = append(trader1Cycles, info)
	}

	rows2, err := db2.Query(query, minEquity, maxEquity)
	if err != nil {
		log.Fatalf("❌ Failed to query database 2: %v", err)
	}
	defer rows2.Close()

	var trader2Cycles []CycleInfo
	for rows2.Next() {
		var info CycleInfo
		err := rows2.Scan(&info.CycleNumber, &info.Equity, &info.Timestamp)
		if err != nil {
			continue
		}
		trader2Cycles = append(trader2Cycles, info)
	}

	fmt.Printf("📊 Found %d cycles for %s with equity %.2f-%.2f\n", len(trader1Cycles), traderID1, minEquity, maxEquity)
	fmt.Printf("📊 Found %d cycles for %s with equity %.2f-%.2f\n\n", len(trader2Cycles), traderID2, minEquity, maxEquity)

	// Find the earliest cycle where both traders have equity close to target
	type CommonCycle struct {
		CycleNumber   int
		Trader1Equity float64
		Trader2Equity float64
		Trader1Time   string
		Trader2Time   string
	}

	var commonCycles []CommonCycle
	trader2Map := make(map[int]CycleInfo)
	for _, info := range trader2Cycles {
		trader2Map[info.CycleNumber] = info
	}

	for _, info1 := range trader1Cycles {
		if info2, found := trader2Map[info1.CycleNumber]; found {
			commonCycles = append(commonCycles, CommonCycle{
				CycleNumber:   info1.CycleNumber,
				Trader1Equity: info1.Equity,
				Trader2Equity: info2.Equity,
				Trader1Time:   info1.Timestamp,
				Trader2Time:   info2.Timestamp,
			})
		}
	}

	if len(commonCycles) == 0 {
		log.Fatalf("❌ No common cycles found where both traders have equity close to %.2f", targetEquity)
	}

	// Find the earliest common cycle
	earliest := commonCycles[0]
	for _, cycle := range commonCycles {
		if cycle.CycleNumber < earliest.CycleNumber {
			earliest = cycle
		}
	}

	fmt.Printf("✅ Found earliest common cycle: #%d\n", earliest.CycleNumber)
	fmt.Printf("   %s: %.2f USDT (%s)\n", traderID1, earliest.Trader1Equity, earliest.Trader1Time)
	fmt.Printf("   %s: %.2f USDT (%s)\n\n", traderID2, earliest.Trader2Equity, earliest.Trader2Time)

	// Ask for confirmation
	fmt.Printf("⚠️  WARNING: This will DELETE all records with cycle_number < %d from both databases!\n", earliest.CycleNumber)
	fmt.Print("   Do you want to proceed? (yes/no): ")

	var confirmation string
	fmt.Scanln(&confirmation)

	if confirmation != "yes" {
		fmt.Println("❌ Operation cancelled.")
		os.Exit(0)
	}

	// Delete records before the earliest cycle
	tx1, err := db1.Begin()
	if err != nil {
		log.Fatalf("❌ Failed to begin transaction for db1: %v", err)
	}

	result1, err := tx1.Exec("DELETE FROM decisions WHERE cycle_number < ?", earliest.CycleNumber)
	if err != nil {
		tx1.Rollback()
		log.Fatalf("❌ Failed to delete from db1: %v", err)
	}

	deleted1, _ := result1.RowsAffected()
	if err := tx1.Commit(); err != nil {
		log.Fatalf("❌ Failed to commit transaction for db1: %v", err)
	}

	tx2, err := db2.Begin()
	if err != nil {
		log.Fatalf("❌ Failed to begin transaction for db2: %v", err)
	}

	result2, err := tx2.Exec("DELETE FROM decisions WHERE cycle_number < ?", earliest.CycleNumber)
	if err != nil {
		tx2.Rollback()
		log.Fatalf("❌ Failed to delete from db2: %v", err)
	}

	deleted2, _ := result2.RowsAffected()
	if err := tx2.Commit(); err != nil {
		log.Fatalf("❌ Failed to commit transaction for db2: %v", err)
	}

	fmt.Printf("\n✅ Successfully deleted records:\n")
	fmt.Printf("   %s: %d records deleted\n", traderID1, deleted1)
	fmt.Printf("   %s: %d records deleted\n", traderID2, deleted2)
	fmt.Printf("\n📊 Both databases now start from cycle #%d\n", earliest.CycleNumber)
}
