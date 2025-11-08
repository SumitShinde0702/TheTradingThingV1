package trader

import (
	"fmt"
	"log"
	"math"
	"math/rand"
	"lia/market"
	"strings"
	"sync"
	"time"
)

// PaperTrader Paper trading simulator
// Does not connect to real exchanges, completely simulates trading for testing and demonstration
type PaperTrader struct {
	initialBalance float64

	// Account state
	balance          float64 // Wallet balance
	unrealizedProfit float64 // Unrealized profit/loss
	availableBalance float64 // Available balance

	// Position records (symbol -> position data)
	positions map[string]*PaperPosition
	mu        sync.RWMutex

	// Random number generator (for simulating price fluctuations)
	rng *rand.Rand
}

// PaperPosition Simulated position
type PaperPosition struct {
	Symbol     string
	Side       string // "LONG" or "SHORT"
	EntryPrice float64
	Quantity   float64
	Leverage   int
	EntryTime  time.Time
	MarginUsed float64
}

// NewPaperTrader Creates a paper trading simulator
func NewPaperTrader(initialBalance float64) *PaperTrader {
	return &PaperTrader{
		initialBalance:   initialBalance,
		balance:          initialBalance,
		availableBalance: initialBalance,
		positions:        make(map[string]*PaperPosition),
		rng:              rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// GetBalance Get account balance (simulated)
func (t *PaperTrader) GetBalance() (map[string]interface{}, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()

	// Update unrealized profit/loss (based on current market price)
	totalUnrealized := 0.0
	for _, pos := range t.positions {
		currentPrice, err := t.getMarketPrice(pos.Symbol)
		if err != nil {
			continue
		}

		var unrealized float64
		if pos.Side == "LONG" {
			// Long position: (current price - entry price) / entry price * position value * leverage
			priceChange := (currentPrice - pos.EntryPrice) / pos.EntryPrice
			positionValue := pos.Quantity * pos.EntryPrice
			unrealized = priceChange * positionValue * float64(pos.Leverage)
		} else {
			// Short position: (entry price - current price) / entry price * position value * leverage
			priceChange := (pos.EntryPrice - currentPrice) / pos.EntryPrice
			positionValue := pos.Quantity * pos.EntryPrice
			unrealized = priceChange * positionValue * float64(pos.Leverage)
		}
		totalUnrealized += unrealized
	}

	t.unrealizedProfit = totalUnrealized

	// Calculate available balance (total equity - margin used by positions)
	totalMarginUsed := 0.0
	for _, pos := range t.positions {
		totalMarginUsed += pos.MarginUsed
	}

	totalEquity := t.balance + t.unrealizedProfit
	t.availableBalance = totalEquity - totalMarginUsed
	if t.availableBalance < 0 {
		t.availableBalance = 0
	}

	return map[string]interface{}{
		"totalWalletBalance":    t.balance,
		"availableBalance":      t.availableBalance,
		"totalUnrealizedProfit": t.unrealizedProfit,
	}, nil
}

// GetPositions 获取所有持仓（模拟）
func (t *PaperTrader) GetPositions() ([]map[string]interface{}, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()

	var result []map[string]interface{}
	for _, pos := range t.positions {
		currentPrice, err := t.getMarketPrice(pos.Symbol)
		if err != nil {
			currentPrice = pos.EntryPrice // 如果获取价格失败，使用入场价
		}

		// 计算未实现盈亏
		var unrealizedPnl float64
		var unrealizedPnlPct float64
		if pos.Side == "LONG" {
			priceChange := (currentPrice - pos.EntryPrice) / pos.EntryPrice
			positionValue := pos.Quantity * pos.EntryPrice
			unrealizedPnl = priceChange * positionValue * float64(pos.Leverage)
			unrealizedPnlPct = priceChange * 100
		} else {
			priceChange := (pos.EntryPrice - currentPrice) / pos.EntryPrice
			positionValue := pos.Quantity * pos.EntryPrice
			unrealizedPnl = priceChange * positionValue * float64(pos.Leverage)
			unrealizedPnlPct = priceChange * 100
		}

		// 计算强平价（简化：假设强平在入场价 ±20%）
		var liquidationPrice float64
		if pos.Side == "LONG" {
			liquidationPrice = pos.EntryPrice * 0.8 // 做多：价格下跌20%强平
		} else {
			liquidationPrice = pos.EntryPrice * 1.2 // 做空：价格上涨20%强平
		}

		positionAmt := pos.Quantity
		if pos.Side == "SHORT" {
			positionAmt = -positionAmt // 做空用负数表示
		}

		// Convert side to lowercase to match expected format
		side := strings.ToLower(pos.Side)

		result = append(result, map[string]interface{}{
			"symbol":              pos.Symbol,
			"side":                side,     // Use "side" for consistency with other traders
			"positionSide":        pos.Side, // Keep for backward compatibility
			"positionAmt":         positionAmt,
			"entryPrice":          pos.EntryPrice,
			"markPrice":           currentPrice,
			"leverage":            float64(pos.Leverage),
			"unRealizedProfit":    unrealizedPnl,
			"unRealizedProfitPct": unrealizedPnlPct,
			"liquidationPrice":    liquidationPrice,
			"marginUsed":          pos.MarginUsed,
		})
	}

	return result, nil
}

// OpenLong 开多仓（模拟）
func (t *PaperTrader) OpenLong(symbol string, quantity float64, leverage int) (map[string]interface{}, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	currentPrice, err := t.getMarketPrice(symbol)
	if err != nil {
		return nil, fmt.Errorf("failed to get market price: %w", err)
	}

	// Calculate required margin
	positionValue := quantity * currentPrice
	marginUsed := positionValue / float64(leverage)

	// Round down margin to 2 decimal places to be more conservative
	// This prevents failures due to floating point precision issues
	marginUsed = math.Floor(marginUsed*100) / 100 // Round down to 2 decimals

	// Add small tolerance (0.1 USDT) to available balance check to account for:
	// - Floating point precision differences
	// - Market price updates between calculation and execution
	// - Minor rounding differences in balance calculations
	const tolerance = 0.1 // 0.1 USDT tolerance
	requiredMargin := marginUsed
	availableWithTolerance := t.availableBalance + tolerance

	if requiredMargin > availableWithTolerance {
		return nil, fmt.Errorf("insufficient available balance: need %.2f, available %.2f", marginUsed, t.availableBalance)
	}

	// Use the rounded-down margin value for actual margin used
	// This ensures we're slightly conservative with margin calculations

	// Create position
	t.positions[symbol+"_LONG"] = &PaperPosition{
		Symbol:     symbol,
		Side:       "LONG",
		EntryPrice: currentPrice,
		Quantity:   quantity,
		Leverage:   leverage,
		EntryTime:  time.Now(),
		MarginUsed: marginUsed,
	}

	log.Printf("📈 [Simulated] Open long: %s %f @ %.4f (Leverage %dx, Margin %.2f)", symbol, quantity, currentPrice, leverage, marginUsed)

	return map[string]interface{}{
		"orderId":     time.Now().Unix(),
		"symbol":      symbol,
		"side":        "BUY",
		"price":       currentPrice,
		"executedQty": quantity,
	}, nil
}

// OpenShort 开空仓（模拟）
func (t *PaperTrader) OpenShort(symbol string, quantity float64, leverage int) (map[string]interface{}, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	currentPrice, err := t.getMarketPrice(symbol)
	if err != nil {
		return nil, fmt.Errorf("failed to get market price: %w", err)
	}

	// Calculate required margin
	positionValue := quantity * currentPrice
	marginUsed := positionValue / float64(leverage)

	// Round down margin to 2 decimal places to be more conservative
	// This prevents failures due to floating point precision issues
	marginUsed = math.Floor(marginUsed*100) / 100 // Round down to 2 decimals

	// Add small tolerance (0.1 USDT) to available balance check to account for:
	// - Floating point precision differences
	// - Market price updates between calculation and execution
	// - Minor rounding differences in balance calculations
	const tolerance = 0.1 // 0.1 USDT tolerance
	requiredMargin := marginUsed
	availableWithTolerance := t.availableBalance + tolerance

	if requiredMargin > availableWithTolerance {
		return nil, fmt.Errorf("insufficient available balance: need %.2f, available %.2f", marginUsed, t.availableBalance)
	}

	// Use the rounded-down margin value for actual margin used
	// This ensures we're slightly conservative with margin calculations

	// Create position
	t.positions[symbol+"_SHORT"] = &PaperPosition{
		Symbol:     symbol,
		Side:       "SHORT",
		EntryPrice: currentPrice,
		Quantity:   quantity,
		Leverage:   leverage,
		EntryTime:  time.Now(),
		MarginUsed: marginUsed,
	}

	log.Printf("📉 [Simulated] Open short: %s %f @ %.4f (Leverage %dx, Margin %.2f)", symbol, quantity, currentPrice, leverage, marginUsed)

	return map[string]interface{}{
		"orderId":     time.Now().Unix(),
		"symbol":      symbol,
		"side":        "SELL",
		"price":       currentPrice,
		"executedQty": quantity,
	}, nil
}

// CloseLong 平多仓（模拟）
func (t *PaperTrader) CloseLong(symbol string, quantity float64) (map[string]interface{}, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	key := symbol + "_LONG"
	pos, exists := t.positions[key]
	if !exists {
		return nil, fmt.Errorf("no long position for %s", symbol)
	}

	currentPrice, err := t.getMarketPrice(symbol)
	if err != nil {
		currentPrice = pos.EntryPrice
	}

	// Calculate profit/loss
	priceChange := (currentPrice - pos.EntryPrice) / pos.EntryPrice
	positionValue := pos.Quantity * pos.EntryPrice
	realizedPnl := priceChange * positionValue * float64(pos.Leverage)

	// Update balance (add P&L to wallet)
	t.balance += realizedPnl

	// If quantity=0, close all; otherwise close partial
	if quantity == 0 || quantity >= pos.Quantity {
		// Close all
		delete(t.positions, key)
		log.Printf("📤 [Simulated] Close long: %s (all) @ %.4f, P&L=%.2f", symbol, currentPrice, realizedPnl)
	} else {
		// Close partial (simplified: reduce proportionally)
		ratio := quantity / pos.Quantity
		pos.Quantity -= quantity
		pos.MarginUsed *= (1 - ratio)
		log.Printf("📤 [Simulated] Close long: %s (partial %f) @ %.4f, P&L=%.2f", symbol, quantity, currentPrice, realizedPnl*ratio)
	}

	return map[string]interface{}{
		"orderId":     time.Now().Unix(),
		"symbol":      symbol,
		"side":        "SELL",
		"price":       currentPrice,
		"executedQty": quantity,
	}, nil
}

// CloseShort 平空仓（模拟）
func (t *PaperTrader) CloseShort(symbol string, quantity float64) (map[string]interface{}, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	key := symbol + "_SHORT"
	pos, exists := t.positions[key]
	if !exists {
		return nil, fmt.Errorf("no short position for %s", symbol)
	}

	currentPrice, err := t.getMarketPrice(symbol)
	if err != nil {
		currentPrice = pos.EntryPrice
	}

	// Calculate profit/loss
	priceChange := (pos.EntryPrice - currentPrice) / pos.EntryPrice
	positionValue := pos.Quantity * pos.EntryPrice
	realizedPnl := priceChange * positionValue * float64(pos.Leverage)

	// Update balance (add P&L to wallet)
	t.balance += realizedPnl

	// If quantity=0, close all; otherwise close partial
	if quantity == 0 || quantity >= pos.Quantity {
		// Close all
		delete(t.positions, key)
		log.Printf("📤 [Simulated] Close short: %s (all) @ %.4f, P&L=%.2f", symbol, currentPrice, realizedPnl)
	} else {
		// Close partial
		ratio := quantity / pos.Quantity
		pos.Quantity -= quantity
		pos.MarginUsed *= (1 - ratio)
		log.Printf("📤 [Simulated] Close short: %s (partial %f) @ %.4f, P&L=%.2f", symbol, quantity, currentPrice, realizedPnl*ratio)
	}

	return map[string]interface{}{
		"orderId":     time.Now().Unix(),
		"symbol":      symbol,
		"side":        "BUY",
		"price":       currentPrice,
		"executedQty": quantity,
	}, nil
}

// SetLeverage 设置杠杆（模拟）
func (t *PaperTrader) SetLeverage(symbol string, leverage int) error {
	// 模拟：不需要实际操作
	return nil
}

// GetMarketPrice 获取市场价格（从market包获取真实数据）
func (t *PaperTrader) GetMarketPrice(symbol string) (float64, error) {
	return t.getMarketPrice(symbol)
}

// getMarketPrice 内部方法：获取市场价格
func (t *PaperTrader) getMarketPrice(symbol string) (float64, error) {
	data, err := market.Get(symbol)
	if err != nil {
		return 0, err
	}
	return data.CurrentPrice, nil
}

// SetStopLoss 设置止损（模拟）
func (t *PaperTrader) SetStopLoss(symbol string, positionSide string, quantity, stopPrice float64) error {
	// 模拟：不需要实际操作（可以记录用于未来实现自动止损）
	return nil
}

// SetTakeProfit 设置止盈（模拟）
func (t *PaperTrader) SetTakeProfit(symbol string, positionSide string, quantity, takeProfitPrice float64) error {
	// 模拟：不需要实际操作（可以记录用于未来实现自动止盈）
	return nil
}

// CancelAllOrders 取消所有挂单（模拟）
func (t *PaperTrader) CancelAllOrders(symbol string) error {
	// 模拟：不需要实际操作
	return nil
}

// FormatQuantity 格式化数量（模拟）
func (t *PaperTrader) FormatQuantity(symbol string, quantity float64) (string, error) {
	// 模拟：简单格式化（实际应该根据交易所精度）
	return fmt.Sprintf("%.4f", quantity), nil
}
