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

type TradeOutcome struct {
	Symbol        string
	Side          string
	OpenPrice     float64
	ClosePrice    float64
	Quantity      float64
	Leverage      int
	PnL           float64
	PnLPct        float64
	PositionValue float64
	MarginUsed    float64
	Duration      time.Duration
	OpenTime      time.Time
	CloseTime     time.Time
}

type AgentRanking struct {
	TraderID         string
	InitialBalance   float64
	CurrentEquity    float64
	TotalTrades      int
	WinningTrades    int
	LosingTrades     int
	WinRate          float64
	TotalPnL         float64
	TotalPnLPct      float64  // P&L % of position value (old metric)
	ReturnOnCapital  float64   // P&L % of initial capital (new metric)
	EstimatedFees    float64   // Estimated trading fees
	NetPnL           float64   // P&L after estimated fees
	AvgWin           float64
	AvgLoss          float64
	ProfitFactor     float64
	LargestWin       float64
	LargestLoss      float64
	BestSymbol       string
	WorstSymbol      string
	SymbolPnL        map[string]float64
	TotalVolume      float64
	AvgHoldingTime   time.Duration
}

func main() {
	baseDir := "decision_logs"
	if len(os.Args) > 1 {
		baseDir = os.Args[1]
	}

	fmt.Println("=" + strings.Repeat("=", 120) + "=")
	fmt.Println("🏆 AGENT RANKING BASED ON TRADE OUTCOMES - Binance Real Traders")
	fmt.Println("=" + strings.Repeat("=", 120) + "=")
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

	rankings := make(map[string]*AgentRanking)

	// Analyze each database
	for _, dbPath := range dbFiles {
		traderID := extractTraderID(dbPath)
		ranking := analyzeTradeOutcomes(dbPath, traderID)
		if ranking != nil && ranking.TotalTrades > 0 {
			rankings[traderID] = ranking
		}
	}

	// Rank and display
	printRankings(rankings)
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

func analyzeTradeOutcomes(dbPath, traderID string) *AgentRanking {
	db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		fmt.Printf("⚠️  Failed to open %s: %v\n", dbPath, err)
		return nil
	}
	defer db.Close()

	// Get initial and current balance from decisions table
	var initialBalance, currentEquity float64
	err = db.QueryRow(`
		SELECT 
			MIN(account_total_balance) as initial_balance,
			MAX(account_total_balance) as current_equity
		FROM decisions
		WHERE account_total_balance > 0
	`).Scan(&initialBalance, &currentEquity)
	if err != nil {
		// Fallback: try to get from first and last records
		db.QueryRow(`SELECT account_total_balance FROM decisions WHERE account_total_balance > 0 ORDER BY cycle_number ASC LIMIT 1`).Scan(&initialBalance)
		db.QueryRow(`SELECT account_total_balance FROM decisions WHERE account_total_balance > 0 ORDER BY cycle_number DESC LIMIT 1`).Scan(&currentEquity)
	}

	// Get all decision actions (trades)
	rows, err := db.Query(`
		SELECT 
			da.action,
			da.symbol,
			da.quantity,
			da.leverage,
			da.price,
			da.timestamp,
			da.success
		FROM decision_actions da
		WHERE da.action IN ('open_long', 'open_short', 'close_long', 'close_short')
			AND da.success = 1
		ORDER BY da.timestamp ASC
	`)
	if err != nil {
		fmt.Printf("⚠️  Failed to query %s: %v\n", traderID, err)
		return nil
	}
	defer rows.Close()

	var actions []struct {
		Action    string
		Symbol    string
		Quantity  float64
		Leverage  sql.NullInt64
		Price     float64
		Timestamp time.Time
		Success   bool
	}

	for rows.Next() {
		var a struct {
			Action    string
			Symbol    string
			Quantity  float64
			Leverage  sql.NullInt64
			Price     float64
			Timestamp time.Time
			Success   bool
		}
		err := rows.Scan(&a.Action, &a.Symbol, &a.Quantity, &a.Leverage, &a.Price, &a.Timestamp, &a.Success)
		if err != nil {
			continue
		}
		actions = append(actions, a)
	}

	// Match open/close pairs to calculate trade outcomes
	trades := matchTrades(actions)
	
	// Calculate ranking metrics
	ranking := calculateRanking(trades, traderID)
	
	// Add initial balance and current equity
	ranking.InitialBalance = initialBalance
	ranking.CurrentEquity = currentEquity
	
	// Calculate return on initial capital
	if initialBalance > 0 {
		ranking.ReturnOnCapital = ((currentEquity - initialBalance) / initialBalance) * 100
	}
	
	// Estimate fees (0.04% per round trip = 0.02% open + 0.02% close)
	// For simplicity, assume 0.04% of position value per closed trade
	ranking.EstimatedFees = ranking.TotalVolume * 0.0004 // 0.04% of total position value
	ranking.NetPnL = ranking.TotalPnL - ranking.EstimatedFees
	
	return ranking
}

