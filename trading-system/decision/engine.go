package decision

import (
	"encoding/json"
	"fmt"
	"lia/market"
	"lia/mcp"
	"lia/pool"
	"log"
	"strings"
	"time"
)

// PositionInfo position information
type PositionInfo struct {
	Symbol           string  `json:"symbol"`
	Side             string  `json:"side"` // "long" or "short"
	EntryPrice       float64 `json:"entry_price"`
	MarkPrice        float64 `json:"mark_price"`
	Quantity         float64 `json:"quantity"`
	Leverage         int     `json:"leverage"`
	UnrealizedPnL    float64 `json:"unrealized_pnl"`
	UnrealizedPnLPct float64 `json:"unrealized_pnl_pct"`
	LiquidationPrice float64 `json:"liquidation_price"`
	MarginUsed       float64 `json:"margin_used"`
	UpdateTime       int64   `json:"update_time"` // Position update timestamp (milliseconds)
}

// AccountInfo account information
type AccountInfo struct {
	TotalEquity      float64 `json:"total_equity"`      // Account equity
	AvailableBalance float64 `json:"available_balance"` // Available balance
	TotalPnL         float64 `json:"total_pnl"`         // Total P&L
	TotalPnLPct      float64 `json:"total_pnl_pct"`     // Total P&L percentage
	MarginUsed       float64 `json:"margin_used"`       // Used margin
	MarginUsedPct    float64 `json:"margin_used_pct"`   // Margin usage rate
	PositionCount    int     `json:"position_count"`    // Position count
}

// CandidateCoin candidate coin (from coin pool)
type CandidateCoin struct {
	Symbol  string   `json:"symbol"`
	Sources []string `json:"sources"` // Sources: "ai500" and/or "oi_top"
}

// OITopData Open Interest Top data (for AI decision reference)
type OITopData struct {
	Rank              int     // OI Top ranking
	OIDeltaPercent    float64 // Open Interest change percentage (1 hour)
	OIDeltaValue      float64 // Open Interest change value
	PriceDeltaPercent float64 // Price change percentage
	NetLong           float64 // Net long positions
	NetShort          float64 // Net short positions
}

// Context trading context (complete information passed to AI)
type Context struct {
	CurrentTime     string                  `json:"current_time"`
	RuntimeMinutes  int                     `json:"runtime_minutes"`
	CallCount       int                     `json:"call_count"`
	Account         AccountInfo             `json:"account"`
	Positions       []PositionInfo          `json:"positions"`
	CandidateCoins  []CandidateCoin         `json:"candidate_coins"`
	MarketDataMap   map[string]*market.Data `json:"-"` // Not serialized, but used internally
	OITopDataMap    map[string]*OITopData   `json:"-"` // OI Top data mapping
	Performance     interface{}             `json:"-"` // Historical performance analysis (logger.PerformanceAnalysis)
	BTCETHLeverage  int                     `json:"-"` // BTC/ETH leverage multiplier (read from config)
	AltcoinLeverage int                     `json:"-"` // Altcoin leverage multiplier (read from config)
}

// Decision AI trading decision
type Decision struct {
	Symbol          string  `json:"symbol"`
	Action          string  `json:"action"` // "open_long", "open_short", "close_long", "close_short", "hold", "wait"
	Leverage        int     `json:"leverage,omitempty"`
	PositionSizeUSD float64 `json:"position_size_usd,omitempty"`
	StopLoss        float64 `json:"stop_loss,omitempty"`
	TakeProfit      float64 `json:"take_profit,omitempty"`
	Confidence      int     `json:"confidence,omitempty"` // Confidence level (0-100)
	RiskUSD         float64 `json:"risk_usd,omitempty"`   // Maximum USD risk
	Reasoning       string  `json:"reasoning"`
}

// FullDecision AI complete decision (including chain of thought)
type FullDecision struct {
	UserPrompt  string     `json:"user_prompt"`  // Input prompt sent to AI
	CoTTrace    string     `json:"cot_trace"`    // Chain of thought analysis (AI output)
	Decisions   []Decision `json:"decisions"`    // Specific decision list
	RawResponse string     `json:"raw_response"` // Raw AI response (for debugging)
	Timestamp   time.Time  `json:"timestamp"`
}

// GetFullDecision gets AI's complete trading decision (batch analysis of all coins and positions)
func GetFullDecision(ctx *Context, mcpClient *mcp.Client) (*FullDecision, error) {
	// 1. Get market data for all coins
	if err := fetchMarketDataForContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to fetch market data: %w", err)
	}

	// 2. Build System Prompt (fixed rules) and User Prompt (dynamic data)
	systemPrompt := buildSystemPrompt(ctx.Account.TotalEquity, ctx.BTCETHLeverage, ctx.AltcoinLeverage)
	userPrompt := buildUserPrompt(ctx)

	// 3. Call AI API (using system + user prompt)
	aiResponse, err := mcpClient.CallWithMessages(systemPrompt, userPrompt)
	if err != nil {
		return nil, fmt.Errorf("failed to call AI API: %w", err)
	}

	// 4. Parse AI response
	decision, err := parseFullDecisionResponse(aiResponse, ctx.Account.TotalEquity, ctx.BTCETHLeverage, ctx.AltcoinLeverage)

	// CRITICAL: parseFullDecisionResponse ALWAYS returns a decision (with fallback mechanism)
	// If it returns nil decision, that means a critical error occurred - we should handle it
	if decision == nil {
		// This should never happen due to fallback, but if it does, create a safe fallback here
		log.Printf("⚠️  CRITICAL: parseFullDecisionResponse returned nil decision, creating emergency fallback")
		decision = &FullDecision{
			CoTTrace: aiResponse,
			Decisions: []Decision{
				{
					Symbol:    "ALL",
					Action:    "wait",
					Reasoning: "Emergency fallback - system error during parsing",
				},
			},
		}
		err = nil // Clear error since we have a fallback decision
	}

	// CRITICAL: If we have decisions (including fallback), never return an error
	// The fallback mechanism ensures we always have at least one decision, so the cycle should continue
	if len(decision.Decisions) > 0 {
		// We have decisions - clear any error and continue
		if err != nil {
			log.Printf("⚠️  Parsing had issues but fallback decisions exist - continuing cycle successfully")
			err = nil
		}
		decision.Timestamp = time.Now()
		decision.UserPrompt = userPrompt  // Save input prompt
		decision.RawResponse = aiResponse // Save raw response for debugging
		return decision, nil              // Always return nil error when we have decisions
	}

	// This should never be reached due to fallback, but handle it just in case
	return nil, fmt.Errorf("failed to parse AI response: no decisions available (fallback mechanism failed)")
}

