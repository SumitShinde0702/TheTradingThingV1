package trader

import (
	"encoding/json"
	"errors"
	"fmt"
	"lia/config"
	decisionPkg "lia/decision"
	"lia/logger"
	"lia/market"
	"lia/mcp"
	multiagent "lia/multi-agent"
	"lia/pool"
	"log"
	"math/rand"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Global position closing locks to prevent race conditions when multiple traders share the same account
var (
	positionClosingLocks = make(map[string]*sync.Mutex) // key: "SYMBOL_SIDE" (e.g., "ETHUSDT_LONG")
	positionLocksMutex   sync.Mutex                     // Protects the map itself
)

var ErrMarginInsufficient = errors.New("margin insufficient for order")

const (
	marginSafetyBuffer  = 1.0 // leave at least 1 USDT to cover taker fees and funding adjustments
	minExecutableMargin = 5.0 // skip trades that would use less than this amount of margin
)

// getPositionLock returns a mutex for a specific position (symbol+side)
// This prevents multiple traders from closing the same position simultaneously
func getPositionLock(symbol, side string) *sync.Mutex {
	key := fmt.Sprintf("%s_%s", strings.ToUpper(symbol), strings.ToUpper(side))

	positionLocksMutex.Lock()
	defer positionLocksMutex.Unlock()

	if lock, exists := positionClosingLocks[key]; exists {
		return lock
	}

	// Create new lock for this position
	lock := &sync.Mutex{}
	positionClosingLocks[key] = lock
	return lock
}

// AutoTraderConfig Auto trading configuration (simplified - AI full decision mode)
type AutoTraderConfig struct {
	// Trader identification
	ID      string // Trader unique identifier (for log directories, etc.)
	Name    string // Trader display name
	AIModel string // AI model: "groq", "qwen", "deepseek", or "custom"

	// Trading platform selection
	Exchange string // "binance", "hyperliquid", "aster", "paper", "simulate", or "demo"

	// Binance API configuration
	BinanceAPIKey    string
	BinanceSecretKey string

	// Hyperliquid configuration
	HyperliquidPrivateKey string
	HyperliquidWalletAddr string
	HyperliquidTestnet    bool

	// Aster configuration
	AsterUser       string // Aster main wallet address
	AsterSigner     string // Aster API wallet address
	AsterPrivateKey string // Aster API wallet private key

	CoinPoolAPIURL string

	// AI configuration
	UseQwen     bool
	DeepSeekKey string
	QwenKey     string
	GroqKey     string
	GroqModel   string // Groq model name

	// Custom AI API configuration
	CustomAPIURL    string
	CustomAPIKey    string
	CustomModelName string

	// Scanning configuration
	ScanInterval time.Duration // Scan interval (recommended 3 minutes)

	// Account configuration
	InitialBalance float64 // Initial balance (for calculating P&L, needs manual setup)

	// Leverage configuration
	BTCETHLeverage  int // Leverage multiplier for BTC and ETH
	AltcoinLeverage int // Leverage multiplier for altcoins

	// Risk control (only as hints, AI can decide autonomously)
	MaxDailyLoss    float64       // Maximum daily loss percentage (hint)
	MaxDrawdown     float64       // Maximum drawdown percentage (hint)
	StopTradingTime time.Duration // Pause duration after risk control trigger

	// Auto take profit (paper trading only)
	AutoTakeProfitPct float64 // Auto close at this P&L % (0 = disabled, 1.0 = 1%)

	// Copy trading: if set, this trader will copy decisions from another trader
	CopyFromTraderID string // ID of trader to copy from
}

// SupabaseConfig configuration for Supabase database (aliased from logger package)
type SupabaseConfig = logger.SupabaseConfig

// AutoTrader Auto trader
type AutoTrader struct {
	id                    string // Trader unique identifier
	name                  string // Trader display name
	aiModel               string // AI model name
	exchange              string // Trading platform name
	config                AutoTraderConfig
	trader                Trader // Uses Trader interface (supports multiple platforms)
	mcpClient             *mcp.Client
	decisionLogger        *logger.DecisionLogger // Decision logger
	initialBalance        float64
	dailyPnL              float64
	lastResetTime         time.Time
	stopUntil             time.Time
	isRunning             bool
	startTime             time.Time        // System startup time
	callCount             int              // AI call count
	positionFirstSeenTime map[string]int64 // Position first seen time (symbol_side -> timestamp in milliseconds)
	multiAgentConfig      interface{}      // Multi-agent config (avoid circular import - use interface{})
	traderManager         interface{}      // Trader manager reference (for copy trading - avoid circular import)
}

// NewAutoTrader creates auto trader
func NewAutoTrader(config AutoTraderConfig, supabaseConfig *SupabaseConfig) (*AutoTrader, error) {
	return NewAutoTraderWithMultiAgent(config, supabaseConfig, nil)
}

// NewAutoTraderWithMultiAgent creates auto trader with optional multi-agent config
func NewAutoTraderWithMultiAgent(config AutoTraderConfig, supabaseConfig *SupabaseConfig, multiAgentConfig interface{}) (*AutoTrader, error) {
	// Set default values
	if config.ID == "" {
		config.ID = "default_trader"
	}
	if config.Name == "" {
		config.Name = "Default Trader"
	}
	if config.AIModel == "" {
		if config.UseQwen {
			config.AIModel = "qwen"
		} else if config.GroqKey != "" {
			config.AIModel = "groq"
		} else {
			config.AIModel = "groq" // Default to Groq
		}
	}

	mcpClient := mcp.New()

	// Initialize AI
	if config.AIModel == "custom" {
		// Use custom API
		mcpClient.SetCustomAPI(config.CustomAPIURL, config.CustomAPIKey, config.CustomModelName)
		log.Printf("🤖 [%s] Using custom AI API: %s (Model: %s)", config.Name, config.CustomAPIURL, config.CustomModelName)
	} else if config.AIModel == "groq" {
		// Use Groq (supports OpenAI and Qwen models)
		mcpClient.SetGroqAPIKey(config.GroqKey, config.GroqModel)
		if config.GroqModel != "" {
			log.Printf("🤖 [%s] Using Groq AI (Model: %s)", config.Name, config.GroqModel)
		} else {
			log.Printf("🤖 [%s] Using Groq AI", config.Name)
		}
	} else if config.UseQwen || config.AIModel == "qwen" {
		// Use Qwen
		mcpClient.SetQwenAPIKey(config.QwenKey, "")
		log.Printf("🤖 [%s] Using Alibaba Cloud Qwen AI", config.Name)
	} else if config.AIModel == "deepseek" || config.DeepSeekKey != "" {
		// Use DeepSeek
		mcpClient.SetDeepSeekAPIKey(config.DeepSeekKey)
		log.Printf("🤖 [%s] Using DeepSeek AI", config.Name)
	} else {
		// Default to Groq
		if config.GroqKey != "" {
			mcpClient.SetGroqAPIKey(config.GroqKey, config.GroqModel)
			if config.GroqModel != "" {
				log.Printf("🤖 [%s] Using Groq AI (Model: %s)", config.Name, config.GroqModel)
			} else {
				log.Printf("🤖 [%s] Using Groq AI", config.Name)
			}
		} else {
			log.Printf("⚠️  [%s] Warning: AI API key not configured, please set groq_key", config.Name)
		}
	}

	// Initialize coin pool API
	if config.CoinPoolAPIURL != "" {
		pool.SetCoinPoolAPI(config.CoinPoolAPIURL)
	}

	// Set default trading platform
	if config.Exchange == "" {
		config.Exchange = "binance"
	}

	// Create corresponding trader based on configuration
	var trader Trader
	var err error
	var tempLogger *logger.DecisionLogger                      // For paper trading state restoration
	var restoredInitialBalance float64 = config.InitialBalance // Will be updated from database if records exist

	switch config.Exchange {
	case "binance":
		log.Printf("🏦 [%s] Using Binance Futures trading", config.Name)
		trader = NewFuturesTrader(config.BinanceAPIKey, config.BinanceSecretKey)
	case "hyperliquid":
		log.Printf("🏦 [%s] Using Hyperliquid trading", config.Name)
		trader, err = NewHyperliquidTrader(config.HyperliquidPrivateKey, config.HyperliquidWalletAddr, config.HyperliquidTestnet)
		if err != nil {
			return nil, fmt.Errorf("failed to initialize Hyperliquid trader: %w", err)
		}
	case "aster":
		log.Printf("🏦 [%s] Using Aster trading", config.Name)
		trader, err = NewAsterTrader(config.AsterUser, config.AsterSigner, config.AsterPrivateKey)
		if err != nil {
			return nil, fmt.Errorf("failed to initialize Aster trader: %w", err)
		}
	case "paper", "simulate", "demo":
		log.Printf("📊 [%s] Using paper trading mode (simulated)", config.Name)
		// Initialize decision logger first to check for existing records
		logDir := fmt.Sprintf("decision_logs/%s", config.ID)
		if supabaseConfig != nil && supabaseConfig.UseSupabase {
			log.Printf("🔗 [%s] Using Supabase for paper trading decision logging", config.Name)
			tempLogger = logger.NewDecisionLoggerWithConfig(logDir, config.ID, supabaseConfig)
		} else {
			tempLogger = logger.NewDecisionLogger(logDir)
		}

		// Get initial balance from first record (for P&L calculation)
		// Since database is seeded, there should always be a record
		if tempLogger != nil {
			firstRecord, err := tempLogger.GetFirstRecord()
			if err != nil {
				log.Printf("⚠️  [%s] Could not get first record: %v", config.Name, err)
				log.Printf("💡 [%s] Make sure you've run the seed migration in Supabase", config.Name)
			} else if firstRecord != nil {
				restoredInitialBalance = firstRecord.AccountState.TotalBalance
				if restoredInitialBalance > 0 {
					log.Printf("✅ [%s] Found first record (cycle #%d), using initial balance: %.2f USDT for P&L calculation",
						config.Name, firstRecord.CycleNumber, restoredInitialBalance)
				} else {
					log.Printf("⚠️  [%s] First record has invalid balance (%.2f), using config: %.2f",
						config.Name, restoredInitialBalance, config.InitialBalance)
					restoredInitialBalance = config.InitialBalance
				}
			}
		}

		// Restore paper trader state from latest decision record
		// Database is seeded, so there should always be at least one record
		log.Printf("🔄 [%s] Restoring balance from latest database record...", config.Name)
		var paperTrader *PaperTrader
		paperTrader, err := restorePaperTraderState(restoredInitialBalance, tempLogger)
		if err != nil {
			log.Printf("❌ [%s] Failed to restore from database: %v", config.Name, err)
			log.Printf("💡 [%s] Make sure the database has been initialized for trader_id='%s'", config.Name, config.ID)
			log.Printf("💡 [%s] Falling back to config initial balance: %.2f USDT", config.Name, config.InitialBalance)
			paperTrader = NewPaperTrader(config.InitialBalance)
		} else {
			log.Printf("✅ [%s] Successfully restored from database", config.Name)
			log.Printf("💰 [%s] Current balance: Wallet=%.2f, Equity=%.2f, Available=%.2f, InitialBalance=%.2f (for P&L)",
				config.Name, paperTrader.balance,
				paperTrader.balance+paperTrader.unrealizedProfit,
				paperTrader.availableBalance, paperTrader.initialBalance)
		}
		trader = paperTrader
	default:
		return nil, fmt.Errorf("unsupported trading platform: %s", config.Exchange)
	}

	// Validate initial balance configuration
	if config.InitialBalance <= 0 {
		return nil, fmt.Errorf("initial balance must be greater than 0, please set InitialBalance in config")
	}

	// Initialize decision logger (create separate directory using trader ID)
	// Note: For paper trading, this was already initialized above as tempLogger
	var decisionLogger *logger.DecisionLogger
	if config.Exchange == "paper" || config.Exchange == "simulate" || config.Exchange == "demo" {
		// Use the logger created above (which already restored cycle number)
		decisionLogger = tempLogger
	} else {
		logDir := fmt.Sprintf("decision_logs/%s", config.ID)
		// Use Supabase if configured, otherwise fall back to SQLite
		if supabaseConfig != nil && supabaseConfig.UseSupabase {
			log.Printf("🔗 [%s] Using Supabase for decision logging", config.Name)
			decisionLogger = logger.NewDecisionLoggerWithConfig(logDir, config.ID, supabaseConfig)
		} else {
			log.Printf("💾 [%s] Using SQLite for decision logging", config.Name)
			decisionLogger = logger.NewDecisionLogger(logDir)
		}
	}

	// Use the restored initial balance (already retrieved above for paper trading)
	// For non-paper trading, restore it now if not already done
	initialBalance := restoredInitialBalance // Use the value we set (either from DB or config)
	if config.Exchange != "paper" && config.Exchange != "simulate" && config.Exchange != "demo" {
		// For real exchanges, ALWAYS try to restore initial balance from first record
		// This ensures P&L calculation continues from where it left off after restart
		if decisionLogger != nil {
			log.Printf("🔄 [%s] Attempting to restore initial balance from decision logs...", config.Name)
			firstRecord, err := decisionLogger.GetFirstRecord()
			if err != nil {
				log.Printf("⚠️  [%s] Could not get first record from logs: %v", config.Name, err)
				log.Printf("⚠️  [%s] Will use config initial balance: %.2f USDT (P&L calculation will restart)", config.Name, config.InitialBalance)
			} else if firstRecord != nil {
				restoredFromDB := firstRecord.AccountState.TotalBalance
				if restoredFromDB > 0 {
					initialBalance = restoredFromDB
					log.Printf("✅ [%s] Successfully restored initial balance from first record (cycle #%d): %.2f USDT",
						config.Name, firstRecord.CycleNumber, initialBalance)
					log.Printf("✅ [%s] Config had %.2f, but using %.2f from logs to maintain P&L continuity",
						config.Name, config.InitialBalance, initialBalance)
				} else {
					log.Printf("⚠️  [%s] First record has invalid/zero balance (%.2f), checking if this is expected...", config.Name, restoredFromDB)
					// If first record has 0 balance, it might mean account was liquidated
					// But we should still use config value in this case
					log.Printf("⚠️  [%s] Using config initial balance: %.2f USDT", config.Name, config.InitialBalance)
					initialBalance = config.InitialBalance
				}
			} else {
				log.Printf("ℹ️  [%s] No first record found in logs - this is the first run", config.Name)
				log.Printf("ℹ️  [%s] Using config initial balance: %.2f USDT", config.Name, config.InitialBalance)
				initialBalance = config.InitialBalance
			}
		} else {
			log.Printf("⚠️  [%s] Decision logger not available, using config initial balance: %.2f USDT", config.Name, config.InitialBalance)
		}
	}

	// Final safety check: ensure initialBalance is never 0 or negative
	if initialBalance <= 0 {
		log.Printf("⚠️  [%s] Initial balance is invalid (%.2f), forcing to config value: %.2f",
			config.Name, initialBalance, config.InitialBalance)
		initialBalance = config.InitialBalance
	}

	// Log final decision on initial balance
	log.Printf("📊 [%s] Final initial balance for P&L calculation: %.2f USDT", config.Name, initialBalance)
	if initialBalance != config.InitialBalance {
		log.Printf("📊 [%s] Note: This differs from config (%.2f) - P&L will be calculated relative to restored value",
			config.Name, config.InitialBalance)
	}

	return &AutoTrader{
		id:                    config.ID,
		name:                  config.Name,
		aiModel:               config.AIModel,
		exchange:              config.Exchange,
		config:                config,
		trader:                trader,
		mcpClient:             mcpClient,
		decisionLogger:        decisionLogger,
		initialBalance:        initialBalance, // Use restored initial balance
		lastResetTime:         time.Now(),
		startTime:             time.Now(),
		callCount:             0,
		isRunning:             false,
		positionFirstSeenTime: make(map[string]int64),
		multiAgentConfig:      multiAgentConfig,
	}, nil
}

// Run Runs the main auto trading loop
func (at *AutoTrader) Run() error {
	at.isRunning = true
	log.Printf("[%s] 🚀 AI-driven auto trading system started", at.name)
	log.Printf("[%s] 💰 Initial balance: %.2f USDT", at.name, at.initialBalance)
	log.Printf("[%s] ⚙️  Scan interval: %v", at.name, at.config.ScanInterval)
	log.Printf("[%s] 🤖 AI will autonomously decide leverage, position size, stop loss/take profit, etc.", at.name)

	// Log auto take profit status
	if at.exchange == "paper" && at.config.AutoTakeProfitPct > 0 {
		log.Printf("[%s] 🎯 Auto Take Profit: ENABLED (%.2f%% P&L target)", at.name, at.config.AutoTakeProfitPct)
		log.Printf("[%s]    Positions will auto-close at %.2f%% profit (with leverage)", at.name, at.config.AutoTakeProfitPct)
	} else if at.exchange == "paper" {
		log.Printf("[%s] ⚠️  Auto Take Profit: DISABLED (set auto_take_profit_pct in config to enable)", at.name)
	} else {
		log.Printf("[%s] ℹ️  Auto Take Profit: Paper trading only (current exchange: %s)", at.name, at.exchange)
	}

	ticker := time.NewTicker(at.config.ScanInterval)
	defer ticker.Stop()

	// Start background position monitor (checks every 10 seconds for profitable positions to close)
	positionMonitorTicker := time.NewTicker(10 * time.Second)
	defer positionMonitorTicker.Stop()

	// Channel to stop background monitor
	stopMonitor := make(chan bool, 1)

	// Start background position monitor goroutine
	go at.startPositionMonitor(positionMonitorTicker, stopMonitor)

	// Execute immediately on first run
	log.Printf("[%s] ▶️  Starting first cycle immediately...", at.name)
	if err := at.runCycle(); err != nil {
		log.Printf("[%s] ❌ First cycle failed: %v", at.name, err)
		log.Printf("[%s] ⚠️  Error logged, continuing with next scheduled cycle...", at.name)
	}

	log.Printf("[%s] ✅ Entering main trading loop (waiting for next interval: %v)...", at.name, at.config.ScanInterval)
	for at.isRunning {
		select {
		case <-ticker.C:
			log.Printf("[%s] ⏰ Ticker fired, starting cycle...", at.name)
			if err := at.runCycle(); err != nil {
				log.Printf("[%s] ❌ Cycle execution failed: %v", at.name, err)
				log.Printf("[%s] ⚠️  Error logged, continuing with next scheduled cycle in %v...", at.name, at.config.ScanInterval)
			} else {
				log.Printf("[%s] ✅ Cycle completed successfully, waiting for next interval: %v", at.name, at.config.ScanInterval)
			}
		}
	}

	// Stop background monitor when main loop exits
	stopMonitor <- true

	log.Printf("[%s] ⏹ Auto trading system stopped (isRunning=false)", at.name)
	return nil
}

// startPositionMonitor runs a background goroutine that checks positions every 10 seconds
// and automatically closes positions with >=4.5% profit
func (at *AutoTrader) startPositionMonitor(ticker *time.Ticker, stopChan chan bool) {
	log.Printf("[%s] 🔄 Background position monitor started (checking every 10 seconds for positions >=4.5%% profit)", at.name)

	for {
		select {
		case <-ticker.C:
			at.checkAndCloseProfitablePositions()
		case <-stopChan:
			log.Printf("[%s] 🛑 Background position monitor stopped", at.name)
			return
		}
	}
}

// checkAndCloseProfitablePositions checks all open positions and closes those with >4.5% profit
func (at *AutoTrader) checkAndCloseProfitablePositions() {
	// Skip if not running
	if !at.isRunning {
		return
	}

	// Get current positions
	positions, err := at.trader.GetPositions()
	if err != nil {
		return // Silently skip on error
	}

	if len(positions) == 0 {
		return // No positions to check
	}

	// Check each position silently, only log when closing
	for _, pos := range positions {
		symbol, _ := pos["symbol"].(string)
		side, _ := pos["side"].(string)
		unrealizedPnl, _ := pos["unRealizedProfit"].(float64)
		entryPrice, _ := pos["entryPrice"].(float64)
		markPrice, _ := pos["markPrice"].(float64)
		leverage, _ := pos["leverage"].(float64)

		if leverage == 0 {
			leverage = 7 // Default leverage if not found
		}

		// Calculate P&L percentage (with leverage)
		var pnlPct float64
		if strings.ToLower(side) == "long" {
			priceChange := (markPrice - entryPrice) / entryPrice
			pnlPct = priceChange * 100 * leverage
		} else {
			priceChange := (entryPrice - markPrice) / entryPrice
			pnlPct = priceChange * 100 * leverage
		}

		// Only close if profitable AND >=4.5%
		if unrealizedPnl > 0 && pnlPct >= 4.5 {
			// Get lock for this position to prevent race conditions
			lock := getPositionLock(symbol, side)
			lock.Lock()
			defer lock.Unlock()

			// Re-check position exists and is still profitable (another trader may have closed it)
			positions, err := at.trader.GetPositions()
			if err != nil {
				return // defer will unlock
			}

			positionStillExists := false
			positionStillProfitable := false
			for _, pos := range positions {
				posSymbol, _ := pos["symbol"].(string)
				posSide, _ := pos["side"].(string)
				if posSymbol == symbol && strings.EqualFold(posSide, side) {
					positionStillExists = true
					posPnl, _ := pos["unRealizedProfit"].(float64)
					if posPnl > 0 {
						positionStillProfitable = true
					}
					break
				}
			}

			if !positionStillExists {
				// Position was already closed by another trader
				return
			}

			if !positionStillProfitable {
				// Position is no longer profitable, skip
				return
			}

			log.Printf("[%s] 🎯 [Background Monitor] %s %s: %.2f%% profit (%.2f USDT) - Auto-closing immediately!",
				at.name, symbol, strings.ToUpper(side), pnlPct, unrealizedPnl)

			// Close the position immediately
			var closeErr error
			if strings.ToLower(side) == "long" {
				_, closeErr = at.trader.CloseLong(symbol, 0)
			} else {
				_, closeErr = at.trader.CloseShort(symbol, 0)
			}

			if closeErr != nil {
				// Check if error is due to position already being closed or margin insufficient (position already closed)
				errStr := strings.ToLower(closeErr.Error())
				if strings.Contains(errStr, "no long position") ||
					strings.Contains(errStr, "no short position") ||
					strings.Contains(errStr, "margin is insufficient") && strings.Contains(errStr, "-2019") {
					// Position was already closed by another trader - this is expected, not an error
					return
				}
				log.Printf("[%s] ❌ [Background Monitor] Failed to auto-close %s %s: %v",
					at.name, symbol, strings.ToUpper(side), closeErr)
			} else {
				log.Printf("[%s] ✅ [Background Monitor] Successfully auto-closed %s %s at %.2f%% profit (%.2f USDT)",
					at.name, symbol, strings.ToUpper(side), pnlPct, unrealizedPnl)
			}
		}
	}
}

// Stop Stops auto trading
func (at *AutoTrader) Stop() {
	at.isRunning = false
	log.Println("⏹ Auto trading system stopped")
}

// runCycle Runs one trading cycle (using AI full decision mode)
func (at *AutoTrader) runCycle() error {
	at.callCount++

	log.Printf("\n[%s] "+strings.Repeat("=", 70), at.name)
	log.Printf("[%s] ⏰ %s - AI Decision Cycle #%d", at.name, time.Now().Format("2006-01-02 15:04:05"), at.callCount)
	log.Printf("[%s] "+strings.Repeat("=", 70), at.name)

	// Create decision record
	record := &logger.DecisionRecord{
		ExecutionLog: []string{},
		Success:      true,
	}

	// 1. Check if trading should be stopped
	if time.Now().Before(at.stopUntil) {
		remaining := at.stopUntil.Sub(time.Now())
		log.Printf("⏸ Risk control: Trading paused, remaining %.0f minutes", remaining.Minutes())
		record.Success = false
		record.ErrorMessage = fmt.Sprintf("Risk control pause active, remaining %.0f minutes", remaining.Minutes())
		at.decisionLogger.LogDecision(record)
		return nil
	}

	// 2. Reset daily P&L (resets daily)
	if time.Since(at.lastResetTime) > 24*time.Hour {
		at.dailyPnL = 0
		at.lastResetTime = time.Now()
		log.Println("📅 Daily P&L reset")
	}

	// 2.5. Check auto take profit and stop loss (paper trading only)
	if at.exchange == "paper" && at.config.AutoTakeProfitPct > 0 {
		if paperTrader, ok := at.trader.(*PaperTrader); ok {
			toClose, err := paperTrader.CheckAutoTakeProfit(at.config.AutoTakeProfitPct)
			if err != nil {
				log.Printf("⚠️  Failed to check auto take profit: %v", err)
			} else if len(toClose) > 0 {
				log.Printf("🎯 Auto-closing %d position(s) due to take profit/stop loss", len(toClose))
				for _, pos := range toClose {
					var closeErr error
					if pos.Side == "long" {
						_, closeErr = at.trader.CloseLong(pos.Symbol, 0)
					} else {
						_, closeErr = at.trader.CloseShort(pos.Symbol, 0)
					}
					if closeErr != nil {
						log.Printf("❌ Failed to auto-close %s %s: %v", pos.Symbol, pos.Side, closeErr)
					} else {
						log.Printf("✅ Auto-closed %s %s: %s", pos.Symbol, pos.Side, pos.Reason)
					}
				}
				// After auto-closing, rebuild context to reflect new positions
				// (will happen in step 3 below)
			}
		}
	}

	// 3. Collect trading context
	ctx, err := at.buildTradingContext()
	if err != nil {
		record.Success = false
		record.ErrorMessage = fmt.Sprintf("Failed to build trading context: %v", err)
		at.decisionLogger.LogDecision(record)
		return fmt.Errorf("failed to build trading context: %w", err)
	}

	// Save account state snapshot
	record.AccountState = logger.AccountSnapshot{
		TotalBalance:          ctx.Account.TotalEquity,
		AvailableBalance:      ctx.Account.AvailableBalance,
		TotalUnrealizedProfit: ctx.Account.TotalPnL,
		PositionCount:         ctx.Account.PositionCount,
		MarginUsedPct:         ctx.Account.MarginUsedPct,
	}

	// Save position snapshots
	for _, pos := range ctx.Positions {
		record.Positions = append(record.Positions, logger.PositionSnapshot{
			Symbol:           pos.Symbol,
			Side:             pos.Side,
			PositionAmt:      pos.Quantity,
			EntryPrice:       pos.EntryPrice,
			MarkPrice:        pos.MarkPrice,
			UnrealizedProfit: pos.UnrealizedPnL,
			Leverage:         float64(pos.Leverage),
			LiquidationPrice: pos.LiquidationPrice,
		})
	}

	// Save candidate coin list
	for _, coin := range ctx.CandidateCoins {
		record.CandidateCoins = append(record.CandidateCoins, coin.Symbol)
	}

	// Log account status - these are ACTUAL Binance account values (same for both traders on shared account)
	// Note: For shared accounts, frontend will show proportional values per trader, but logs show actual account values
	unrealizedPnL := ctx.Account.TotalEquity - ctx.Account.WalletBalance
	marginUsed := ctx.Account.TotalEquity - ctx.Account.AvailableBalance
	log.Printf("📊 Margin Balance (Equity): %.2f USDT | Wallet Balance: %.2f USDT | Available: %.2f USDT | Unrealized P&L: %.2f USDT | Positions: %d",
		ctx.Account.TotalEquity, ctx.Account.WalletBalance, ctx.Account.AvailableBalance, unrealizedPnL, ctx.Account.PositionCount)
	log.Printf("💡 Margin Used: %.2f USDT (%.1f%% of equity) - locked in %d open positions", marginUsed, (marginUsed/ctx.Account.TotalEquity)*100, ctx.Account.PositionCount)

	// Show breakdown of margin usage per position
	if len(ctx.Positions) > 0 {
		log.Printf("📋 Margin Breakdown by Position:")
		for _, pos := range ctx.Positions {
			// Format P&L with color indicator
			pnlSign := "+"
			if pos.UnrealizedPnL < 0 {
				pnlSign = ""
			}
			log.Printf("   • %s %s: %.2f USDT margin (%.1f%% of equity) | Notional: %.2f USDT | Leverage: %dx | P&L: %s%.2f USDT (%s%.2f%%)",
				pos.Symbol, strings.ToUpper(pos.Side), pos.MarginUsed,
				(pos.MarginUsed/ctx.Account.TotalEquity)*100,
				pos.Quantity*pos.MarkPrice, pos.Leverage,
				pnlSign, pos.UnrealizedPnL, pnlSign, pos.UnrealizedPnLPct)
		}
	}

	log.Printf("💡 Available = Equity (%.2f) - Margin Used (%.2f) = %.2f USDT", ctx.Account.TotalEquity, marginUsed, ctx.Account.AvailableBalance)
	if ctx.Account.AvailableBalance < 0.01 {
		log.Printf("⚠️  Available balance is $0 - all margin is used by open positions. This is normal when positions are open.")
	}
	log.Printf("💡 Note: These are ACTUAL Binance account values (shared account). Frontend shows proportional values per trader.")

	// 4. Call AI to get full decision (multi-agent or single-agent) OR copy from another trader
	log.Println("🤖 Requesting AI analysis and decision...")

	var decision *decisionPkg.FullDecision
	// err is already declared from buildTradingContext above

	// Check if this trader should copy from another trader(s)
	if at.config.CopyFromTraderID != "" && at.traderManager != nil {
		// Get trader manager (using type assertion)
		type TraderManagerInterface interface {
			GetTrader(id string) (*AutoTrader, error)
			GetAllTraders() map[string]*AutoTrader
		}
		tm, ok := at.traderManager.(TraderManagerInterface)
		if !ok {
			log.Printf("⚠️  [Copy Trading] Failed to get trader manager, falling back to AI")
		} else {
			var allSourceDecisions []decisionPkg.Decision
			var allCoTTraces []string
			var sourceTraderNames []string
			totalSourceEquity := 0.0

			// Check if copying from all traders or specific trader
			if at.config.CopyFromTraderID == "all" || at.config.CopyFromTraderID == "portfolio" {
				// Copy from ALL traders (except itself)
				log.Printf("📋 [Copy Trading] Copying decisions from ALL traders")
				allTraders := tm.GetAllTraders()
				for traderID, sourceTrader := range allTraders {
					// Skip self
					if traderID == at.id {
						continue
					}
					// Get latest decision from this trader
					sourceRecords, err := sourceTrader.GetDecisionLogger().GetLatestRecords(1)
					if err != nil || len(sourceRecords) == 0 {
						continue
					}
					latestRecord := sourceRecords[len(sourceRecords)-1]
					if latestRecord.DecisionJSON == "" {
						continue
					}
					var traderDecisions []decisionPkg.Decision
					if err := json.Unmarshal([]byte(latestRecord.DecisionJSON), &traderDecisions); err != nil {
						continue
					}
					// Add decisions from this trader
					for _, d := range traderDecisions {
						// Skip "wait" and "hold" actions
						if d.Action == "wait" || d.Action == "hold" || d.Symbol == "ALL" {
							continue
						}
						allSourceDecisions = append(allSourceDecisions, d)
					}
					if latestRecord.CoTTrace != "" {
						allCoTTraces = append(allCoTTraces, fmt.Sprintf("=== %s ===\n%s", sourceTrader.GetName(), latestRecord.CoTTrace))
					}
					sourceTraderNames = append(sourceTraderNames, sourceTrader.GetName())
					// Get source equity for scaling
					sourceAccount, _ := sourceTrader.GetAccountInfo()
					if eq, ok := sourceAccount["total_equity"].(float64); ok && eq > 0 {
						totalSourceEquity += eq
					} else {
						totalSourceEquity += sourceTrader.GetInitialBalance()
					}
				}
			} else {
				// Copy from specific trader
				log.Printf("📋 [Copy Trading] Copying decisions from trader: %s", at.config.CopyFromTraderID)
				sourceTrader, err := tm.GetTrader(at.config.CopyFromTraderID)
				if err != nil {
					log.Printf("⚠️  [Copy Trading] Failed to get source trader '%s': %v, falling back to AI", at.config.CopyFromTraderID, err)
				} else {
					// Get latest decision from source trader
					sourceRecords, err := sourceTrader.GetDecisionLogger().GetLatestRecords(1)
					if err != nil || len(sourceRecords) == 0 {
						log.Printf("⚠️  [Copy Trading] No recent decisions from source trader, falling back to AI")
					} else {
						latestRecord := sourceRecords[len(sourceRecords)-1]
						if latestRecord.DecisionJSON != "" {
							if err := json.Unmarshal([]byte(latestRecord.DecisionJSON), &allSourceDecisions); err != nil {
								log.Printf("⚠️  [Copy Trading] Failed to parse source decision JSON: %v, falling back to AI", err)
							} else {
								if latestRecord.CoTTrace != "" {
									allCoTTraces = append(allCoTTraces, fmt.Sprintf("=== %s ===\n%s", sourceTrader.GetName(), latestRecord.CoTTrace))
								}
								sourceTraderNames = append(sourceTraderNames, sourceTrader.GetName())
								// Get source equity
								sourceAccount, _ := sourceTrader.GetAccountInfo()
								if eq, ok := sourceAccount["total_equity"].(float64); ok && eq > 0 {
									totalSourceEquity = eq
								} else {
									totalSourceEquity = sourceTrader.GetInitialBalance()
								}
							}
						}
					}
				}
			}

			// If we have decisions, process them
			if len(allSourceDecisions) > 0 {
				currentEquity := ctx.Account.TotalEquity
				if currentEquity <= 0 {
					currentEquity = at.initialBalance
				}

				equityRatio := 1.0
				if totalSourceEquity > 0 {
					equityRatio = currentEquity / totalSourceEquity
				}

				log.Printf("📊 [Copy Trading] Source equity: %.2f, Current equity: %.2f, Ratio: %.2f",
					totalSourceEquity, currentEquity, equityRatio)

				// Get current positions to verify close decisions are valid
				currentPositions, _ := at.trader.GetPositions()
				positionMap := make(map[string]bool) // key: "SYMBOL_SIDE" (e.g., "ETHUSDT_LONG")
				for _, pos := range currentPositions {
					posSymbol, _ := pos["symbol"].(string)
					posSide, _ := pos["side"].(string)
					key := fmt.Sprintf("%s_%s", strings.ToUpper(posSymbol), strings.ToUpper(posSide))
					positionMap[key] = true
				}

				// Deduplicate decisions by symbol+action (if multiple traders want same action, take first)
				decisionMap := make(map[string]decisionPkg.Decision) // key: symbol_action
				for _, d := range allSourceDecisions {
					// Skip "wait" and "hold"
					if d.Action == "wait" || d.Action == "hold" || d.Symbol == "ALL" {
						continue
					}

					// For close actions, verify position exists
					if d.Action == "close_long" || d.Action == "close_short" {
						side := "LONG"
						if d.Action == "close_short" {
							side = "SHORT"
						}
						posKey := fmt.Sprintf("%s_%s", strings.ToUpper(d.Symbol), side)
						if !positionMap[posKey] {
							log.Printf("⚠️  [Copy Trading] Skipping %s %s - position does not exist in this account", d.Symbol, d.Action)
							continue
						}
					}

					key := fmt.Sprintf("%s_%s", d.Symbol, d.Action)
					if _, exists := decisionMap[key]; !exists {
						decisionMap[key] = d
					}
				}

				// Scale decisions
				scaledDecisions := make([]decisionPkg.Decision, 0, len(decisionMap))
				for _, d := range decisionMap {
					scaledDecision := d
					// Scale position size proportionally
					if d.PositionSizeUSD > 0 {
						scaledDecision.PositionSizeUSD = d.PositionSizeUSD * equityRatio
						// Ensure minimum position size (20% of equity for BTC/ETH, 15% for altcoins)
						minSizeBTCETH := currentEquity * 0.20
						minSizeAltcoin := currentEquity * 0.15
						isBTCETH := d.Symbol == "BTCUSDT" || d.Symbol == "ETHUSDT"
						minSize := minSizeAltcoin
						if isBTCETH {
							minSize = minSizeBTCETH
						}
						if scaledDecision.PositionSizeUSD < minSize && scaledDecision.PositionSizeUSD > 0 {
							scaledDecision.PositionSizeUSD = minSize
						}
					}
					// Update reasoning to indicate it's copied
					sourceNames := strings.Join(sourceTraderNames, ", ")
					scaledDecision.Reasoning = fmt.Sprintf("[Copied from %s] %s", sourceNames, d.Reasoning)
					scaledDecisions = append(scaledDecisions, scaledDecision)
				}

				// Create decision with copied data
				combinedCoT := strings.Join(allCoTTraces, "\n\n")
				if combinedCoT == "" {
					combinedCoT = fmt.Sprintf("📋 [Copy Trading] Copied %d decisions from: %s", len(scaledDecisions), strings.Join(sourceTraderNames, ", "))
				} else {
					combinedCoT = fmt.Sprintf("📋 [Copy Trading] Copied %d decisions from: %s\n\n%s", len(scaledDecisions), strings.Join(sourceTraderNames, ", "), combinedCoT)
				}

				decision = &decisionPkg.FullDecision{
					UserPrompt:  fmt.Sprintf("Copy trading from: %s", strings.Join(sourceTraderNames, ", ")),
					CoTTrace:    combinedCoT,
					Decisions:   scaledDecisions,
					RawResponse: fmt.Sprintf("Copied from %s", strings.Join(sourceTraderNames, ", ")),
					Timestamp:   time.Now(),
				}

				log.Printf("✅ [Copy Trading] Successfully copied %d decisions from: %s", len(scaledDecisions), strings.Join(sourceTraderNames, ", "))
				err = nil // Clear any previous errors
			}
		}
	}

	// If copy trading didn't produce a decision, use AI (normal flow)
	if decision == nil {
		// Check if multi-agent is enabled
		if at.multiAgentConfig != nil {
			// Use multi-agent consensus
			cfg, ok := at.multiAgentConfig.(*config.MultiAgentConfig)
			if ok && cfg != nil && cfg.Enabled {
				// Convert config.MultiAgentConfig to multiagent.MultiAgentConfig
				maConfig := convertToMultiAgentConfig(cfg)
				if maConfig != nil {
					log.Printf("🤖 [Multi-Agent] Using multi-agent consensus (mode: %s)", maConfig.ConsensusMode)
					decision, err = multiagent.GetMultiAgentDecision(ctx, maConfig)
					if err != nil {
						log.Printf("⚠️  Multi-agent decision failed, falling back to single-agent: %v", err)
						// Fallback to single-agent
						decision, err = decisionPkg.GetFullDecision(ctx, at.mcpClient)
					}
				} else {
					log.Printf("⚠️  Failed to convert multi-agent config, using single-agent")
					decision, err = decisionPkg.GetFullDecision(ctx, at.mcpClient)
				}
			} else {
				// Multi-agent config exists but not enabled, use single-agent
				decision, err = decisionPkg.GetFullDecision(ctx, at.mcpClient)
			}
		} else {
			// No multi-agent config, use single-agent
			decision, err = decisionPkg.GetFullDecision(ctx, at.mcpClient)
		}
	}

	// Save chain of thought, decision, and input prompt even if there's an error (for debugging)
	// CRITICAL: GetFullDecision should always return a decision (with fallback), so decision should never be nil
	if decision == nil {
		log.Printf("⚠️  CRITICAL: GetFullDecision returned nil decision - this should never happen due to fallback")
		// Create emergency fallback
		decision = &decisionPkg.FullDecision{
			CoTTrace: "Emergency fallback - GetFullDecision returned nil",
			Decisions: []decisionPkg.Decision{
				{
					Symbol:    "ALL",
					Action:    "wait",
					Reasoning: "Emergency fallback - GetFullDecision returned nil",
				},
			},
		}
		err = nil // Clear error since we have fallback
	}

	record.InputPrompt = decision.UserPrompt
	record.CoTTrace = decision.CoTTrace
	record.RawResponse = decision.RawResponse // Save raw response for debugging

	// Log raw response preview if parsing failed
	if decision.RawResponse != "" && err != nil {
		rawResponsePreview := decision.RawResponse
		if len(rawResponsePreview) > 500 {
			rawResponsePreview = rawResponsePreview[:500] + "..."
		}
		log.Printf("🔍 Raw AI Response (first 500 chars): %s", rawResponsePreview)
	}

	if len(decision.Decisions) > 0 {
		decisionJSON, _ := json.MarshalIndent(decision.Decisions, "", "  ")
		record.DecisionJSON = string(decisionJSON)
		// CRITICAL: If we have decisions (including fallback), always mark as successful
		// The fallback mechanism ensures we always have at least one decision
		record.Success = true
	}

	if err != nil {
		// CRITICAL: If we have decisions, we should never have an error (GetFullDecision clears it)
		// But if we do, it means GetFullDecision didn't properly clear the error - handle it
		if len(decision.Decisions) == 0 {
			// No decisions AND error - this is a real failure
			record.Success = false
			record.ErrorMessage = fmt.Sprintf("Failed to get AI decision: %v", err)

			// Print AI chain of thought (even if there's an error)
			if decision.CoTTrace != "" {
				log.Printf("\n" + strings.Repeat("-", 70))
				log.Println("💭 AI Chain of Thought Analysis (error case):")
				log.Println(strings.Repeat("-", 70))
				log.Println(decision.CoTTrace)
				log.Printf(strings.Repeat("-", 70) + "\n")
			}

			at.decisionLogger.LogDecision(record)
			return fmt.Errorf("failed to get AI decision: %w", err)
		}

		// We have decisions BUT there's still an error - GetFullDecision should have cleared this
		// Log warning but continue since we have decisions
		record.Success = true
		errStr := err.Error()
		if strings.Contains(errStr, "extract decisions") || strings.Contains(errStr, "parse AI response") ||
			strings.Contains(errStr, "JSON") || strings.Contains(errStr, "unable to find") {
			record.ErrorMessage = fmt.Sprintf("JSON parsing failed, used fallback decision: %v", err)
			log.Printf("⚠️  JSON parsing failed but fallback decision exists - continuing cycle (error should have been cleared by GetFullDecision)")
		} else {
			record.ErrorMessage = fmt.Sprintf("Warning: %v (but continuing with decisions)", err)
			log.Printf("⚠️  Warning: %v (but continuing with available decisions - error should have been cleared by GetFullDecision)", err)
		}

		log.Printf("💭 AI Chain of Thought Analysis (using fallback/safety decision):")
		log.Println(strings.Repeat("-", 70))
		log.Println(decision.CoTTrace)
		log.Printf(strings.Repeat("-", 70) + "\n")
		// Clear the error so the cycle continues successfully
		err = nil
	}

	// 5. Print AI chain of thought
	log.Printf("\n" + strings.Repeat("-", 70))
	log.Println("💭 AI Chain of Thought Analysis:")
	log.Println(strings.Repeat("-", 70))
	log.Println(decision.CoTTrace)
	log.Printf(strings.Repeat("-", 70) + "\n")

	// 6. Print AI decisions
	log.Printf("📋 AI Decision List (%d items):\n", len(decision.Decisions))
	for i, d := range decision.Decisions {
		log.Printf("  [%d] %s: %s - %s", i+1, d.Symbol, d.Action, d.Reasoning)
		if d.Action == "open_long" || d.Action == "open_short" {
			log.Printf("      Leverage: %dx | Position: %.2f USDT | Stop Loss: %.4f | Take Profit: %.4f",
				d.Leverage, d.PositionSizeUSD, d.StopLoss, d.TakeProfit)
		}
	}
	log.Println()

	// 7. Sort decisions: ensure close positions before opening (prevent position stacking overflow)
	sortedDecisions := sortDecisionsByPriority(decision.Decisions)

	log.Println("🔄 Execution Order (optimized): Close positions first → Open positions later")
	for i, d := range sortedDecisions {
		log.Printf("  [%d] %s %s", i+1, d.Symbol, d.Action)
	}
	log.Println()

	// 7.5. Validate: Limit new positions to prevent margin exhaustion
	currentPositions, _ := at.trader.GetPositions()
	currentPositionCount := len(currentPositions)

	// Count how many new positions AI wants to open
	newPositionCount := 0
	for _, d := range sortedDecisions {
		if d.Action == "open_long" || d.Action == "open_short" {
			newPositionCount++
		}
	}

	// Maximum 6 total positions (hard limit) – small position sizing keeps margin safe
	maxPositions := 6
	availableSlots := maxPositions - currentPositionCount

	if newPositionCount > availableSlots {
		log.Printf("⚠️  AI tried to open %d new positions, but only %d slots available (current: %d, max: %d)",
			newPositionCount, availableSlots, currentPositionCount, maxPositions)
		log.Printf("⚠️  Rejecting excess position openings. Only opening first %d positions.", availableSlots)

		// Filter out excess open positions
		var filteredDecisions []decisionPkg.Decision
		openedCount := 0
		for _, d := range sortedDecisions {
			if (d.Action == "open_long" || d.Action == "open_short") && openedCount >= availableSlots {
				log.Printf("  ⏭ Skipping %s %s (would exceed position limit)", d.Symbol, d.Action)
				record.ExecutionLog = append(record.ExecutionLog, fmt.Sprintf("⏭ Skipped %s %s (position limit reached)", d.Symbol, d.Action))
				continue
			}
			if d.Action == "open_long" || d.Action == "open_short" {
				openedCount++
			}
			filteredDecisions = append(filteredDecisions, d)
		}
		sortedDecisions = filteredDecisions
	}

	// Execute decisions and record results
	for _, d := range sortedDecisions {
		actionRecord := logger.DecisionAction{
			Action:    d.Action,
			Symbol:    d.Symbol,
			Quantity:  0,
			Leverage:  d.Leverage,
			Price:     0,
			Timestamp: time.Now(),
			Success:   false,
		}

		if err := at.executeDecisionWithRecord(&d, &actionRecord); err != nil {
			log.Printf("❌ Failed to execute decision (%s %s): %v", d.Symbol, d.Action, err)
			if errors.Is(err, ErrMarginInsufficient) {
				log.Printf("   ↳ Margin alert: %s %s skipped due to insufficient free margin", d.Symbol, d.Action)
			}
			actionRecord.Error = err.Error()
			record.ExecutionLog = append(record.ExecutionLog, fmt.Sprintf("❌ %s %s failed: %v", d.Symbol, d.Action, err))
		} else {
			actionRecord.Success = true
			record.ExecutionLog = append(record.ExecutionLog, fmt.Sprintf("✓ %s %s succeeded", d.Symbol, d.Action))
			// Brief delay after successful execution
			time.Sleep(1 * time.Second)
		}

		record.Decisions = append(record.Decisions, actionRecord)
	}

	// 8. Refresh account state and positions AFTER executing decisions
	// This ensures newly opened positions and updated balances are saved to the database
	currentBalance, err := at.trader.GetBalance()
	if err == nil {
		totalWalletBalance := 0.0
		totalUnrealizedProfit := 0.0
		availableBalance := 0.0

		if wallet, ok := currentBalance["totalWalletBalance"].(float64); ok {
			totalWalletBalance = wallet
		}
		if unrealized, ok := currentBalance["totalUnrealizedProfit"].(float64); ok {
			totalUnrealizedProfit = unrealized
		}
		if avail, ok := currentBalance["availableBalance"].(float64); ok {
			availableBalance = avail
		}

		totalEquity := totalWalletBalance + totalUnrealizedProfit

		// Update account state snapshot with latest values
		record.AccountState.TotalBalance = totalEquity
		record.AccountState.AvailableBalance = availableBalance
		record.AccountState.TotalUnrealizedProfit = totalUnrealizedProfit
		log.Printf("💾 Updated account state: Equity=%.2f, Available=%.2f, Unrealized=%.2f",
			totalEquity, availableBalance, totalUnrealizedProfit)
	}

	currentPositions, err = at.trader.GetPositions()
	if err == nil {
		// Clear old position snapshots and update with current positions
		record.Positions = []logger.PositionSnapshot{}
		for _, pos := range currentPositions {
			symbol := pos["symbol"].(string)
			side := pos["side"].(string)
			entryPrice := pos["entryPrice"].(float64)
			markPrice := pos["markPrice"].(float64)
			quantity := pos["positionAmt"].(float64)
			if quantity < 0 {
				quantity = -quantity // Convert negative shorts to positive
			}
			unrealizedPnl := pos["unRealizedProfit"].(float64)
			liquidationPrice := pos["liquidationPrice"].(float64)

			leverage := 10.0
			if lev, ok := pos["leverage"].(float64); ok {
				leverage = lev
			}

			record.Positions = append(record.Positions, logger.PositionSnapshot{
				Symbol:           symbol,
				Side:             side,
				PositionAmt:      quantity,
				EntryPrice:       entryPrice,
				MarkPrice:        markPrice,
				UnrealizedProfit: unrealizedPnl,
				Leverage:         leverage,
				LiquidationPrice: liquidationPrice,
			})
		}
		// Update position count in account state
		record.AccountState.PositionCount = len(record.Positions)
		log.Printf("💾 Updated position snapshots: %d positions (including newly opened)", len(record.Positions))
	} else {
		log.Printf("⚠️  Failed to refresh positions before logging: %v", err)
	}

	// 9. Save decision record (now includes positions opened in this cycle)
	if err := at.decisionLogger.LogDecision(record); err != nil {
		log.Printf("⚠ Failed to save decision record: %v", err)
	}

	return nil
}

// buildTradingContext Builds trading context
func (at *AutoTrader) buildTradingContext() (*decisionPkg.Context, error) {
	// 1. Get account information
	balance, err := at.trader.GetBalance()
	if err != nil {
		return nil, fmt.Errorf("failed to get account balance: %w", err)
	}

	// Get account fields
	totalWalletBalance := 0.0
	totalUnrealizedProfit := 0.0
	availableBalance := 0.0

	if wallet, ok := balance["totalWalletBalance"].(float64); ok {
		totalWalletBalance = wallet
	}
	if unrealized, ok := balance["totalUnrealizedProfit"].(float64); ok {
		totalUnrealizedProfit = unrealized
	}
	if avail, ok := balance["availableBalance"].(float64); ok {
		availableBalance = avail
	}

	// Total Equity = Wallet Balance + Unrealized P&L
	totalEquity := totalWalletBalance + totalUnrealizedProfit

	// 2. Get position information
	positions, err := at.trader.GetPositions()
	if err != nil {
		return nil, fmt.Errorf("failed to get positions: %w", err)
	}

	var positionInfos []decisionPkg.PositionInfo
	totalMarginUsed := 0.0

	// Current position key set (for cleaning up closed position records)
	currentPositionKeys := make(map[string]bool)

	for _, pos := range positions {
		symbol := pos["symbol"].(string)
		side := pos["side"].(string)
		entryPrice := pos["entryPrice"].(float64)
		markPrice := pos["markPrice"].(float64)
		quantity := pos["positionAmt"].(float64)
		if quantity < 0 {
			quantity = -quantity // Short position quantity is negative, convert to positive
		}
		unrealizedPnl := pos["unRealizedProfit"].(float64)
		liquidationPrice := pos["liquidationPrice"].(float64)

		// Calculate used margin (estimate)
		leverage := 10 // Default value, should actually get from position info
		if lev, ok := pos["leverage"].(float64); ok {
			leverage = int(lev)
		}
		marginUsed := (quantity * markPrice) / float64(leverage)
		totalMarginUsed += marginUsed

		// Calculate P&L percentage
		pnlPct := 0.0
		if side == "long" {
			pnlPct = ((markPrice - entryPrice) / entryPrice) * float64(leverage) * 100
		} else {
			pnlPct = ((entryPrice - markPrice) / entryPrice) * float64(leverage) * 100
		}

		// Track position first seen time
		posKey := symbol + "_" + side
		currentPositionKeys[posKey] = true
		if _, exists := at.positionFirstSeenTime[posKey]; !exists {
			// New position, record current time
			at.positionFirstSeenTime[posKey] = time.Now().UnixMilli()
		}
		updateTime := at.positionFirstSeenTime[posKey]

		positionInfos = append(positionInfos, decisionPkg.PositionInfo{
			Symbol:           symbol,
			Side:             side,
			EntryPrice:       entryPrice,
			MarkPrice:        markPrice,
			Quantity:         quantity,
			Leverage:         leverage,
			UnrealizedPnL:    unrealizedPnl,
			UnrealizedPnLPct: pnlPct,
			LiquidationPrice: liquidationPrice,
			MarginUsed:       marginUsed,
			UpdateTime:       updateTime,
		})
	}

	// Clean up closed position records
	for key := range at.positionFirstSeenTime {
		if !currentPositionKeys[key] {
			delete(at.positionFirstSeenTime, key)
		}
	}

	// 3. Get merged candidate coin pool (AI500 + OI Top, deduplicated)
	// Analyze the same number of coins regardless of positions (let AI see all good opportunities)
	// AI will decide whether to switch positions based on margin usage rate and existing positions
	const ai500Limit = 20 // AI500 takes top 20 highest-scored coins

	// Get merged coin pool (AI500 + OI Top)
	mergedPool, err := pool.GetMergedCoinPool(ai500Limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get merged coin pool: %w", err)
	}

	// Build candidate coin list (including source information)
	var candidateCoins []decisionPkg.CandidateCoin
	for _, symbol := range mergedPool.AllSymbols {
		sources := mergedPool.SymbolSources[symbol]
		candidateCoins = append(candidateCoins, decisionPkg.CandidateCoin{
			Symbol:  symbol,
			Sources: sources, // "ai500" and/or "oi_top"
		})
	}

	log.Printf("📋 Merged coin pool: AI500 top %d + OI_Top20 = Total %d candidate coins",
		ai500Limit, len(candidateCoins))

	// 4. Calculate total P&L
	totalPnL := totalEquity - at.initialBalance
	totalPnLPct := 0.0
	if at.initialBalance > 0 {
		totalPnLPct = (totalPnL / at.initialBalance) * 100
	}

	marginUsedPct := 0.0
	if totalEquity > 0 {
		marginUsedPct = (totalMarginUsed / totalEquity) * 100
	}

	// 5. Analyze historical performance (recent 100 cycles, avoid losing trading records for long-term positions)
	// Assume 3 minutes per cycle, 100 cycles = 5 hours, sufficient to cover most trades
	performance, err := at.decisionLogger.AnalyzePerformance(100)
	if err != nil {
		log.Printf("⚠️  Failed to analyze historical performance: %v", err)
		// Doesn't affect main flow, continue execution (but set performance to nil to avoid passing error data)
		performance = nil
	}

	// 6. Build context
	ctx := &decisionPkg.Context{
		CurrentTime:     time.Now().Format("2006-01-02 15:04:05"),
		RuntimeMinutes:  int(time.Since(at.startTime).Minutes()),
		CallCount:       at.callCount,
		BTCETHLeverage:  at.config.BTCETHLeverage,  // Use configured leverage multiplier
		AltcoinLeverage: at.config.AltcoinLeverage, // Use configured leverage multiplier
		Account: decisionPkg.AccountInfo{
			TotalEquity:      totalEquity,
			WalletBalance:    totalWalletBalance, // Actual wallet balance from API
			AvailableBalance: availableBalance,
			TotalPnL:         totalPnL,
			TotalPnLPct:      totalPnLPct,
			MarginUsed:       totalMarginUsed,
			MarginUsedPct:    marginUsedPct,
			PositionCount:    len(positionInfos),
		},
		Positions:      positionInfos,
		CandidateCoins: candidateCoins,
		Performance:    performance, // Add historical performance analysis
	}

	return ctx, nil
}

// executeDecisionWithRecord executes AI decision and records detailed information
func (at *AutoTrader) executeDecisionWithRecord(decision *decisionPkg.Decision, actionRecord *logger.DecisionAction) error {
	switch decision.Action {
	case "open_long":
		return at.executeOpenLongWithRecord(decision, actionRecord)
	case "open_short":
		return at.executeOpenShortWithRecord(decision, actionRecord)
	case "close_long":
		return at.executeCloseLongWithRecord(decision, actionRecord)
	case "close_short":
		return at.executeCloseShortWithRecord(decision, actionRecord)
	case "hold", "wait":
		// No execution needed, just record
		return nil
	default:
		return fmt.Errorf("unknown action: %s", decision.Action)
	}
}

func (at *AutoTrader) determineExecutableMargin(symbol, action string, desiredMargin float64) (float64, float64, error) {
	balance, err := at.trader.GetBalance()
	if err != nil {
		return 0, 0, fmt.Errorf("failed to fetch balance before %s %s: %w", action, symbol, err)
	}

	rawAvailable, exists := balance["availableBalance"]
	if !exists {
		return 0, 0, fmt.Errorf("failed to determine available balance before %s %s: field missing", action, symbol)
	}

	available, err := toFloat64(rawAvailable)
	if err != nil {
		return 0, 0, fmt.Errorf("invalid available balance format before %s %s: %w", action, symbol, err)
	}

	maxUsable := available - marginSafetyBuffer
	if maxUsable < 0 {
		maxUsable = 0
	}

	effectiveMargin := desiredMargin
	if effectiveMargin > maxUsable {
		effectiveMargin = maxUsable
	}

	if effectiveMargin < minExecutableMargin {
		return 0, available, fmt.Errorf("%w: usable margin %.2f USDT is below minimum %.2f USDT (available %.2f USDT)",
			ErrMarginInsufficient, effectiveMargin, minExecutableMargin, available)
	}

	if effectiveMargin < desiredMargin {
		log.Printf("  ⚠️  Reducing %s %s margin from %.2f to %.2f USDT (available: %.2f USDT, buffer: %.2f USDT)",
			symbol, action, desiredMargin, effectiveMargin, available, marginSafetyBuffer)
	}

	return effectiveMargin, available, nil
}

func isMarginInsufficientAPIError(err error) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "margin is insufficient") || strings.Contains(lower, "-2019")
}