func matchTrades(actions []struct {
	Action    string
	Symbol    string
	Quantity  float64
	Leverage  sql.NullInt64
	Price     float64
	Timestamp time.Time
	Success   bool
}) []TradeOutcome {
	trades := []TradeOutcome{}
	openPositions := make(map[string]*TradeOutcome) // key: symbol+side

	for _, action := range actions {
		key := action.Symbol + "_" + strings.TrimPrefix(action.Action, "open_")

		if action.Action == "open_long" || action.Action == "open_short" {
			side := strings.TrimPrefix(action.Action, "open_")
			leverage := 1
			if action.Leverage.Valid {
				leverage = int(action.Leverage.Int64)
			}

			positionValue := action.Quantity * action.Price
			marginUsed := positionValue / float64(leverage)

			trade := &TradeOutcome{
				Symbol:        action.Symbol,
				Side:          side,
				OpenPrice:     action.Price,
				Quantity:      action.Quantity,
				Leverage:      leverage,
				PositionValue: positionValue,
				MarginUsed:    marginUsed,
				OpenTime:      action.Timestamp,
			}
			openPositions[key] = trade
		} else if action.Action == "close_long" || action.Action == "close_short" {
			side := strings.TrimPrefix(action.Action, "close_")
			key := action.Symbol + "_" + side

			if openTrade, exists := openPositions[key]; exists {
				// Calculate P&L (accounting for leverage)
				// P&L = price_change * position_value * leverage_factor
				// But since position_value already includes leverage, we calculate based on margin
				var priceChange float64
				if side == "long" {
					priceChange = (action.Price - openTrade.OpenPrice) / openTrade.OpenPrice
				} else {
					priceChange = (openTrade.OpenPrice - action.Price) / openTrade.OpenPrice
				}
				
				// P&L = price_change_percent * position_value
				// Position value = quantity * openPrice (this is the notional value)
				positionValue := openTrade.Quantity * openTrade.OpenPrice
				pnl := priceChange * positionValue
				
				// P&L percentage relative to margin used
				pnlPct := 0.0
				if openTrade.MarginUsed > 0 {
					pnlPct = (pnl / openTrade.MarginUsed) * 100
				}

				openTrade.ClosePrice = action.Price
				openTrade.CloseTime = action.Timestamp
				openTrade.PnL = pnl
				openTrade.PnLPct = pnlPct
				openTrade.Duration = action.Timestamp.Sub(openTrade.OpenTime)

				trades = append(trades, *openTrade)
				delete(openPositions, key)
			}
		}
	}

	return trades
}