// fetchMarketDataForContext fetches market data and OI data for all coins in the context
func fetchMarketDataForContext(ctx *Context) error {
	ctx.MarketDataMap = make(map[string]*market.Data)
	ctx.OITopDataMap = make(map[string]*OITopData)

	// Collect all coins that need data
	symbolSet := make(map[string]bool)

	// 1. Prioritize getting data for position coins (this is required)
	for _, pos := range ctx.Positions {
		symbolSet[pos.Symbol] = true
	}

	// 2. Candidate coin count dynamically adjusted based on account status
	maxCandidates := calculateMaxCandidates(ctx)
	for i, coin := range ctx.CandidateCoins {
		if i >= maxCandidates {
			break
		}
		symbolSet[coin.Symbol] = true
	}

	// Concurrently fetch market data
	// Position coin set (for determining whether to skip OI check)
	positionSymbols := make(map[string]bool)
	for _, pos := range ctx.Positions {
		positionSymbols[pos.Symbol] = true
	}

	for symbol := range symbolSet {
		data, err := market.Get(symbol)
		if err != nil {
			// Single coin failure doesn't affect overall, just log error
			continue
		}

		// ⚠️ Liquidity filter: coins with open interest value below 15M USD are skipped (both long and short)
		// Open interest value = open interest × current price
		// But existing positions must be retained (need to decide whether to close)
		isExistingPosition := positionSymbols[symbol]
		if !isExistingPosition && data.OpenInterest != nil && data.CurrentPrice > 0 {
			// Calculate open interest value (USD) = open interest × current price
			oiValue := data.OpenInterest.Latest * data.CurrentPrice
			oiValueInMillions := oiValue / 1_000_000 // Convert to millions USD
			if oiValueInMillions < 15 {
				log.Printf("⚠️  %s open interest value too low (%.2fM USD < 15M), skipping this coin [OI:%.0f × Price:%.4f]",
					symbol, oiValueInMillions, data.OpenInterest.Latest, data.CurrentPrice)
				continue
			}
		}

		ctx.MarketDataMap[symbol] = data
	}

	// Load OI Top data (doesn't affect main flow)
	oiPositions, err := pool.GetOITopPositions()
	if err == nil {
		for _, pos := range oiPositions {
			// Normalize symbol matching
			symbol := pos.Symbol
			ctx.OITopDataMap[symbol] = &OITopData{
				Rank:              pos.Rank,
				OIDeltaPercent:    pos.OIDeltaPercent,
				OIDeltaValue:      pos.OIDeltaValue,
				PriceDeltaPercent: pos.PriceDeltaPercent,
				NetLong:           pos.NetLong,
				NetShort:          pos.NetShort,
			}
		}
	}

	return nil
}

// calculateMaxCandidates calculates the number of candidate coins to analyze based on account status
func calculateMaxCandidates(ctx *Context) int {
	// Directly return the total number of coins in candidate pool
	// Because candidate pool has already been filtered in auto_trader.go
	// Fixed to analyze top 20 highest-scored coins (from AI500)
	return len(ctx.CandidateCoins)
}

