//go:build ignore
// +build ignore

package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type PerformanceMetrics struct {
	TraderID         string
	InitialEquity    float64
	CurrentEquity    float64
	TotalPnL         float64
	TotalPnLPct      float64
	TotalCycles      int
	SuccessfulCycles int
	FailedCycles     int
	FirstCycle       time.Time
	LastCycle        time.Time
	MaxEquity        float64
	MinEquity        float64
	MaxDrawdown      float64
	MaxDrawdownPct   float64
}

func main() {
	baseDir := "decision_logs"
	if len(os.Args) > 1 {
		baseDir = os.Args[1]
	}

	fmt.Println("=" + strings.Repeat("=", 100) + "=")
	fmt.Println("📊 PERFORMANCE ANALYSIS - Binance Real Traders")
	fmt.Println("=" + strings.Repeat("=", 100) + "=")
	fmt.Println()

	// Find all decision databases
	dbFiles := findDatabases(baseDir)
	if len(dbFiles) == 0 {
		fmt.Printf("❌ No decision databases found in %s\n", baseDir)
		return
	}

	// Filter to only binance_real traders
	filteredFiles := []string{}
	for _, dbPath := range dbFiles {
		traderID := extractTraderID(dbPath)
		if strings.Contains(traderID, "binance_real") {
			filteredFiles = append(filteredFiles, dbPath)
		}
	}
	dbFiles = filteredFiles

	if len(dbFiles) == 0 {
		fmt.Printf("❌ No binance_real trader databases found in %s\n", baseDir)
		return
	}

	fmt.Printf("Found %d binance_real trader databases\n\n", len(dbFiles))

	allMetrics := make(map[string]*PerformanceMetrics)

	// Analyze each database
	for _, dbPath := range dbFiles {
		traderID := extractTraderID(dbPath)
		metrics := analyzePerformance(dbPath, traderID)
		if metrics != nil {
			allMetrics[traderID] = metrics
		}
	}

	// Print summary table
	printPerformanceTable(allMetrics)
}

func findDatabases(baseDir string) []string {
	var dbFiles []string
	filepath.Walk(baseDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && strings.HasSuffix(path, "decisions.db") {
			dbFiles = append(dbFiles, path)
		}
		return nil
	})
	return dbFiles
}

func extractTraderID(dbPath string) string {
	dir := filepath.Dir(dbPath)
	traderID := filepath.Base(dir)
	return traderID
}

func analyzePerformance(dbPath, traderID string) *PerformanceMetrics {
	db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		fmt.Printf("⚠️  Failed to open %s: %v\n", dbPath, err)
		return nil
	}
	defer db.Close()

	// Get all decision records ordered by cycle number
	rows, err := db.Query(`
		SELECT 
			cycle_number,
			timestamp,
			account_total_balance,
			account_unrealized_profit,
			success
		FROM decisions
		WHERE account_total_balance > 0
		ORDER BY cycle_number ASC
	`)
	if err != nil {
		fmt.Printf("⚠️  Failed to query %s: %v\n", traderID, err)
		return nil
	}
	defer rows.Close()

	var cycles []struct {
		CycleNumber    int
		Timestamp      time.Time
		TotalBalance   float64
		UnrealizedPnL  float64
		Success        bool
	}

	for rows.Next() {
		var c struct {
			CycleNumber    int
			Timestamp      time.Time
			TotalBalance   float64
			UnrealizedPnL  float64
			Success        bool
		}
		err := rows.Scan(&c.CycleNumber, &c.Timestamp, &c.TotalBalance, &c.UnrealizedPnL, &c.Success)
		if err != nil {
			continue
		}
		cycles = append(cycles, c)
	}

	if len(cycles) == 0 {
		return nil
	}

	metrics := &PerformanceMetrics{
		TraderID: traderID,
	}

	// Calculate metrics
	metrics.TotalCycles = len(cycles)
	metrics.FirstCycle = cycles[0].Timestamp
	metrics.LastCycle = cycles[len(cycles)-1].Timestamp

	// Find initial and current equity
	metrics.InitialEquity = cycles[0].TotalBalance
	metrics.CurrentEquity = cycles[len(cycles)-1].TotalBalance
	metrics.TotalPnL = metrics.CurrentEquity - metrics.InitialEquity
	if metrics.InitialEquity > 0 {
		metrics.TotalPnLPct = (metrics.TotalPnL / metrics.InitialEquity) * 100
	}

	// Find max/min equity and drawdown
	metrics.MaxEquity = metrics.InitialEquity
	metrics.MinEquity = metrics.InitialEquity
	maxDrawdown := 0.0
	peakEquity := metrics.InitialEquity

	for _, cycle := range cycles {
		if cycle.Success {
			metrics.SuccessfulCycles++
		} else {
			metrics.FailedCycles++
		}

		equity := cycle.TotalBalance
		if equity > metrics.MaxEquity {
			metrics.MaxEquity = equity
			peakEquity = equity
		}
		if equity < metrics.MinEquity {
			metrics.MinEquity = equity
		}

		// Calculate drawdown from peak
		if peakEquity > 0 {
			drawdown := peakEquity - equity
			drawdownPct := (drawdown / peakEquity) * 100
			if drawdown > maxDrawdown {
				maxDrawdown = drawdown
				metrics.MaxDrawdown = drawdown
				metrics.MaxDrawdownPct = drawdownPct
			}
		}
	}

	return metrics
}

func printPerformanceTable(metrics map[string]*PerformanceMetrics) {
	fmt.Println("📊 PERFORMANCE SUMMARY")
	fmt.Println(strings.Repeat("-", 120))
	fmt.Printf("%-30s | %10s | %10s | %10s | %10s | %8s | %8s | %10s | %10s\n",
		"Trader ID", "Initial", "Current", "Total P&L", "P&L %", "Cycles", "Success%", "Max DD", "Max DD %")
	fmt.Println(strings.Repeat("-", 120))

	sorted := make([]string, 0, len(metrics))
	for traderID := range metrics {
		sorted = append(sorted, traderID)
	}
	sort.Slice(sorted, func(i, j int) bool {
		return metrics[sorted[i]].TotalPnLPct > metrics[sorted[j]].TotalPnLPct
	})

	for _, traderID := range sorted {
		m := metrics[traderID]
		successRate := 0.0
		if m.TotalCycles > 0 {
			successRate = (float64(m.SuccessfulCycles) / float64(m.TotalCycles)) * 100
		}
		pnlSign := ""
		if m.TotalPnL >= 0 {
			pnlSign = "+"
		}
		fmt.Printf("%-30s | %10.2f | %10.2f | %s%9.2f | %9.2f%% | %8d | %7.1f%% | %9.2f | %9.2f%%\n",
			truncate(traderID, 30),
			m.InitialEquity,
			m.CurrentEquity,
			pnlSign,
			m.TotalPnL,
			m.TotalPnLPct,
			m.TotalCycles,
			successRate,
			m.MaxDrawdown,
			m.MaxDrawdownPct)
	}

	fmt.Println()
	fmt.Println("🏆 BEST PERFORMER:")
	if len(sorted) > 0 {
		best := metrics[sorted[0]]
		fmt.Printf("   %s\n", best.TraderID)
		fmt.Printf("   P&L: %.2f%% (%.2f USDT)\n", best.TotalPnLPct, best.TotalPnL)
		fmt.Printf("   Equity: %.2f USDT (from %.2f USDT)\n", best.CurrentEquity, best.InitialEquity)
	}
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

