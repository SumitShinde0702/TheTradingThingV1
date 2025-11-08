package logger

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io/ioutil" // Still used for JSON migration
	"log"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "github.com/lib/pq" // PostgreSQL driver for Supabase
	_ "modernc.org/sqlite"
)

// DecisionRecord decision record
type DecisionRecord struct {
	Timestamp      time.Time          `json:"timestamp"`       // Decision time
	CycleNumber    int                `json:"cycle_number"`    // Cycle number
	InputPrompt    string             `json:"input_prompt"`    // Input prompt sent to AI
	CoTTrace       string             `json:"cot_trace"`       // AI chain of thought (output)
	DecisionJSON   string             `json:"decision_json"`   // Decision JSON
	RawResponse    string             `json:"raw_response"`    // Raw AI response (for debugging parsing failures)
	AccountState   AccountSnapshot    `json:"account_state"`   // Account state snapshot
	Positions      []PositionSnapshot `json:"positions"`       // Position snapshots
	CandidateCoins []string           `json:"candidate_coins"` // Candidate coin list
	Decisions      []DecisionAction   `json:"decisions"`       // Executed decisions
	ExecutionLog   []string           `json:"execution_log"`   // Execution log
	Success        bool               `json:"success"`         // Whether successful
	ErrorMessage   string             `json:"error_message"`   // Error message (if any)
}

// AccountSnapshot account state snapshot
type AccountSnapshot struct {
	TotalBalance          float64 `json:"total_balance"`
	AvailableBalance      float64 `json:"available_balance"`
	TotalUnrealizedProfit float64 `json:"total_unrealized_profit"`
	PositionCount         int     `json:"position_count"`
	MarginUsedPct         float64 `json:"margin_used_pct"`
}

// PositionSnapshot position snapshot
type PositionSnapshot struct {
	Symbol           string  `json:"symbol"`
	Side             string  `json:"side"`
	PositionAmt      float64 `json:"position_amt"`
	EntryPrice       float64 `json:"entry_price"`
	MarkPrice        float64 `json:"mark_price"`
	UnrealizedProfit float64 `json:"unrealized_profit"`
	Leverage         float64 `json:"leverage"`
	LiquidationPrice float64 `json:"liquidation_price"`
}

// DecisionAction decision action
type DecisionAction struct {
	Action    string    `json:"action"`    // open_long, open_short, close_long, close_short
	Symbol    string    `json:"symbol"`    // Coin symbol
	Quantity  float64   `json:"quantity"`  // Quantity
	Leverage  int       `json:"leverage"`  // Leverage (when opening position)
	Price     float64   `json:"price"`     // Execution price
	OrderID   int64     `json:"order_id"`  // Order ID
	Timestamp time.Time `json:"timestamp"` // Execution time
	Success   bool      `json:"success"`   // Whether successful
	Error     string    `json:"error"`     // Error message
}

// DecisionLogger decision logger (supports SQLite and Supabase/PostgreSQL)
type DecisionLogger struct {
	db          *sql.DB
	logDir      string
	cycleNumber int
	traderID    string // Trader ID (required for Supabase)
	isPostgres  bool   // True if using PostgreSQL/Supabase, false for SQLite
}

// SupabaseConfig configuration for Supabase database
type SupabaseConfig struct {
	UseSupabase         bool
	DatabaseURL         string // PostgreSQL connection string
	SupabaseURL         string // Supabase project URL (not used with direct connection)
	SupabaseKey         string // Supabase API key (not used with direct connection)
	Schema              string // Database schema (default: "public")
}

// NewDecisionLogger creates decision logger (backward compatible - uses SQLite)
func NewDecisionLogger(logDir string) *DecisionLogger {
	return NewDecisionLoggerWithConfig(logDir, "", nil)
}

// NewDecisionLoggerWithConfig creates decision logger with optional Supabase support
// traderID is required for Supabase (to separate data per trader)
// supabaseConfig can be nil to use SQLite (default behavior)
func NewDecisionLoggerWithConfig(logDir string, traderID string, supabaseConfig *SupabaseConfig) *DecisionLogger {
	if logDir == "" {
		logDir = "decision_logs"
	}

	logger := &DecisionLogger{
		db:          nil,
		logDir:      logDir,
		cycleNumber: 0,
		traderID:    traderID,
		isPostgres:  false,
	}

	// Check if Supabase is enabled
	if supabaseConfig != nil && supabaseConfig.UseSupabase && supabaseConfig.DatabaseURL != "" {
		logger.isPostgres = true
		logger.traderID = traderID
		
		// Add connection parameters for better compatibility
		connString := supabaseConfig.DatabaseURL
		// Add connection timeout and other parameters if not already present
		// Increased timeout to 30 seconds to handle network latency
		if !strings.Contains(connString, "?") && !strings.Contains(connString, "connect_timeout") {
			connString += "?connect_timeout=30&sslmode=require"
		} else if strings.Contains(connString, "?") && !strings.Contains(connString, "connect_timeout") {
			connString += "&connect_timeout=30&sslmode=require"
		}
		
		// Connect to PostgreSQL/Supabase
		db, err := sql.Open("postgres", connString)
		if err != nil {
			log.Printf("⚠ Failed to open Supabase database: %v\n", err)
			log.Printf("⚠ Falling back to SQLite...\n")
			logger.isPostgres = false
		} else {
			// Set connection pool settings - increased for better performance
			db.SetMaxOpenConns(20)
			db.SetMaxIdleConns(10)
			db.SetConnMaxLifetime(10 * time.Minute)
			
			// Test connection with timeout context - increased to 30 seconds
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			
			if err := db.PingContext(ctx); err != nil {
				log.Printf("⚠ Supabase database connection failed: %v\n", err)
				log.Printf("⚠ Connection string (masked): %s\n", maskConnectionString(supabaseConfig.DatabaseURL))
				log.Printf("⚠ Falling back to SQLite...\n")
				db.Close()
				logger.isPostgres = false
			} else {
				logger.db = db
				log.Printf("✅ Connected to Supabase database (trader_id: %s)\n", traderID)
			}
		}
	}

	// If not using Supabase or Supabase connection failed, use SQLite
	if !logger.isPostgres {
		// Ensure log directory exists
		if err := os.MkdirAll(logDir, 0755); err != nil {
			log.Printf("⚠ Failed to create log directory: %v\n", err)
		}

		// SQLite database file path
		dbPath := filepath.Join(logDir, "decisions.db")

		// Open or create database
		db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)")
		if err != nil {
			log.Printf("⚠ Failed to open SQLite database: %v\n", err)
		} else {
			// Test database connection
			if err := db.Ping(); err != nil {
				log.Printf("⚠ SQLite database connection failed: %v\n", err)
				db.Close()
			} else {
				logger.db = db
			}
		}
	}

	// Initialize database table structure
	if logger.db == nil {
		log.Printf("⚠ Database not initialized, will use JSON file mode (slower performance)\n")
		// Try to restore cycle number from JSON file
		if err := logger.restoreCycleNumberFromJSON(); err != nil {
			log.Printf("ℹ️  Unable to restore cycle number from JSON file, starting from 1: %v\n", err)
		}
	} else {
		if err := logger.initDB(); err != nil {
			log.Printf("⚠ Failed to initialize database: %v\n", err)
			// Try to restore cycle number from JSON file
			if err2 := logger.restoreCycleNumberFromJSON(); err2 != nil {
				log.Printf("ℹ️  Unable to restore cycle number from JSON file, starting from 1: %v\n", err2)
			}
		} else {
			// Restore cycle number from database
			if err := logger.restoreCycleNumber(); err != nil {
				log.Printf("ℹ️  Unable to restore previous cycle number, starting from 1: %v\n", err)
			}
			// Try to migrate existing JSON files to database (one-time operation)
			if !logger.isPostgres {
				// Only migrate from JSON for SQLite (Supabase should be empty or manually migrated)
				go logger.migrateFromJSON() // Async migration, doesn't block startup
			}
		}
	}

	return logger
}