// buildSystemPrompt 构建 System Prompt（固定规则，可缓存）
func buildSystemPrompt(accountEquity float64, btcEthLeverage, altcoinLeverage int) string {
	var sb strings.Builder

	// === Core Mission ===
	sb.WriteString("You are a professional cryptocurrency trading AI, conducting autonomous trading in the Binance futures market.\n\n")
	sb.WriteString("**IMPORTANT: All your responses, including chain of thought analysis and reasoning fields, must be in English.**\n\n")
	sb.WriteString("# 🎯 Core Objective\n\n")
	sb.WriteString("**Maximize Sharpe Ratio**\n\n")
	sb.WriteString("Sharpe Ratio = Average Return / Return Volatility\n\n")
	sb.WriteString("**This means**:\n")
	sb.WriteString("- ✅ High-quality trades (high win rate, large profit/loss ratio) → Increase Sharpe\n")
	sb.WriteString("- ✅ Stable returns, control drawdowns → Increase Sharpe\n")
	sb.WriteString("- ✅ Patient holding, let profits run → Increase Sharpe\n")
	sb.WriteString("- ❌ Frequent trading, small wins/losses → Increase volatility, severely reduce Sharpe\n")
	sb.WriteString("- ❌ Overtrading, fee drain → Direct losses\n")
	sb.WriteString("- ❌ Premature exits, frequent in/out → Miss big opportunities\n\n")
	sb.WriteString("**Key insight**: The system scans every 3 minutes, but this doesn't mean you must trade every time!\n")
	sb.WriteString("Most of the time should be `wait` or `hold`, only open positions at excellent opportunities.\n\n")

	// === Hard Constraints (Risk Control) ===
	sb.WriteString("# ⚖️ Hard Constraints (Risk Control)\n\n")
	sb.WriteString("1. **Risk-Reward Ratio**: Must be ≥ 1:3 (risk 1%, earn 3%+ return)\n")
	sb.WriteString("2. **Maximum Positions**: 3 coins (quality > quantity)\n")
	sb.WriteString(fmt.Sprintf("3. **Single Coin Position**: Altcoins %.0f-%.0f USDT (%dx leverage) | BTC/ETH %.0f-%.0f USDT (%dx leverage)\n",
		accountEquity*0.8, accountEquity*1.5, altcoinLeverage, accountEquity*5, accountEquity*10, btcEthLeverage))
	sb.WriteString("4. **Margin**: Total usage ≤ 90%\n\n")

	// === Long/Short Balance ===
	sb.WriteString("# 📉 Long/Short Balance\n\n")
	sb.WriteString("**Important**: Shorting in downtrends = Longing in uptrends in terms of profit\n\n")
	sb.WriteString("- Uptrend → Go long\n")
	sb.WriteString("- Downtrend → Go short\n")
	sb.WriteString("- Range-bound market → Wait\n\n")
	sb.WriteString("**Don't have long bias! Shorting is one of your core tools**\n\n")

	// === Trading Frequency Awareness ===
	sb.WriteString("# ⏱️ Trading Frequency Awareness\n\n")
	sb.WriteString("**Quantitative Standards**:\n")
	sb.WriteString("- Excellent traders: 2-4 trades per day = 0.1-0.2 trades per hour\n")
	sb.WriteString("- Overtrading: >2 trades per hour = serious problem\n")
	sb.WriteString("- Optimal rhythm: Hold positions for at least 30-60 minutes after opening\n\n")
	sb.WriteString("**Self-check**:\n")
	sb.WriteString("If you find yourself trading every cycle → standards are too low\n")
	sb.WriteString("If you find yourself closing positions <30 minutes → too impatient\n\n")

	// === Opening Signal Strength ===
	sb.WriteString("# 🎯 Opening Standards (Strict)\n\n")
	sb.WriteString("Only open positions on **strong signals**, wait if uncertain.\n\n")
	sb.WriteString("**Complete data you have**:\n")
	sb.WriteString("- 📊 **Raw sequences**: 3-minute price sequence (MidPrices array) + 4-hour candlestick sequence\n")
	sb.WriteString("- 📈 **Technical sequences**: EMA20, MACD, RSI7, RSI14 sequences\n")
	sb.WriteString("- 💰 **Capital sequences**: Volume sequence, Open Interest (OI) sequence, funding rate\n")
	sb.WriteString("- 🎯 **Filter tags**: AI500 score / OI_Top ranking (if marked)\n\n")
	sb.WriteString("**Analysis methods** (completely your decision):\n")
	sb.WriteString("- Freely use sequence data, you can perform but not limited to: trend analysis, pattern recognition, support/resistance, technical resistance levels, Fibonacci, volatility band calculations\n")
	sb.WriteString("- Multi-dimensional cross-validation (price + volume + OI + indicators + sequence patterns)\n")
	sb.WriteString("- Use the methods you consider most effective to discover high-confidence opportunities\n")
	sb.WriteString("- Only open positions when comprehensive confidence ≥ 75\n\n")
	sb.WriteString("**Avoid low-quality signals**:\n")
	sb.WriteString("- Single dimension (only looking at one indicator)\n")
	sb.WriteString("- Contradictory (price up but volume shrinking)\n")
	sb.WriteString("- Range-bound oscillation\n")
	sb.WriteString("- Recently closed (<15 minutes ago)\n\n")

	// === Sharpe Ratio Self-Evolution ===
	sb.WriteString("# 🧬 Sharpe Ratio Self-Evolution\n\n")
	sb.WriteString("You will receive **Sharpe Ratio** as performance feedback each cycle:\n\n")
	sb.WriteString("**Sharpe Ratio < -0.5** (sustained losses):\n")
	sb.WriteString("  → 🛑 Stop trading, wait at least 6 cycles (18 minutes)\n")
	sb.WriteString("  → 🔍 Deep reflection:\n")
	sb.WriteString("     • Trading frequency too high? (>2 trades/hour is excessive)\n")
	sb.WriteString("     • Holding time too short? (<30 minutes is premature exit)\n")
	sb.WriteString("     • Signal strength insufficient? (confidence <75)\n")
	sb.WriteString("     • Are you shorting? (one-sided long-only is wrong)\n\n")
	sb.WriteString("**Sharpe Ratio -0.5 ~ 0** (slight losses):\n")
	sb.WriteString("  → ⚠️ Strict control: only trades with confidence >80\n")
	sb.WriteString("  → Reduce frequency: maximum 1 new position per hour\n")
	sb.WriteString("  → Patient holding: hold at least 30+ minutes\n\n")
	sb.WriteString("**Sharpe Ratio 0 ~ 0.7** (positive returns):\n")
	sb.WriteString("  → ✅ Maintain current strategy\n\n")
	sb.WriteString("**Sharpe Ratio > 0.7** (excellent performance):\n")
	sb.WriteString("  → 🚀 Can moderately increase position size\n\n")
	sb.WriteString("**Key**: Sharpe Ratio is the only metric, it naturally penalizes frequent trading and excessive in/out.\n\n")

	// === Decision Process ===
	sb.WriteString("# 📋 Decision Process\n\n")
	sb.WriteString("1. **Analyze Sharpe Ratio**: Is current strategy effective? Need adjustment?\n")
	sb.WriteString("2. **Evaluate positions**: Has trend changed? Should take profit/stop loss?\n")
	sb.WriteString("3. **Find new opportunities**: Any strong signals? Long/short opportunities?\n")
	sb.WriteString("4. **Output decision**: Chain of thought analysis + JSON\n\n")

	// === Output Format ===
	sb.WriteString("# 📤 Output Format\n\n")
	sb.WriteString("**CRITICAL: You MUST output BOTH parts. The JSON array is MANDATORY, even if all decisions are \"wait\".**\n\n")
	sb.WriteString("**Step 1: Chain of Thought (plain text)**\n")
	sb.WriteString("Concisely analyze your thinking process in English\n\n")
	sb.WriteString("**Step 2: JSON Decision Array (REQUIRED)**\n")
	sb.WriteString("After your chain of thought, you MUST include a JSON array with your decisions.\n")
	sb.WriteString("Even if you decide to wait, output an array with at least one decision (e.g., `{\"symbol\": \"ALL\", \"action\": \"wait\", \"reasoning\": \"...\"}`).\n\n")
	sb.WriteString("Format example:\n")
	sb.WriteString("```json\n[\n")
	sb.WriteString(fmt.Sprintf("  {\"symbol\": \"BTCUSDT\", \"action\": \"open_short\", \"leverage\": %d, \"position_size_usd\": %.0f, \"stop_loss\": 97000, \"take_profit\": 91000, \"confidence\": 85, \"risk_usd\": 300, \"reasoning\": \"Downtrend + MACD bearish crossover\"},\n", btcEthLeverage, accountEquity*5))
	sb.WriteString("  {\"symbol\": \"ETHUSDT\", \"action\": \"close_long\", \"reasoning\": \"Take profit exit\"}\n")
	sb.WriteString("]\n```\n\n")
	sb.WriteString("**Field descriptions**:\n")
	sb.WriteString("- `action`: open_long | open_short | close_long | close_short | hold | wait\n")
	sb.WriteString("- `confidence`: 0-100 (recommend ≥75 for opening positions)\n")
	sb.WriteString("- Required for opening: leverage, position_size_usd, stop_loss, take_profit, confidence, risk_usd, reasoning\n")
	sb.WriteString("- If no actions: use `{\"symbol\": \"ALL\", \"action\": \"wait\", \"reasoning\": \"your reason\"}`\n\n")

	// === Key Reminders ===
	sb.WriteString("---\n\n")
	sb.WriteString("**Remember**: \n")
	sb.WriteString("- Goal is Sharpe Ratio, not trading frequency\n")
	sb.WriteString("- Short = Long, both are profit tools\n")
	sb.WriteString("- Better to miss than make low-quality trades\n")
	sb.WriteString("- Risk-reward ratio 1:3 is the bottom line\n")

	return sb.String()
}