func toFloat64(value interface{}) (float64, error) {
	switch v := value.(type) {
	case float64:
		return v, nil
	case float32:
		return float64(v), nil
	case int:
		return float64(v), nil
	case int64:
		return float64(v), nil
	case json.Number:
		return v.Float64()
	case string:
		return strconv.ParseFloat(v, 64)
	default:
		return 0, fmt.Errorf("unsupported numeric type %T", value)
	}
}

// executeOpenLongWithRecord Execute opening long position and record detailed information
func (at *AutoTrader) executeOpenLongWithRecord(decision *decisionPkg.Decision, actionRecord *logger.DecisionAction) error {
	log.Printf("  📈 Opening long position: %s", decision.Symbol)

	// Note: Multiple positions in the same coin are allowed (user preference)

	// Get current price
	marketData, err := market.Get(decision.Symbol)
	if err != nil {
		return err
	}

	effectiveMargin, _, err := at.determineExecutableMargin(decision.Symbol, "open_long", decision.PositionSizeUSD)
	if err != nil {
		return err
	}

	// Calculate quantity from MARGIN
	// position_size_usd is now MARGIN, not notional
	// notional = margin * leverage
	// quantity = notional / price
	notionalValue := effectiveMargin * float64(decision.Leverage)
	quantity := notionalValue / marketData.CurrentPrice
	actionRecord.Quantity = quantity
	actionRecord.Price = marketData.CurrentPrice

	// Open position
	order, err := at.trader.OpenLong(decision.Symbol, quantity, decision.Leverage)
	if err != nil {
		if isMarginInsufficientAPIError(err) {
			return fmt.Errorf("%w: Binance rejected %s open_long (need %.2f USDT margin, err: %v)",
				ErrMarginInsufficient, decision.Symbol, effectiveMargin, err)
		}
		return err
	}

	// Record order ID
	if orderID, ok := order["orderId"].(int64); ok {
		actionRecord.OrderID = orderID
	}

	log.Printf("  ✓ Position opened successfully, Order ID: %v, Quantity: %.4f", order["orderId"], quantity)

	// Record position opening time
	posKey := decision.Symbol + "_long"
	at.positionFirstSeenTime[posKey] = time.Now().UnixMilli()

	// DISABLED: Stop loss orders - we don't want to automatically close losing positions
	// Only profitable positions can be closed (by AI decision or manual close)
	// if err := at.trader.SetStopLoss(decision.Symbol, "LONG", quantity, decision.StopLoss); err != nil {
	// 	log.Printf("  ⚠ Failed to set stop loss: %v", err)
	// }
	if err := at.trader.SetTakeProfit(decision.Symbol, "LONG", quantity, decision.TakeProfit); err != nil {
		log.Printf("  ⚠ Failed to set take profit: %v", err)
	}

	return nil
}