// maskConnectionString masks password in connection string for logging
func maskConnectionString(connStr string) string {
	// Mask password between :// and @
	if idx := strings.Index(connStr, "://"); idx != -1 {
		if atIdx := strings.Index(connStr[idx+3:], "@"); atIdx != -1 {
			start := idx + 3
			// Find password (between : and @)
			if colonIdx := strings.Index(connStr[start:], ":"); colonIdx != -1 {
				pwdStart := start + colonIdx + 1
				if pwdEnd := strings.Index(connStr[pwdStart:], "@"); pwdEnd != -1 {
					masked := connStr[:pwdStart] + "***" + connStr[pwdStart+pwdEnd:]
					return masked
				}
			}
		}
	}
	return "***"
}

// initDB initializes database table structure
func (l *DecisionLogger) initDB() error {
	var schema string
	
	if l.isPostgres {
		// PostgreSQL/Supabase schema (with trader_id column)
		schema = `
		CREATE TABLE IF NOT EXISTS decisions (
			id SERIAL PRIMARY KEY,
			trader_id TEXT NOT NULL,
			timestamp TIMESTAMPTZ NOT NULL,
			cycle_number INTEGER NOT NULL,
			input_prompt TEXT,
			cot_trace TEXT,
			decision_json TEXT,
			raw_response TEXT,
			success BOOLEAN NOT NULL DEFAULT true,
			error_message TEXT,
			account_total_balance REAL NOT NULL,
			account_available_balance REAL NOT NULL,
			account_unrealized_profit REAL NOT NULL,
			account_position_count INTEGER NOT NULL,
			account_margin_used_pct REAL NOT NULL,
			execution_log TEXT,
			candidate_coins TEXT,
			created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(trader_id, cycle_number)
		);

		CREATE TABLE IF NOT EXISTS positions (
			id SERIAL PRIMARY KEY,
			decision_id INTEGER NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
			symbol TEXT NOT NULL,
			side TEXT NOT NULL,
			position_amt REAL NOT NULL,
			entry_price REAL NOT NULL,
			mark_price REAL NOT NULL,
			unrealized_profit REAL NOT NULL,
			leverage REAL NOT NULL,
			liquidation_price REAL NOT NULL
		);

		CREATE TABLE IF NOT EXISTS decision_actions (
			id SERIAL PRIMARY KEY,
			decision_id INTEGER NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
			action TEXT NOT NULL,
			symbol TEXT NOT NULL,
			quantity REAL NOT NULL,
			leverage INTEGER,
			price REAL NOT NULL,
			order_id BIGINT,
			timestamp TIMESTAMPTZ NOT NULL,
			success BOOLEAN NOT NULL DEFAULT true,
			error TEXT
		);

		CREATE INDEX IF NOT EXISTS idx_decisions_trader_id ON decisions(trader_id);
		CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp);
		CREATE INDEX IF NOT EXISTS idx_decisions_cycle ON decisions(trader_id, cycle_number);
		CREATE INDEX IF NOT EXISTS idx_decisions_success ON decisions(success);
		CREATE INDEX IF NOT EXISTS idx_positions_decision ON positions(decision_id);
		CREATE INDEX IF NOT EXISTS idx_actions_decision ON decision_actions(decision_id);
		`
	} else {
		// SQLite schema (backward compatible)
		schema = `
		CREATE TABLE IF NOT EXISTS decisions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp DATETIME NOT NULL,
			cycle_number INTEGER NOT NULL UNIQUE,
			input_prompt TEXT,
			cot_trace TEXT,
			decision_json TEXT,
			raw_response TEXT,
			success BOOLEAN NOT NULL DEFAULT 1,
			error_message TEXT,
			account_total_balance REAL NOT NULL,
			account_available_balance REAL NOT NULL,
			account_unrealized_profit REAL NOT NULL,
			account_position_count INTEGER NOT NULL,
			account_margin_used_pct REAL NOT NULL,
			execution_log TEXT,
			candidate_coins TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS positions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			decision_id INTEGER NOT NULL,
			symbol TEXT NOT NULL,
			side TEXT NOT NULL,
			position_amt REAL NOT NULL,
			entry_price REAL NOT NULL,
			mark_price REAL NOT NULL,
			unrealized_profit REAL NOT NULL,
			leverage REAL NOT NULL,
			liquidation_price REAL NOT NULL,
			FOREIGN KEY(decision_id) REFERENCES decisions(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS decision_actions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			decision_id INTEGER NOT NULL,
			action TEXT NOT NULL,
			symbol TEXT NOT NULL,
			quantity REAL NOT NULL,
			leverage INTEGER,
			price REAL NOT NULL,
			order_id INTEGER,
			timestamp DATETIME NOT NULL,
			success BOOLEAN NOT NULL DEFAULT 1,
			error TEXT,
			FOREIGN KEY(decision_id) REFERENCES decisions(id) ON DELETE CASCADE
		);

		CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp);
		CREATE INDEX IF NOT EXISTS idx_decisions_cycle ON decisions(cycle_number);
		CREATE INDEX IF NOT EXISTS idx_decisions_success ON decisions(success);
		CREATE INDEX IF NOT EXISTS idx_positions_decision ON positions(decision_id);
		CREATE INDEX IF NOT EXISTS idx_actions_decision ON decision_actions(decision_id);
		`
	}

	_, err := l.db.Exec(schema)
	return err
}

// migrateFromJSON migrates from JSON files to database (one-time migration)
func (l *DecisionLogger) migrateFromJSON() error {
	if l.db == nil {
		return fmt.Errorf("database not initialized")
	}

	files, err := ioutil.ReadDir(l.logDir)
	if err != nil {
		return fmt.Errorf("failed to read log directory: %w", err)
	}

	migratedCount := 0
	maxCycle := 0

	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		// Check if already in database
		filePath := filepath.Join(l.logDir, file.Name())
		data, err := ioutil.ReadFile(filePath)
		if err != nil {
			continue
		}

		var record DecisionRecord
		if err := json.Unmarshal(data, &record); err != nil {
			continue
		}

		// Check if already exists
		var exists int
		err = l.db.QueryRow("SELECT 1 FROM decisions WHERE cycle_number = ?", record.CycleNumber).Scan(&exists)
		if err == nil {
			// Already exists, skip
			if record.CycleNumber > maxCycle {
				maxCycle = record.CycleNumber
			}
			continue
		}

		// Migrate to database
		if err := l.insertDecisionRecord(&record); err != nil {
			log.Printf("⚠ Failed to migrate record %d: %v\n", record.CycleNumber, err)
			continue
		}

		migratedCount++
		if record.CycleNumber > maxCycle {
			maxCycle = record.CycleNumber
		}
	}

	if migratedCount > 0 {
		log.Printf("✅ Migrated %d records from JSON to database\n", migratedCount)
	}

	// Update cycle number (if larger in database)
	if maxCycle > l.cycleNumber {
		l.cycleNumber = maxCycle
	}

	return nil
}