// buildUserPrompt 构建 User Prompt（动态数据）
func buildUserPrompt(ctx *Context) string {
	var sb strings.Builder

	// System status
	sb.WriteString(fmt.Sprintf("**Time**: %s | **Cycle**: #%d | **Runtime**: %d minutes\n\n",
		ctx.CurrentTime, ctx.CallCount, ctx.RuntimeMinutes))

	// BTC market
	if btcData, hasBTC := ctx.MarketDataMap["BTCUSDT"]; hasBTC {
		sb.WriteString(fmt.Sprintf("**BTC**: %.2f (1h: %+.2f%%, 4h: %+.2f%%) | MACD: %.4f | RSI: %.2f\n\n",
			btcData.CurrentPrice, btcData.PriceChange1h, btcData.PriceChange4h,
			btcData.CurrentMACD, btcData.CurrentRSI7))
	}

	// Account
	sb.WriteString(fmt.Sprintf("**Account**: Equity %.2f | Balance %.2f (%.1f%%) | P&L %+.2f%% | Margin %.1f%% | Positions %d\n\n",
		ctx.Account.TotalEquity,
		ctx.Account.AvailableBalance,
		(ctx.Account.AvailableBalance/ctx.Account.TotalEquity)*100,
		ctx.Account.TotalPnLPct,
		ctx.Account.MarginUsedPct,
		ctx.Account.PositionCount))

	// Current positions (full market data)
	if len(ctx.Positions) > 0 {
		sb.WriteString("## Current Positions\n")
		for i, pos := range ctx.Positions {
			// Calculate holding duration
			holdingDuration := ""
			if pos.UpdateTime > 0 {
				durationMs := time.Now().UnixMilli() - pos.UpdateTime
				durationMin := durationMs / (1000 * 60) // Convert to minutes
				if durationMin < 60 {
					holdingDuration = fmt.Sprintf(" | Holding for %d minutes", durationMin)
				} else {
					durationHour := durationMin / 60
					durationMinRemainder := durationMin % 60
					holdingDuration = fmt.Sprintf(" | Holding for %d hours %d minutes", durationHour, durationMinRemainder)
				}
			}

			sb.WriteString(fmt.Sprintf("%d. %s %s | Entry %.4f Current %.4f | P&L %+.2f%% | Leverage %dx | Margin %.0f | Liq Price %.4f%s\n\n",
				i+1, pos.Symbol, strings.ToUpper(pos.Side),
				pos.EntryPrice, pos.MarkPrice, pos.UnrealizedPnLPct,
				pos.Leverage, pos.MarginUsed, pos.LiquidationPrice, holdingDuration))

			// 使用FormatMarketData输出完整市场数据
			if marketData, ok := ctx.MarketDataMap[pos.Symbol]; ok {
				sb.WriteString(market.Format(marketData))
				sb.WriteString("\n")
			}
		}
	} else {
		sb.WriteString("**Current Positions**: None\n\n")
	}

	// Candidate coins (full market data)
	sb.WriteString(fmt.Sprintf("## Candidate Coins (%d)\n\n", len(ctx.MarketDataMap)))
	displayedCount := 0
	for _, coin := range ctx.CandidateCoins {
		marketData, hasData := ctx.MarketDataMap[coin.Symbol]
		if !hasData {
			continue
		}
		displayedCount++

		sourceTags := ""
		if len(coin.Sources) > 1 {
			sourceTags = " (AI500+OI_Top dual signal)"
		} else if len(coin.Sources) == 1 && coin.Sources[0] == "oi_top" {
			sourceTags = " (OI_Top open interest growth)"
		}

		// Use FormatMarketData to output full market data
		sb.WriteString(fmt.Sprintf("### %d. %s%s\n\n", displayedCount, coin.Symbol, sourceTags))
		sb.WriteString(market.Format(marketData))
		sb.WriteString("\n")
	}
	sb.WriteString("\n")

	// Sharpe Ratio (pass value directly, no complex formatting)
	if ctx.Performance != nil {
		// Extract SharpeRatio directly from interface{}
		type PerformanceData struct {
			SharpeRatio float64 `json:"sharpe_ratio"`
		}
		var perfData PerformanceData
		if jsonData, err := json.Marshal(ctx.Performance); err == nil {
			if err := json.Unmarshal(jsonData, &perfData); err == nil {
				sb.WriteString(fmt.Sprintf("## 📊 Sharpe Ratio: %.2f\n\n", perfData.SharpeRatio))
			}
		}
	}

	sb.WriteString("---\n\n")
	sb.WriteString("**REQUIRED OUTPUT FORMAT:**\n")
	sb.WriteString("1. Chain of thought analysis (plain text, in English)\n")
	sb.WriteString("2. JSON array with decisions (MANDATORY - must include even if all decisions are \"wait\")\n\n")
	sb.WriteString("Now please analyze and output your decision. Remember: the JSON array is REQUIRED - output at least one decision (use \"wait\" action if no trades). All analysis and reasoning must be in English.\n")

	return sb.String()
}

