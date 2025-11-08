package main

import (
	"encoding/json"
	"fmt"
	"lia/backtest"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	traders := []string{
		"qwen_trader_single",
		"openai_trader_single",
		"qwen_trader_multi",
		"openai_trader_multi",
	}

	baseDir := "../../decision_logs"
	allResults := make(map[string]*backtest.BacktestResult)

	fmt.Println(strings.Repeat("=", 100))
	fmt.Println("📊 AUTO-CLOSE STRATEGY BACKTEST - SUMMARY FOR ALL TRADERS")
	fmt.Println(strings.Repeat("=", 100))
	fmt.Println()

	// Load results for each trader
	for _, traderID := range traders {
		logDir := filepath.Join(baseDir, traderID)
		
		// Find latest backtest file
		backtestFiles, err := filepath.Glob(filepath.Join(logDir, "backtest_*.json"))
		if err != nil || len(backtestFiles) == 0 {
			fmt.Printf("⚠️  %s: No backtest results found\n", traderID)
			continue
		}

		// Get most recent file
		latestFile := backtestFiles[len(backtestFiles)-1]
		for _, f := range backtestFiles {
			if f > latestFile {
				latestFile = f
			}
		}

		data, err := os.ReadFile(latestFile)
		if err != nil {
			fmt.Printf("⚠️  %s: Failed to read backtest file: %v\n", traderID, err)
			continue
		}

		var result backtest.BacktestResult
		if err := json.Unmarshal(data, &result); err != nil {
			fmt.Printf("⚠️  %s: Failed to parse backtest file: %v\n", traderID, err)
			continue
		}

		allResults[traderID] = &result
	}

	// Print summary for each trader
	for _, traderID := range traders {
		result, exists := allResults[traderID]
		if !exists {
			continue
		}

		fmt.Println(strings.Repeat("-", 100))
		fmt.Printf("📈 Trader: %s\n", traderID)
		fmt.Printf("   Period: %s to %s\n", 
			result.StartTime.Format("2006-01-02 15:04"), 
			result.EndTime.Format("2006-01-02 15:04"))
		fmt.Printf("   Total Cycles: %d\n", result.TotalCycles)
		fmt.Println()

		fmt.Printf("   %-8s | %10s | %6s | %8s | %8s | %10s | %8s\n",
			"Auto%", "Total P&L", "Trades", "Win%", "Sharpe", "Avg Win", "Avg Loss")
		fmt.Println(strings.Repeat("-", 80))

		for _, s := range result.Strategies {
			fmt.Printf("   %-8.1f | %10.2f | %6d | %7.1f%% | %8.2f | %10.2f | %8.2f\n",
				s.AutoClosePct, s.TotalPnL, s.TotalTrades, s.WinRate, s.SharpeRatio, s.AvgWin, s.AvgLoss)
		}

		fmt.Println()
		fmt.Printf("   🏆 Best Sharpe: %.2f%% (Sharpe: %.2f, P&L: $%.2f, Win Rate: %.1f%%)\n",
			result.BestStrategy.AutoClosePct, result.BestStrategy.SharpeRatio,
			result.BestStrategy.TotalPnL, result.BestStrategy.WinRate)
		fmt.Printf("   💰 Best P&L: %.2f%% (P&L: $%.2f, Sharpe: %.2f)\n",
			result.BestTotalPnL.AutoClosePct, result.BestTotalPnL.TotalPnL,
			result.BestTotalPnL.SharpeRatio)
		fmt.Println()
	}

	// Overall comparison
	fmt.Println(strings.Repeat("=", 100))
	fmt.Println("🎯 OVERALL COMPARISON - Best Strategy Per Trader")
	fmt.Println(strings.Repeat("=", 100))
	fmt.Println()

	for _, traderID := range traders {
		result, exists := allResults[traderID]
		if !exists {
			continue
		}

		fmt.Printf("📊 %s:\n", traderID)
		fmt.Printf("   Best Strategy: %.2f%% auto-close\n", result.BestStrategy.AutoClosePct)
		fmt.Printf("   Sharpe Ratio: %.2f\n", result.BestStrategy.SharpeRatio)
		fmt.Printf("   Total P&L: $%.2f\n", result.BestStrategy.TotalPnL)
		fmt.Printf("   Win Rate: %.1f%%\n", result.BestStrategy.WinRate)
		fmt.Println()
	}

	fmt.Println(strings.Repeat("=", 100))
}

