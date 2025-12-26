package trader

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/adshao/go-binance/v2/futures"
)

// FuturesTrader Binance Futures trader
type FuturesTrader struct {
	client *futures.Client

	// Balance cache
	cachedBalance     map[string]interface{}
	balanceCacheTime  time.Time
	balanceCacheMutex sync.RWMutex

	// Positions cache
	cachedPositions     []map[string]interface{}
	positionsCacheTime  time.Time
	positionsCacheMutex sync.RWMutex

	// Cache duration (15 seconds)
	cacheDuration time.Duration

	// Multi-Assets Mode detection
	isMultiAssetsMode bool
	multiAssetsMutex  sync.RWMutex

	// Time sync tracking
	lastTimeSync  time.Time
	timeSyncMutex sync.RWMutex
}

// NewFuturesTrader 创建合约交易器
func NewFuturesTrader(apiKey, secretKey string) *FuturesTrader {
	client := futures.NewClient(apiKey, secretKey)

	// Sync with Binance server time to avoid timestamp errors
	syncServerTime(client)

	return &FuturesTrader{
		client:        client,
		cacheDuration: 15 * time.Second, // 15秒缓存
	}
}

// syncServerTime synchronizes client time with Binance server time
func syncServerTime(client *futures.Client) {
	// Get Binance server time
	serverTime, err := client.NewServerTimeService().Do(context.Background())
	if err != nil {
		log.Printf("⚠️  Failed to get Binance server time: %v (will continue without sync)", err)
		return
	}

	// Calculate time offset (server time - local time)
	localTime := time.Now().UnixMilli()
	timeOffset := serverTime - localTime

	if timeOffset > 1000 || timeOffset < -1000 {
		log.Printf("⚠️  Time offset detected: %d ms (local time is %s ahead/behind server)",
			timeOffset,
			func() string {
				if timeOffset > 0 {
					return fmt.Sprintf("%.1f seconds", float64(timeOffset)/1000.0)
				}
				return fmt.Sprintf("%.1f seconds", float64(-timeOffset)/1000.0)
			}())
		log.Printf("💡 Tip: Sync your system clock: Windows Settings > Time & Language > Date & Time > Sync now")
	} else {
		log.Printf("✓ Time synchronized with Binance server (offset: %d ms)", timeOffset)
	}

	// Note: go-binance library handles timestamps automatically
	// If errors persist, sync system clock: Windows Settings > Time & Language > Sync now
}

// reSyncServerTime re-syncs server time (called on timestamp errors)
func (t *FuturesTrader) reSyncServerTime() {
	t.timeSyncMutex.Lock()
	defer t.timeSyncMutex.Unlock()

	// Don't re-sync too frequently (max once per minute)
	if time.Since(t.lastTimeSync) < 1*time.Minute {
		return
	}

	log.Printf("🔄 Re-syncing with Binance server time due to timestamp error...")
	syncServerTime(t.client)
	t.lastTimeSync = time.Now()
}

// GetBalance 获取账户余额（带缓存）
func (t *FuturesTrader) GetBalance() (map[string]interface{}, error) {
	// 先检查缓存是否有效
	t.balanceCacheMutex.RLock()
	if t.cachedBalance != nil && time.Since(t.balanceCacheTime) < t.cacheDuration {
		t.balanceCacheMutex.RUnlock()
		return t.cachedBalance, nil
	}
	t.balanceCacheMutex.RUnlock()

	// 缓存过期或不存在，调用API
	account, err := t.client.NewGetAccountService().Do(context.Background())
	if err != nil {
		// If timestamp error, try re-syncing and retry once
		if strings.Contains(err.Error(), "-1021") || strings.Contains(err.Error(), "recvWindow") || strings.Contains(err.Error(), "timestamp") {
			log.Printf("⚠️  Timestamp error detected, re-syncing server time...")
			t.reSyncServerTime()
			// Retry once after re-sync
			account, err = t.client.NewGetAccountService().Do(context.Background())
			if err != nil {
				log.Printf("❌ Binance API call failed after re-sync: %v", err)
				return nil, fmt.Errorf("failed to get account info (timestamp error persists - please sync system clock): %w", err)
			}
		} else {
			log.Printf("❌ Binance API call failed: %v", err)
			return nil, fmt.Errorf("failed to get account info: %w", err)
		}
	}

	result := make(map[string]interface{})
	result["totalWalletBalance"], _ = strconv.ParseFloat(account.TotalWalletBalance, 64)
	result["availableBalance"], _ = strconv.ParseFloat(account.AvailableBalance, 64)
	result["totalUnrealizedProfit"], _ = strconv.ParseFloat(account.TotalUnrealizedProfit, 64)

	// Calculate margin balance (wallet + unrealized P&L) for clarity
	walletBalance, _ := strconv.ParseFloat(account.TotalWalletBalance, 64)
	unrealizedPnl, _ := strconv.ParseFloat(account.TotalUnrealizedProfit, 64)
	marginBalance := walletBalance + unrealizedPnl

	log.Printf("✓ Binance API returned: Wallet Balance=%s, Margin Balance=%.2f, Available=%s, Unrealized P&L=%s",
		account.TotalWalletBalance,
		marginBalance,
		account.AvailableBalance,
		account.TotalUnrealizedProfit)

	// 更新缓存
	t.balanceCacheMutex.Lock()
	t.cachedBalance = result
	t.balanceCacheTime = time.Now()
	t.balanceCacheMutex.Unlock()

	return result, nil
}

