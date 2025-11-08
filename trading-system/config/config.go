package config

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// TraderConfig configuration for a single trader
type TraderConfig struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`  // Whether this trader is enabled
	AIModel string `json:"ai_model"` // "groq", "qwen", "deepseek", or "custom"

	// Exchange selection (choose one)
	Exchange string `json:"exchange"` // "binance" or "hyperliquid"

	// Binance configuration
	BinanceAPIKey    string `json:"binance_api_key,omitempty"`
	BinanceSecretKey string `json:"binance_secret_key,omitempty"`

	// Hyperliquid configuration
	HyperliquidPrivateKey string `json:"hyperliquid_private_key,omitempty"`
	HyperliquidWalletAddr string `json:"hyperliquid_wallet_addr,omitempty"`
	HyperliquidTestnet    bool   `json:"hyperliquid_testnet,omitempty"`

	// Aster configuration
	AsterUser       string `json:"aster_user,omitempty"`        // Aster main wallet address
	AsterSigner     string `json:"aster_signer,omitempty"`      // Aster API wallet address
	AsterPrivateKey string `json:"aster_private_key,omitempty"` // Aster API wallet private key

	// AI configuration
	QwenKey     string `json:"qwen_key,omitempty"`
	DeepSeekKey string `json:"deepseek_key,omitempty"`
	GroqKey     string `json:"groq_key,omitempty"`
	GroqModel   string `json:"groq_model,omitempty"` // Groq model name, e.g., "openai/gpt-4o", "qwen/qwen2.5-72b-instruct"

	// Custom AI API configuration (supports any OpenAI-format API)
	CustomAPIURL    string `json:"custom_api_url,omitempty"`
	CustomAPIKey    string `json:"custom_api_key,omitempty"`
	CustomModelName string `json:"custom_model_name,omitempty"`

	InitialBalance      float64 `json:"initial_balance"`
	ScanIntervalMinutes float64 `json:"scan_interval_minutes"`
}

// LeverageConfig leverage configuration
type LeverageConfig struct {
	BTCETHLeverage  int `json:"btc_eth_leverage"` // Leverage multiplier for BTC and ETH (main account: 5-50 recommended, subaccount: ≤5)
	AltcoinLeverage int `json:"altcoin_leverage"` // Leverage multiplier for altcoins (main account: 5-20 recommended, subaccount: ≤5)
}

// Config main configuration
type Config struct {
	Traders            []TraderConfig `json:"traders"`
	UseDefaultCoins    bool           `json:"use_default_coins"` // Whether to use default mainstream coin list
	DefaultCoins       []string       `json:"default_coins"`     // Default mainstream coin pool
	CoinPoolAPIURL     string         `json:"coin_pool_api_url"`
	OITopAPIURL        string         `json:"oi_top_api_url"`
	APIServerPort      int            `json:"api_server_port"`
	MaxDailyLoss       float64        `json:"max_daily_loss"`
	MaxDrawdown        float64        `json:"max_drawdown"`
	StopTradingMinutes int            `json:"stop_trading_minutes"`
	Leverage           LeverageConfig `json:"leverage"`             // Leverage configuration
	AutoTakeProfitPct  float64        `json:"auto_take_profit_pct"` // Auto close at this P&L % (0 = disabled, 1.0 = 1%)

	// Supabase configuration (optional - for cloud database storage)
	SupabaseURL         string `json:"supabase_url,omitempty"`          // Supabase project URL (e.g., https://xxxxx.supabase.co)
	SupabaseKey         string `json:"supabase_key,omitempty"`          // Supabase API key (anon or service_role)
	SupabaseDatabaseURL string `json:"supabase_database_url,omitempty"` // Direct PostgreSQL connection string (optional, preferred)
	UseSupabase         bool   `json:"use_supabase,omitempty"`          // Enable Supabase instead of SQLite
	SupabaseSchema      string `json:"supabase_schema,omitempty"`       // Database schema name (default: "public")

	// Multi-agent configuration (optional - experimental)
	MultiAgent *MultiAgentConfig `json:"multi_agent,omitempty"`
}

// MultiAgentConfig is imported from multi-agent package
// We define it here to avoid circular imports
type MultiAgentConfig struct {
	Enabled       bool          `json:"enabled"`        // Enable multi-agent mode
	ConsensusMode string        `json:"consensus_mode"` // "voting", "weighted", "unanimous", "best"
	FastFirst     bool          `json:"fast_first"`     // Use fast-first (don't wait for all)
	MinAgents     int           `json:"min_agents"`     // Minimum agents needed (for fast-first)
	MaxWaitTime   int           `json:"max_wait_time"`  // Max wait time in seconds
	Agents        []AgentConfig `json:"agents"`         // List of agents
}

// AgentConfig configuration for a single agent in multi-agent system
type AgentConfig struct {
	ID        string  `json:"id"`                   // Unique agent ID
	Name      string  `json:"name"`                 // Agent display name
	Model     string  `json:"model"`                // "groq", "qwen", "deepseek", or "custom"
	APIKey    string  `json:"api_key"`              // API key for this agent
	GroqModel string  `json:"groq_model,omitempty"` // Groq model name (if using Groq)
	Role      string  `json:"role,omitempty"`       // Agent role: "technical", "momentum", "risk", "trend"
	Weight    float64 `json:"weight,omitempty"`     // Weight for weighted consensus (0.0-1.0)
}

// LoadConfig loads configuration from file
func LoadConfig(filename string) (*Config, error) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Set default values: if use_default_coins is not set (false) and coin_pool_api_url is not configured, default to using default coin list
	if !config.UseDefaultCoins && config.CoinPoolAPIURL == "" {
		config.UseDefaultCoins = true
	}

	// Set default coin pool
	if len(config.DefaultCoins) == 0 {
		config.DefaultCoins = []string{
			"BTCUSDT",
			"ETHUSDT",
			"SOLUSDT",
			"BNBUSDT",
			"XRPUSDT",
			"DOGEUSDT",
			"ADAUSDT",
			"HYPEUSDT",
		}
	}

	// Validate configuration
	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("configuration validation failed: %w", err)
	}

	return &config, nil
}

// Validate validates configuration validity
func (c *Config) Validate() error {
	if len(c.Traders) == 0 {
		return fmt.Errorf("at least one trader must be configured")
	}

	traderIDs := make(map[string]bool)
	for i, trader := range c.Traders {
		if trader.ID == "" {
			return fmt.Errorf("trader[%d]: ID cannot be empty", i)
		}
		if traderIDs[trader.ID] {
			return fmt.Errorf("trader[%d]: ID '%s' is duplicated", i, trader.ID)
		}
		traderIDs[trader.ID] = true

		if trader.Name == "" {
			return fmt.Errorf("trader[%d]: Name cannot be empty", i)
		}
		if trader.AIModel != "groq" && trader.AIModel != "qwen" && trader.AIModel != "deepseek" && trader.AIModel != "custom" {
			return fmt.Errorf("trader[%d]: ai_model must be 'groq', 'qwen', 'deepseek' or 'custom'", i)
		}

		// Validate exchange configuration
		if trader.Exchange == "" {
			trader.Exchange = "paper" // Default to paper trading
		}
		if trader.Exchange != "binance" && trader.Exchange != "hyperliquid" && trader.Exchange != "aster" && trader.Exchange != "paper" && trader.Exchange != "simulate" && trader.Exchange != "demo" {
			return fmt.Errorf("trader[%d]: exchange must be 'binance', 'hyperliquid', 'aster' or 'paper'/'simulate'/'demo'", i)
		}

		// Validate corresponding keys based on exchange (paper trading does not require API keys)
		if trader.Exchange == "binance" {
			if trader.BinanceAPIKey == "" || trader.BinanceSecretKey == "" {
				return fmt.Errorf("trader[%d]: binance_api_key and binance_secret_key must be configured when using Binance", i)
			}
		} else if trader.Exchange == "hyperliquid" {
			if trader.HyperliquidPrivateKey == "" {
				return fmt.Errorf("trader[%d]: hyperliquid_private_key must be configured when using Hyperliquid", i)
			}
		} else if trader.Exchange == "aster" {
			if trader.AsterUser == "" || trader.AsterSigner == "" || trader.AsterPrivateKey == "" {
				return fmt.Errorf("trader[%d]: aster_user, aster_signer and aster_private_key must be configured when using Aster", i)
			}
		}
		// paper/simulate/demo modes do not require API key validation

		if trader.AIModel == "qwen" && trader.QwenKey == "" {
			return fmt.Errorf("trader[%d]: qwen_key must be configured when using Qwen", i)
		}
		if trader.AIModel == "deepseek" && trader.DeepSeekKey == "" {
			return fmt.Errorf("trader[%d]: deepseek_key must be configured when using DeepSeek", i)
		}
		if trader.AIModel == "groq" && trader.GroqKey == "" {
			return fmt.Errorf("trader[%d]: groq_key must be configured when using Groq", i)
		}
		if trader.AIModel == "custom" {
			if trader.CustomAPIURL == "" {
				return fmt.Errorf("trader[%d]: custom_api_url must be configured when using custom API", i)
			}
			if trader.CustomAPIKey == "" {
				return fmt.Errorf("trader[%d]: custom_api_key must be configured when using custom API", i)
			}
			if trader.CustomModelName == "" {
				return fmt.Errorf("trader[%d]: custom_model_name must be configured when using custom API", i)
			}
		}
		if trader.InitialBalance <= 0 {
			return fmt.Errorf("trader[%d]: initial_balance must be greater than 0", i)
		}
		if trader.ScanIntervalMinutes <= 0 {
			trader.ScanIntervalMinutes = 2.0 // Default 2 minutes
		}
	}

	if c.APIServerPort <= 0 {
		c.APIServerPort = 8080 // Default port 8080
	}

	// Set default leverage values (adapted for Binance subaccount limit, max 5x)
	if c.Leverage.BTCETHLeverage <= 0 {
		c.Leverage.BTCETHLeverage = 5 // Default 5x (safe value, adapted for subaccounts)
	}
	if c.Leverage.BTCETHLeverage > 5 {
		fmt.Printf("⚠️  Warning: BTC/ETH leverage set to %dx, may fail if using subaccount (subaccount limit ≤5x)\n", c.Leverage.BTCETHLeverage)
	}
	if c.Leverage.AltcoinLeverage <= 0 {
		c.Leverage.AltcoinLeverage = 5 // Default 5x (safe value, adapted for subaccounts)
	}
	if c.Leverage.AltcoinLeverage > 5 {
		fmt.Printf("⚠️  Warning: Altcoin leverage set to %dx, may fail if using subaccount (subaccount limit ≤5x)\n", c.Leverage.AltcoinLeverage)
	}

	return nil
}

// GetScanInterval gets the scan interval
func (tc *TraderConfig) GetScanInterval() time.Duration {
	return time.Duration(tc.ScanIntervalMinutes * float64(time.Minute))
}
