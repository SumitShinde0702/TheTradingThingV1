package main

import (
	"flag"
	"lia/backtest"
	"log"
	"path/filepath"
)

func main() {
	traderID := flag.String("trader", "", "Trader ID to backtest (e.g., qwen_trader_single)")
	decisionLogDir := flag.String("dir", "", "Decision logs directory (e.g., decision_logs/qwen_trader_single)")
	flag.Parse()

	if *traderID == "" || *decisionLogDir == "" {
		log.Fatal("Usage: go run main.go -trader <trader_id> -dir <decision_logs_dir>")
	}

	// Resolve absolute path
	absDir, err := filepath.Abs(*decisionLogDir)
	if err != nil {
		log.Fatalf("Failed to resolve path: %v", err)
	}

	log.Printf("🧪 Starting backtest for trader: %s", *traderID)
	log.Printf("📁 Decision logs directory: %s", absDir)

	if err := backtest.RunBacktest(*traderID, absDir); err != nil {
		log.Fatalf("Backtest failed: %v", err)
	}
}