// GetPositions 获取所有持仓（带缓存）
func (t *FuturesTrader) GetPositions() ([]map[string]interface{}, error) {
	// 先检查缓存是否有效
	t.positionsCacheMutex.RLock()
	if t.cachedPositions != nil && time.Since(t.positionsCacheTime) < t.cacheDuration {
		t.positionsCacheMutex.RUnlock()
		return t.cachedPositions, nil
	}
	t.positionsCacheMutex.RUnlock()

	// 缓存过期或不存在，调用API
	positions, err := t.client.NewGetPositionRiskService().Do(context.Background())
	if err != nil {
		// If timestamp error, try re-syncing and retry once
		if strings.Contains(err.Error(), "-1021") || strings.Contains(err.Error(), "recvWindow") || strings.Contains(err.Error(), "timestamp") {
			log.Printf("⚠️  Timestamp error detected, re-syncing server time...")
			t.reSyncServerTime()
			// Retry once after re-sync
			positions, err = t.client.NewGetPositionRiskService().Do(context.Background())
			if err != nil {
				return nil, fmt.Errorf("获取持仓失败 (timestamp error persists - please sync system clock): %w", err)
			}
		} else {
			return nil, fmt.Errorf("获取持仓失败: %w", err)
		}
	}

	var result []map[string]interface{}
	for _, pos := range positions {
		posAmt, _ := strconv.ParseFloat(pos.PositionAmt, 64)
		if posAmt == 0 {
			continue // 跳过无持仓的
		}

		posMap := make(map[string]interface{})
		posMap["symbol"] = pos.Symbol
		posMap["positionAmt"], _ = strconv.ParseFloat(pos.PositionAmt, 64)
		posMap["entryPrice"], _ = strconv.ParseFloat(pos.EntryPrice, 64)
		posMap["markPrice"], _ = strconv.ParseFloat(pos.MarkPrice, 64)
		posMap["unRealizedProfit"], _ = strconv.ParseFloat(pos.UnRealizedProfit, 64)
		posMap["leverage"], _ = strconv.ParseFloat(pos.Leverage, 64)
		posMap["liquidationPrice"], _ = strconv.ParseFloat(pos.LiquidationPrice, 64)

		// 判断方向
		if posAmt > 0 {
			posMap["side"] = "long"
		} else {
			posMap["side"] = "short"
		}

		result = append(result, posMap)
	}

	// 更新缓存
	t.positionsCacheMutex.Lock()
	t.cachedPositions = result
	t.positionsCacheTime = time.Now()
	t.positionsCacheMutex.Unlock()

	return result, nil
}

