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

type Trade struct {
	TraderID      string
	Symbol        string
	Side          string // "long" or "short"
	OpenTime      time.Time
	CloseTime     *time.Time
	OpenPrice     float64
	ClosePrice    *float64
	Quantity      float64
	Leverage      int
	PositionValue float64 // USD value at open
	PnL           *float64 // Realized P&L (if closed)
	PnLPct        *float64 // Realized P&L % (if closed)
	Status        string   // "open" or "closed"
	OrderID       int64
}

type TraderStats struct {
	TraderID         string
	TotalTrades      int
	OpenTrades       int
	ClosedTrades     int
	WinningTrades    int
	LosingTrades     int
	TotalPnL         float64
	TotalPnLPct      float64
	WinRate          float64
	AvgWin            float64
	AvgLoss           float64
	LargestWin        float64
	LargestLoss       float64
	TotalVolume       float64 // Total USD volume traded
	FirstTrade        time.Time
	LastTrade         time.Time
}

func main() {
	baseDir := "decision_logs"
	if len(os.Args) > 1 {
		baseDir = os.Args[1]
	}

	fmt.Println("=" + strings.Repeat("=", 100) + "=")
	fmt.Println("📊 TRADE ANALYSIS REPORT - Binance Real Traders Only")
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

	allTrades := make(map[string][]Trade) // trader_id -> trades
	allStats := make(map[string]*TraderStats)

	// Analyze each database
	for _, dbPath := range dbFiles {
		traderID := extractTraderID(dbPath)
		trades, stats := analyzeTrader(dbPath, traderID)
		if len(trades) > 0 {
			allTrades[traderID] = trades
			allStats[traderID] = stats
		}
	}

	// Print summary table
	printSummaryTable(allStats)

	// Print detailed trades for each trader
	fmt.Println("\n" + strings.Repeat("=", 102))
	fmt.Println("📋 DETAILED TRADE BREAKDOWN BY TRADER")
	fmt.Println(strings.Repeat("=", 102))

	// Sort traders by total P&L
	sortedTraders := make([]string, 0, len(allStats))
	for traderID := range allStats {
		sortedTraders = append(sortedTraders, traderID)
	}
	sort.Slice(sortedTraders, func(i, j int) bool {
		return allStats[sortedTraders[i]].TotalPnL > allStats[sortedTraders[j]].TotalPnL
	})

	for _, traderID := range sortedTraders {
		trades := allTrades[traderID]
		stats := allStats[traderID]
		printTraderDetails(traderID, trades, stats)
	}
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
	// Extract trader ID from path like "decision_logs/llama_scalper_binance_real/decisions.db"
	dir := filepath.Dir(dbPath)
	traderID := filepath.Base(dir)
	return traderID
}

func analyzeTrader(dbPath, traderID string) ([]Trade, *TraderStats) {
	db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		fmt.Printf("⚠️  Failed to open %s: %v\n", dbPath, err)
		return nil, nil
	}
	defer db.Close()

	// Get all decision actions (trades)
	rows, err := db.Query(`
		SELECT 
			da.action,
			da.symbol,
			da.quantity,
			da.leverage,
			da.price,
			da.order_id,
			da.timestamp,
			da.success,
			d.account_total_balance
		FROM decision_actions da
		JOIN decisions d ON da.decision_id = d.id
		WHERE da.action IN ('open_long', 'open_short', 'close_long', 'close_short')
		ORDER BY da.timestamp ASC
	`)
	if err != nil {
		fmt.Printf("⚠️  Failed to query %s: %v\n", traderID, err)
		return nil, nil
	}
	defer rows.Close()

	var actions []struct {
		Action      string
		Symbol      string
		Quantity    float64
		Leverage    sql.NullInt64
		Price       float64
		OrderID     sql.NullInt64
		Timestamp   time.Time
		Success     bool
		AccountEquity float64
	}

	for rows.Next() {
		var a struct {
			Action      string
			Symbol      string
			Quantity    float64
			Leverage    sql.NullInt64
			Price       float64
			OrderID     sql.NullInt64
			Timestamp   time.Time
			Success     bool
			AccountEquity float64
		}
		err := rows.Scan(&a.Action, &a.Symbol, &a.Quantity, &a.Leverage, &a.Price, &a.OrderID, &a.Timestamp, &a.Success, &a.AccountEquity)
		if err != nil {
			continue
		}
		if a.Success {
			actions = append(actions, a)
		}
	}

	// Match open/close pairs
	trades := matchTrades(actions, traderID)
	stats := calculateStats(trades, traderID)

	return trades, stats
}

