package api

import (
	"encoding/json"
	"fmt"
	"lia/logger"
	"lia/manager"
	"lia/market"
	"lia/trader"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// Server HTTP API server
type Server struct {
	router        *gin.Engine
	traderManager *manager.TraderManager
	port          int
}

// NewServer creates API server
func NewServer(traderManager *manager.TraderManager, port int) *Server {
	// Set to Release mode (reduces log output)
	gin.SetMode(gin.ReleaseMode)

	router := gin.Default()

	// Add request logging middleware for debugging
	router.Use(func(c *gin.Context) {
		log.Printf("📥 Incoming request: %s %s%s (from %s)",
			c.Request.Method, c.Request.Host, c.Request.URL.Path, c.ClientIP())
		c.Next()
	})

	// Enable CORS
	router.Use(corsMiddleware())

	s := &Server{
		router:        router,
		traderManager: traderManager,
		port:          port,
	}

	// Setup routes
	s.setupRoutes()

	return s
}

// corsMiddleware CORS middleware
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cache-Control")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}

		c.Next()
	}
}

// setupRoutes sets up routes
func (s *Server) setupRoutes() {
	// Health check
	s.router.Any("/health", s.handleHealth)

	// API route group
	api := s.router.Group("/api")
	{
		// Competition overview
		api.GET("/competition", s.handleCompetition)

		// Portfolio overview (ETF-like aggregated view)
		api.GET("/portfolio", s.handlePortfolio)

		// Trader list
		api.GET("/traders", s.handleTraderList)

		// Trader-specific data (use query parameter ?trader_id=xxx)
		api.GET("/status", s.handleStatus)
		api.GET("/account", s.handleAccount)

		// Close position endpoints (must come before GET /positions to avoid route conflicts)
		// Register POST routes first to ensure they're matched before GET routes
		api.POST("/positions/close", s.handleClosePosition)
		api.POST("/positions/force-close", s.handleForceClosePosition)

		// Position endpoints (GET must come after POST to avoid conflicts)
		api.GET("/positions", s.handlePositions)
		api.GET("/decisions", s.handleDecisions)
		api.GET("/decisions/latest", s.handleLatestDecisions)
		api.GET("/statistics", s.handleStatistics)
		api.GET("/equity-history", s.handleEquityHistory)
		api.GET("/performance", s.handlePerformance)

		// Trading Signal API - Get latest AI trading signal
		api.GET("/trading-signal", s.handleTradingSignal)
	}

	// Add 404 handler for unmatched routes
	s.router.NoRoute(func(c *gin.Context) {
		log.Printf("❌ 404 - Route not found: %s %s%s",
			c.Request.Method, c.Request.Host, c.Request.URL.Path)
		c.JSON(http.StatusNotFound, gin.H{
			"error": fmt.Sprintf("route not found: %s %s", c.Request.Method, c.Request.URL.Path),
		})
	})
}

// handleHealth health check
func (s *Server) handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"time":   c.Request.Context().Value("time"),
	})
}

// getTraderFromQuery gets trader from query parameter
func (s *Server) getTraderFromQuery(c *gin.Context) (*manager.TraderManager, string, error) {
	traderID := c.Query("trader_id")
	if traderID == "" {
		// If trader_id is not specified, return the first trader
		ids := s.traderManager.GetTraderIDs()
		if len(ids) == 0 {
			return nil, "", fmt.Errorf("no available trader")
		}
		traderID = ids[0]
	}
	return s.traderManager, traderID, nil
}

// handleCompetition competition overview (compare all traders)
func (s *Server) handleCompetition(c *gin.Context) {
	comparison, err := s.traderManager.GetComparisonData()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get comparison data: %v", err),
		})
		return
	}
	c.JSON(http.StatusOK, comparison)
}