func calculateRanking(trades []TradeOutcome, traderID string) *AgentRanking {
	ranking := &AgentRanking{
		TraderID:      traderID,
		SymbolPnL:     make(map[string]float64),
		LargestWin:    -999999,
		LargestLoss:   999999,
	}

	if len(trades) == 0 {
		return ranking
	}

	var totalWins, totalLosses float64
	var totalHoldingTime time.Duration

	for _, trade := range trades {
		ranking.TotalTrades++
		ranking.TotalVolume += trade.PositionValue
		totalHoldingTime += trade.Duration

		// Track symbol performance
		ranking.SymbolPnL[trade.Symbol] += trade.PnL

		if trade.PnL > 0 {
			ranking.WinningTrades++
			totalWins += trade.PnL
			if trade.PnL > ranking.LargestWin {
				ranking.LargestWin = trade.PnL
			}
		} else if trade.PnL < 0 {
			ranking.LosingTrades++
			totalLosses += trade.PnL
			if trade.PnL < ranking.LargestLoss {
				ranking.LargestLoss = trade.PnL
			}
		}

		ranking.TotalPnL += trade.PnL
	}

	// Calculate metrics
	if ranking.TotalTrades > 0 {
		ranking.WinRate = (float64(ranking.WinningTrades) / float64(ranking.TotalTrades)) * 100
	}
	if ranking.WinningTrades > 0 {
		ranking.AvgWin = totalWins / float64(ranking.WinningTrades)
	}
	if ranking.LosingTrades > 0 {
		ranking.AvgLoss = totalLosses / float64(ranking.LosingTrades)
	}
	if ranking.AvgLoss < 0 {
		ranking.ProfitFactor = totalWins / (-totalLosses)
	}
	if ranking.TotalTrades > 0 {
		ranking.AvgHoldingTime = totalHoldingTime / time.Duration(ranking.TotalTrades)
	}
	if ranking.TotalVolume > 0 {
		ranking.TotalPnLPct = (ranking.TotalPnL / ranking.TotalVolume) * 100
	}

	// Find best/worst symbols
	bestPnL := -999999.0
	worstPnL := 999999.0
	for symbol, pnl := range ranking.SymbolPnL {
		if pnl > bestPnL {
			bestPnL = pnl
			ranking.BestSymbol = symbol
		}
		if pnl < worstPnL {
			worstPnL = pnl
			ranking.WorstSymbol = symbol
		}
	}

	return ranking
}