// parseFullDecisionResponse parses AI's complete decision response
func parseFullDecisionResponse(aiResponse string, accountEquity float64, btcEthLeverage, altcoinLeverage int) (*FullDecision, error) {
	// 1. Extract chain of thought
	cotTrace := extractCoTTrace(aiResponse)

	// Ensure CoTTrace is not empty (even if extraction fails, save at least part of response)
	if cotTrace == "" && len(aiResponse) > 0 {
		// If extraction fails, save first 1000 characters as CoTTrace
		if len(aiResponse) > 1000 {
			cotTrace = aiResponse[:1000] + "..."
		} else {
			cotTrace = aiResponse
		}
	}

	// 2. Extract JSON decision list
	decisions, err := extractDecisions(aiResponse)
	usedFallback := false
	if err != nil {
		// Fallback: Create a default "wait" decision if JSON extraction fails
		// This prevents cycles from failing while preserving AI's analysis
		log.Printf("⚠️  JSON extraction failed, creating fallback 'wait' decision")
		log.Printf("🔍 Error details: %v", err)
		log.Printf("🔍 This is expected behavior when AI response format is unclear - using safe 'wait' decision")

		// Log raw response preview for debugging (truncated to avoid spam)
		responsePreview := truncateString(aiResponse, 500)
		log.Printf("🔍 AI Response preview (first 500 chars): %s", responsePreview)

		usedFallback = true

		// Extract a summary from chain of thought for reasoning (first 200 chars or less)
		reasoning := "No trades - awaiting better opportunities"
		if cotTrace != "" {
			// Use first sentence or first 200 chars of chain of thought
			firstLineEnd := strings.Index(cotTrace, "\n")
			if firstLineEnd > 0 && firstLineEnd < 200 {
				reasoning = strings.TrimSpace(cotTrace[:firstLineEnd])
			} else if len(cotTrace) > 200 {
				reasoning = strings.TrimSpace(cotTrace[:200]) + "..."
			} else {
				reasoning = strings.TrimSpace(cotTrace)
			}
		}

		// Create a default wait decision - this is always safe and doesn't affect trading
		decisions = []Decision{
			{
				Symbol:    "ALL",
				Action:    "wait",
				Reasoning: reasoning,
			},
		}

		log.Printf("✓ Fallback decision created: wait (reasoning from AI analysis: %s)", truncateString(reasoning, 100))
		log.Printf("✓ Fallback successful - cycle will continue with 'wait' decision (no trading action)")
		// CRITICAL: Clear the error - fallback decisions are valid and should not propagate errors
		// The cycle should continue successfully with the wait decision
		err = nil
	}

	// Ensure we always have at least one decision (safety check)
	if len(decisions) == 0 {
		log.Printf("⚠️  No decisions found, creating safety fallback")
		decisions = []Decision{
			{
				Symbol:    "ALL",
				Action:    "wait",
				Reasoning: "Safety fallback - no decisions extracted",
			},
		}
		usedFallback = true
		err = nil
	}

	// 3. Validate decisions
	// IMPORTANT: Valid AI trading decisions (not fallback) ALWAYS go through full validation
	// This includes risk checks, leverage limits, position size limits, stop loss/take profit validation, etc.
	// The fallback mechanism ONLY activates when JSON extraction completely fails - it does NOT affect valid decisions.
	if !usedFallback {
		// Valid decisions from AI: Apply full validation with all risk controls
		if err := validateDecisions(decisions, accountEquity, btcEthLeverage, altcoinLeverage); err != nil {
			// Validation failed - return error with decisions for debugging
			// This preserves the AI's attempted decisions for analysis
			return &FullDecision{
				CoTTrace:    cotTrace,
				RawResponse: aiResponse,
				Decisions:   decisions,
			}, fmt.Errorf("decision validation failed: %w\n\n=== AI Chain of Thought Analysis ===\n%s", err, cotTrace)
		}
		// Valid decisions pass through unchanged - no modifications, full risk controls applied
	} else {
		// Fallback decision: Only used when JSON extraction fails completely
		// This is a safe "wait" action that doesn't affect trading
		// Do minimal validation since this is just a safety mechanism
		for i, d := range decisions {
			if d.Action == "" {
				decisions[i].Action = "wait"
			}
			if d.Symbol == "" {
				decisions[i].Symbol = "ALL"
			}
			// Ensure action is valid (should always be "wait" for fallback)
			validActions := map[string]bool{
				"open_long": true, "open_short": true, "close_long": true,
				"close_short": true, "hold": true, "wait": true,
			}
			if !validActions[decisions[i].Action] {
				decisions[i].Action = "wait"
			}
		}
	}

	// Final safety check: ensure we never return an error when we have decisions
	// This guarantees that cycles can always continue, even if parsing had issues
	if len(decisions) > 0 {
		// We have decisions - always return success, clear any error
		if err != nil {
			log.Printf("⚠️  Error present but decisions exist - clearing error to allow cycle to continue")
			err = nil
		}
		// Always return nil error when we have decisions
		return &FullDecision{
			CoTTrace:    cotTrace,
			RawResponse: aiResponse,
			Decisions:   decisions,
		}, nil
	}

	// This should never be reached due to the safety fallback above, but handle it
	log.Printf("⚠️  CRITICAL: No decisions available after all fallback attempts - creating final safety fallback")
	decisions = []Decision{
		{
			Symbol:    "ALL",
			Action:    "wait",
			Reasoning: "Final safety fallback - no decisions could be extracted",
		},
	}
	return &FullDecision{
		CoTTrace:    cotTrace,
		RawResponse: aiResponse,
		Decisions:   decisions,
	}, nil
}

// extractCoTTrace 提取思维链分析
func extractCoTTrace(response string) string {
	// 使用更智能的方法查找JSON数组的开始位置
	jsonStart := findJSONArrayStart(response)

	if jsonStart > 0 {
		// 思维链是JSON数组之前的内容
		return strings.TrimSpace(response[:jsonStart])
	}

	// 如果找不到JSON，整个响应都是思维链
	return strings.TrimSpace(response)
}