// executeOpenShortWithRecord Execute opening short position and record detailed information
func (at *AutoTrader) executeOpenShortWithRecord(decision *decisionPkg.Decision, actionRecord *logger.DecisionAction) error {
	log.Printf("  📉 Opening short position: %s", decision.Symbol)

	// Note: Multiple positions in the same coin are allowed (user preference)

	// Get current price
	marketData, err := market.Get(decision.Symbol)
	if err != nil {
		return err
	}

	effectiveMargin, _, err := at.determineExecutableMargin(decision.Symbol, "open_short", decision.PositionSizeUSD)
	if err != nil {
		return err
	}

	// Calculate quantity from MARGIN
	// position_size_usd is now MARGIN, not notional
	// notional = margin * leverage
	// quantity = notional / price
	notionalValue := effectiveMargin * float64(decision.Leverage)
	quantity := notionalValue / marketData.CurrentPrice
	actionRecord.Quantity = quantity
	actionRecord.Price = marketData.CurrentPrice

	// Open position
	order, err := at.trader.OpenShort(decision.Symbol, quantity, decision.Leverage)
	if err != nil {
		if isMarginInsufficientAPIError(err) {
			return fmt.Errorf("%w: Binance rejected %s open_short (need %.2f USDT margin, err: %v)",
				ErrMarginInsufficient, decision.Symbol, effectiveMargin, err)
		}
		return err
	}

	// Record order ID
	if orderID, ok := order["orderId"].(int64); ok {
		actionRecord.OrderID = orderID
	}

	log.Printf("  ✓ Position opened successfully, Order ID: %v, Quantity: %.4f", order["orderId"], quantity)

	// Record position opening time
	posKey := decision.Symbol + "_short"
	at.positionFirstSeenTime[posKey] = time.Now().UnixMilli()

	// DISABLED: Stop loss orders - we don't want to automatically close losing positions
	// Only profitable positions can be closed (by AI decision or manual close)
	// if err := at.trader.SetStopLoss(decision.Symbol, "SHORT", quantity, decision.StopLoss); err != nil {
	// 	log.Printf("  ⚠ Failed to set stop loss: %v", err)
	// }
	if err := at.trader.SetTakeProfit(decision.Symbol, "SHORT", quantity, decision.TakeProfit); err != nil {
		log.Printf("  ⚠ Failed to set take profit: %v", err)
	}

	return nil
}