// SetLeverage 设置杠杆（智能判断+冷却期）
func (t *FuturesTrader) SetLeverage(symbol string, leverage int) error {
	// 先尝试获取当前杠杆（从持仓信息）
	currentLeverage := 0
	positions, err := t.GetPositions()
	if err == nil {
		for _, pos := range positions {
			if pos["symbol"] == symbol {
				if lev, ok := pos["leverage"].(float64); ok {
					currentLeverage = int(lev)
					break
				}
			}
		}
	}

	// 如果当前杠杆已经是目标杠杆，跳过
	if currentLeverage == leverage && currentLeverage > 0 {
		log.Printf("  ✓ %s leverage already %dx, no need to change", symbol, leverage)
		return nil
	}

	// 切换杠杆
	_, err = t.client.NewChangeLeverageService().
		Symbol(symbol).
		Leverage(leverage).
		Do(context.Background())

	if err != nil {
		// 如果错误信息包含"No need to change"，说明杠杆已经是目标值
		if contains(err.Error(), "No need to change") {
			log.Printf("  ✓ %s leverage already %dx", symbol, leverage)
			return nil
		}
		return fmt.Errorf("failed to set leverage: %w", err)
	}

	log.Printf("  ✓ %s leverage switched to %dx", symbol, leverage)

	// Wait 5 seconds after switching leverage (avoid cooldown error)
	log.Printf("  ⏱ Waiting 5 seconds cooldown...")
	time.Sleep(5 * time.Second)

	return nil
}

// SetMarginType 设置保证金模式
func (t *FuturesTrader) SetMarginType(symbol string, marginType futures.MarginType) error {
	// Check if already in Multi-Assets Mode - skip entirely if so
	t.multiAssetsMutex.RLock()
	if t.isMultiAssetsMode {
		t.multiAssetsMutex.RUnlock()
		log.Printf("  ⚠ %s account uses Multi-Assets Mode, skipping margin mode setting (not needed)", symbol)
		return nil
	}
	t.multiAssetsMutex.RUnlock()

	err := t.client.NewChangeMarginTypeService().
		Symbol(symbol).
		MarginType(marginType).
		Do(context.Background())

	if err != nil {
		// If already in this mode, not an error
		if contains(err.Error(), "No need to change") {
			log.Printf("  ✓ %s margin mode already %s", symbol, marginType)
			return nil
		}
		// Multi-Assets Mode (Unified Trading Account) doesn't support margin mode changes
		// Error -4168: "Unable to adjust to isolated-margin mode under the Multi-Assets mode"
		// Error -4050: "Cross balance insufficient" (also indicates Multi-Assets Mode)
		if contains(err.Error(), "Multi-Assets mode") || contains(err.Error(), "-4168") || contains(err.Error(), "-4050") {
			log.Printf("  ⚠ %s account uses Multi-Assets Mode, skipping margin mode setting (not needed)", symbol)
			// Mark as Multi-Assets Mode for future orders
			t.multiAssetsMutex.Lock()
			t.isMultiAssetsMode = true
			t.multiAssetsMutex.Unlock()
			return nil // Not an error, just skip it
		}
		return fmt.Errorf("failed to set margin mode: %w", err)
	}

	log.Printf("  ✓ %s margin mode switched to %s", symbol, marginType)

	// Wait 3 seconds after switching margin mode (avoid cooldown error)
	log.Printf("  ⏱ Waiting 3 seconds cooldown...")
	time.Sleep(3 * time.Second)

	return nil
}