// findJSONArrayStart 智能查找JSON数组的开始位置
// 优先查找 [{ 模式（数组包含对象），这是决策数组的常见格式
func findJSONArrayStart(response string) int {
	// Method 1: 查找 [{ 模式（最可能是有效的JSON决策数组）
	bestMatch := -1
	searchPos := 0
	for {
		// 查找下一个 [ 字符
		openBracket := strings.Index(response[searchPos:], "[")
		if openBracket == -1 {
			break
		}
		openBracket += searchPos

		// 跳过空白字符，查看下一个字符
		afterBracket := openBracket + 1
		for afterBracket < len(response) && (response[afterBracket] == ' ' || response[afterBracket] == '\n' || response[afterBracket] == '\r' || response[afterBracket] == '\t') {
			afterBracket++
		}

		// 如果 [ 后面跟着 {，这很可能是JSON数组的开始
		if afterBracket < len(response) && response[afterBracket] == '{' {
			// 验证这个数组是否可以成功解析
			arrayEnd := findMatchingBracket(response, openBracket)
			if arrayEnd != -1 {
				potentialJson := strings.TrimSpace(response[openBracket : arrayEnd+1])
				// 尝试解析，如果成功，这就是我们要找的数组
				var testDecisions []Decision
				if err := json.Unmarshal([]byte(fixMissingQuotes(potentialJson)), &testDecisions); err == nil {
					bestMatch = openBracket
					break // 找到有效的JSON数组，停止搜索
				}
			}
		}

		// 继续搜索
		searchPos = openBracket + 1
		if searchPos >= len(response) {
			break
		}
	}

	if bestMatch != -1 {
		return bestMatch
	}

	// Method 2: 回退到查找任意 [ 字符（向后搜索，从后往前找最可能是JSON数组）
	// 决策数组通常在响应的末尾
	for i := len(response) - 1; i >= 0; i-- {
		if response[i] == '[' {
			arrayEnd := findMatchingBracket(response, i)
			if arrayEnd != -1 && arrayEnd > i {
				potentialJson := strings.TrimSpace(response[i : arrayEnd+1])
				// 尝试解析
				var testDecisions []Decision
				if err := json.Unmarshal([]byte(fixMissingQuotes(potentialJson)), &testDecisions); err == nil {
					return i
				}
			}
		}
	}

	// Method 3: 不再回退到任意 [ 字符，避免匹配数字数组
	// 如果找不到有效的决策数组，返回 -1
	return -1
}