// executeCloseLongWithRecord executes closing long position and records detailed information
func (at *AutoTrader) executeCloseLongWithRecord(decision *decisionPkg.Decision, actionRecord *logger.DecisionAction) error {
	log.Printf("  🔄 Closing long position: %s", decision.Symbol)

	// Get lock for this position to prevent race conditions
	lock := getPositionLock(decision.Symbol, "LONG")
	lock.Lock()
	defer lock.Unlock()

	// Check position exists and P&L before closing - don't close losing positions
	positions, err := at.trader.GetPositions()
	if err != nil {
		return fmt.Errorf("failed to get positions: %w", err)
	}

	positionExists := false
	for _, pos := range positions {
		posSymbol, _ := pos["symbol"].(string)
		posSide, _ := pos["side"].(string)
		if posSymbol == decision.Symbol && strings.ToLower(posSide) == "long" {
			positionExists = true
			unrealizedPnl, _ := pos["unRealizedProfit"].(float64)
			if unrealizedPnl < 0 {
				// Position is losing money - reject close unless stop loss is hit
				log.Printf("  ⚠️ Position %s LONG has negative P&L (%.2f USDT) - holding until profitable or stop loss hit", decision.Symbol, unrealizedPnl)
				return fmt.Errorf("position is losing money (P&L: %.2f USDT) - holding until profitable. Only close if stop loss is hit or position becomes profitable", unrealizedPnl)
			}
			log.Printf("  ✓ Position %s LONG is profitable (P&L: +%.2f USDT) - closing", decision.Symbol, unrealizedPnl)
			break
		}
	}

	if !positionExists {
		return fmt.Errorf("no long position found for %s (may have been closed by another trader)", decision.Symbol)
	}

	// Get current price
	marketData, err := market.Get(decision.Symbol)
	if err != nil {
		return err
	}
	actionRecord.Price = marketData.CurrentPrice

	// Close position
	order, err := at.trader.CloseLong(decision.Symbol, 0) // 0 = close all
	if err != nil {
		// Check if position was already closed
		errStr := strings.ToLower(err.Error())
		if strings.Contains(errStr, "no long position") ||
			(strings.Contains(errStr, "margin is insufficient") && strings.Contains(errStr, "-2019")) {
			return fmt.Errorf("position %s LONG was already closed (likely by another trader)", decision.Symbol)
		}
		return err
	}

	// Record order ID
	if orderID, ok := order["orderId"].(int64); ok {
		actionRecord.OrderID = orderID
	}

	log.Printf("  ✓ Position closed successfully")
	return nil
}

