package manager

import (
	"fmt"
	"log"
	"lia/config"
	"lia/trader"
	"runtime"
	"sync"
	"time"
)

// TraderManager manages multiple trader instances
type TraderManager struct {
	traders map[string]*trader.AutoTrader // key: trader ID
	mu      sync.RWMutex
}

// NewTraderManager creates trader manager
func NewTraderManager() *TraderManager {
	return &TraderManager{
		traders: make(map[string]*trader.AutoTrader),
	}
}

// AddTrader adds a trader
func (tm *TraderManager) AddTrader(cfg config.TraderConfig, coinPoolURL string, maxDailyLoss, maxDrawdown float64, stopTradingMinutes int, leverage config.LeverageConfig, globalConfig *config.Config) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if _, exists := tm.traders[cfg.ID]; exists {
		return fmt.Errorf("trader ID '%s' already exists", cfg.ID)
	}

	// Build AutoTraderConfig
	traderConfig := trader.AutoTraderConfig{
		ID:                    cfg.ID,
		Name:                  cfg.Name,
		AIModel:               cfg.AIModel,
		Exchange:              cfg.Exchange,
		BinanceAPIKey:         cfg.BinanceAPIKey,
		BinanceSecretKey:      cfg.BinanceSecretKey,
		HyperliquidPrivateKey: cfg.HyperliquidPrivateKey,
		HyperliquidWalletAddr: cfg.HyperliquidWalletAddr,
		HyperliquidTestnet:    cfg.HyperliquidTestnet,
		AsterUser:             cfg.AsterUser,
		AsterSigner:           cfg.AsterSigner,
		AsterPrivateKey:       cfg.AsterPrivateKey,
		CoinPoolAPIURL:        coinPoolURL,
		UseQwen:               cfg.AIModel == "qwen",
		DeepSeekKey:           cfg.DeepSeekKey,
		QwenKey:               cfg.QwenKey,
		GroqKey:               cfg.GroqKey,
		GroqModel:             cfg.GroqModel,
		CustomAPIURL:          cfg.CustomAPIURL,
		CustomAPIKey:          cfg.CustomAPIKey,
		CustomModelName:       cfg.CustomModelName,
		ScanInterval:          cfg.GetScanInterval(),
		InitialBalance:        cfg.InitialBalance,
		BTCETHLeverage:        leverage.BTCETHLeverage,  // Use configured leverage multiplier
		AltcoinLeverage:       leverage.AltcoinLeverage, // Use configured leverage multiplier
		MaxDailyLoss:          maxDailyLoss,
		MaxDrawdown:           maxDrawdown,
		StopTradingTime:       time.Duration(stopTradingMinutes) * time.Minute,
		AutoTakeProfitPct:     globalConfig.AutoTakeProfitPct, // Auto take profit percentage
	}

	// Build Supabase config if enabled
	var supabaseConfig *trader.SupabaseConfig
	if globalConfig != nil && globalConfig.UseSupabase && globalConfig.SupabaseDatabaseURL != "" {
		supabaseConfig = &trader.SupabaseConfig{
			UseSupabase: true,
			DatabaseURL: globalConfig.SupabaseDatabaseURL,
			Schema:      globalConfig.SupabaseSchema,
		}
		if supabaseConfig.Schema == "" {
			supabaseConfig.Schema = "public"
		}
		log.Printf("📊 Supabase enabled for trader '%s'", cfg.Name)
	}

	// Pass multi-agent config if enabled
	var multiAgentConfig interface{}
	if globalConfig != nil && globalConfig.MultiAgent != nil && globalConfig.MultiAgent.Enabled {
		multiAgentConfig = globalConfig.MultiAgent
		log.Printf("🤖 Multi-agent enabled for trader '%s'", cfg.Name)
	}

	// Create trader instance
	at, err := trader.NewAutoTraderWithMultiAgent(traderConfig, supabaseConfig, multiAgentConfig)
	if err != nil {
		return fmt.Errorf("failed to create trader: %w", err)
	}

	tm.traders[cfg.ID] = at
	log.Printf("✓ Trader '%s' (%s) added", cfg.Name, cfg.AIModel)
	return nil
}