func printRankings(rankings map[string]*AgentRanking) {
	// Convert to slice and sort by total P&L
	type RankedAgent struct {
		Rank    int
		Ranking *AgentRanking
		Score   float64 // Composite score for ranking
	}

	ranked := make([]RankedAgent, 0, len(rankings))
	for _, ranking := range rankings {
		// Composite score: Total P&L (70%) + Win Rate * 10 (20%) + Profit Factor * 100 (10%)
		score := ranking.TotalPnL*0.7 + ranking.WinRate*10*0.2 + ranking.ProfitFactor*100*0.1
		ranked = append(ranked, RankedAgent{
			Ranking: ranking,
			Score:   score,
		})
	}

	// Sort by score (descending)
	sort.Slice(ranked, func(i, j int) bool {
		return ranked[i].Score > ranked[j].Score
	})

	// Assign ranks
	for i := range ranked {
		ranked[i].Rank = i + 1
	}

	fmt.Println("🏆 AGENT RANKINGS (Based on Trade Outcomes)")
	fmt.Println(strings.Repeat("=", 120))
	fmt.Printf("%-4s | %-30s | %6s | %6s | %6s | %8s | %10s | %10s | %10s | %8s | %10s | %10s\n",
		"Rank", "Agent", "Trades", "Wins", "Losses", "Win Rate", "Total P&L", "Return %", "Net P&L", "Profit F", "Avg Win", "Avg Loss")
	fmt.Println(strings.Repeat("-", 120))

	for _, r := range ranked {
		ranking := r.Ranking
		pnlSign := ""
		if ranking.TotalPnL >= 0 {
			pnlSign = "+"
		}
		netPnlSign := ""
		if ranking.NetPnL >= 0 {
			netPnlSign = "+"
		}
		returnSign := ""
		if ranking.ReturnOnCapital >= 0 {
			returnSign = "+"
		}
		fmt.Printf("%-4d | %-30s | %6d | %6d | %6d | %7.1f%% | %s%9.2f | %s%9.2f%% | %s%9.2f | %7.2f | %9.2f | %9.2f\n",
			r.Rank,
			truncate(ranking.TraderID, 30),
			ranking.TotalTrades,
			ranking.WinningTrades,
			ranking.LosingTrades,
			ranking.WinRate,
			pnlSign,
			ranking.TotalPnL,
			returnSign,
			ranking.ReturnOnCapital,
			netPnlSign,
			ranking.NetPnL,
			ranking.ProfitFactor,
			ranking.AvgWin,
			ranking.AvgLoss)
	}

	fmt.Println()
	fmt.Println("📊 DETAILED BREAKDOWN")
	fmt.Println(strings.Repeat("=", 120))

	for _, r := range ranked {
		ranking := r.Ranking
		fmt.Printf("\n🥇 Rank #%d: %s\n", r.Rank, ranking.TraderID)
		fmt.Println(strings.Repeat("-", 120))
		if ranking.InitialBalance > 0 {
			fmt.Printf("   Initial Balance: %.2f USDT | Current Equity: %.2f USDT\n",
				ranking.InitialBalance, ranking.CurrentEquity)
			fmt.Printf("   Return on Capital: %+.2f%% (%.2f USDT profit)\n",
				ranking.ReturnOnCapital, ranking.CurrentEquity-ranking.InitialBalance)
		}
		fmt.Printf("   Total Trades: %d | Win Rate: %.1f%% | Profit Factor: %.2f\n",
			ranking.TotalTrades, ranking.WinRate, ranking.ProfitFactor)
		fmt.Printf("   Gross P&L: %+.2f USDT | Estimated Fees: %.2f USDT | Net P&L: %+.2f USDT\n",
			ranking.TotalPnL, ranking.EstimatedFees, ranking.NetPnL)
		fmt.Printf("   Average Win: +%.2f USDT | Average Loss: %.2f USDT\n",
			ranking.AvgWin, ranking.AvgLoss)
		fmt.Printf("   Largest Win: +%.2f USDT | Largest Loss: %.2f USDT\n",
			ranking.LargestWin, ranking.LargestLoss)
		if ranking.BestSymbol != "" {
			fmt.Printf("   Best Symbol: %s (+%.2f USDT) | Worst Symbol: %s (%.2f USDT)\n",
				ranking.BestSymbol, ranking.SymbolPnL[ranking.BestSymbol],
				ranking.WorstSymbol, ranking.SymbolPnL[ranking.WorstSymbol])
		}
		if ranking.AvgHoldingTime > 0 {
			avgHours := ranking.AvgHoldingTime.Hours()
			if avgHours < 1 {
				fmt.Printf("   Avg Holding Time: %.0f minutes\n", ranking.AvgHoldingTime.Minutes())
			} else {
				fmt.Printf("   Avg Holding Time: %.1f hours\n", avgHours)
			}
		}
	}

	fmt.Println()
	fmt.Println("🏆 WINNER:")
	if len(ranked) > 0 {
		winner := ranked[0].Ranking
		fmt.Printf("   %s\n", winner.TraderID)
		if winner.InitialBalance > 0 {
			fmt.Printf("   Return on Capital: %+.2f%% (%.2f → %.2f USDT)\n",
				winner.ReturnOnCapital, winner.InitialBalance, winner.CurrentEquity)
		}
		fmt.Printf("   Net P&L: %+.2f USDT | Win Rate: %.1f%% | Profit Factor: %.2f\n",
			winner.NetPnL, winner.WinRate, winner.ProfitFactor)
	}
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