// executeCloseShortWithRecord executes closing short position and records detailed information
func (at *AutoTrader) executeCloseShortWithRecord(decision *decisionPkg.Decision, actionRecord *logger.DecisionAction) error {
	log.Printf("  🔄 Closing short position: %s", decision.Symbol)

	// Get lock for this position to prevent race conditions
	lock := getPositionLock(decision.Symbol, "SHORT")
	lock.Lock()
	defer lock.Unlock()

	// Check position exists and P&L before closing - don't close losing positions
	positions, err := at.trader.GetPositions()
	if err != nil {
		return fmt.Errorf("failed to get positions: %w", err)
	}

	positionExists := false
	for _, pos := range positions {
		posSymbol, _ := pos["symbol"].(string)
		posSide, _ := pos["side"].(string)
		if posSymbol == decision.Symbol && strings.ToLower(posSide) == "short" {
			positionExists = true
			unrealizedPnl, _ := pos["unRealizedProfit"].(float64)
			if unrealizedPnl < 0 {
				// Position is losing money - reject close unless stop loss is hit
				log.Printf("  ⚠️ Position %s SHORT has negative P&L (%.2f USDT) - holding until profitable or stop loss hit", decision.Symbol, unrealizedPnl)
				return fmt.Errorf("position is losing money (P&L: %.2f USDT) - holding until profitable. Only close if stop loss is hit or position becomes profitable", unrealizedPnl)
			}
			log.Printf("  ✓ Position %s SHORT is profitable (P&L: +%.2f USDT) - closing", decision.Symbol, unrealizedPnl)
			break
		}
	}

	if !positionExists {
		return fmt.Errorf("no short position found for %s (may have been closed by another trader)", decision.Symbol)
	}

	// Get current price
	marketData, err := market.Get(decision.Symbol)
	if err != nil {
		return err
	}
	actionRecord.Price = marketData.CurrentPrice

	// Close position
	order, err := at.trader.CloseShort(decision.Symbol, 0) // 0 = close all
	if err != nil {
		// Check if position was already closed
		errStr := strings.ToLower(err.Error())
		if strings.Contains(errStr, "no short position") ||
			(strings.Contains(errStr, "margin is insufficient") && strings.Contains(errStr, "-2019")) {
			return fmt.Errorf("position %s SHORT was already closed (likely by another trader)", decision.Symbol)
		}
		return err
	}

	// Record order ID
	if orderID, ok := order["orderId"].(int64); ok {
		actionRecord.OrderID = orderID
	}

	log.Printf("  ✓ Position closed successfully")
	return nil
}