// restoreCycleNumber restores cycle number from database
func (l *DecisionLogger) restoreCycleNumber() error {
	if l.db == nil {
		return fmt.Errorf("database not initialized")
	}

	var maxCycle sql.NullInt64
	var err error
	
	if l.isPostgres {
		// PostgreSQL: filter by trader_id
		err = l.db.QueryRow("SELECT MAX(cycle_number) FROM decisions WHERE trader_id = $1", l.traderID).Scan(&maxCycle)
	} else {
		// SQLite: no trader_id filter
		err = l.db.QueryRow("SELECT MAX(cycle_number) FROM decisions").Scan(&maxCycle)
	}
	
	if err != nil {
		return fmt.Errorf("failed to query max cycle number: %w", err)
	}

	if maxCycle.Valid && maxCycle.Int64 >= 0 {
		// If maxCycle is 0, that means only cycle #0 (seed) exists, so next should be #1
		// If maxCycle > 0, continue from that cycle
		if maxCycle.Int64 == 0 {
			// Only seed record exists, start from cycle #1
			l.cycleNumber = 0
			fmt.Printf("✅ Restored cycle number: found seed record (cycle #0), will start from cycle #1\n")
		} else {
			l.cycleNumber = int(maxCycle.Int64)
			fmt.Printf("✅ Restored cycle number: continuing from %d\n", l.cycleNumber)
		}
	} else {
		// No records found, start fresh
		l.cycleNumber = 0
		fmt.Printf("ℹ️  No previous cycles found, starting from cycle #1\n")
	}

	return nil
}

// restoreCycleNumberFromJSON restores cycle number from JSON file (fallback method)
func (l *DecisionLogger) restoreCycleNumberFromJSON() error {
	files, err := ioutil.ReadDir(l.logDir)
	if err != nil {
		return fmt.Errorf("failed to read log directory: %w", err)
	}

	maxCycle := 0
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		filePath := filepath.Join(l.logDir, file.Name())
		data, err := ioutil.ReadFile(filePath)
		if err != nil {
			continue
		}

		var record DecisionRecord
		if err := json.Unmarshal(data, &record); err != nil {
			continue
		}

		if record.CycleNumber > maxCycle {
			maxCycle = record.CycleNumber
		}
	}

	if maxCycle > 0 {
		l.cycleNumber = maxCycle
		fmt.Printf("✅ Restored cycle number from JSON file: continuing from %d\n", maxCycle)
	}

	return nil
}