func matchTrades(actions []struct {
	Action      string
	Symbol      string
	Quantity    float64
	Leverage    sql.NullInt64
	Price       float64
	OrderID     sql.NullInt64
	Timestamp   time.Time
	Success     bool
	AccountEquity float64
}, traderID string) []Trade {
	trades := []Trade{}
	openPositions := make(map[string]*Trade) // key: symbol+side

	for _, action := range actions {
		key := action.Symbol + "_" + strings.TrimPrefix(action.Action, "open_")

		if action.Action == "open_long" || action.Action == "open_short" {
			side := strings.TrimPrefix(action.Action, "open_")
			leverage := 1
			if action.Leverage.Valid {
				leverage = int(action.Leverage.Int64)
			}
			orderID := int64(0)
			if action.OrderID.Valid {
				orderID = action.OrderID.Int64
			}

			positionValue := action.Quantity * action.Price

			trade := &Trade{
				TraderID:      traderID,
				Symbol:        action.Symbol,
				Side:          side,
				OpenTime:      action.Timestamp,
				OpenPrice:     action.Price,
				Quantity:      action.Quantity,
				Leverage:      leverage,
				PositionValue: positionValue,
				Status:        "open",
				OrderID:       orderID,
			}
			openPositions[key] = trade
			trades = append(trades, *trade)
		} else if action.Action == "close_long" || action.Action == "close_short" {
			side := strings.TrimPrefix(action.Action, "close_")
			key := action.Symbol + "_" + side

			if openTrade, exists := openPositions[key]; exists {
				// Calculate P&L
				var pnl, pnlPct float64
				if side == "long" {
					pnl = (action.Price - openTrade.OpenPrice) * action.Quantity
				} else {
					pnl = (openTrade.OpenPrice - action.Price) * action.Quantity
				}
				pnlPct = (pnl / openTrade.PositionValue) * 100

				// Update the trade in trades slice
				for i := range trades {
					if trades[i].Symbol == action.Symbol &&
						trades[i].Side == side &&
						trades[i].Status == "open" &&
						trades[i].OpenTime.Equal(openTrade.OpenTime) {
						trades[i].CloseTime = &action.Timestamp
						trades[i].ClosePrice = &action.Price
						trades[i].PnL = &pnl
						trades[i].PnLPct = &pnlPct
						trades[i].Status = "closed"
						break
					}
				}

				delete(openPositions, key)
			}
		}
	}

	return trades
}

func calculateStats(trades []Trade, traderID string) *TraderStats {
	stats := &TraderStats{
		TraderID: traderID,
	}

	if len(trades) == 0 {
		return stats
	}

	var wins, losses float64
	var winCount, lossCount int

	stats.TotalTrades = len(trades)
	stats.FirstTrade = trades[0].OpenTime
	stats.LastTrade = trades[0].OpenTime

	for _, trade := range trades {
		if trade.OpenTime.Before(stats.FirstTrade) {
			stats.FirstTrade = trade.OpenTime
		}
		if trade.OpenTime.After(stats.LastTrade) {
			stats.LastTrade = trade.OpenTime
		}

		stats.TotalVolume += trade.PositionValue

		if trade.Status == "open" {
			stats.OpenTrades++
		} else {
			stats.ClosedTrades++
			if trade.PnL != nil {
				stats.TotalPnL += *trade.PnL
				if *trade.PnL > 0 {
					stats.WinningTrades++
					wins += *trade.PnL
					if *trade.PnL > stats.LargestWin {
						stats.LargestWin = *trade.PnL
					}
					winCount++
				} else if *trade.PnL < 0 {
					stats.LosingTrades++
					losses += *trade.PnL
					if *trade.PnL < stats.LargestLoss {
						stats.LargestLoss = *trade.PnL
					}
					lossCount++
				}
			}
		}
	}

	if stats.ClosedTrades > 0 {
		stats.WinRate = (float64(stats.WinningTrades) / float64(stats.ClosedTrades)) * 100
	}
	if winCount > 0 {
		stats.AvgWin = wins / float64(winCount)
	}
	if lossCount > 0 {
		stats.AvgLoss = losses / float64(lossCount)
	}

	// Calculate total P&L percentage (approximate based on average position size)
	if stats.TotalVolume > 0 {
		stats.TotalPnLPct = (stats.TotalPnL / stats.TotalVolume) * 100
	}

	return stats
}

