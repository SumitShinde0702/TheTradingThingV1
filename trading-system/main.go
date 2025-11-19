package main

import (
	"fmt"
	"lia/api"
	"lia/config"
	"lia/manager"
	"lia/pool"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"github.com/joho/godotenv"
)

func main() {
	fmt.Println("╔════════════════════════════════════════════════════════════╗")
	fmt.Println("║    🤖 AI-Driven Cryptocurrency Trading System             ║")
	fmt.Println("║              OpenAI vs Qwen Competition                    ║")
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
	fmt.Println()

	// Load .env if present (silently ignore if missing)
	if err := godotenv.Load(); err != nil {
		if os.IsNotExist(err) {
			log.Printf("ℹ️  No .env file found, continuing with OS environment variables")
		} else {
			log.Printf("⚠️  Failed to load .env file: %v", err)
		}
	}

	// Load configuration file
	configFile := "config.json"
	if len(os.Args) > 1 {
		configFile = os.Args[1]
	}

	log.Printf("📋 Loading configuration file: %s", configFile)
	cfg, err := config.LoadConfig(configFile)
	if err != nil {
		log.Fatalf("❌ Failed to load configuration: %v", err)
	}

	// Override API server port with Render's PORT environment variable if set
	if renderPort := os.Getenv("PORT"); renderPort != "" {
		if portNum, err := strconv.Atoi(renderPort); err == nil {
			cfg.APIServerPort = portNum
			log.Printf("✓ Using PORT from environment: %d", portNum)
		}
	}

	log.Printf("✓ Configuration loaded successfully, %d traders participating", len(cfg.Traders))
	fmt.Println()

	// Set default coin list
	pool.SetDefaultCoins(cfg.DefaultCoins)

	// Set whether to use default coins
	pool.SetUseDefaultCoins(cfg.UseDefaultCoins)
	if cfg.UseDefaultCoins {
		log.Printf("✓ Default coin list enabled (%d coins): %v", len(cfg.DefaultCoins), cfg.DefaultCoins)
	}

	// Set coin pool API URL
	if cfg.CoinPoolAPIURL != "" {
		pool.SetCoinPoolAPI(cfg.CoinPoolAPIURL)
		log.Printf("✓ AI500 coin pool API configured")
	}
	if cfg.OITopAPIURL != "" {
		pool.SetOITopAPI(cfg.OITopAPIURL)
		log.Printf("✓ OI Top API configured")
	}

	// Create TraderManager
	traderManager := manager.NewTraderManager()

	// Add all enabled traders
	enabledCount := 0
	for i, traderCfg := range cfg.Traders {
		// Skip disabled traders
		if !traderCfg.Enabled {
			log.Printf("⏭️  [%d/%d] Skipping disabled trader: %s", i+1, len(cfg.Traders), traderCfg.Name)
			continue
		}

		enabledCount++
		log.Printf("📦 [%d/%d] Initializing %s (%s model)...",
			i+1, len(cfg.Traders), traderCfg.Name, strings.ToUpper(traderCfg.AIModel))

		err := traderManager.AddTrader(
			traderCfg,
			cfg.CoinPoolAPIURL,
			cfg.MaxDailyLoss,
			cfg.MaxDrawdown,
			cfg.StopTradingMinutes,
			cfg.Leverage, // Pass leverage configuration
			cfg,          // Pass global config for Supabase settings
		)
		if err != nil {
			log.Fatalf("❌ Failed to initialize trader: %v", err)
		}
	}

	// Check if at least one trader is enabled
	if enabledCount == 0 {
		log.Fatalf("❌ No enabled traders found, please set at least one trader's enabled=true in config.json")
	}

	fmt.Println()
	fmt.Println("🏁 Competition Participants:")
	for _, traderCfg := range cfg.Traders {
		// Only show enabled traders
		if !traderCfg.Enabled {
			continue
		}
		fmt.Printf("  • %s (%s) - Initial Balance: %.0f USDT\n",
			traderCfg.Name, strings.ToUpper(traderCfg.AIModel), traderCfg.InitialBalance)
	}

	fmt.Println()
	fmt.Println("🤖 AI Full Decision Mode:")
	fmt.Printf("  • AI will autonomously decide leverage for each trade (max %dx for altcoins, %dx for BTC/ETH)\n",
		cfg.Leverage.AltcoinLeverage, cfg.Leverage.BTCETHLeverage)
	fmt.Println("  • AI will autonomously decide position size for each trade")
	fmt.Println("  • AI will autonomously set stop loss and take profit prices")
	fmt.Println("  • AI will make comprehensive analysis based on market data, technical indicators, and account status")
	fmt.Println()
	fmt.Println("⚠️  Risk Warning: AI automated trading has risks, recommend testing with small funds!")
	fmt.Println()
	fmt.Println("Press Ctrl+C to stop")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println()

	// Create and start API server
	apiServer := api.NewServer(traderManager, cfg.APIServerPort)
	go func() {
		if err := apiServer.Start(); err != nil {
			log.Printf("❌ API server error: %v", err)
		}
	}()

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start all traders
	traderManager.StartAll()

	// Wait for shutdown signal
	<-sigChan
	fmt.Println()
	fmt.Println()
	log.Println("📛 Received shutdown signal, stopping all traders...")
	traderManager.StopAll()

	fmt.Println()
	fmt.Println("👋 Thank you for using the AI Automated Traders System!")
}
