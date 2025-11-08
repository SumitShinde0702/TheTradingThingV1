package backtest

import (
	"encoding/json"
	"fmt"
	"lia/logger"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// StrategyResult result for a single auto-close strategy
type StrategyResult struct {
	AutoClosePct    float64 `json:"auto_close_pct"`    // Auto-close percentage (0 = no auto-close)
	TotalPnL        float64 `json:"total_pnl"`         // Total profit/loss (USDT)
	TotalTrades     int     `json:"total_trades"`      // Total number of trades
	WinningTrades   int     `json:"winning_trades"`    // Number of winning trades
	LosingTrades    int     `json:"losing_trades"`     // Number of losing trades
	WinRate         float64 `json:"win_rate"`          // Win rate (%)
	AvgWin          float64 `json:"avg_win"`           // Average win (USDT)
	AvgLoss         float64 `json:"avg_loss"`          // Average loss (USDT)
	ProfitFactor    float64 `json:"profit_factor"`     // Profit factor (wins/losses)
	SharpeRatio     float64 `json:"sharpe_ratio"`      // Sharpe ratio
	MaxDrawdown     float64 `json:"max_drawdown"`      // Maximum drawdown (%)
	AvgHoldTime     float64 `json:"avg_hold_time"`     // Average hold time (minutes)
	EarlyCloses     int     `json:"early_closes"`      // Number of times auto-close triggered
	MissedProfit    float64 `json:"missed_profit"`      // Profit that would have been made if held longer
}

// BacktestResult contains results for all strategies
type BacktestResult struct {
	TraderID        string           `json:"trader_id"`
	StartTime       time.Time        `json:"start_time"`
	EndTime         time.Time        `json:"end_time"`
	TotalCycles     int              `json:"total_cycles"`
	Strategies      []StrategyResult `json:"strategies"`
	BestStrategy    StrategyResult   `json:"best_strategy"`    // Best by Sharpe Ratio
	BestTotalPnL    StrategyResult   `json:"best_total_pnl"`   // Best by total P&L
	BestWinRate     StrategyResult   `json:"best_win_rate"`    // Best by win rate
}

// BacktestAutoCloseStrategies backtests different auto-close strategies on historical data
func BacktestAutoCloseStrategies(traderID string, decisionLogDir string, strategies []float64) (*BacktestResult, error) {
	log.Printf("🧪 Starting backtest for trader: %s", traderID)
	log.Printf("📊 Testing %d strategies: %v", len(strategies), strategies)

	// Load decision logger
	decisionLogger := logger.NewDecisionLogger(decisionLogDir)

	// Get all historical records
	records, err := decisionLogger.GetAllRecords()
	if err != nil {
		return nil, fmt.Errorf("failed to get historical records: %w", err)
	}

	if len(records) == 0 {
		return nil, fmt.Errorf("no historical records found")
	}

	log.Printf("📈 Loaded %d historical decision records", len(records))

	// Sort records by timestamp
	sort.Slice(records, func(i, j int) bool {
		return records[i].Timestamp.Before(records[j].Timestamp)
	})

	startTime := records[0].Timestamp
	endTime := records[len(records)-1].Timestamp

	// Extract all trades (open/close pairs)
	trades := extractTrades(records)
	log.Printf("📊 Found %d completed trades", len(trades))

	// Test each strategy
	results := make([]StrategyResult, 0, len(strategies))
	for _, strategy := range strategies {
		log.Printf("🧪 Testing strategy: %.2f%% auto-close", strategy)
		result := testStrategy(trades, strategy)
		results = append(results, result)
	}

	// Find best strategies
	bestStrategy := findBestBySharpe(results)
	bestTotalPnL := findBestByTotalPnL(results)
	bestWinRate := findBestByWinRate(results)

	backtestResult := &BacktestResult{
		TraderID:     traderID,
		StartTime:    startTime,
		EndTime:       endTime,
		TotalCycles:   len(records),
		Strategies:    results,
		BestStrategy:  bestStrategy,
		BestTotalPnL:  bestTotalPnL,
		BestWinRate:   bestWinRate,
	}

	return backtestResult, nil
}

// Trade represents a single trade (open + close)
type Trade struct {
	Symbol      string
	Side        string // "long" or "short"
	OpenPrice   float64
	ClosePrice  float64
	OpenTime    time.Time
	CloseTime   time.Time
	Quantity    float64
	Leverage    int
	TakeProfit  float64 // AI's take profit price (0 if not set)
	StopLoss    float64 // AI's stop loss price (0 if not set)
	ActualPnL   float64 // Actual P&L from historical data
	ActualPnLPct float64 // Actual P&L % (with leverage)
}

// extractTrades extracts all completed trades from decision records
func extractTrades(records []*logger.DecisionRecord) []Trade {
	trades := make([]Trade, 0)
	openPositions := make(map[string]*Trade)

	for _, record := range records {
		for _, action := range record.Decisions {
			if !action.Success {
				continue
			}

			symbol := action.Symbol
			var side string
			if action.Action == "open_long" || action.Action == "close_long" {
				side = "long"
			} else if action.Action == "open_short" || action.Action == "close_short" {
				side = "short"
			} else {
				continue
			}

			posKey := symbol + "_" + side

			switch action.Action {
			case "open_long", "open_short":
				// Extract take profit and stop loss from decision JSON if available
				takeProfit := 0.0
				stopLoss := 0.0
				
				// Try to parse decision JSON to get take_profit and stop_loss
				if record.DecisionJSON != "" {
					var decisions []map[string]interface{}
					if err := json.Unmarshal([]byte(record.DecisionJSON), &decisions); err == nil {
						for _, d := range decisions {
							if d["symbol"] == symbol {
								if tp, ok := d["take_profit"].(float64); ok {
									takeProfit = tp
								}
								if sl, ok := d["stop_loss"].(float64); ok {
									stopLoss = sl
								}
								break
							}
						}
					}
				}

				openPositions[posKey] = &Trade{
					Symbol:     symbol,
					Side:       side,
					OpenPrice:  action.Price,
					OpenTime:   action.Timestamp,
					Quantity:   action.Quantity,
					Leverage:   action.Leverage,
					TakeProfit: takeProfit,
					StopLoss:   stopLoss,
				}

			case "close_long", "close_short":
				if openTrade, exists := openPositions[posKey]; exists {
					openTrade.ClosePrice = action.Price
					openTrade.CloseTime = action.Timestamp

					// Calculate actual P&L
					var pnl float64
					if side == "long" {
						pnl = openTrade.Quantity * (openTrade.ClosePrice - openTrade.OpenPrice)
					} else {
						pnl = openTrade.Quantity * (openTrade.OpenPrice - openTrade.ClosePrice)
					}
					openTrade.ActualPnL = pnl

					positionValue := openTrade.Quantity * openTrade.OpenPrice
					marginUsed := positionValue / float64(openTrade.Leverage)
					if marginUsed > 0 {
						openTrade.ActualPnLPct = (pnl / marginUsed) * 100
					}

					trades = append(trades, *openTrade)
					delete(openPositions, posKey)
				}
			}
		}
	}

	return trades
}

// testStrategy tests a single auto-close strategy
func testStrategy(trades []Trade, autoClosePct float64) StrategyResult {
	result := StrategyResult{
		AutoClosePct: autoClosePct,
	}

	totalPnL := 0.0
	totalWinAmount := 0.0
	totalLossAmount := 0.0
	totalHoldTime := 0.0
	earlyCloses := 0
	missedProfit := 0.0
	equityHistory := make([]float64, 0)
	initialEquity := 10000.0
	currentEquity := initialEquity
	maxEquity := initialEquity
	maxDrawdown := 0.0

	for _, trade := range trades {
		// Simulate what would happen with this auto-close strategy
		simulatedPnL, _, closedEarly, missed := simulateTrade(trade, autoClosePct)
		
		if closedEarly {
			earlyCloses++
		}
		missedProfit += missed

		totalPnL += simulatedPnL
		currentEquity += simulatedPnL
		equityHistory = append(equityHistory, currentEquity)

		if currentEquity > maxEquity {
			maxEquity = currentEquity
		}

		drawdown := ((maxEquity - currentEquity) / maxEquity) * 100
		if drawdown > maxDrawdown {
			maxDrawdown = drawdown
		}

		result.TotalTrades++

		if simulatedPnL > 0 {
			result.WinningTrades++
			totalWinAmount += simulatedPnL
		} else if simulatedPnL < 0 {
			result.LosingTrades++
			totalLossAmount += simulatedPnL
		}

		holdDuration := trade.CloseTime.Sub(trade.OpenTime).Minutes()
		totalHoldTime += holdDuration
	}

	result.TotalPnL = totalPnL
	result.MaxDrawdown = maxDrawdown

	if result.TotalTrades > 0 {
		result.WinRate = (float64(result.WinningTrades) / float64(result.TotalTrades)) * 100
		result.AvgHoldTime = totalHoldTime / float64(result.TotalTrades)
	}

	if result.WinningTrades > 0 {
		result.AvgWin = totalWinAmount / float64(result.WinningTrades)
	}
	if result.LosingTrades > 0 {
		result.AvgLoss = totalLossAmount / float64(result.LosingTrades)
	}

	if totalLossAmount != 0 {
		result.ProfitFactor = totalWinAmount / (-totalLossAmount)
	} else if totalWinAmount > 0 {
		result.ProfitFactor = 999.0
	}

	result.EarlyCloses = earlyCloses
	result.MissedProfit = missedProfit

	// Calculate Sharpe Ratio
	result.SharpeRatio = calculateSharpeRatio(equityHistory)

	return result
}

// simulateTrade simulates a trade with auto-close strategy
// Returns: simulated P&L, simulated P&L %, whether closed early, missed profit
func simulateTrade(trade Trade, autoClosePct float64) (float64, float64, bool, float64) {
	// If no auto-close, use actual result
	if autoClosePct == 0 {
		return trade.ActualPnL, trade.ActualPnLPct, false, 0.0
	}

	positionValue := trade.Quantity * trade.OpenPrice
	marginUsed := positionValue / float64(trade.Leverage)
	
	// Calculate price change needed for autoClosePct P&L
	// P&L% = (price_change / entry_price) * leverage * 100
	// So: price_change = (P&L% / (leverage * 100)) * entry_price
	priceChangePct := autoClosePct / (100.0 * float64(trade.Leverage))
	
	var autoClosePrice float64
	if trade.Side == "long" {
		autoClosePrice = trade.OpenPrice * (1 + priceChangePct)
	} else {
		autoClosePrice = trade.OpenPrice * (1 - priceChangePct)
	}

	// Check if auto-close would have triggered based on actual close price
	// If actual close price passed the auto-close level, we would have closed early
	var simulatedClosePrice float64
	closedEarly := false
	missedProfit := 0.0

	if trade.Side == "long" {
		// For long: auto-close at higher price
		if trade.ClosePrice >= autoClosePrice {
			// Price reached or exceeded auto-close level → would have closed early
			simulatedClosePrice = autoClosePrice
			closedEarly = true
			// Calculate missed profit (actual - simulated)
			if trade.ClosePrice > autoClosePrice {
				missedProfit = trade.Quantity * (trade.ClosePrice - autoClosePrice)
			}
		} else {
			// Price never reached auto-close level → use actual close
			simulatedClosePrice = trade.ClosePrice
		}
	} else {
		// For short: auto-close at lower price
		if trade.ClosePrice <= autoClosePrice {
			// Price reached or went below auto-close level → would have closed early
			simulatedClosePrice = autoClosePrice
			closedEarly = true
			// Calculate missed profit
			if trade.ClosePrice < autoClosePrice {
				missedProfit = trade.Quantity * (autoClosePrice - trade.ClosePrice)
			}
		} else {
			// Price never reached auto-close level → use actual close
			simulatedClosePrice = trade.ClosePrice
		}
	}

	// Calculate simulated P&L
	var simulatedPnL float64
	if trade.Side == "long" {
		simulatedPnL = trade.Quantity * (simulatedClosePrice - trade.OpenPrice)
	} else {
		simulatedPnL = trade.Quantity * (trade.OpenPrice - simulatedClosePrice)
	}

	simulatedPnLPct := 0.0
	if marginUsed > 0 {
		simulatedPnLPct = (simulatedPnL / marginUsed) * 100
	}

	return simulatedPnL, simulatedPnLPct, closedEarly, missedProfit
}

// calculateSharpeRatio calculates Sharpe ratio from equity history
func calculateSharpeRatio(equityHistory []float64) float64 {
	if len(equityHistory) < 2 {
		return 0.0
	}

	// Calculate returns
	returns := make([]float64, len(equityHistory)-1)
	for i := 1; i < len(equityHistory); i++ {
		returns[i-1] = (equityHistory[i] - equityHistory[i-1]) / equityHistory[i-1]
	}

	if len(returns) == 0 {
		return 0.0
	}

	// Calculate average return
	avgReturn := 0.0
	for _, r := range returns {
		avgReturn += r
	}
	avgReturn /= float64(len(returns))

	// Calculate standard deviation
	variance := 0.0
	for _, r := range returns {
		variance += (r - avgReturn) * (r - avgReturn)
	}
	variance /= float64(len(returns))
	stdDev := 0.0
	if variance > 0 {
		stdDev = variance
		// Simple approximation (should use proper sqrt)
		for i := 0; i < 10; i++ {
			stdDev = (stdDev + variance/stdDev) / 2
		}
	}

	if stdDev == 0 {
		return 0.0
	}

	// Annualize (assuming 1 trade per hour on average)
	annualizedReturn := avgReturn * 24 * 365
	annualizedStdDev := stdDev * 24 * 365

	// Sharpe Ratio = (Return - RiskFreeRate) / StdDev
	// Assuming risk-free rate = 0 for simplicity
	sharpe := annualizedReturn / annualizedStdDev

	return sharpe
}

// findBestBySharpe finds strategy with best Sharpe Ratio
func findBestBySharpe(results []StrategyResult) StrategyResult {
	best := results[0]
	for _, r := range results {
		if r.SharpeRatio > best.SharpeRatio {
			best = r
		}
	}
	return best
}

// findBestByTotalPnL finds strategy with best total P&L
func findBestByTotalPnL(results []StrategyResult) StrategyResult {
	best := results[0]
	for _, r := range results {
		if r.TotalPnL > best.TotalPnL {
			best = r
		}
	}
	return best
}

// findBestByWinRate finds strategy with best win rate
func findBestByWinRate(results []StrategyResult) StrategyResult {
	best := results[0]
	for _, r := range results {
		if r.WinRate > best.WinRate {
			best = r
		}
	}
	return best
}

// RunBacktest runs backtest and saves results to file
func RunBacktest(traderID string, decisionLogDir string) error {
	// Test strategies: 0% (no auto-close), 0.5%, 1%, 1.5%, 2%, 2.5%, 3%, 5%
	strategies := []float64{0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 5.0}

	result, err := BacktestAutoCloseStrategies(traderID, decisionLogDir, strategies)
	if err != nil {
		return fmt.Errorf("backtest failed: %w", err)
	}

	// Save results to JSON file
	outputFile := filepath.Join(decisionLogDir, fmt.Sprintf("backtest_%s.json", time.Now().Format("20060102_150405")))
	jsonData, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal results: %w", err)
	}

	if err := os.WriteFile(outputFile, jsonData, 0644); err != nil {
		return fmt.Errorf("failed to write results: %w", err)
	}

	log.Printf("✅ Backtest complete! Results saved to: %s", outputFile)

	// Print summary
	printBacktestSummary(result)

	return nil
}