// handlePortfolio portfolio overview (ETF-like aggregated view of all traders)
func (s *Server) handlePortfolio(c *gin.Context) {
	traders := s.traderManager.GetAllTraders()

	if len(traders) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"total_equity":    0.0,
			"total_pnl":       0.0,
			"total_pnl_pct":   0.0,
			"total_positions": 0,
			"agent_count":     0,
			"agents":          []interface{}{},
		})
		return
	}

	// First pass: collect all initial balances and detect shared accounts
	initialBalances := make(map[string]float64)
	totalInitialBalance := 0.0

	for _, t := range traders {
		status := t.GetStatus()
		initialBalance := 0.0
		if ib, ok := status["initial_balance"].(float64); ok && ib > 0 {
			initialBalance = ib
		}
		initialBalances[t.GetID()] = initialBalance
		totalInitialBalance += initialBalance
	}

	// Get first trader's account to check if all share same balance
	var sharedAccountEquity float64 = 0.0
	hasSharedAccount := false

	if len(traders) > 1 {
		// Get first trader to check
		var firstTrader *trader.AutoTrader
		for _, t := range traders {
			firstTrader = t
			break
		}

		firstAccount, err := firstTrader.GetAccountInfo()
		if err == nil {
			firstEquity := firstAccount["total_equity"].(float64)
			// Check if all traders have same equity (indicating shared account)
			allSame := true
			for _, t := range traders {
				acc, err := t.GetAccountInfo()
				if err != nil {
					allSame = false
					break
				}
				accEquity := acc["total_equity"].(float64)
				// Allow small floating point differences
				if accEquity != firstEquity && (accEquity-firstEquity > 0.01 || firstEquity-accEquity > 0.01) {
					allSame = false
					break
				}
			}
			if allSame {
				hasSharedAccount = true
				sharedAccountEquity = firstEquity
				log.Printf("🔍 Detected shared account: %d traders sharing %.2f USDT equity", len(traders), sharedAccountEquity)
			}
		}
	}

	totalEquity := 0.0
	totalPositions := 0
	agents := make([]map[string]interface{}, 0, len(traders))
	allRunning := true

	for _, t := range traders {
		account, err := t.GetAccountInfo()
		status := t.GetStatus()

		initialBalance := initialBalances[t.GetID()]

		if err != nil {
			log.Printf("⚠️  [%s] Failed to get account info: %v", t.GetName(), err)
			// Use initial balance as fallback
			equity := initialBalance
			totalEquity += equity
			totalInitialBalance += initialBalance

			agents = append(agents, map[string]interface{}{
				"trader_id":       t.GetID(),
				"trader_name":     t.GetName(),
				"ai_model":        t.GetAIModel(),
				"equity":          equity,
				"initial_balance": initialBalance,
				"pnl":             0.0,
				"pnl_pct":         0.0,
				"position_count":  0,
				"is_running":      status["is_running"],
			})

			if isRunning, ok := status["is_running"].(bool); ok && !isRunning {
				allRunning = false
			}
			continue
		}

		var equity, pnl, pnlPct float64
		var positionCount int

		// If multiple traders share same account, split proportionally
		if hasSharedAccount && totalInitialBalance > 0 {
			// Calculate this trader's proportional share
			proportion := initialBalance / totalInitialBalance
			equity = sharedAccountEquity * proportion
			pnl = equity - initialBalance
			if initialBalance > 0 {
				pnlPct = (pnl / initialBalance) * 100
			}

			// For positions, we can't split them, so show all positions for each trader
			// (This is a limitation - we can't track which positions belong to which trader)
			if pc, ok := account["position_count"].(int); ok {
				positionCount = pc
			} else if pc, ok := account["position_count"].(float64); ok {
				positionCount = int(pc)
			}
		} else {
			// Normal case: each trader has own account
			equity = account["total_equity"].(float64)
			pnl = account["total_pnl"].(float64)
			pnlPct = account["total_pnl_pct"].(float64)

			if pc, ok := account["position_count"].(int); ok {
				positionCount = pc
			} else if pc, ok := account["position_count"].(float64); ok {
				positionCount = int(pc)
			} else {
				positionCount = 0
			}
		}

		totalEquity += equity
		totalPositions += positionCount

		agents = append(agents, map[string]interface{}{
			"trader_id":       t.GetID(),
			"trader_name":     t.GetName(),
			"ai_model":        t.GetAIModel(),
			"equity":          equity,
			"initial_balance": initialBalance,
			"pnl":             pnl,
			"pnl_pct":         pnlPct,
			"position_count":  positionCount,
			"is_running":      status["is_running"],
		})

		if isRunning, ok := status["is_running"].(bool); ok && !isRunning {
			allRunning = false
		}
	}

	totalPnL := totalEquity - totalInitialBalance
	totalPnLPct := 0.0
	if totalInitialBalance > 0 {
		totalPnLPct = (totalPnL / totalInitialBalance) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"total_equity":    totalEquity,
		"initial_balance": totalInitialBalance,
		"total_pnl":       totalPnL,
		"total_pnl_pct":   totalPnLPct,
		"total_positions": totalPositions,
		"agent_count":     len(traders),
		"is_running":      allRunning,
		"agents":          agents,
	})
}

// handleTraderList trader list
func (s *Server) handleTraderList(c *gin.Context) {
	traders := s.traderManager.GetAllTraders()
	result := make([]map[string]interface{}, 0, len(traders))

	for _, t := range traders {
		result = append(result, map[string]interface{}{
			"trader_id":   t.GetID(),
			"trader_name": t.GetName(),
			"ai_model":    t.GetAIModel(),
		})
	}

	c.JSON(http.StatusOK, result)
}