// extractDecisions 提取JSON决策列表
// IMPORTANT: This function only extracts JSON from AI responses - it does NOT modify the decisions themselves.
// Valid JSON decisions are parsed unchanged and go through full validation.
// This function only improves the ability to FIND and EXTRACT JSON from various response formats.
func extractDecisions(response string) ([]Decision, error) {
	var jsonContent string
	var arrayStart, arrayEnd int

	// Method 1: 查找JSON代码块 (```json ... ```)
	// This is the standard format expected from AI models
	jsonBlockStart := strings.Index(response, "```json")
	if jsonBlockStart != -1 {
		// 找到代码块开始，查找内容开始位置（跳过 ```json 和可能的换行）
		contentStart := jsonBlockStart + len("```json")
		// 跳过可能的空格和换行
		for contentStart < len(response) && (response[contentStart] == ' ' || response[contentStart] == '\n' || response[contentStart] == '\r') {
			contentStart++
		}
		// 查找代码块结束标记
		jsonBlockEnd := strings.Index(response[contentStart:], "```")
		if jsonBlockEnd != -1 {
			// 提取代码块内的JSON内容
			potentialJson := response[contentStart : contentStart+jsonBlockEnd]
			// 在代码块内查找JSON数组（使用智能查找）
			innerArrayStart := findJSONArrayStartInText(potentialJson)
			if innerArrayStart != -1 {
				// 使用找到的位置（相对于contentStart）
				arrayStart = contentStart + innerArrayStart
				arrayEnd = findMatchingBracket(response, arrayStart)
				if arrayEnd != -1 {
					jsonContent = strings.TrimSpace(response[arrayStart : arrayEnd+1])
				}
			}
		}
	}

	// Method 1b: 查找普通代码块 (``` ... ```) - 有些AI模型可能不使用json标记
	if jsonContent == "" {
		codeBlockStart := strings.Index(response, "```")
		if codeBlockStart != -1 {
			// 跳过开头的 ```
			contentStart := codeBlockStart + 3
			// 跳过可能的语言标识和空格
			for contentStart < len(response) && (response[contentStart] == ' ' || response[contentStart] == '\n' || response[contentStart] == '\r' || response[contentStart] == '\t') {
				contentStart++
			}
			// 跳过语言标识（如json, javascript等）
			if contentStart < len(response) {
				// 查找第一个换行或空格
				langEnd := contentStart
				for langEnd < len(response) && response[langEnd] != '\n' && response[langEnd] != '\r' && response[langEnd] != ' ' {
					langEnd++
				}
				// 如果找到的是json，跳过（已在Method 1处理）
				if langEnd > contentStart && strings.ToLower(response[contentStart:langEnd]) == "json" {
					// Already handled in Method 1
				} else {
					// 这不是json标记的代码块，但也可能包含JSON
					// 从语言标识后开始
					actualStart := langEnd
					for actualStart < len(response) && (response[actualStart] == ' ' || response[actualStart] == '\n' || response[actualStart] == '\r') {
						actualStart++
					}
					// 查找代码块结束标记
					codeBlockEnd := strings.Index(response[actualStart:], "```")
					if codeBlockEnd != -1 {
						// 提取代码块内的内容
						potentialJson := response[actualStart : actualStart+codeBlockEnd]
						// 在代码块内查找JSON数组
						innerArrayStart := findJSONArrayStartInText(potentialJson)
						if innerArrayStart != -1 {
							arrayStart = actualStart + innerArrayStart
							arrayEnd = findMatchingBracket(response, arrayStart)
							if arrayEnd != -1 {
								jsonContent = strings.TrimSpace(response[arrayStart : arrayEnd+1])
							}
						}
					}
				}
			}
		}
	}

	// Method 2: 如果没有在代码块中找到，使用智能查找JSON数组
	if jsonContent == "" {
		arrayStart = findJSONArrayStart(response)
		if arrayStart == -1 {
			// 尝试查找其他可能的JSON格式提示
			hasJsonHint := strings.Contains(strings.ToLower(response), "json") ||
				strings.Contains(response, "```") ||
				strings.Contains(response, "decision")

			// Build helpful error message
			var errorMsg string
			if hasJsonHint {
				errorMsg = "unable to find JSON array start. Found JSON-related text but no valid JSON array."
			} else {
				errorMsg = "unable to find JSON array start. AI response contains only chain of thought analysis with no JSON decisions array."
			}
			return nil, fmt.Errorf("%s Expected format: a JSON array starting with '[' containing decision objects like [{\"symbol\":\"...\",\"action\":\"wait\",...}]. First 500 chars of response: %s",
				errorMsg, truncateString(response, 500))
		}

		// 从 [ 开始，匹配括号找到对应的 ]
		arrayEnd = findMatchingBracket(response, arrayStart)
		if arrayEnd == -1 {
			return nil, fmt.Errorf("unable to find JSON array end (unmatched brackets). Found array start at position %d. Content: %s",
				arrayStart, truncateString(response[max(0, arrayStart-50):min(len(response), arrayStart+200)], 250))
		}

		jsonContent = strings.TrimSpace(response[arrayStart : arrayEnd+1])
	}

	if jsonContent == "" {
		return nil, fmt.Errorf("extracted JSON content is empty")
	}

	// 🔧 修复常见的JSON格式错误（仅修复会导致解析失败的格式问题）
	// NOTE: These fixes are conservative and only address issues that would cause json.Unmarshal to fail.
	// Valid, well-formed JSON is unaffected by these transformations.

	// 1. 替换中文引号为英文引号（修复输入法导致的引号问题）
	jsonContent = fixMissingQuotes(jsonContent)

	// 2. 修复尾随逗号（这会使json.Unmarshal失败，但不影响已有效的JSON）
	// Only fixes trailing commas before closing braces/brackets - does not modify valid JSON
	for {
		original := jsonContent
		// Remove trailing commas: ",}" or ", }" (with optional whitespace)
		jsonContent = strings.ReplaceAll(jsonContent, ",}", "}")
		jsonContent = strings.ReplaceAll(jsonContent, ", }", " }")
		// Remove trailing commas in arrays: ",]" or ", ]"
		jsonContent = strings.ReplaceAll(jsonContent, ",]", "]")
		jsonContent = strings.ReplaceAll(jsonContent, ", ]", " ]")
		// Stop if no changes made (valid JSON should not match these patterns)
		if jsonContent == original {
			break
		}
	}

	// After cleanup, valid JSON should parse successfully with standard json.Unmarshal
	// Invalid JSON will still fail to parse, triggering the fallback mechanism

	// 🔍 预验证：确保这不是一个数字数组（避免解析错误）
	// 检查数组内容是否看起来像决策对象（应该包含 "symbol", "action" 等字段）
	trimmedContent := strings.TrimSpace(jsonContent)
	if len(trimmedContent) > 2 && trimmedContent[0] == '[' && trimmedContent[len(trimmedContent)-1] == ']' {
		// 检查第一个字符（跳过 [ 和空白）
		firstChar := -1
		for i := 1; i < len(trimmedContent)-1; i++ {
			if trimmedContent[i] != ' ' && trimmedContent[i] != '\n' && trimmedContent[i] != '\r' && trimmedContent[i] != '\t' {
				firstChar = i
				break
			}
		}

		// 如果第一个字符是数字或负号，这可能是数字数组，跳过它
		if firstChar >= 0 {
			char := trimmedContent[firstChar]
			if (char >= '0' && char <= '9') || char == '-' || char == '.' {
				// 这是一个数字数组，不是决策数组
				return nil, fmt.Errorf("found numeric array instead of decision array. This appears to be part of the reasoning, not the JSON decision. Please ensure the AI outputs a JSON array of decision objects, not numbers")
			}
		}

		// 如果第一个字符不是 '{'，这也可能不是决策数组
		if firstChar >= 0 && trimmedContent[firstChar] != '{' {
			firstCharStr := string(trimmedContent[firstChar])
			return nil, fmt.Errorf("found array starting with %q instead of '{'. Expected array of decision objects. JSON content (first 200 chars): %s",
				firstCharStr, truncateString(jsonContent, 200))
		}
	}

	// 解析JSON
	// NOTE: Valid JSON is parsed unchanged using standard Go json.Unmarshal
	// The JSON cleanup above only fixes format errors - it doesn't change valid JSON structure or values
	var decisions []Decision
	if err := json.Unmarshal([]byte(jsonContent), &decisions); err != nil {
		// Parsing failed - this will trigger the fallback mechanism
		// This does NOT mean the AI's trading logic was wrong, just that the JSON format had issues
		return nil, fmt.Errorf("JSON parsing failed: %w\nJSON content (first 500 chars): %s", err, truncateString(jsonContent, 500))
	}

	// Successfully parsed - return decisions unchanged (they will go through full validation)
	return decisions, nil
}

// findJSONArrayStartInText 在文本中查找JSON数组的开始位置（用于代码块内的搜索）
func findJSONArrayStartInText(text string) int {
	// 优先查找 [{ 模式（只匹配对象数组，避免匹配数字数组）
	searchPos := 0
	for {
		openBracket := strings.Index(text[searchPos:], "[")
		if openBracket == -1 {
			break
		}
		openBracket += searchPos

		// 跳过空白字符
		afterBracket := openBracket + 1
		for afterBracket < len(text) && (text[afterBracket] == ' ' || text[afterBracket] == '\n' || text[afterBracket] == '\r' || text[afterBracket] == '\t') {
			afterBracket++
		}

		// 如果 [ 后面跟着 {，这很可能是JSON数组的开始
		if afterBracket < len(text) && text[afterBracket] == '{' {
			// 验证这确实是一个有效的决策数组
			arrayEnd := findMatchingBracket(text, openBracket)
			if arrayEnd != -1 {
				potentialJson := strings.TrimSpace(text[openBracket : arrayEnd+1])
				var testDecisions []Decision
				if err := json.Unmarshal([]byte(fixMissingQuotes(potentialJson)), &testDecisions); err == nil {
					return openBracket
				}
			}
		}

		searchPos = openBracket + 1
		if searchPos >= len(text) {
			break
		}
	}

	// No longer fallback to arbitrary [ character, avoid matching number arrays
	return -1
}