// printBacktestSummary prints a formatted summary of backtest results
func printBacktestSummary(result *BacktestResult) {
	fmt.Println("\n" + strings.Repeat("=", 80))
	fmt.Println("🧪 AUTO-CLOSE STRATEGY BACKTEST RESULTS")
	fmt.Println(strings.Repeat("=", 80))
	fmt.Printf("Trader: %s\n", result.TraderID)
	fmt.Printf("Period: %s to %s\n", result.StartTime.Format("2006-01-02 15:04:05"), result.EndTime.Format("2006-01-02 15:04:05"))
	fmt.Printf("Total Cycles: %d\n", result.TotalCycles)
	fmt.Println(strings.Repeat("-", 80))

	fmt.Printf("\n📊 Strategy Comparison:\n\n")
	fmt.Printf("%-8s | %10s | %6s | %8s | %8s | %10s | %8s | %8s\n",
		"Auto%", "Total P&L", "Trades", "Win%", "Sharpe", "Avg Win", "Avg Loss", "Early")
	fmt.Println(strings.Repeat("-", 80))

	for _, s := range result.Strategies {
		fmt.Printf("%-8.1f | %10.2f | %6d | %7.1f%% | %8.2f | %10.2f | %8.2f | %8d\n",
			s.AutoClosePct, s.TotalPnL, s.TotalTrades, s.WinRate, s.SharpeRatio, s.AvgWin, s.AvgLoss, s.EarlyCloses)
	}

	fmt.Println(strings.Repeat("-", 80))

	fmt.Printf("\n🏆 Best Strategies:\n\n")
	fmt.Printf("Best Sharpe Ratio: %.2f%% auto-close\n", result.BestStrategy.AutoClosePct)
	fmt.Printf("  Sharpe: %.2f | P&L: $%.2f | Win Rate: %.1f%%\n",
		result.BestStrategy.SharpeRatio, result.BestStrategy.TotalPnL, result.BestStrategy.WinRate)

	fmt.Printf("\nBest Total P&L: %.2f%% auto-close\n", result.BestTotalPnL.AutoClosePct)
	fmt.Printf("  P&L: $%.2f | Sharpe: %.2f | Win Rate: %.1f%%\n",
		result.BestTotalPnL.TotalPnL, result.BestTotalPnL.SharpeRatio, result.BestTotalPnL.WinRate)

	fmt.Printf("\nBest Win Rate: %.2f%% auto-close\n", result.BestWinRate.AutoClosePct)
	fmt.Printf("  Win Rate: %.1f%% | P&L: $%.2f | Sharpe: %.2f\n",
		result.BestWinRate.WinRate, result.BestWinRate.TotalPnL, result.BestWinRate.SharpeRatio)

	fmt.Println(strings.Repeat("=", 80))
}