// handleStatus system status
func (s *Server) handleStatus(c *gin.Context) {
	_, traderID, err := s.getTraderFromQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trader, err := s.traderManager.GetTrader(traderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	status := trader.GetStatus()
	c.JSON(http.StatusOK, status)
}

// handleAccount account information
func (s *Server) handleAccount(c *gin.Context) {
	_, traderID, err := s.getTraderFromQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trader, err := s.traderManager.GetTrader(traderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	log.Printf("📊 Received account info request [%s]", trader.GetName())
	account, err := trader.GetAccountInfo()
	if err != nil {
		log.Printf("❌ Failed to get account info [%s]: %v", trader.GetName(), err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get account info: %v", err),
		})
		return
	}

	// Check if this trader shares account with others (proportional balance splitting)
	allTraders := s.traderManager.GetAllTraders()
	if len(allTraders) > 1 {
		// Get first trader's equity to check if shared
		var firstTrader interface {
			GetAccountInfo() (map[string]interface{}, error)
		}
		for _, t := range allTraders {
			firstTrader = t
			break
		}
		firstAccount, err := firstTrader.GetAccountInfo()
		if err == nil {
			firstEquity := firstAccount["total_equity"].(float64)
			currentEquity := account["total_equity"].(float64)
			// Check if all traders have same equity (shared account)
			allSame := true
			for _, t := range allTraders {
				acc, err := t.GetAccountInfo()
				if err != nil {
					allSame = false
					break
				}
				accEquity := acc["total_equity"].(float64)
				if accEquity != firstEquity && (accEquity-firstEquity > 0.01 || firstEquity-accEquity > 0.01) {
					allSame = false
					break
				}
			}

			if allSame && currentEquity == firstEquity {
				// Shared account detected - calculate proportional balance
				status := trader.GetStatus()
				initialBalance := 0.0
				if ib, ok := status["initial_balance"].(float64); ok && ib > 0 {
					initialBalance = ib
				}

				// Calculate total initial balance
				totalInitialBalance := 0.0
				for _, t := range allTraders {
					s := t.GetStatus()
					if ib, ok := s["initial_balance"].(float64); ok && ib > 0 {
						totalInitialBalance += ib
					}
				}

				if totalInitialBalance > 0 {
					proportion := initialBalance / totalInitialBalance
					equity := firstEquity * proportion
					pnl := equity - initialBalance
					pnlPct := 0.0
					if initialBalance > 0 {
						pnlPct = (pnl / initialBalance) * 100
					}

					// Update account with proportional values
					account["total_equity"] = equity
					account["total_pnl"] = pnl
					account["total_pnl_pct"] = pnlPct
					account["wallet_balance"] = equity - account["unrealized_profit"].(float64)
					account["available_balance"] = equity - account["margin_used"].(float64)
				}
			}
		}
	}

	log.Printf("✓ Returning account info [%s]: equity=%.2f, available=%.2f, P/L=%.2f (%.2f%%)",
		trader.GetName(),
		account["total_equity"],
		account["available_balance"],
		account["total_pnl"],
		account["total_pnl_pct"])
	c.JSON(http.StatusOK, account)
}

// handlePositions position list
func (s *Server) handlePositions(c *gin.Context) {
	_, traderID, err := s.getTraderFromQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trader, err := s.traderManager.GetTrader(traderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	positions, err := trader.GetPositions()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get position list: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, positions)
}

// handleDecisions decision log list
func (s *Server) handleDecisions(c *gin.Context) {
	_, traderID, err := s.getTraderFromQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trader, err := s.traderManager.GetTrader(traderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Get all historical decision records (unlimited, using GetAllRecords)
	records, err := trader.GetDecisionLogger().GetAllRecords()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get decision logs: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, records)
}

// handleLatestDecisions latest decision logs (recent 10, newest first)
func (s *Server) handleLatestDecisions(c *gin.Context) {
	_, traderID, err := s.getTraderFromQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trader, err := s.traderManager.GetTrader(traderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	records, err := trader.GetDecisionLogger().GetLatestRecords(10)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get decision logs: %v", err),
		})
		return
	}

	// Reverse array to put newest first (for list display)
	// GetLatestRecords returns oldest to newest (for charts), here we need newest to oldest
	for i, j := 0, len(records)-1; i < j; i, j = i+1, j-1 {
		records[i], records[j] = records[j], records[i]
	}

	c.JSON(http.StatusOK, records)
}