// GetID gets trader ID
func (at *AutoTrader) GetID() string {
	return at.id
}

// GetName gets trader name
func (at *AutoTrader) GetName() string {
	return at.name
}

// GetTrader gets the underlying trader interface
func (at *AutoTrader) GetTrader() Trader {
	return at.trader
}

// GetAIModel gets AI model
func (at *AutoTrader) GetAIModel() string {
	return at.aiModel
}

// GetDecisionLogger gets decision logger
func (at *AutoTrader) GetDecisionLogger() *logger.DecisionLogger {
	return at.decisionLogger
}

// SetTraderManager sets trader manager reference (for copy trading)
func (at *AutoTrader) SetTraderManager(tm interface{}) {
	at.traderManager = tm
}

// restorePaperTraderState restores paper trader state (balance and positions) from decision logs
func restorePaperTraderState(initialBalance float64, decisionLogger *logger.DecisionLogger) (*PaperTrader, error) {
	if decisionLogger == nil {
		return nil, fmt.Errorf("decision logger is nil")
	}

	// Get latest decision records (get more to filter out cycle #0 seed records)
	// We need to exclude cycle #0 as it's just a seed record with 10000, not the actual current state
	// Fetch more records to increase chance of finding one with positions if latest doesn't have them
	records, err := decisionLogger.GetLatestRecords(20)
	if err != nil {
		return nil, fmt.Errorf("failed to get latest records: %w", err)
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("no previous records found")
	}

	// Filter out cycle #0 records (seed records) - we want the latest actual trading cycle
	// GetLatestRecords returns oldest to newest, so iterate backwards to find latest
	var latestRecord *logger.DecisionRecord
	var latestRecordWithPositions *logger.DecisionRecord
	for i := len(records) - 1; i >= 0; i-- {
		if records[i].CycleNumber > 0 {
			// Track latest record (first one we find going backwards) for account state
			if latestRecord == nil {
				latestRecord = records[i]
			}
			// Track most recent record (going backwards) that has positions
			if len(records[i].Positions) > 0 {
				if latestRecordWithPositions == nil {
					latestRecordWithPositions = records[i]
				}
			}
		}
	}

	// If only cycle #0 exists, that means no actual trading has happened yet
	if latestRecord == nil {
		log.Printf("⚠️  Only cycle #0 seed records found, no actual trading cycles yet. Using initial balance: %.2f", initialBalance)
		return &PaperTrader{
			initialBalance:   initialBalance,
			balance:          initialBalance,
			unrealizedProfit: 0.0,
			availableBalance: initialBalance,
			positions:        make(map[string]*PaperPosition),
			rng:              rand.New(rand.NewSource(time.Now().UnixNano())),
		}, nil
	}

	// Use latest record for account state, but use record with positions for position restoration
	// This ensures we restore positions even if latest record doesn't have them (due to timing/race conditions)
	positionsSourceRecord := latestRecord
	if latestRecordWithPositions != nil {
		positionsSourceRecord = latestRecordWithPositions
		if latestRecordWithPositions != latestRecord {
			log.Printf("⚠️  Latest record (cycle #%d) has no positions, using cycle #%d for position restoration",
				latestRecord.CycleNumber, latestRecordWithPositions.CycleNumber)
		}
	}

	log.Printf("🔄 Restoring from cycle #%d (latest record)", latestRecord.CycleNumber)
	log.Printf("📊 Latest record data: TotalBalance=%.2f, AvailableBalance=%.2f, UnrealizedProfit=%.2f, Positions=%d",
		latestRecord.AccountState.TotalBalance, latestRecord.AccountState.AvailableBalance,
		latestRecord.AccountState.TotalUnrealizedProfit, latestRecord.AccountState.PositionCount)

	// Restore account state from latest record
	accountState := latestRecord.AccountState

	// If balance in record is invalid or 0, use passed initialBalance as base
	// This is because if account has been liquidated, latest record may show 0, but we should restore from initialBalance obtained from first record
	effectiveEquity := accountState.TotalBalance
	if effectiveEquity <= 0 {
		log.Printf("⚠️  Latest record has invalid equity (%.2f), using restored initial balance: %.2f",
			effectiveEquity, initialBalance)
		effectiveEquity = initialBalance
		accountState.TotalUnrealizedProfit = 0 // Reset unrealized profit if using initial balance
	}

	// Create paper trader and restore balance
	// balance = totalEquity - unrealizedProfit (wallet balance = total assets - unrealized P&L)
	balance := effectiveEquity - accountState.TotalUnrealizedProfit
	if balance < 0 {
		log.Printf("⚠️  Calculated balance is negative (%.2f), setting to 0", balance)
		balance = 0 // Safe handling: avoid negative balance
	}

	// Ensure available balance doesn't exceed total balance
	availableBalance := accountState.AvailableBalance
	if availableBalance > balance {
		log.Printf("⚠️  Available balance (%.2f) exceeds wallet balance (%.2f), capping to wallet balance",
			availableBalance, balance)
		availableBalance = balance
	}
	if availableBalance < 0 {
		availableBalance = 0
	}

	paperTrader := &PaperTrader{
		initialBalance:   initialBalance, // Use initial balance restored from first record for P&L calculation
		balance:          balance,        // Current wallet balance (from latest record)
		unrealizedProfit: accountState.TotalUnrealizedProfit,
		availableBalance: availableBalance,
		positions:        make(map[string]*PaperPosition),
		rng:              rand.New(rand.NewSource(time.Now().UnixNano())),
	}

	log.Printf("💾 Restored paper trader values: balance=%.2f, availableBalance=%.2f, unrealizedProfit=%.2f, initialBalance=%.2f",
		balance, availableBalance, accountState.TotalUnrealizedProfit, initialBalance)

	// Restore positions from record that has positions (may be different from latest if latest has none)
	positionCount := 0
	for _, posSnapshot := range positionsSourceRecord.Positions {
		position := &PaperPosition{
			Symbol:     posSnapshot.Symbol,
			Side:       strings.ToUpper(posSnapshot.Side), // Ensure uppercase
			EntryPrice: posSnapshot.EntryPrice,
			Quantity:   posSnapshot.PositionAmt,
			Leverage:   int(posSnapshot.Leverage),
			MarginUsed: posSnapshot.EntryPrice * posSnapshot.PositionAmt / posSnapshot.Leverage, // Estimate margin
		}

		// If position amount is negative, it's a short (SHORT)
		if posSnapshot.PositionAmt < 0 {
			position.Side = "SHORT"
			position.Quantity = -posSnapshot.PositionAmt // Convert to positive
		}

		// Set entry time (if available, otherwise use current time)
		// Note: We need to infer time from record, but we don't store entry_time
		// So use a reasonable default (current time minus estimated position duration)
		position.EntryTime = time.Now().Add(-30 * time.Minute) // Default 30 minutes ago

		// Use symbol+side as key
		key := fmt.Sprintf("%s_%s", position.Symbol, position.Side)
		paperTrader.positions[key] = position
		positionCount++
	}

	log.Printf("✅ Restored paper trader state: Wallet=%.2f, Equity=%.2f, Available=%.2f, InitialBalance=%.2f (for P&L), Positions=%d",
		balance, effectiveEquity, availableBalance, initialBalance, positionCount)

	return paperTrader, nil
}