// GetTrader gets trader with specified ID
func (tm *TraderManager) GetTrader(id string) (*trader.AutoTrader, error) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	t, exists := tm.traders[id]
	if !exists {
		return nil, fmt.Errorf("trader ID '%s' does not exist", id)
	}
	return t, nil
}

// GetAllTraders gets all traders
func (tm *TraderManager) GetAllTraders() map[string]*trader.AutoTrader {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	result := make(map[string]*trader.AutoTrader)
	for id, t := range tm.traders {
		result[id] = t
	}
	return result
}

// GetTraderIDs gets all trader ID list
func (tm *TraderManager) GetTraderIDs() []string {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	ids := make([]string, 0, len(tm.traders))
	for id := range tm.traders {
		ids = append(ids, id)
	}
	return ids
}

// StartAll starts all traders
func (tm *TraderManager) StartAll() {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	log.Println("🚀 Starting all Traders...")
	for id, t := range tm.traders {
		go func(traderID string, at *trader.AutoTrader) {
			// Add panic recovery to prevent goroutine crashes
			defer func() {
				if r := recover(); r != nil {
					log.Printf("🚨 PANIC in %s goroutine: %v\n%s", at.GetName(), r, getStackTrace())
					log.Printf("🔄 Attempting to restart %s...", at.GetName())
					// Attempt to restart the trader
					time.Sleep(5 * time.Second)
					go func() {
						if err := at.Run(); err != nil {
							log.Printf("❌ %s restart failed: %v", at.GetName(), err)
						}
					}()
				}
			}()
			
			log.Printf("▶️  Starting %s...", at.GetName())
			if err := at.Run(); err != nil {
				log.Printf("❌ %s runtime error: %v", at.GetName(), err)
			}
		}(id, t)
	}
}

// getStackTrace returns the current stack trace as a string
func getStackTrace() string {
	buf := make([]byte, 4096)
	n := runtime.Stack(buf, false)
	return string(buf[:n])
}

// StopAll stops all traders
func (tm *TraderManager) StopAll() {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	log.Println("⏹  Stopping all Traders...")
	for _, t := range tm.traders {
		t.Stop()
	}
}

// GetComparisonData gets comparison data
func (tm *TraderManager) GetComparisonData() (map[string]interface{}, error) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	comparison := make(map[string]interface{})
	traders := make([]map[string]interface{}, 0, len(tm.traders))

	for _, t := range tm.traders {
		account, err := t.GetAccountInfo()
		status := t.GetStatus()
		
		// If account info fails (e.g., invalid API keys), use demo data
		if err != nil {
			log.Printf("⚠️  [%s] Failed to get account info, using demo data: %v", t.GetName(), err)
			initialBalance := 1000.0
			if ib, ok := status["initial_balance"].(float64); ok && ib > 0 {
				initialBalance = ib
			}
			
			traders = append(traders, map[string]interface{}{
				"trader_id":       t.GetID(),
				"trader_name":     t.GetName(),
				"ai_model":        t.GetAIModel(),
				"total_equity":    initialBalance, // Use initial balance as demo
				"total_pnl":       0.0,
				"total_pnl_pct":   0.0,
				"position_count":  0,
				"margin_used_pct": 0.0,
				"call_count":      status["call_count"],
				"is_running":      status["is_running"],
			})
			continue
		}

		traders = append(traders, map[string]interface{}{
			"trader_id":       t.GetID(),
			"trader_name":     t.GetName(),
			"ai_model":        t.GetAIModel(),
			"total_equity":    account["total_equity"],
			"total_pnl":       account["total_pnl"],
			"total_pnl_pct":   account["total_pnl_pct"],
			"position_count":  account["position_count"],
			"margin_used_pct": account["margin_used_pct"],
			"call_count":      status["call_count"],
			"is_running":      status["is_running"],
		})
	}

	comparison["traders"] = traders
	comparison["count"] = len(traders)

	return comparison, nil
}