// handleStatistics statistics
func (s *Server) handleStatistics(c *gin.Context) {
	_, traderID, err := s.getTraderFromQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trader, err := s.traderManager.GetTrader(traderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	stats, err := trader.GetDecisionLogger().GetStatistics()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to get statistics: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// handleEquityHistory equity history data
func (s *Server) handleEquityHistory(c *gin.Context) {
	_, traderID, err := s.getTraderFromQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trader, err := s.traderManager.GetTrader(traderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Get historical data - limit to recent 2000 records for performance
	// This is enough for chart display and much faster than getting all records
	// If you need more, use startCycle parameter to fetch specific ranges
	records, err := trader.GetDecisionLogger().GetLatestRecords(2000)
	if err != nil {
		log.Printf("❌ Failed to get records for equity history: %v", err)
		// Return empty array instead of error to prevent 500 errors
		c.JSON(http.StatusOK, []interface{}{})
		return
	}

	// Reverse to get chronological order (oldest to newest)
	for i, j := 0, len(records)-1; i < j; i, j = i+1, j-1 {
		records[i], records[j] = records[j], records[i]
	}

	// Check for startCycle query parameter to filter data from a specific cycle
	startCycleStr := c.Query("startCycle")
	var startCycle int
	if startCycleStr != "" {
		startCycle, err = strconv.Atoi(startCycleStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Invalid startCycle parameter: %v", err),
			})
			return
		}

		// Filter records to only include from startCycle onwards
		var filteredRecords []*logger.DecisionRecord
		for _, record := range records {
			if record.CycleNumber >= startCycle {
				filteredRecords = append(filteredRecords, record)
			}
		}

		if len(filteredRecords) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("No records found for cycle #%d or later", startCycle),
			})
			return
		}

		records = filteredRecords
		log.Printf("📊 Filtered equity history: starting from cycle #%d, %d records found", startCycle, len(records))
	}

	// Build equity history data points
	type EquityPoint struct {
		Timestamp        string  `json:"timestamp"`
		TotalEquity      float64 `json:"total_equity"`      // Account equity (wallet + unrealized)
		AvailableBalance float64 `json:"available_balance"` // Available balance
		TotalPnL         float64 `json:"total_pnl"`         // Total P&L (relative to initial balance)
		TotalPnLPct      float64 `json:"total_pnl_pct"`     // Total P&L percentage
		PositionCount    int     `json:"position_count"`    // Position count
		MarginUsedPct    float64 `json:"margin_used_pct"`   // Margin usage rate
		CycleNumber      int     `json:"cycle_number"`
	}

	// Determine initial balance for calculating P&L percentage
	// Strategy:
	// 1. If startCycle is specified, use that cycle's equity as baseline (chart starts from that point, shows 0% PnL)
	// 2. If cycle #1 exists, use it as initial balance
	// 3. Otherwise use earliest record as baseline (so chart starts from 0%)
	initialBalance := 0.0
	useEarliestAsBaseline := false

	if len(records) == 0 {
		// Return empty array instead of error - trader might not have any decisions yet
		c.JSON(http.StatusOK, []interface{}{})
		return
	}

	// If startCycle is specified, use that cycle's equity as baseline
	if startCycle > 0 {
		// First record should be the specified startCycle (since we filtered)
		if len(records) > 0 && records[0].CycleNumber >= startCycle {
			initialBalance = records[0].AccountState.TotalBalance
			useEarliestAsBaseline = true
			log.Printf("📊 Using startCycle #%d (equity: %.2f USDT) as baseline - chart will start at 0%% from this point",
				records[0].CycleNumber, initialBalance)
		}
	} else {
		// Otherwise, use original logic
		// First try to get cycle #1 record (true starting point)
		firstRecord, err := trader.GetDecisionLogger().GetFirstRecord()
		if err == nil && firstRecord != nil && firstRecord.CycleNumber == 1 {
			// We have cycle #1, use it as initial balance
			initialBalance = firstRecord.AccountState.TotalBalance
			if initialBalance > 0 {
				log.Printf("📊 Using cycle #1 as baseline: %.2f USDT", initialBalance)
			}
		}

		// If no cycle #1, use earliest available record as baseline (so chart starts from 0%)
		if initialBalance == 0 {
			// Use earliest record's equity as baseline
			earliestRecord := records[0] // GetAllRecords returns sorted oldest to newest
			initialBalance = earliestRecord.AccountState.TotalBalance
			useEarliestAsBaseline = true
			if initialBalance > 0 {
				log.Printf("📊 No cycle #1 found, using earliest record (cycle #%d) as baseline: %.2f USDT",
					earliestRecord.CycleNumber, initialBalance)
			}
		}
	}

	// If still unable to get, try to get from AutoTrader status
	if initialBalance == 0 {
		if status := trader.GetStatus(); status != nil {
			if ib, ok := status["initial_balance"].(float64); ok && ib > 0 {
				initialBalance = ib
				log.Printf("📊 Using AutoTrader initial balance as fallback: %.2f USDT", initialBalance)
			}
		}
	}

	// If still unable to get, return error
	if initialBalance == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "unable to get initial balance",
		})
		return
	}

	var history []EquityPoint
	for _, record := range records {
		// TotalBalance field actually stores TotalEquity
		totalEquity := record.AccountState.TotalBalance

		// If using earliest record as baseline, ensure first record shows 0% PnL
		// This avoids chart starting from negative values (if no true cycle #1)
		totalPnL := totalEquity - initialBalance
		totalPnLPct := 0.0
		if initialBalance > 0 {
			totalPnLPct = (totalPnL / initialBalance) * 100
		}

		// If using earliest record as baseline and this is the first record, force to 0% to ensure chart starts from 0
		if useEarliestAsBaseline && len(history) == 0 {
			totalPnL = 0
			totalPnLPct = 0
			log.Printf("📊 Setting first data point to 0%% PnL (earliest record as baseline)")
		}

		history = append(history, EquityPoint{
			Timestamp:        record.Timestamp.Format("2006-01-02 15:04:05"),
			TotalEquity:      totalEquity,
			AvailableBalance: record.AccountState.AvailableBalance,
			TotalPnL:         totalPnL,
			TotalPnLPct:      totalPnLPct,
			PositionCount:    record.AccountState.PositionCount,
			MarginUsedPct:    record.AccountState.MarginUsedPct,
			CycleNumber:      record.CycleNumber,
		})
	}

	// Always append current real-time account info as the latest data point
	// This ensures the chart always shows the most up-to-date P&L
	// IMPORTANT: Calculate PnL% relative to the baseline we're using for consistency
	currentAccount, err := trader.GetAccountInfo()
	if err == nil {
		currentTime := time.Now()
		totalEquity, _ := currentAccount["total_equity"].(float64)
		availableBalance, _ := currentAccount["available_balance"].(float64)
		positionCount, _ := currentAccount["position_count"].(int)
		marginUsedPct, _ := currentAccount["margin_used_pct"].(float64)

		// Calculate PnL relative to the baseline we're using for historical data
		// This ensures consistency throughout the chart
		totalPnL := totalEquity - initialBalance
		totalPnLPct := 0.0
		if initialBalance > 0 {
			totalPnLPct = (totalPnL / initialBalance) * 100
		}

		// If NOT using earliest as baseline (i.e., we have cycle #1), use GetAccountInfo values
		// for consistency with leaderboard (which also uses cycle #1 initial balance)
		if !useEarliestAsBaseline {
			// Try to use the exact same calculation as GetAccountInfo (for leaderboard consistency)
			accountInitialBalance, _ := currentAccount["initial_balance"].(float64)
			if accountInitialBalance > 0 && accountInitialBalance == initialBalance {
				// Same baseline, so we can use GetAccountInfo values
				totalPnL, _ = currentAccount["total_pnl"].(float64)
				totalPnLPct, _ = currentAccount["total_pnl_pct"].(float64)
			}
			// Otherwise, we've already calculated using the correct baseline above
		}

		// Always remove any existing real-time points first to ensure only one real-time point
		// Filter out real-time points (cycle 0)
		filteredHistory := []EquityPoint{}
		for _, point := range history {
			if point.CycleNumber != 0 {
				filteredHistory = append(filteredHistory, point)
			}
		}
		history = filteredHistory

		// Always append the most recent real-time point at the end
		// Use a slightly future timestamp to ensure it's always sorted last
		realtimeTimestamp := currentTime.Add(1 * time.Second).Format("2006-01-02 15:04:05")
		history = append(history, EquityPoint{
			Timestamp:        realtimeTimestamp,
			TotalEquity:      totalEquity,
			AvailableBalance: availableBalance,
			TotalPnL:         totalPnL,
			TotalPnLPct:      totalPnLPct,
			PositionCount:    positionCount,
			MarginUsedPct:    marginUsedPct,
			CycleNumber:      0, // 0 indicates real-time data point
		})
	}

	c.JSON(http.StatusOK, history)
}