// insertDecisionRecord inserts decision record to database (internal method)
func (l *DecisionLogger) insertDecisionRecord(record *DecisionRecord) error {
	tx, err := l.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Serialize array fields to JSON
	// Optimize: Only keep execution_log for failed decisions (saves ~0.5-2 KB per record)
	executionLog := record.ExecutionLog
	if record.Success && len(executionLog) > 0 {
		// For successful decisions, execution log is usually not needed
		// Only keep it if there was an error for debugging
		executionLog = []string{}
	}
	executionLogJSON, _ := json.Marshal(executionLog)
	candidateCoinsJSON, _ := json.Marshal(record.CandidateCoins)

	// Insert main record
	var decisionID int64
	
	// Optimize: Only store raw_response if there was an error (for debugging)
	// This saves ~5-15 KB per record (50-70% storage reduction)
	rawResponse := record.RawResponse
	if record.Success && rawResponse != "" {
		// For successful decisions, raw_response is redundant (we have cot_trace and decision_json)
		// Only keep it if there was an error for debugging
		rawResponse = ""
	}
	
	if l.isPostgres {
		// PostgreSQL: use RETURNING id to get the inserted ID
		err = tx.QueryRow(`
			INSERT INTO decisions (
				trader_id, timestamp, cycle_number, input_prompt, cot_trace, decision_json, raw_response,
				success, error_message,
				account_total_balance, account_available_balance, account_unrealized_profit,
				account_position_count, account_margin_used_pct,
				execution_log, candidate_coins
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
			RETURNING id`,
			l.traderID, record.Timestamp, record.CycleNumber, record.InputPrompt, record.CoTTrace,
			record.DecisionJSON, rawResponse, record.Success, record.ErrorMessage,
			record.AccountState.TotalBalance, record.AccountState.AvailableBalance,
			record.AccountState.TotalUnrealizedProfit, record.AccountState.PositionCount,
			record.AccountState.MarginUsedPct, string(executionLogJSON), string(candidateCoinsJSON)).Scan(&decisionID)
	} else {
		// SQLite: use Exec + LastInsertId()
		result, err := tx.Exec(`
			INSERT INTO decisions (
				timestamp, cycle_number, input_prompt, cot_trace, decision_json, raw_response,
				success, error_message,
				account_total_balance, account_available_balance, account_unrealized_profit,
				account_position_count, account_margin_used_pct,
				execution_log, candidate_coins
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			record.Timestamp, record.CycleNumber, record.InputPrompt, record.CoTTrace,
			record.DecisionJSON, rawResponse, record.Success, record.ErrorMessage,
			record.AccountState.TotalBalance, record.AccountState.AvailableBalance,
			record.AccountState.TotalUnrealizedProfit, record.AccountState.PositionCount,
			record.AccountState.MarginUsedPct, string(executionLogJSON), string(candidateCoinsJSON))
		
		if err != nil {
			return err
		}
		
		decisionID, err = result.LastInsertId()
	}

	if err != nil {
		return err
	}

	// Insert position records
	for _, pos := range record.Positions {
		if l.isPostgres {
			_, err = tx.Exec(`
				INSERT INTO positions (
					decision_id, symbol, side, position_amt, entry_price, mark_price,
					unrealized_profit, leverage, liquidation_price
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
				decisionID, pos.Symbol, pos.Side, pos.PositionAmt, pos.EntryPrice,
				pos.MarkPrice, pos.UnrealizedProfit, pos.Leverage, pos.LiquidationPrice)
		} else {
			_, err = tx.Exec(`
				INSERT INTO positions (
					decision_id, symbol, side, position_amt, entry_price, mark_price,
					unrealized_profit, leverage, liquidation_price
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				decisionID, pos.Symbol, pos.Side, pos.PositionAmt, pos.EntryPrice,
				pos.MarkPrice, pos.UnrealizedProfit, pos.Leverage, pos.LiquidationPrice)
		}
		if err != nil {
			return err
		}
	}

	// Insert decision action records
	for _, action := range record.Decisions {
		if l.isPostgres {
			_, err = tx.Exec(`
				INSERT INTO decision_actions (
					decision_id, action, symbol, quantity, leverage, price, order_id,
					timestamp, success, error
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
				decisionID, action.Action, action.Symbol, action.Quantity, action.Leverage,
				action.Price, action.OrderID, action.Timestamp, action.Success, action.Error)
		} else {
			_, err = tx.Exec(`
				INSERT INTO decision_actions (
					decision_id, action, symbol, quantity, leverage, price, order_id,
					timestamp, success, error
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				decisionID, action.Action, action.Symbol, action.Quantity, action.Leverage,
				action.Price, action.OrderID, action.Timestamp, action.Success, action.Error)
		}
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// LogDecision logs decision
func (l *DecisionLogger) LogDecision(record *DecisionRecord) error {
	// Safety check: Verify cycle number with database before logging
	// This prevents issues if database was reset while backend was running
	if l.db != nil && l.isPostgres {
		var maxCycle sql.NullInt64
		err := l.db.QueryRow("SELECT MAX(cycle_number) FROM decisions WHERE trader_id = $1", l.traderID).Scan(&maxCycle)
		if err == nil && maxCycle.Valid {
			// If in-memory cycle number doesn't match database (database was reset), restore from database
			expectedNextCycle := int(maxCycle.Int64) + 1
			if maxCycle.Int64 == 0 {
				// Database only has seed record (cycle #0), next should be #1
				expectedNextCycle = 1
			}
			
			// If in-memory cycle is way off from database (database was reset), restore
			if l.cycleNumber > expectedNextCycle || (maxCycle.Int64 == 0 && l.cycleNumber > 1) {
				log.Printf("⚠️  Cycle number mismatch! In-memory: %d, Database max: %d (next should be %d). Restoring from database...", 
					l.cycleNumber, maxCycle.Int64, expectedNextCycle)
				// Restore cycle number from database
				if maxCycle.Int64 == 0 {
					l.cycleNumber = 0  // Will become 1 after increment
				} else {
					l.cycleNumber = int(maxCycle.Int64)
				}
			}
		}
	}
	
	l.cycleNumber++
	record.CycleNumber = l.cycleNumber
	record.Timestamp = time.Now()

	// If database is available, use database; otherwise fallback to JSON file
	if l.db != nil {
		if err := l.insertDecisionRecord(record); err != nil {
			log.Printf("⚠ Database save failed (cycle #%d): %v\n", record.CycleNumber, err)
			log.Printf("⚠ Falling back to JSON file...\n")
			return l.logDecisionToJSON(record)
		}
		fmt.Printf("📝 Decision record saved to database: cycle #%d (trader: %s)\n", record.CycleNumber, l.traderID)
		return nil
	}

	// Fallback to JSON file
	return l.logDecisionToJSON(record)
}

// logDecisionToJSON saves decision record to JSON file (fallback method)
func (l *DecisionLogger) logDecisionToJSON(record *DecisionRecord) error {
	filename := fmt.Sprintf("decision_%s_cycle%d.json",
		record.Timestamp.Format("20060102_150405"),
		record.CycleNumber)

	filepath := filepath.Join(l.logDir, filename)
	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return fmt.Errorf("serialization failed: %w", err)
	}

	if err := os.WriteFile(filepath, data, 0644); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	fmt.Printf("📝 Decision record saved (JSON): %s\n", filename)
	return nil
}

// GetFirstRecord gets first record (cycle #1, used to restore original initial balance)
func (l *DecisionLogger) GetFirstRecord() (*DecisionRecord, error) {
	if l.db != nil {
		return l.getFirstRecordFromDB()
	}
	return l.getFirstRecordFromJSON()
}

// getFirstRecordFromDB gets first record from database (cycle #0 seed record, or cycle #1, or earliest record)
func (l *DecisionLogger) getFirstRecordFromDB() (*DecisionRecord, error) {
	var row *sql.Row
	
	// First try to get cycle #0 (seed record) for initial balance
	if l.isPostgres {
		row = l.db.QueryRow(`
			SELECT id, timestamp, cycle_number, input_prompt, cot_trace, decision_json,
				raw_response, success, error_message,
				account_total_balance, account_available_balance, account_unrealized_profit,
				account_position_count, account_margin_used_pct,
				execution_log, candidate_coins
			FROM decisions
			WHERE trader_id = $1 AND cycle_number = 0
			ORDER BY timestamp ASC
			LIMIT 1
		`, l.traderID)
	} else {
		row = l.db.QueryRow(`
			SELECT id, timestamp, cycle_number, input_prompt, cot_trace, decision_json,
				raw_response, success, error_message,
				account_total_balance, account_available_balance, account_unrealized_profit,
				account_position_count, account_margin_used_pct,
				execution_log, candidate_coins
			FROM decisions
			WHERE cycle_number = 0
			ORDER BY timestamp ASC
			LIMIT 1
		`)
	}

	decisionID := int64(0)
	record := &DecisionRecord{}
	var executionLogJSON, candidateCoinsJSON string
	var accountState AccountSnapshot

	err := row.Scan(
		&decisionID,
		&record.Timestamp,
		&record.CycleNumber,
		&record.InputPrompt,
		&record.CoTTrace,
		&record.DecisionJSON,
		&record.RawResponse,
		&record.Success,
		&record.ErrorMessage,
		&accountState.TotalBalance,
		&accountState.AvailableBalance,
		&accountState.TotalUnrealizedProfit,
		&accountState.PositionCount,
		&accountState.MarginUsedPct,
		&executionLogJSON,
		&candidateCoinsJSON,
	)
	
	// If cycle #1 not found, try to get the earliest record by timestamp
	if err == sql.ErrNoRows {
		var row2 *sql.Row
		if l.isPostgres {
			row2 = l.db.QueryRow(`
				SELECT id, timestamp, cycle_number, input_prompt, cot_trace, decision_json,
					raw_response, success, error_message,
					account_total_balance, account_available_balance, account_unrealized_profit,
					account_position_count, account_margin_used_pct,
					execution_log, candidate_coins
				FROM decisions
				WHERE trader_id = $1
				ORDER BY timestamp ASC
				LIMIT 1
			`, l.traderID)
		} else {
			row2 = l.db.QueryRow(`
				SELECT id, timestamp, cycle_number, input_prompt, cot_trace, decision_json,
					raw_response, success, error_message,
					account_total_balance, account_available_balance, account_unrealized_profit,
					account_position_count, account_margin_used_pct,
					execution_log, candidate_coins
				FROM decisions
				ORDER BY timestamp ASC
				LIMIT 1
			`)
		}
		
		err = row2.Scan(
			&decisionID,
			&record.Timestamp,
			&record.CycleNumber,
			&record.InputPrompt,
			&record.CoTTrace,
			&record.DecisionJSON,
			&record.RawResponse,
			&record.Success,
			&record.ErrorMessage,
			&accountState.TotalBalance,
			&accountState.AvailableBalance,
			&accountState.TotalUnrealizedProfit,
			&accountState.PositionCount,
			&accountState.MarginUsedPct,
			&executionLogJSON,
			&candidateCoinsJSON,
		)
	}
	
	if err != nil {
		return nil, fmt.Errorf("failed to get first record: %w", err)
	}

	record.AccountState = accountState
	json.Unmarshal([]byte(executionLogJSON), &record.ExecutionLog)
	json.Unmarshal([]byte(candidateCoinsJSON), &record.CandidateCoins)

	record.Positions, _ = l.loadPositions(decisionID)
	record.Decisions, _ = l.loadDecisionActions(decisionID)

	return record, nil
}

// getFirstRecordFromJSON gets first record from JSON file (fallback method)
func (l *DecisionLogger) getFirstRecordFromJSON() (*DecisionRecord, error) {
	files, err := ioutil.ReadDir(l.logDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read log directory: %w", err)
	}

	var firstRecord *DecisionRecord
	minCycle := 999999

	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		filePath := filepath.Join(l.logDir, file.Name())
		data, err := ioutil.ReadFile(filePath)
		if err != nil {
			continue
		}

		var record DecisionRecord
		if err := json.Unmarshal(data, &record); err != nil {
			continue
		}

		if record.CycleNumber < minCycle {
			minCycle = record.CycleNumber
			firstRecord = &record
		}
	}

	if firstRecord == nil {
		return nil, fmt.Errorf("first record not found")
	}

	return firstRecord, nil
}

// GetAllRecords gets all historical records (unlimited, sorted by time ascending: from old to new)
func (l *DecisionLogger) GetAllRecords() ([]*DecisionRecord, error) {
	// If database is available, use database query
	if l.db != nil {
		return l.getAllRecordsFromDB()
	}

	// Fallback to JSON files
	return l.getAllRecordsFromJSON()
}

// getAllRecordsFromDB gets all records from database
func (l *DecisionLogger) getAllRecordsFromDB() ([]*DecisionRecord, error) {
	// Add context timeout for query (30 seconds)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	var rows *sql.Rows
	var err error
	
	if l.isPostgres {
		// PostgreSQL: filter by trader_id, use $1 placeholder
		rows, err = l.db.QueryContext(ctx, `
			SELECT id, timestamp, cycle_number, input_prompt, cot_trace, decision_json,
				raw_response, success, error_message,
				account_total_balance, account_available_balance, account_unrealized_profit,
				account_position_count, account_margin_used_pct,
				execution_log, candidate_coins
			FROM decisions
			WHERE trader_id = $1
			ORDER BY timestamp ASC
		`, l.traderID)
	} else {
		// SQLite: no trader_id filter, use ? placeholder
		rows, err = l.db.QueryContext(ctx, `
			SELECT id, timestamp, cycle_number, input_prompt, cot_trace, decision_json,
				raw_response, success, error_message,
				account_total_balance, account_available_balance, account_unrealized_profit,
				account_position_count, account_margin_used_pct,
				execution_log, candidate_coins
			FROM decisions
			ORDER BY timestamp ASC
		`)
	}
	
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var records []*DecisionRecord
	for rows.Next() {
		record, err := l.scanDecisionRecord(rows)
		if err != nil {
			continue
		}
		records = append(records, record)
	}

	return records, nil
}

// getAllRecordsFromJSON gets all records from JSON file (fallback method)
func (l *DecisionLogger) getAllRecordsFromJSON() ([]*DecisionRecord, error) {
	files, err := ioutil.ReadDir(l.logDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read log directory: %w", err)
	}

	var records []*DecisionRecord
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		filePath := filepath.Join(l.logDir, file.Name())
		data, err := ioutil.ReadFile(filePath)
		if err != nil {
			continue
		}

		var record DecisionRecord
		if err := json.Unmarshal(data, &record); err != nil {
			continue
		}

		records = append(records, &record)
	}

	// Sort by time (from old to new)
	sort.Slice(records, func(i, j int) bool {
		return records[i].Timestamp.Before(records[j].Timestamp)
	})

	return records, nil
}

// GetLatestRecords gets latest N records (sorted by time ascending: from old to new)
func (l *DecisionLogger) GetLatestRecords(n int) ([]*DecisionRecord, error) {
	// If database is available, use database query
	if l.db != nil {
		return l.getLatestRecordsFromDB(n)
	}

	// Fallback to JSON files
	return l.getLatestRecordsFromJSON(n)
}

// getLatestRecordsFromDB gets latest records from database
func (l *DecisionLogger) getLatestRecordsFromDB(n int) ([]*DecisionRecord, error) {
	// Add context timeout for query (30 seconds)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	var rows *sql.Rows
	var err error
	
	if l.isPostgres {
		// PostgreSQL: filter by trader_id, use $1, $2 placeholders
		rows, err = l.db.QueryContext(ctx, `
			SELECT id, timestamp, cycle_number, input_prompt, cot_trace, decision_json,
				raw_response, success, error_message,
				account_total_balance, account_available_balance, account_unrealized_profit,
				account_position_count, account_margin_used_pct,
				execution_log, candidate_coins
			FROM decisions
			WHERE trader_id = $1
			ORDER BY timestamp DESC
			LIMIT $2
		`, l.traderID, n)
	} else {
		// SQLite: no trader_id filter, use ? placeholder
		rows, err = l.db.QueryContext(ctx, `
			SELECT id, timestamp, cycle_number, input_prompt, cot_trace, decision_json,
				raw_response, success, error_message,
				account_total_balance, account_available_balance, account_unrealized_profit,
				account_position_count, account_margin_used_pct,
				execution_log, candidate_coins
			FROM decisions
			ORDER BY timestamp DESC
			LIMIT ?
		`, n)
	}
	
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var records []*DecisionRecord
	for rows.Next() {
		record, err := l.scanDecisionRecord(rows)
		if err != nil {
			continue
		}
		records = append(records, record)
	}

	// Reverse array to arrange time from old to new (for chart display)
	for i, j := 0, len(records)-1; i < j; i, j = i+1, j-1 {
		records[i], records[j] = records[j], records[i]
	}

	return records, nil
}

// getLatestRecordsFromJSON gets latest records from JSON file (fallback method)
func (l *DecisionLogger) getLatestRecordsFromJSON(n int) ([]*DecisionRecord, error) {
	files, err := ioutil.ReadDir(l.logDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read log directory: %w", err)
	}

	var records []*DecisionRecord
	count := 0
	for i := len(files) - 1; i >= 0 && count < n; i-- {
		file := files[i]
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		filePath := filepath.Join(l.logDir, file.Name())
		data, err := ioutil.ReadFile(filePath)
		if err != nil {
			continue
		}

		var record DecisionRecord
		if err := json.Unmarshal(data, &record); err != nil {
			continue
		}

		records = append(records, &record)
		count++
	}

	// Reverse array to arrange time from old to new
	for i, j := 0, len(records)-1; i < j; i, j = i+1, j-1 {
		records[i], records[j] = records[j], records[i]
	}

	return records, nil
}

// scanDecisionRecord scans decision record (helper method)
func (l *DecisionLogger) scanDecisionRecord(rows *sql.Rows) (*DecisionRecord, error) {
	var record DecisionRecord
	var decisionID int64
	var executionLogJSON, candidateCoinsJSON string
	var accountState AccountSnapshot

	err := rows.Scan(
		&decisionID,
		&record.Timestamp,
		&record.CycleNumber,
		&record.InputPrompt,
		&record.CoTTrace,
		&record.DecisionJSON,
		&record.RawResponse,
		&record.Success,
		&record.ErrorMessage,
		&accountState.TotalBalance,
		&accountState.AvailableBalance,
		&accountState.TotalUnrealizedProfit,
		&accountState.PositionCount,
		&accountState.MarginUsedPct,
		&executionLogJSON,
		&candidateCoinsJSON,
	)
	if err != nil {
		return nil, err
	}

	record.AccountState = accountState

	// Parse JSON array
	json.Unmarshal([]byte(executionLogJSON), &record.ExecutionLog)
	json.Unmarshal([]byte(candidateCoinsJSON), &record.CandidateCoins)

	// Load associated positions and actions
	record.Positions, _ = l.loadPositions(decisionID)
	record.Decisions, _ = l.loadDecisionActions(decisionID)

	return &record, nil
}

// loadPositions loads position records
func (l *DecisionLogger) loadPositions(decisionID int64) ([]PositionSnapshot, error) {
	var rows *sql.Rows
	var err error
	
	if l.isPostgres {
		rows, err = l.db.Query(`
			SELECT symbol, side, position_amt, entry_price, mark_price,
				unrealized_profit, leverage, liquidation_price
			FROM positions
			WHERE decision_id = $1
		`, decisionID)
	} else {
		rows, err = l.db.Query(`
			SELECT symbol, side, position_amt, entry_price, mark_price,
				unrealized_profit, leverage, liquidation_price
			FROM positions
			WHERE decision_id = ?
		`, decisionID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var positions []PositionSnapshot
	for rows.Next() {
		var pos PositionSnapshot
		if err := rows.Scan(
			&pos.Symbol, &pos.Side, &pos.PositionAmt, &pos.EntryPrice,
			&pos.MarkPrice, &pos.UnrealizedProfit, &pos.Leverage, &pos.LiquidationPrice,
		); err != nil {
			continue
		}
		positions = append(positions, pos)
	}
	return positions, nil
}

// loadDecisionActions loads decision action records
func (l *DecisionLogger) loadDecisionActions(decisionID int64) ([]DecisionAction, error) {
	var rows *sql.Rows
	var err error
	
	if l.isPostgres {
		rows, err = l.db.Query(`
			SELECT action, symbol, quantity, leverage, price, order_id,
				timestamp, success, error
			FROM decision_actions
			WHERE decision_id = $1
			ORDER BY timestamp
		`, decisionID)
	} else {
		rows, err = l.db.Query(`
			SELECT action, symbol, quantity, leverage, price, order_id,
				timestamp, success, error
			FROM decision_actions
			WHERE decision_id = ?
			ORDER BY timestamp
		`, decisionID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var actions []DecisionAction
	for rows.Next() {
		var action DecisionAction
		if err := rows.Scan(
			&action.Action, &action.Symbol, &action.Quantity, &action.Leverage,
			&action.Price, &action.OrderID, &action.Timestamp, &action.Success, &action.Error,
		); err != nil {
			continue
		}
		actions = append(actions, action)
	}
	return actions, nil
}

// GetRecordByDate gets all records for specified date
func (l *DecisionLogger) GetRecordByDate(date time.Time) ([]*DecisionRecord, error) {
	if l.db != nil {
		return l.getRecordByDateFromDB(date)
	}

	// Fallback to JSON files
	return l.getRecordByDateFromJSON(date)
}

// getRecordByDateFromDB gets records from database for specified date
func (l *DecisionLogger) getRecordByDateFromDB(date time.Time) ([]*DecisionRecord, error) {
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)

	rows, err := l.db.Query(`
		SELECT id, timestamp, cycle_number, input_prompt, cot_trace, decision_json,
			raw_response, success, error_message,
			account_total_balance, account_available_balance, account_unrealized_profit,
			account_position_count, account_margin_used_pct,
			execution_log, candidate_coins
		FROM decisions
		WHERE timestamp >= ? AND timestamp < ?
		ORDER BY timestamp ASC
	`, startOfDay, endOfDay)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var records []*DecisionRecord
	for rows.Next() {
		record, err := l.scanDecisionRecord(rows)
		if err != nil {
			continue
		}
		records = append(records, record)
	}

	return records, nil
}

// getRecordByDateFromJSON gets records from JSON file for specified date (fallback method)
func (l *DecisionLogger) getRecordByDateFromJSON(date time.Time) ([]*DecisionRecord, error) {
	dateStr := date.Format("20060102")
	pattern := filepath.Join(l.logDir, fmt.Sprintf("decision_%s_*.json", dateStr))

	files, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to find log files: %w", err)
	}

	var records []*DecisionRecord
	for _, filePath := range files {
		data, err := ioutil.ReadFile(filePath)
		if err != nil {
			continue
		}

		var record DecisionRecord
		if err := json.Unmarshal(data, &record); err != nil {
			continue
		}

		records = append(records, &record)
	}

	return records, nil
}

// CleanOldRecords cleans old records from N days ago
func (l *DecisionLogger) CleanOldRecords(days int) error {
	cutoffTime := time.Now().AddDate(0, 0, -days)

	if l.db != nil {
		result, err := l.db.Exec("DELETE FROM decisions WHERE timestamp < ?", cutoffTime)
		if err != nil {
			return fmt.Errorf("failed to clean old records: %w", err)
		}

		removedCount, _ := result.RowsAffected()
		if removedCount > 0 {
			fmt.Printf("🗑️ Cleaned %d old records (%d days ago)\n", removedCount, days)
		}
		return nil
	}

	// Fallback: clean JSON files
	return l.cleanOldRecordsFromJSON(days)
}

// cleanOldRecordsFromJSON cleans old records from JSON files (fallback method)
func (l *DecisionLogger) cleanOldRecordsFromJSON(days int) error {
	cutoffTime := time.Now().AddDate(0, 0, -days)

	files, err := ioutil.ReadDir(l.logDir)
	if err != nil {
		return fmt.Errorf("读取日志目录失败: %w", err)
	}

	removedCount := 0
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		if file.ModTime().Before(cutoffTime) {
			filePath := filepath.Join(l.logDir, file.Name())
			if err := os.Remove(filePath); err != nil {
				fmt.Printf("⚠ 删除旧记录失败 %s: %v\n", file.Name(), err)
				continue
			}
			removedCount++
		}
	}

	if removedCount > 0 {
		fmt.Printf("🗑️ 已清理 %d 条旧记录（%d天前）\n", removedCount, days)
	}

	return nil
}

// GetStatistics gets statistics
func (l *DecisionLogger) GetStatistics() (*Statistics, error) {
	if l.db != nil {
		return l.getStatisticsFromDB()
	}

	// Fallback to JSON files
	return l.getStatisticsFromJSON()
}

// getStatisticsFromDB gets statistics from database
func (l *DecisionLogger) getStatisticsFromDB() (*Statistics, error) {
	// Add context timeout for query (30 seconds)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	stats := &Statistics{}

	// Total cycle count - filter by trader_id for PostgreSQL
	var totalCyclesQuery string
	if l.isPostgres {
		totalCyclesQuery = "SELECT COUNT(*) FROM decisions WHERE trader_id = $1"
	} else {
		totalCyclesQuery = "SELECT COUNT(*) FROM decisions"
	}
	
	var err error
	if l.isPostgres {
		err = l.db.QueryRowContext(ctx, totalCyclesQuery, l.traderID).Scan(&stats.TotalCycles)
	} else {
		err = l.db.QueryRowContext(ctx, totalCyclesQuery).Scan(&stats.TotalCycles)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query total cycle count: %w", err)
	}

	// Success/failure cycle count - filter by trader_id for PostgreSQL
	var successQuery string
	if l.isPostgres {
		successQuery = `
			SELECT 
				SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
				SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
			FROM decisions
			WHERE trader_id = $1
		`
	} else {
		successQuery = `
			SELECT 
				SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
				SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
			FROM decisions
		`
	}
	
	if l.isPostgres {
		err = l.db.QueryRowContext(ctx, successQuery, l.traderID).Scan(&stats.SuccessfulCycles, &stats.FailedCycles)
	} else {
		err = l.db.QueryRowContext(ctx, successQuery).Scan(&stats.SuccessfulCycles, &stats.FailedCycles)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query success/failure cycle count: %w", err)
	}

	// Open/close position count - note: decision_actions table may need trader_id filtering too
	// For now, keeping as is since decision_actions structure may differ
	var actionsQuery string
	if l.isPostgres {
		// Assuming decision_actions has trader_id column, adjust if needed
		actionsQuery = `
			SELECT 
				SUM(CASE WHEN action IN ('open_long', 'open_short') AND success = 1 THEN 1 ELSE 0 END) as opens,
				SUM(CASE WHEN action IN ('close_long', 'close_short') AND success = 1 THEN 1 ELSE 0 END) as closes
			FROM decision_actions
			WHERE decision_id IN (SELECT id FROM decisions WHERE trader_id = $1)
		`
	} else {
		actionsQuery = `
			SELECT 
				SUM(CASE WHEN action IN ('open_long', 'open_short') AND success = 1 THEN 1 ELSE 0 END) as opens,
				SUM(CASE WHEN action IN ('close_long', 'close_short') AND success = 1 THEN 1 ELSE 0 END) as closes
			FROM decision_actions
		`
	}
	
	if l.isPostgres {
		err = l.db.QueryRowContext(ctx, actionsQuery, l.traderID).Scan(&stats.TotalOpenPositions, &stats.TotalClosePositions)
	} else {
		err = l.db.QueryRowContext(ctx, actionsQuery).Scan(&stats.TotalOpenPositions, &stats.TotalClosePositions)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query open/close position count: %w", err)
	}

	return stats, nil
}

// getStatisticsFromJSON gets statistics from JSON file (fallback method)
func (l *DecisionLogger) getStatisticsFromJSON() (*Statistics, error) {
	files, err := ioutil.ReadDir(l.logDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read log directory: %w", err)
	}

	stats := &Statistics{}

	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		filePath := filepath.Join(l.logDir, file.Name())
		data, err := ioutil.ReadFile(filePath)
		if err != nil {
			continue
		}

		var record DecisionRecord
		if err := json.Unmarshal(data, &record); err != nil {
			continue
		}

		stats.TotalCycles++

		for _, action := range record.Decisions {
			if action.Success {
				switch action.Action {
				case "open_long", "open_short":
					stats.TotalOpenPositions++
				case "close_long", "close_short":
					stats.TotalClosePositions++
				}
			}
		}

		if record.Success {
			stats.SuccessfulCycles++
		} else {
			stats.FailedCycles++
		}
	}

	return stats, nil
}

// Statistics statistics
type Statistics struct {
	TotalCycles         int `json:"total_cycles"`
	SuccessfulCycles    int `json:"successful_cycles"`
	FailedCycles        int `json:"failed_cycles"`
	TotalOpenPositions  int `json:"total_open_positions"`
	TotalClosePositions int `json:"total_close_positions"`
}

// TradeOutcome single trade result
type TradeOutcome struct {
	Symbol        string    `json:"symbol"`         // Coin symbol
	Side          string    `json:"side"`           // long/short
	Quantity      float64   `json:"quantity"`       // Position quantity
	Leverage      int       `json:"leverage"`       // Leverage multiplier
	OpenPrice     float64   `json:"open_price"`     // Opening price
	ClosePrice    float64   `json:"close_price"`   // Closing price
	PositionValue float64   `json:"position_value"` // Position value (quantity × openPrice)
	MarginUsed    float64   `json:"margin_used"`   // Margin used (positionValue / leverage)
	PnL           float64   `json:"pn_l"`           // Profit/loss (USDT)
	PnLPct        float64   `json:"pn_l_pct"`       // Profit/loss percentage (relative to margin)
	Duration      string    `json:"duration"`       // Position holding duration
	OpenTime      time.Time `json:"open_time"`      // Opening time
	CloseTime      time.Time `json:"close_time"`     // Closing time
	WasStopLoss   bool      `json:"was_stop_loss"`  // Whether stop loss was triggered
}

// PerformanceAnalysis trading performance analysis
type PerformanceAnalysis struct {
	TotalTrades   int                           `json:"total_trades"`   // Total number of trades
	WinningTrades int                           `json:"winning_trades"` // Number of winning trades
	LosingTrades  int                           `json:"losing_trades"`  // Number of losing trades
	WinRate       float64                       `json:"win_rate"`       // Win rate
	AvgWin        float64                       `json:"avg_win"`        // Average win
	AvgLoss       float64                       `json:"avg_loss"`       // Average loss
	ProfitFactor  float64                       `json:"profit_factor"`  // Profit factor
	SharpeRatio   float64                       `json:"sharpe_ratio"`   // Sharpe ratio (risk-adjusted return)
	RecentTrades  []TradeOutcome                `json:"recent_trades"`  // Recent N trades
	SymbolStats   map[string]*SymbolPerformance `json:"symbol_stats"`   // Performance by symbol
	BestSymbol    string                        `json:"best_symbol"`    // Best performing symbol
	WorstSymbol   string                        `json:"worst_symbol"`   // Worst performing symbol
}

// SymbolPerformance symbol performance statistics
type SymbolPerformance struct {
	Symbol        string  `json:"symbol"`         // Coin symbol
	TotalTrades   int     `json:"total_trades"`   // Number of trades
	WinningTrades int     `json:"winning_trades"` // Number of winning trades
	LosingTrades  int     `json:"losing_trades"`  // Number of losing trades
	WinRate       float64 `json:"win_rate"`       // Win rate
	TotalPnL      float64 `json:"total_pn_l"`     // Total profit/loss
	AvgPnL        float64 `json:"avg_pn_l"`       // Average profit/loss
}

// AnalyzePerformance analyzes trading performance
// If lookbackCycles <= 0, analyze all historical records
func (l *DecisionLogger) AnalyzePerformance(lookbackCycles int) (*PerformanceAnalysis, error) {
	var records []*DecisionRecord
	var err error

	// If lookbackCycles <= 0, get all historical records
	if lookbackCycles <= 0 {
		records, err = l.GetAllRecords()
		if err != nil {
			return nil, fmt.Errorf("failed to read all historical records: %w", err)
		}
	} else {
		records, err = l.GetLatestRecords(lookbackCycles)
		if err != nil {
			return nil, fmt.Errorf("failed to read historical records: %w", err)
		}
	}

	if len(records) == 0 {
		return &PerformanceAnalysis{
			RecentTrades: []TradeOutcome{},
			SymbolStats:  make(map[string]*SymbolPerformance),
		}, nil
	}

	analysis := &PerformanceAnalysis{
		TotalTrades:   0,
		WinningTrades: 0,
		LosingTrades:  0,
		RecentTrades:  []TradeOutcome{},
		SymbolStats:   make(map[string]*SymbolPerformance),
	}

	// Use SQL query to more efficiently get open/close position pairs
	openPositions := make(map[string]map[string]interface{})

	// Get all opening records in expanded window (for tracking unclosed positions)
	// If analyzing all records, use all records; otherwise use expanded window
	var allRecords []*DecisionRecord
	if lookbackCycles <= 0 {
		// Already got all records
		allRecords = records
	} else {
		// Get expanded window to track positions that may span across window
		allRecords, err = l.GetLatestRecords(lookbackCycles * 3)
		if err == nil && len(allRecords) > len(records) {
			// Use the expanded window for position tracking
		} else {
			allRecords = records
		}
	}
	
	// Pre-populate openPositions from allRecords to track positions that may have been opened
	// before the analysis window but closed within it. This is critical for correctly matching open/close pairs.
	// Only do this if allRecords is a superset of records (i.e., when using expanded window)
	// Otherwise, we'll process all records together in the main loop below
	if len(allRecords) > len(records) {
		for _, record := range allRecords {
			for _, action := range record.Decisions {
				if !action.Success {
					continue
				}

				symbol := action.Symbol
				side := ""
				if action.Action == "open_long" || action.Action == "close_long" {
					side = "long"
				} else if action.Action == "open_short" || action.Action == "close_short" {
					side = "short"
				}
				if side == "" {
					continue
				}
				posKey := symbol + "_" + side

				switch action.Action {
				case "open_long", "open_short":
					openPositions[posKey] = map[string]interface{}{
						"side":      side,
						"openPrice": action.Price,
						"openTime":  action.Timestamp,
						"quantity":  action.Quantity,
						"leverage":  action.Leverage,
					}
				case "close_long", "close_short":
					// Only delete if it exists - this handles the case where we're tracking
					// positions opened before the analysis window
					if _, exists := openPositions[posKey]; exists {
						delete(openPositions, posKey)
					}
				}
			}
		}
	}

	// Iterate through records in analysis window and generate trade results
	// Process records chronologically to correctly match open/close pairs
	for _, record := range records {
		for _, action := range record.Decisions {
			if !action.Success {
				continue
			}

			symbol := action.Symbol
			side := ""
			if action.Action == "open_long" || action.Action == "close_long" {
				side = "long"
			} else if action.Action == "open_short" || action.Action == "close_short" {
				side = "short"
			}
			if side == "" {
				continue
			}
			posKey := symbol + "_" + side

			switch action.Action {
			case "open_long", "open_short":
				// Track opened positions (will be matched with closes later)
				openPositions[posKey] = map[string]interface{}{
					"side":      side,
					"openPrice": action.Price,
					"openTime":  action.Timestamp,
					"quantity":  action.Quantity,
					"leverage":  action.Leverage,
				}

			case "close_long", "close_short":
				// Match close with corresponding open position
				// If no matching open found in current tracking, try to find it from earlier in records
				if _, exists := openPositions[posKey]; !exists {
					// Try to find the matching open position by scanning forwards through records
					// Records are in chronological order (oldest to newest), so scan from beginning
					// This handles cases where opens/closes might be in different decision records
					currentRecordIndex := -1
					for idx, r := range records {
						if r == record {
							currentRecordIndex = idx
							break
						}
					}
					
					if currentRecordIndex > 0 {
						for j := 0; j < currentRecordIndex; j++ {
							prevRecord := records[j]
							if prevRecord == nil {
								continue
							}
							for _, prevAction := range prevRecord.Decisions {
								if !prevAction.Success {
									continue
								}
								prevSymbol := prevAction.Symbol
								prevSide := ""
								if prevAction.Action == "open_long" || prevAction.Action == "close_long" {
									prevSide = "long"
								} else if prevAction.Action == "open_short" || prevAction.Action == "close_short" {
									prevSide = "short"
								}
								if prevSide == "" {
									continue
								}
								prevPosKey := prevSymbol + "_" + prevSide
								
								if prevPosKey == posKey && (prevAction.Action == "open_long" || prevAction.Action == "open_short") {
									// Found matching open - use it for this close
									openPositions[posKey] = map[string]interface{}{
										"side":      prevSide,
										"openPrice": prevAction.Price,
										"openTime":  prevAction.Timestamp,
										"quantity":  prevAction.Quantity,
										"leverage":  prevAction.Leverage,
									}
									break
								}
							}
							if _, found := openPositions[posKey]; found {
								break
							}
						}
					}
				}
				
				if openPos, exists := openPositions[posKey]; exists {
					openPrice := openPos["openPrice"].(float64)
					openTime := openPos["openTime"].(time.Time)
					side := openPos["side"].(string)
					quantity := openPos["quantity"].(float64)
					leverage := openPos["leverage"].(int)

					var pnl float64
					if side == "long" {
						pnl = quantity * (action.Price - openPrice)
					} else {
						pnl = quantity * (openPrice - action.Price)
					}

					positionValue := quantity * openPrice
					marginUsed := positionValue / float64(leverage)
					pnlPct := 0.0
					if marginUsed > 0 {
						pnlPct = (pnl / marginUsed) * 100
					}

					outcome := TradeOutcome{
						Symbol:        symbol,
						Side:          side,
						Quantity:      quantity,
						Leverage:      leverage,
						OpenPrice:     openPrice,
						ClosePrice:    action.Price,
						PositionValue: positionValue,
						MarginUsed:    marginUsed,
						PnL:           pnl,
						PnLPct:        pnlPct,
						Duration:      action.Timestamp.Sub(openTime).String(),
						OpenTime:      openTime,
						CloseTime:     action.Timestamp,
					}

					analysis.RecentTrades = append(analysis.RecentTrades, outcome)
					analysis.TotalTrades++

					if pnl > 0 {
						analysis.WinningTrades++
						analysis.AvgWin += pnl
					} else if pnl < 0 {
						analysis.LosingTrades++
						analysis.AvgLoss += pnl
					}

					if _, exists := analysis.SymbolStats[symbol]; !exists {
						analysis.SymbolStats[symbol] = &SymbolPerformance{
							Symbol: symbol,
						}
					}
					stats := analysis.SymbolStats[symbol]
					stats.TotalTrades++
					stats.TotalPnL += pnl
					if pnl > 0 {
						stats.WinningTrades++
					} else if pnl < 0 {
						stats.LosingTrades++
					}

					delete(openPositions, posKey)
				}
			}
		}
	}

	// Calculate statistics
	if analysis.TotalTrades > 0 {
		analysis.WinRate = (float64(analysis.WinningTrades) / float64(analysis.TotalTrades)) * 100

		totalWinAmount := analysis.AvgWin
		totalLossAmount := analysis.AvgLoss

		if analysis.WinningTrades > 0 {
			analysis.AvgWin /= float64(analysis.WinningTrades)
		}
		if analysis.LosingTrades > 0 {
			analysis.AvgLoss /= float64(analysis.LosingTrades)
		}

		if totalLossAmount != 0 {
			analysis.ProfitFactor = totalWinAmount / (-totalLossAmount)
		} else if totalWinAmount > 0 {
			analysis.ProfitFactor = 999.0
		}
	}

	// Calculate win rate and average profit/loss for each symbol
	bestPnL := -999999.0
	worstPnL := 999999.0
	for symbol, stats := range analysis.SymbolStats {
		if stats.TotalTrades > 0 {
			stats.WinRate = (float64(stats.WinningTrades) / float64(stats.TotalTrades)) * 100
			stats.AvgPnL = stats.TotalPnL / float64(stats.TotalTrades)

			if stats.TotalPnL > bestPnL {
				bestPnL = stats.TotalPnL
				analysis.BestSymbol = symbol
			}
			if stats.TotalPnL < worstPnL {
				worstPnL = stats.TotalPnL
				analysis.WorstSymbol = symbol
			}
		}
	}

	// Keep only recent trades (reverse order: newest first)
	if len(analysis.RecentTrades) > 10 {
		for i, j := 0, len(analysis.RecentTrades)-1; i < j; i, j = i+1, j-1 {
			analysis.RecentTrades[i], analysis.RecentTrades[j] = analysis.RecentTrades[j], analysis.RecentTrades[i]
		}
		analysis.RecentTrades = analysis.RecentTrades[:10]
	} else if len(analysis.RecentTrades) > 0 {
		for i, j := 0, len(analysis.RecentTrades)-1; i < j; i, j = i+1, j-1 {
			analysis.RecentTrades[i], analysis.RecentTrades[j] = analysis.RecentTrades[j], analysis.RecentTrades[i]
		}
	}

	analysis.SharpeRatio = l.calculateSharpeRatio(records)

	return analysis, nil
}

// calculateSharpeRatio calculates Sharpe ratio
func (l *DecisionLogger) calculateSharpeRatio(records []*DecisionRecord) float64 {
	if len(records) < 2 {
		return 0.0
	}

	var equities []float64
	for _, record := range records {
		equity := record.AccountState.TotalBalance
		if equity > 0 {
			equities = append(equities, equity)
		}
	}

	if len(equities) < 2 {
		return 0.0
	}

	var returns []float64
	for i := 1; i < len(equities); i++ {
		if equities[i-1] > 0 {
			periodReturn := (equities[i] - equities[i-1]) / equities[i-1]
			returns = append(returns, periodReturn)
		}
	}

	if len(returns) == 0 {
		return 0.0
	}

	sumReturns := 0.0
	for _, r := range returns {
		sumReturns += r
	}
	meanReturn := sumReturns / float64(len(returns))

	sumSquaredDiff := 0.0
	for _, r := range returns {
		diff := r - meanReturn
		sumSquaredDiff += diff * diff
	}
	variance := sumSquaredDiff / float64(len(returns))
	stdDev := math.Sqrt(variance)

	if stdDev == 0 {
		if meanReturn > 0 {
			return 999.0
		} else if meanReturn < 0 {
			return -999.0
		}
		return 0.0
	}

	sharpeRatio := meanReturn / stdDev
	return sharpeRatio
}