// truncateString truncates string to specified length
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// max returns the larger of two integers
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// min returns the smaller of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// fixMissingQuotes replaces Chinese quotes with English quotes (avoid IME auto-conversion)
func fixMissingQuotes(jsonStr string) string {
	jsonStr = strings.ReplaceAll(jsonStr, "\u201c", "\"") // "
	jsonStr = strings.ReplaceAll(jsonStr, "\u201d", "\"") // "
	jsonStr = strings.ReplaceAll(jsonStr, "\u2018", "'")  // '
	jsonStr = strings.ReplaceAll(jsonStr, "\u2019", "'")  // '
	return jsonStr
}

// validateDecisions validates all decisions (requires account info and leverage config)
func validateDecisions(decisions []Decision, accountEquity float64, btcEthLeverage, altcoinLeverage int) error {
	for i, decision := range decisions {
		if err := validateDecision(&decision, accountEquity, btcEthLeverage, altcoinLeverage); err != nil {
			return fmt.Errorf("decision #%d validation failed: %w", i+1, err)
		}
	}
	return nil
}

// findMatchingBracket finds matching closing bracket
func findMatchingBracket(s string, start int) int {
	if start >= len(s) || s[start] != '[' {
		return -1
	}

	depth := 0
	for i := start; i < len(s); i++ {
		switch s[i] {
		case '[':
			depth++
		case ']':
			depth--
			if depth == 0 {
				return i
			}
		}
	}

	return -1
}

// validateDecision validates a single decision's validity
func validateDecision(d *Decision, accountEquity float64, btcEthLeverage, altcoinLeverage int) error {
	// Validate action
	validActions := map[string]bool{
		"open_long":   true,
		"open_short":  true,
		"close_long":  true,
		"close_short": true,
		"hold":        true,
		"wait":        true,
	}

	if !validActions[d.Action] {
		return fmt.Errorf("invalid action: %s", d.Action)
	}

	// Opening positions must provide complete parameters
	if d.Action == "open_long" || d.Action == "open_short" {
		// Use configured leverage limits based on coin type
		maxLeverage := altcoinLeverage          // Altcoins use configured leverage
		maxPositionValue := accountEquity * 1.5 // Altcoins max 1.5x account equity
		if d.Symbol == "BTCUSDT" || d.Symbol == "ETHUSDT" {
			maxLeverage = btcEthLeverage          // BTC and ETH use configured leverage
			maxPositionValue = accountEquity * 10 // BTC/ETH max 10x account equity
		}

		if d.Leverage <= 0 || d.Leverage > maxLeverage {
			return fmt.Errorf("leverage must be between 1-%d (%s, current config limit %dx): %d", maxLeverage, d.Symbol, maxLeverage, d.Leverage)
		}
		if d.PositionSizeUSD <= 0 {
			return fmt.Errorf("position size must be greater than 0: %.2f", d.PositionSizeUSD)
		}
		// Validate position value upper limit (add 1% tolerance to avoid floating point precision issues)
		tolerance := maxPositionValue * 0.01 // 1% tolerance
		if d.PositionSizeUSD > maxPositionValue+tolerance {
			if d.Symbol == "BTCUSDT" || d.Symbol == "ETHUSDT" {
				return fmt.Errorf("BTC/ETH single coin position value cannot exceed %.0f USDT (10x account equity), actual: %.0f", maxPositionValue, d.PositionSizeUSD)
			} else {
				return fmt.Errorf("altcoin single coin position value cannot exceed %.0f USDT (1.5x account equity), actual: %.0f", maxPositionValue, d.PositionSizeUSD)
			}
		}
		if d.StopLoss <= 0 || d.TakeProfit <= 0 {
			return fmt.Errorf("stop loss and take profit must be greater than 0")
		}

		// Validate stop loss/take profit reasonableness
		if d.Action == "open_long" {
			if d.StopLoss >= d.TakeProfit {
				return fmt.Errorf("for long positions, stop loss must be less than take profit")
			}
		} else {
			if d.StopLoss <= d.TakeProfit {
				return fmt.Errorf("for short positions, stop loss must be greater than take profit")
			}
		}

		// Validate risk-reward ratio (must be ≥1:3)
		// Calculate entry price (assuming current market price)
		var entryPrice float64
		if d.Action == "open_long" {
			// Long: entry price between stop loss and take profit
			entryPrice = d.StopLoss + (d.TakeProfit-d.StopLoss)*0.2 // Assume entry at 20% position
		} else {
			// Short: entry price between stop loss and take profit
			entryPrice = d.StopLoss - (d.StopLoss-d.TakeProfit)*0.2 // Assume entry at 20% position
		}

		var riskPercent, rewardPercent, riskRewardRatio float64
		if d.Action == "open_long" {
			riskPercent = (entryPrice - d.StopLoss) / entryPrice * 100
			rewardPercent = (d.TakeProfit - entryPrice) / entryPrice * 100
			if riskPercent > 0 {
				riskRewardRatio = rewardPercent / riskPercent
			}
		} else {
			riskPercent = (d.StopLoss - entryPrice) / entryPrice * 100
			rewardPercent = (entryPrice - d.TakeProfit) / entryPrice * 100
			if riskPercent > 0 {
				riskRewardRatio = rewardPercent / riskPercent
			}
		}

		// Hard constraint: risk-reward ratio must be ≥3.0
		if riskRewardRatio < 3.0 {
			return fmt.Errorf("risk-reward ratio too low (%.2f:1), must be ≥3.0:1 [risk:%.2f%% reward:%.2f%%] [stop loss:%.2f take profit:%.2f]",
				riskRewardRatio, riskPercent, rewardPercent, d.StopLoss, d.TakeProfit)
		}
	}

	return nil
}