// handlePerformance AI historical performance analysis (for showing AI learning and reflection)
func (s *Server) handlePerformance(c *gin.Context) {
	_, traderID, err := s.getTraderFromQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trader, err := s.traderManager.GetTrader(traderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Analyze all historical trading performance (lookbackCycles = 0 means analyze all records)
	// This allows seeing all historical trading data after restart
	performance, err := trader.GetDecisionLogger().AnalyzePerformance(0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to analyze historical performance: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, performance)
}

// handleTradingSignal get latest trading signal (AI chain of thought and trading decisions)
func (s *Server) handleTradingSignal(c *gin.Context) {
	// Supports query by model or trader_id
	model := c.Query("model")
	traderID := c.Query("trader_id")

	var trader *trader.AutoTrader
	var err error

	if traderID != "" {
		// If trader_id is provided, use it directly
		trader, err = s.traderManager.GetTrader(traderID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"error": fmt.Sprintf("Trader ID '%s' not found: %v", traderID, err),
			})
			return
		}
	} else if model != "" {
		// If model is provided, find matching trader
		allTraders := s.traderManager.GetAllTraders()
		found := false
		for _, t := range allTraders {
			if t.GetAIModel() == model {
				trader = t
				found = true
				break
			}
		}
		if !found {
			c.JSON(http.StatusNotFound, gin.H{
				"error": fmt.Sprintf("No trader found with model '%s'", model),
			})
			return
		}
	} else {
		// If neither is provided, return error
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Either 'model' or 'trader_id' parameter is required",
			"example": "/api/trading-signal?model=openai or /api/trading-signal?trader_id=openai_trader",
		})
		return
	}

	// Get latest decision record (only latest 1, from database)
	records, err := trader.GetDecisionLogger().GetLatestRecords(1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to get decision records: %v", err),
		})
		return
	}

	if len(records) == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "No decision records found for this trader",
		})
		return
	}

	// Get latest decision record (GetLatestRecords returns oldest to newest, so last one is newest)
	latestRecord := records[len(records)-1]

	// Ensure AI responses are included (they're already stored in DB as RawResponse and CoTTrace)
	// The record from GetLatestRecords already includes these fields from the database

	// Parse decision_json into actual decision array
	var decisionsArray []interface{}
	if latestRecord.DecisionJSON != "" {
		if err := json.Unmarshal([]byte(latestRecord.DecisionJSON), &decisionsArray); err != nil {
			// If parsing fails, use decisions field
			decisionsArray = nil
		}
	}

	// If decision_json parsing fails, convert using decisions field
	if decisionsArray == nil && len(latestRecord.Decisions) > 0 {
		decisionsArray = make([]interface{}, len(latestRecord.Decisions))
		for i, d := range latestRecord.Decisions {
			decisionsArray[i] = map[string]interface{}{
				"action":    d.Action,
				"symbol":    d.Symbol,
				"quantity":  d.Quantity,
				"leverage":  d.Leverage,
				"price":     d.Price,
				"success":   d.Success,
				"error":     d.Error,
				"timestamp": d.Timestamp.Format(time.RFC3339),
			}
		}
	}

	// Build response (from database, includes all AI response data)
	response := map[string]interface{}{
		"trader_id":        trader.GetID(),
		"trader_name":      trader.GetName(),
		"ai_model":         trader.GetAIModel(),
		"timestamp":        latestRecord.Timestamp.Format(time.RFC3339),
		"cycle_number":     latestRecord.CycleNumber,
		"success":          latestRecord.Success,
		"chain_of_thought": latestRecord.CoTTrace,    // AI chain of thought (from database)
		"input_prompt":     latestRecord.InputPrompt, // Input prompt sent to AI (from database)
		"raw_response":     latestRecord.RawResponse, // AI raw response (from database)
		"decisions":        decisionsArray,
		"account_state": map[string]interface{}{
			"total_equity":      latestRecord.AccountState.TotalBalance,
			"available_balance": latestRecord.AccountState.AvailableBalance,
			"total_pnl":         latestRecord.AccountState.TotalUnrealizedProfit,
			"position_count":    latestRecord.AccountState.PositionCount,
			"margin_used_pct":   latestRecord.AccountState.MarginUsedPct,
		},
	}

	// If there's an error message, include it in the response
	if latestRecord.ErrorMessage != "" {
		response["error_message"] = latestRecord.ErrorMessage
	}

	c.JSON(http.StatusOK, response)
}