// OpenLong 开多仓
func (t *FuturesTrader) OpenLong(symbol string, quantity float64, leverage int) (map[string]interface{}, error) {
	// 先取消该币种的所有委托单（清理旧的止损止盈单）
	if err := t.CancelAllOrders(symbol); err != nil {
		log.Printf("  ⚠ 取消旧委托单失败（可能没有委托单）: %v", err)
	}

	// 设置杠杆
	if err := t.SetLeverage(symbol, leverage); err != nil {
		return nil, err
	}

	// 设置逐仓模式
	if err := t.SetMarginType(symbol, futures.MarginTypeIsolated); err != nil {
		return nil, err
	}

	// 格式化数量到正确精度
	quantityStr, err := t.FormatQuantity(symbol, quantity)
	if err != nil {
		return nil, err
	}

	// Determine position side based on account mode
	t.multiAssetsMutex.RLock()
	useBothSide := t.isMultiAssetsMode
	t.multiAssetsMutex.RUnlock()

	// Create market buy order
	orderService := t.client.NewCreateOrderService().
		Symbol(symbol).
		Side(futures.SideTypeBuy).
		Type(futures.OrderTypeMarket).
		Quantity(quantityStr)

	// Multi-Assets Mode requires PositionSideTypeBoth
	if useBothSide {
		orderService = orderService.PositionSide(futures.PositionSideTypeBoth)
	} else {
		orderService = orderService.PositionSide(futures.PositionSideTypeLong)
	}

	order, err := orderService.Do(context.Background())

	if err != nil {
		// If -4061 error (position side mismatch), try with BOTH and mark as Multi-Assets Mode
		if contains(err.Error(), "-4061") || contains(err.Error(), "position side does not match") {
			log.Printf("  ⚠ Detected Multi-Assets Mode, retrying with PositionSide BOTH...")
			t.multiAssetsMutex.Lock()
			t.isMultiAssetsMode = true
			t.multiAssetsMutex.Unlock()
			// Retry with BOTH
			order, err = t.client.NewCreateOrderService().
				Symbol(symbol).
				Side(futures.SideTypeBuy).
				PositionSide(futures.PositionSideTypeBoth).
				Type(futures.OrderTypeMarket).
				Quantity(quantityStr).
				Do(context.Background())
		}
		if err != nil {
			return nil, fmt.Errorf("failed to open long position: %w", err)
		}
	}

	log.Printf("✓ Long position opened: %s quantity: %s", symbol, quantityStr)
	log.Printf("  Order ID: %d", order.OrderID)

	result := make(map[string]interface{})
	result["orderId"] = order.OrderID
	result["symbol"] = order.Symbol
	result["status"] = order.Status
	return result, nil
}

// OpenShort 开空仓
func (t *FuturesTrader) OpenShort(symbol string, quantity float64, leverage int) (map[string]interface{}, error) {
	// 先取消该币种的所有委托单（清理旧的止损止盈单）
	if err := t.CancelAllOrders(symbol); err != nil {
		log.Printf("  ⚠ 取消旧委托单失败（可能没有委托单）: %v", err)
	}

	// 设置杠杆
	if err := t.SetLeverage(symbol, leverage); err != nil {
		return nil, err
	}

	// 设置逐仓模式
	if err := t.SetMarginType(symbol, futures.MarginTypeIsolated); err != nil {
		return nil, err
	}

	// 格式化数量到正确精度
	quantityStr, err := t.FormatQuantity(symbol, quantity)
	if err != nil {
		return nil, err
	}

	// Determine position side based on account mode
	t.multiAssetsMutex.RLock()
	useBothSide := t.isMultiAssetsMode
	t.multiAssetsMutex.RUnlock()

	// Create market sell order
	orderService := t.client.NewCreateOrderService().
		Symbol(symbol).
		Side(futures.SideTypeSell).
		Type(futures.OrderTypeMarket).
		Quantity(quantityStr)

	// Multi-Assets Mode requires PositionSideTypeBoth
	if useBothSide {
		orderService = orderService.PositionSide(futures.PositionSideTypeBoth)
	} else {
		orderService = orderService.PositionSide(futures.PositionSideTypeShort)
	}

	order, err := orderService.Do(context.Background())

	if err != nil {
		// If -4061 error (position side mismatch), try with BOTH and mark as Multi-Assets Mode
		if contains(err.Error(), "-4061") || contains(err.Error(), "position side does not match") {
			log.Printf("  ⚠ Detected Multi-Assets Mode, retrying with PositionSide BOTH...")
			t.multiAssetsMutex.Lock()
			t.isMultiAssetsMode = true
			t.multiAssetsMutex.Unlock()
			// Retry with BOTH
			order, err = t.client.NewCreateOrderService().
				Symbol(symbol).
				Side(futures.SideTypeSell).
				PositionSide(futures.PositionSideTypeBoth).
				Type(futures.OrderTypeMarket).
				Quantity(quantityStr).
				Do(context.Background())
		}
		if err != nil {
			return nil, fmt.Errorf("failed to open short position: %w", err)
		}
	}

	log.Printf("✓ Short position opened: %s quantity: %s", symbol, quantityStr)
	log.Printf("  Order ID: %d", order.OrderID)

	result := make(map[string]interface{})
	result["orderId"] = order.OrderID
	result["symbol"] = order.Symbol
	result["status"] = order.Status
	return result, nil
}