// GetStatus gets system status (for API)
func (at *AutoTrader) GetStatus() map[string]interface{} {
	aiProvider := "DeepSeek"
	if at.config.UseQwen {
		aiProvider = "Qwen"
	}

	return map[string]interface{}{
		"trader_id":       at.id,
		"trader_name":     at.name,
		"ai_model":        at.aiModel,
		"exchange":        at.exchange,
		"is_running":      at.isRunning,
		"start_time":      at.startTime.Format(time.RFC3339),
		"runtime_minutes": int(time.Since(at.startTime).Minutes()),
		"call_count":      at.callCount,
		"initial_balance": at.initialBalance,
		"scan_interval":   at.config.ScanInterval.String(),
		"stop_until":      at.stopUntil.Format(time.RFC3339),
		"last_reset_time": at.lastResetTime.Format(time.RFC3339),
		"ai_provider":     aiProvider,
	}
}

// GetInitialBalance gets initial balance
func (at *AutoTrader) GetInitialBalance() float64 {
	return at.initialBalance
}

// GetAccountInfo gets account information (for API)
func (at *AutoTrader) GetAccountInfo() (map[string]interface{}, error) {
	balance, err := at.trader.GetBalance()
	if err != nil {
		return nil, fmt.Errorf("failed to get balance: %w", err)
	}

	// Get account fields
	totalWalletBalance := 0.0
	totalUnrealizedProfit := 0.0
	availableBalance := 0.0

	if wallet, ok := balance["totalWalletBalance"].(float64); ok {
		totalWalletBalance = wallet
	}
	if unrealized, ok := balance["totalUnrealizedProfit"].(float64); ok {
		totalUnrealizedProfit = unrealized
	}
	if avail, ok := balance["availableBalance"].(float64); ok {
		availableBalance = avail
	}

	// Total Equity = wallet balance + unrealized profit/loss
	totalEquity := totalWalletBalance + totalUnrealizedProfit

	// Get positions and calculate total margin
	positions, err := at.trader.GetPositions()
	if err != nil {
		return nil, fmt.Errorf("failed to get positions: %w", err)
	}

	totalMarginUsed := 0.0
	totalUnrealizedPnL := 0.0
	for _, pos := range positions {
		markPrice := pos["markPrice"].(float64)
		quantity := pos["positionAmt"].(float64)
		if quantity < 0 {
			quantity = -quantity
		}
		unrealizedPnl := pos["unRealizedProfit"].(float64)
		totalUnrealizedPnL += unrealizedPnl

		leverage := 10
		if lev, ok := pos["leverage"].(float64); ok {
			leverage = int(lev)
		}
		marginUsed := (quantity * markPrice) / float64(leverage)
		totalMarginUsed += marginUsed
	}

	totalPnL := totalEquity - at.initialBalance
	totalPnLPct := 0.0
	if at.initialBalance > 0 {
		totalPnLPct = (totalPnL / at.initialBalance) * 100
	}

	marginUsedPct := 0.0
	if totalEquity > 0 {
		marginUsedPct = (totalMarginUsed / totalEquity) * 100
	}

	return map[string]interface{}{
		// Core fields
		"total_equity":      totalEquity,           // Account equity = wallet + unrealized
		"wallet_balance":    totalWalletBalance,    // Wallet balance (excluding unrealized profit/loss)
		"unrealized_profit": totalUnrealizedProfit, // Unrealized profit/loss (from API)
		"available_balance": availableBalance,      // Available balance

		// Profit/loss statistics
		"total_pnl":            totalPnL,           // Total profit/loss = equity - initial
		"total_pnl_pct":        totalPnLPct,        // Total profit/loss percentage
		"total_unrealized_pnl": totalUnrealizedPnL, // Unrealized profit/loss (calculated from positions)
		"initial_balance":      at.initialBalance,  // Initial balance
		"daily_pnl":            at.dailyPnL,        // Daily profit/loss

		// Position information
		"position_count":  len(positions),  // Position count
		"margin_used":     totalMarginUsed, // Margin used
		"margin_used_pct": marginUsedPct,   // Margin usage rate
	}, nil
}