// logManualClose logs a manually closed position to the decision logger
func (s *Server) logManualClose(traderInstance *trader.AutoTrader, symbol, side string, closePrice float64, positionInfo map[string]interface{}) {
	decisionLogger := traderInstance.GetDecisionLogger()
	if decisionLogger == nil {
		log.Printf("⚠️  Cannot log manual close: decision logger not available")
		return
	}

	// Get current account info
	accountInfo, err := traderInstance.GetAccountInfo()
	if err != nil {
		log.Printf("⚠️  Failed to get account info for logging: %v", err)
		// Continue anyway with default values
		accountInfo = make(map[string]interface{})
	}

	// Extract quantity and leverage from position info if available
	quantity := 0.0
	leverage := 0
	if positionInfo != nil {
		if qty, ok := positionInfo["positionAmt"].(float64); ok {
			if qty < 0 {
				qty = -qty // Short position quantity is negative
			}
			quantity = qty
		}
		if lev, ok := positionInfo["leverage"].(float64); ok {
			leverage = int(lev)
		}
	}

	// Create close action
	// Note: Quantity and leverage may be 0 if not available from position info,
	// but AnalyzePerformance will match this close with the open action from history
	action := logger.DecisionAction{
		Action:    fmt.Sprintf("close_%s", side),
		Symbol:    symbol,
		Quantity:  quantity,
		Leverage:  leverage,
		Price:     closePrice,
		OrderID:   0,
		Timestamp: time.Now(),
		Success:   true,
		Error:     "",
	}

	// Create minimal decision record for manual close
	totalBalance := 0.0
	if tb, ok := accountInfo["total_equity"].(float64); ok {
		totalBalance = tb
	}
	availableBalance := 0.0
	if ab, ok := accountInfo["available_balance"].(float64); ok {
		availableBalance = ab
	}
	totalPnL := 0.0
	if pnl, ok := accountInfo["total_pnl"].(float64); ok {
		totalPnL = pnl
	}
	positionCount := 0
	if pc, ok := accountInfo["position_count"].(int); ok {
		positionCount = pc
	}
	marginUsedPct := 0.0
	if mup, ok := accountInfo["margin_used_pct"].(float64); ok {
		marginUsedPct = mup
	}

	record := &logger.DecisionRecord{
		InputPrompt:  fmt.Sprintf("Manual close: %s %s at %.4f", symbol, side, closePrice),
		CoTTrace:     "Manual position close by user",
		DecisionJSON: "{}",
		RawResponse:  "",
		AccountState: logger.AccountSnapshot{
			TotalBalance:          totalBalance,
			AvailableBalance:      availableBalance,
			TotalUnrealizedProfit: totalPnL,
			PositionCount:         positionCount,
			MarginUsedPct:         marginUsedPct,
		},
		Positions:      []logger.PositionSnapshot{},
		CandidateCoins: []string{},
		Decisions:      []logger.DecisionAction{action},
		ExecutionLog:   []string{fmt.Sprintf("Manually closed %s %s position at %.4f", symbol, side, closePrice)},
		Success:        true,
		ErrorMessage:   "",
	}

	// Log the decision
	if err := decisionLogger.LogDecision(record); err != nil {
		log.Printf("⚠️  Failed to log manual close: %v", err)
	} else {
		log.Printf("✅ Logged manual close: %s %s at %.4f", symbol, side, closePrice)
	}
}