// CloseLong 平多仓
func (t *FuturesTrader) CloseLong(symbol string, quantity float64) (map[string]interface{}, error) {
	// 如果数量为0，获取当前持仓数量
	if quantity == 0 {
		positions, err := t.GetPositions()
		if err != nil {
			return nil, err
		}

		for _, pos := range positions {
			if pos["symbol"] == symbol && pos["side"] == "long" {
				quantity = pos["positionAmt"].(float64)
				break
			}
		}

		if quantity == 0 {
			return nil, fmt.Errorf("no long position found for %s", symbol)
		}
	}

	// 格式化数量
	quantityStr, err := t.FormatQuantity(symbol, quantity)
	if err != nil {
		return nil, err
	}

	// Determine position side based on account mode
	t.multiAssetsMutex.RLock()
	useBothSide := t.isMultiAssetsMode
	t.multiAssetsMutex.RUnlock()

	// Create market sell order (close long)
	orderService := t.client.NewCreateOrderService().
		Symbol(symbol).
		Side(futures.SideTypeSell).
		Type(futures.OrderTypeMarket).
		Quantity(quantityStr)

	// Multi-Assets Mode requires PositionSideTypeBoth
	if useBothSide {
		orderService = orderService.PositionSide(futures.PositionSideTypeBoth)
	} else {
		orderService = orderService.PositionSide(futures.PositionSideTypeLong)
	}

	order, err := orderService.Do(context.Background())

	if err != nil {
		// If -4061 error (position side mismatch), try with BOTH and mark as Multi-Assets Mode
		if contains(err.Error(), "-4061") || contains(err.Error(), "position side does not match") {
			log.Printf("  ⚠ Detected Multi-Assets Mode, retrying with PositionSide BOTH...")
			t.multiAssetsMutex.Lock()
			t.isMultiAssetsMode = true
			t.multiAssetsMutex.Unlock()
			// Retry with BOTH
			order, err = t.client.NewCreateOrderService().
				Symbol(symbol).
				Side(futures.SideTypeSell).
				PositionSide(futures.PositionSideTypeBoth).
				Type(futures.OrderTypeMarket).
				Quantity(quantityStr).
				Do(context.Background())
		}
		if err != nil {
			return nil, fmt.Errorf("failed to close long position: %w", err)
		}
	}

	log.Printf("✓ Long position closed: %s quantity: %s", symbol, quantityStr)

	// Cancel all pending orders after closing position (stop loss/take profit orders)
	if err := t.CancelAllOrders(symbol); err != nil {
		log.Printf("  ⚠ Failed to cancel orders: %v", err)
	}

	result := make(map[string]interface{})
	result["orderId"] = order.OrderID
	result["symbol"] = order.Symbol
	result["status"] = order.Status
	return result, nil
}

// CloseShort 平空仓
func (t *FuturesTrader) CloseShort(symbol string, quantity float64) (map[string]interface{}, error) {
	// 如果数量为0，获取当前持仓数量
	if quantity == 0 {
		positions, err := t.GetPositions()
		if err != nil {
			return nil, err
		}

		for _, pos := range positions {
			if pos["symbol"] == symbol && pos["side"] == "short" {
				quantity = -pos["positionAmt"].(float64) // 空仓数量是负的，取绝对值
				break
			}
		}

		if quantity == 0 {
			return nil, fmt.Errorf("no short position found for %s", symbol)
		}
	}

	// 格式化数量
	quantityStr, err := t.FormatQuantity(symbol, quantity)
	if err != nil {
		return nil, err
	}

	// Determine position side based on account mode
	t.multiAssetsMutex.RLock()
	useBothSide := t.isMultiAssetsMode
	t.multiAssetsMutex.RUnlock()

	// Create market buy order (close short)
	orderService := t.client.NewCreateOrderService().
		Symbol(symbol).
		Side(futures.SideTypeBuy).
		Type(futures.OrderTypeMarket).
		Quantity(quantityStr)

	// Multi-Assets Mode requires PositionSideTypeBoth
	if useBothSide {
		orderService = orderService.PositionSide(futures.PositionSideTypeBoth)
	} else {
		orderService = orderService.PositionSide(futures.PositionSideTypeShort)
	}

	order, err := orderService.Do(context.Background())

	if err != nil {
		// If -4061 error (position side mismatch), try with BOTH and mark as Multi-Assets Mode
		if contains(err.Error(), "-4061") || contains(err.Error(), "position side does not match") {
			log.Printf("  ⚠ Detected Multi-Assets Mode, retrying with PositionSide BOTH...")
			t.multiAssetsMutex.Lock()
			t.isMultiAssetsMode = true
			t.multiAssetsMutex.Unlock()
			// Retry with BOTH
			order, err = t.client.NewCreateOrderService().
				Symbol(symbol).
				Side(futures.SideTypeBuy).
				PositionSide(futures.PositionSideTypeBoth).
				Type(futures.OrderTypeMarket).
				Quantity(quantityStr).
				Do(context.Background())
		}
		if err != nil {
			return nil, fmt.Errorf("failed to close short position: %w", err)
		}
	}

	log.Printf("✓ Short position closed: %s quantity: %s", symbol, quantityStr)

	// Cancel all pending orders after closing position (stop loss/take profit orders)
	if err := t.CancelAllOrders(symbol); err != nil {
		log.Printf("  ⚠ Failed to cancel orders: %v", err)
	}

	result := make(map[string]interface{})
	result["orderId"] = order.OrderID
	result["symbol"] = order.Symbol
	result["status"] = order.Status
	return result, nil
}