// GetPositions gets position list (for API)
func (at *AutoTrader) GetPositions() ([]map[string]interface{}, error) {
	positions, err := at.trader.GetPositions()
	if err != nil {
		return nil, fmt.Errorf("failed to get positions: %w", err)
	}

	var result []map[string]interface{}
	for _, pos := range positions {
		symbol := pos["symbol"].(string)

		// Handle both "side" and "positionSide" fields (different exchanges use different names)
		var side string
		if s, ok := pos["side"].(string); ok && s != "" {
			side = s
		} else if ps, ok := pos["positionSide"].(string); ok && ps != "" {
			// PaperTrader uses "positionSide" with "LONG"/"SHORT", convert to lowercase "long"/"short"
			side = strings.ToLower(ps)
		} else {
			// Fallback: determine from positionAmt sign (negative = short)
			quantity := pos["positionAmt"].(float64)
			if quantity < 0 {
				side = "short"
			} else {
				side = "long"
			}
		}

		entryPrice := pos["entryPrice"].(float64)
		markPrice := pos["markPrice"].(float64)
		quantity := pos["positionAmt"].(float64)
		if quantity < 0 {
			quantity = -quantity
		}
		unrealizedPnl := pos["unRealizedProfit"].(float64)
		liquidationPrice := pos["liquidationPrice"].(float64)

		leverage := 10
		if lev, ok := pos["leverage"].(float64); ok {
			leverage = int(lev)
		}

		pnlPct := 0.0
		if side == "long" {
			pnlPct = ((markPrice - entryPrice) / entryPrice) * float64(leverage) * 100
		} else {
			pnlPct = ((entryPrice - markPrice) / entryPrice) * float64(leverage) * 100
		}

		marginUsed := (quantity * markPrice) / float64(leverage)

		result = append(result, map[string]interface{}{
			"symbol":             symbol,
			"side":               side,
			"entry_price":        entryPrice,
			"mark_price":         markPrice,
			"quantity":           quantity,
			"leverage":           leverage,
			"unrealized_pnl":     unrealizedPnl,
			"unrealized_pnl_pct": pnlPct,
			"liquidation_price":  liquidationPrice,
			"margin_used":        marginUsed,
		})
	}

	return result, nil
}

// sortDecisionsByPriority sorts decisions: close positions first, then open positions, finally hold/wait
// This avoids position stacking beyond limits when switching positions
func sortDecisionsByPriority(decisions []decisionPkg.Decision) []decisionPkg.Decision {
	if len(decisions) <= 1 {
		return decisions
	}

	// Define priority
	getActionPriority := func(action string) int {
		switch action {
		case "close_long", "close_short":
			return 1 // Highest priority: close positions first
		case "open_long", "open_short":
			return 2 // Second priority: open positions later
		case "hold", "wait":
			return 3 // Lowest priority: wait
		default:
			return 999 // Unknown actions go last
		}
	}

	// Copy decision list
	sorted := make([]decisionPkg.Decision, len(decisions))
	copy(sorted, decisions)

	// Sort by priority
	for i := 0; i < len(sorted)-1; i++ {
		for j := i + 1; j < len(sorted); j++ {
			if getActionPriority(sorted[i].Action) > getActionPriority(sorted[j].Action) {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	return sorted
}