// handleClosePosition closes a position
func (s *Server) handleClosePosition(c *gin.Context) {
	// Log incoming request details
	log.Printf("🔍 Close position request received: method=%s, path=%s, query=%s",
		c.Request.Method, c.Request.URL.Path, c.Request.URL.RawQuery)

	_, traderID, err := s.getTraderFromQuery(c)
	if err != nil {
		log.Printf("❌ Close position: failed to get trader from query: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("🔍 Close position request: trader_id='%s'", traderID)

	// List all available traders for debugging
	availableIDs := s.traderManager.GetTraderIDs()
	log.Printf("📋 Available trader IDs: %v", availableIDs)

	traderInstance, err := s.traderManager.GetTrader(traderID)
	if err != nil {
		log.Printf("❌ Close position: trader not found: trader_id='%s', available=%v, error=%v", traderID, availableIDs, err)
		c.JSON(http.StatusNotFound, gin.H{
			"error":         err.Error(),
			"trader_id":     traderID,
			"available_ids": availableIDs,
		})
		return
	}

	// Parse request body
	var req struct {
		Symbol string `json:"symbol" binding:"required"`
		Side   string `json:"side" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("❌ Close position: invalid request body: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("invalid request: %v", err),
		})
		return
	}

	// Normalize side to lowercase (handle "SHORT", "LONG", etc.)
	req.Side = strings.ToLower(req.Side)

	// Validate side
	if req.Side != "long" && req.Side != "short" {
		log.Printf("❌ Close position: invalid side '%s' (must be 'long' or 'short')", req.Side)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("side must be 'long' or 'short', got '%s'", req.Side),
		})
		return
	}

	log.Printf("📤 Closing position: %s %s [%s]", req.Symbol, req.Side, traderInstance.GetName())

	// Get the underlying trader interface
	traderInterface := traderInstance.GetTrader()

	// Get position info BEFORE closing (for logging)
	var positionInfo map[string]interface{}
	positions, err := traderInterface.GetPositions()
	if err == nil {
		for _, pos := range positions {
			posSymbol, _ := pos["symbol"].(string)
			posSide, _ := pos["side"].(string)
			if posSymbol == req.Symbol && strings.ToLower(posSide) == req.Side {
				positionInfo = pos
				break
			}
		}
	}

	// Get current market price for logging
	closePrice := 0.0
	if marketData, err := market.Get(req.Symbol); err == nil {
		closePrice = marketData.CurrentPrice
	}

	// Close position (quantity=0 means close all)
	var result map[string]interface{}
	if req.Side == "long" {
		result, err = traderInterface.CloseLong(req.Symbol, 0)
	} else {
		result, err = traderInterface.CloseShort(req.Symbol, 0)
	}

	if err != nil {
		log.Printf("❌ Failed to close position %s %s [%s]: %v", req.Symbol, req.Side, traderInstance.GetName(), err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to close position: %v", err),
		})
		return
	}

	// If close price wasn't retrieved from market, try to get it from result
	if closePrice == 0 {
		if price, ok := result["price"].(float64); ok {
			closePrice = price
		} else if avgPrice, ok := result["avgPrice"].(float64); ok {
			closePrice = avgPrice
		}
	}

	// Log the manual close
	if closePrice > 0 {
		s.logManualClose(traderInstance, req.Symbol, req.Side, closePrice, positionInfo)
	}

	log.Printf("✓ Successfully closed position: %s %s [%s]", req.Symbol, req.Side, traderInstance.GetName())
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"symbol":  req.Symbol,
		"side":    req.Side,
		"result":  result,
	})
}

// handleForceClosePosition force closes a position (bypasses cache, allows manual quantity)
func (s *Server) handleForceClosePosition(c *gin.Context) {
	_, traderID, err := s.getTraderFromQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	traderInstance, err := s.traderManager.GetTrader(traderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// Parse request body
	var req struct {
		Symbol   string  `json:"symbol" binding:"required"`
		Side     string  `json:"side" binding:"required"`
		Quantity float64 `json:"quantity"` // Optional: if 0, close all
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("invalid request: %v", err),
		})
		return
	}

	// Validate side
	if req.Side != "long" && req.Side != "short" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "side must be 'long' or 'short'",
		})
		return
	}

	log.Printf("🔄 Force-closing position: %s %s [%s] (quantity: %.8f)", req.Symbol, req.Side, traderInstance.GetName(), req.Quantity)

	// Get the underlying trader interface
	traderInterface := traderInstance.GetTrader()

	// Get position info BEFORE closing (for logging)
	var positionInfo map[string]interface{}
	positions, err := traderInterface.GetPositions()
	if err == nil {
		log.Printf("📊 Current positions before force-close (%d total):", len(positions))
		for i, pos := range positions {
			log.Printf("  Position %d: %s %s (amt: %.8f)", i+1, pos["symbol"], pos["side"], pos["positionAmt"])
			posSymbol, _ := pos["symbol"].(string)
			posSide, _ := pos["side"].(string)
			if posSymbol == req.Symbol && strings.ToLower(posSide) == req.Side {
				positionInfo = pos
			}
		}
	}

	// Get current market price for logging
	closePrice := 0.0
	if marketData, err := market.Get(req.Symbol); err == nil {
		closePrice = marketData.CurrentPrice
	}

	// Close position
	var result map[string]interface{}
	quantity := req.Quantity
	if quantity == 0 {
		quantity = 0 // Close all
	}

	if req.Side == "long" {
		result, err = traderInterface.CloseLong(req.Symbol, quantity)
	} else {
		result, err = traderInterface.CloseShort(req.Symbol, quantity)
	}

	if err != nil {
		log.Printf("❌ Failed to force-close position %s %s [%s]: %v", req.Symbol, req.Side, traderInstance.GetName(), err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to force-close position: %v", err),
		})
		return
	}

	// If close price wasn't retrieved from market, try to get it from result
	if closePrice == 0 {
		if price, ok := result["price"].(float64); ok {
			closePrice = price
		} else if avgPrice, ok := result["avgPrice"].(float64); ok {
			closePrice = avgPrice
		}
	}

	// Log the manual close
	if closePrice > 0 {
		s.logManualClose(traderInstance, req.Symbol, req.Side, closePrice, positionInfo)
	}

	log.Printf("✓ Successfully force-closed position: %s %s [%s]", req.Symbol, req.Side, traderInstance.GetName())
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"symbol":  req.Symbol,
		"side":    req.Side,
		"result":  result,
	})
}

// Start starts the server
func (s *Server) Start() error {
	addr := fmt.Sprintf(":%d", s.port)
	log.Printf("🌐 API server started at http://localhost%s", addr)
	log.Printf("📊 API Documentation:")
	log.Printf("  • GET  /api/competition      - Competition overview (compare all traders)")
	log.Printf("  • GET  /api/traders          - Trader list")
	log.Printf("  • GET  /api/status?trader_id=xxx     - Get specific trader's system status")
	log.Printf("  • GET  /api/account?trader_id=xxx    - Get specific trader's account info")
	log.Printf("  • GET  /api/positions?trader_id=xxx  - Get specific trader's position list")
	log.Printf("  • GET  /api/decisions?trader_id=xxx  - Get specific trader's decision logs")
	log.Printf("  • GET  /api/decisions/latest?trader_id=xxx - Get specific trader's latest decision")
	log.Printf("  • GET  /api/statistics?trader_id=xxx - Get specific trader's statistics")
	log.Printf("  • GET  /api/equity-history?trader_id=xxx - Get specific trader's equity history")
	log.Printf("  • GET  /api/performance?trader_id=xxx - Get specific trader's AI learning performance")
	log.Printf("  • GET  /api/trading-signal?model=xxx - Get latest trading signal by AI model")
	log.Printf("  • GET  /api/trading-signal?trader_id=xxx - Get latest trading signal by trader ID")
	log.Printf("  • POST /api/positions/close?trader_id=xxx - Close a position (body: {symbol, side})")
	log.Printf("  • POST /api/positions/force-close?trader_id=xxx - Force close a position (body: {symbol, side, quantity?})")
	log.Printf("  • GET  /health               - Health check")
	log.Println()

	return s.router.Run(addr)
}