// CancelAllOrders 取消该币种的所有挂单
func (t *FuturesTrader) CancelAllOrders(symbol string) error {
	err := t.client.NewCancelAllOpenOrdersService().
		Symbol(symbol).
		Do(context.Background())

	if err != nil {
		return fmt.Errorf("failed to cancel orders: %w", err)
	}

	log.Printf("  ✓ Cancelled all orders for %s", symbol)
	return nil
}

// GetMarketPrice 获取市场价格
func (t *FuturesTrader) GetMarketPrice(symbol string) (float64, error) {
	prices, err := t.client.NewListPricesService().Symbol(symbol).Do(context.Background())
	if err != nil {
		return 0, fmt.Errorf("failed to get price: %w", err)
	}

	if len(prices) == 0 {
		return 0, fmt.Errorf("price not found")
	}

	price, err := strconv.ParseFloat(prices[0].Price, 64)
	if err != nil {
		return 0, err
	}

	return price, nil
}

// CalculatePositionSize 计算仓位大小
func (t *FuturesTrader) CalculatePositionSize(balance, riskPercent, price float64, leverage int) float64 {
	riskAmount := balance * (riskPercent / 100.0)
	positionValue := riskAmount * float64(leverage)
	quantity := positionValue / price
	return quantity
}

// SetStopLoss 设置止损单
func (t *FuturesTrader) SetStopLoss(symbol string, positionSide string, quantity, stopPrice float64) error {
	var side futures.SideType
	var posSide futures.PositionSideType

	if positionSide == "LONG" {
		side = futures.SideTypeSell
		posSide = futures.PositionSideTypeLong
	} else {
		side = futures.SideTypeBuy
		posSide = futures.PositionSideTypeShort
	}

	// Check if Multi-Assets Mode - use BOTH for position side
	t.multiAssetsMutex.RLock()
	useBothSide := t.isMultiAssetsMode
	t.multiAssetsMutex.RUnlock()

	if useBothSide {
		posSide = futures.PositionSideTypeBoth
	}

	// Format quantity
	quantityStr, err := t.FormatQuantity(symbol, quantity)
	if err != nil {
		return err
	}

	_, err = t.client.NewCreateOrderService().
		Symbol(symbol).
		Side(side).
		PositionSide(posSide).
		Type(futures.OrderTypeStopMarket).
		StopPrice(fmt.Sprintf("%.8f", stopPrice)).
		Quantity(quantityStr).
		WorkingType(futures.WorkingTypeContractPrice).
		ClosePosition(true).
		Do(context.Background())

	if err != nil {
		// Make it a warning, not a fatal error - position is still open
		log.Printf("  ⚠ Failed to set stop loss: %v (position remains open)", err)
		return nil // Don't fail the entire trade
	}

	log.Printf("  ✓ Stop loss set: %.4f", stopPrice)
	return nil
}