func printSummaryTable(stats map[string]*TraderStats) {
	fmt.Println("📊 SUMMARY TABLE")
	fmt.Println(strings.Repeat("-", 102))
	fmt.Printf("%-30s | %6s | %6s | %6s | %6s | %8s | %8s | %6s | %10s | %10s\n",
		"Trader ID", "Total", "Open", "Closed", "Win%", "Total P&L", "P&L %", "Win/Loss", "Avg Win", "Avg Loss")
	fmt.Println(strings.Repeat("-", 102))

	sorted := make([]string, 0, len(stats))
	for traderID := range stats {
		sorted = append(sorted, traderID)
	}
	sort.Slice(sorted, func(i, j int) bool {
		return stats[sorted[i]].TotalPnL > stats[sorted[j]].TotalPnL
	})

	for _, traderID := range sorted {
		s := stats[traderID]
		winLoss := fmt.Sprintf("%d/%d", s.WinningTrades, s.LosingTrades)
		pnlSign := ""
		if s.TotalPnL >= 0 {
			pnlSign = "+"
		}
		fmt.Printf("%-30s | %6d | %6d | %6d | %5.1f%% | %s%7.2f | %7.2f%% | %6s | %9.2f | %9.2f\n",
			truncate(traderID, 30),
			s.TotalTrades,
			s.OpenTrades,
			s.ClosedTrades,
			s.WinRate,
			pnlSign,
			s.TotalPnL,
			s.TotalPnLPct,
			winLoss,
			s.AvgWin,
			s.AvgLoss)
	}
}

func printTraderDetails(traderID string, trades []Trade, stats *TraderStats) {
	fmt.Printf("\n🔹 %s\n", traderID)
	fmt.Println(strings.Repeat("-", 102))
	fmt.Printf("📈 Statistics: %d total trades | %d open | %d closed | %.1f%% win rate | Total P&L: %.2f USDT (%.2f%%)\n",
		stats.TotalTrades, stats.OpenTrades, stats.ClosedTrades, stats.WinRate, stats.TotalPnL, stats.TotalPnLPct)
	fmt.Println(strings.Repeat("-", 102))

	// Sort trades by open time (newest first)
	sort.Slice(trades, func(i, j int) bool {
		return trades[i].OpenTime.After(trades[j].OpenTime)
	})

	fmt.Printf("%-12s | %-8s | %-6s | %-12s | %-12s | %10s | %10s | %12s | %8s | %8s\n",
		"Symbol", "Side", "Status", "Open Time", "Close Time", "Open Price", "Close Price", "Position Size", "P&L (USDT)", "P&L %")
	fmt.Println(strings.Repeat("-", 120))

	for _, trade := range trades {
		openTimeStr := trade.OpenTime.Format("2006-01-02 15:04")
		closeTimeStr := "-"
		closePriceStr := "-"
		pnlStr := "-"
		pnlPctStr := "-"
		positionSizeStr := fmt.Sprintf("%.2f USDT", trade.PositionValue)

		if trade.Status == "closed" && trade.CloseTime != nil && trade.ClosePrice != nil && trade.PnL != nil && trade.PnLPct != nil {
			closeTimeStr = trade.CloseTime.Format("2006-01-02 15:04")
			closePriceStr = fmt.Sprintf("%.4f", *trade.ClosePrice)
			sign := ""
			if *trade.PnL >= 0 {
				sign = "+"
			}
			pnlStr = fmt.Sprintf("%s%.2f", sign, *trade.PnL)
			pnlPctStr = fmt.Sprintf("%s%.2f%%", sign, *trade.PnLPct)
		}

		fmt.Printf("%-12s | %-8s | %-6s | %-12s | %-12s | %10.4f | %10s | %12s | %8s | %8s\n",
			trade.Symbol,
			strings.ToUpper(trade.Side),
			trade.Status,
			openTimeStr,
			closeTimeStr,
			trade.OpenPrice,
			closePriceStr,
			positionSizeStr,
			pnlStr,
			pnlPctStr)
	}
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