// SetTakeProfit 设置止盈单
func (t *FuturesTrader) SetTakeProfit(symbol string, positionSide string, quantity, takeProfitPrice float64) error {
	var side futures.SideType
	var posSide futures.PositionSideType

	if positionSide == "LONG" {
		side = futures.SideTypeSell
		posSide = futures.PositionSideTypeLong
	} else {
		side = futures.SideTypeBuy
		posSide = futures.PositionSideTypeShort
	}

	// Check if Multi-Assets Mode - use BOTH for position side
	t.multiAssetsMutex.RLock()
	useBothSide := t.isMultiAssetsMode
	t.multiAssetsMutex.RUnlock()

	if useBothSide {
		posSide = futures.PositionSideTypeBoth
	}

	// Format quantity
	quantityStr, err := t.FormatQuantity(symbol, quantity)
	if err != nil {
		return err
	}

	_, err = t.client.NewCreateOrderService().
		Symbol(symbol).
		Side(side).
		PositionSide(posSide).
		Type(futures.OrderTypeTakeProfitMarket).
		StopPrice(fmt.Sprintf("%.8f", takeProfitPrice)).
		Quantity(quantityStr).
		WorkingType(futures.WorkingTypeContractPrice).
		ClosePosition(true).
		Do(context.Background())

	if err != nil {
		// Make it a warning, not a fatal error - position is still open
		log.Printf("  ⚠ Failed to set take profit: %v (position remains open)", err)
		return nil // Don't fail the entire trade
	}

	log.Printf("  ✓ Take profit set: %.4f", takeProfitPrice)
	return nil
}

// GetSymbolPrecision 获取交易对的数量精度
func (t *FuturesTrader) GetSymbolPrecision(symbol string) (int, error) {
	exchangeInfo, err := t.client.NewExchangeInfoService().Do(context.Background())
	if err != nil {
		return 0, fmt.Errorf("获取交易规则失败: %w", err)
	}

	for _, s := range exchangeInfo.Symbols {
		if s.Symbol == symbol {
			// 从LOT_SIZE filter获取精度
			for _, filter := range s.Filters {
				if filter["filterType"] == "LOT_SIZE" {
					stepSize := filter["stepSize"].(string)
					precision := calculatePrecision(stepSize)
					log.Printf("  %s 数量精度: %d (stepSize: %s)", symbol, precision, stepSize)
					return precision, nil
				}
			}
		}
	}

	log.Printf("  ⚠ %s 未找到精度信息，使用默认精度3", symbol)
	return 3, nil // 默认精度为3
}

// calculatePrecision 从stepSize计算精度
func calculatePrecision(stepSize string) int {
	// 去除尾部的0
	stepSize = trimTrailingZeros(stepSize)

	// 查找小数点
	dotIndex := -1
	for i := 0; i < len(stepSize); i++ {
		if stepSize[i] == '.' {
			dotIndex = i
			break
		}
	}

	// 如果没有小数点或小数点在最后，精度为0
	if dotIndex == -1 || dotIndex == len(stepSize)-1 {
		return 0
	}

	// 返回小数点后的位数
	return len(stepSize) - dotIndex - 1
}

// trimTrailingZeros 去除尾部的0
func trimTrailingZeros(s string) string {
	// 如果没有小数点，直接返回
	if !stringContains(s, ".") {
		return s
	}

	// 从后向前遍历，去除尾部的0
	for len(s) > 0 && s[len(s)-1] == '0' {
		s = s[:len(s)-1]
	}

	// 如果最后一位是小数点，也去掉
	if len(s) > 0 && s[len(s)-1] == '.' {
		s = s[:len(s)-1]
	}

	return s
}

// FormatQuantity 格式化数量到正确的精度
func (t *FuturesTrader) FormatQuantity(symbol string, quantity float64) (string, error) {
	precision, err := t.GetSymbolPrecision(symbol)
	if err != nil {
		// 如果获取失败，使用默认格式
		return fmt.Sprintf("%.3f", quantity), nil
	}

	format := fmt.Sprintf("%%.%df", precision)
	return fmt.Sprintf(format, quantity), nil
}

// 辅助函数
func contains(s, substr string) bool {
	return len(s) >= len(substr) && stringContains(s, substr)
}

func stringContains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
