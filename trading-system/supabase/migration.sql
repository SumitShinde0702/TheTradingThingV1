-- Supabase Migration Script for Decision Logger
-- Run this in your Supabase SQL Editor to create the required tables

-- Create decisions table
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

-- Create positions table
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

-- Create decision_actions table
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_decisions_trader_id ON decisions(trader_id);
CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp);
CREATE INDEX IF NOT EXISTS idx_decisions_cycle ON decisions(trader_id, cycle_number);
CREATE INDEX IF NOT EXISTS idx_decisions_success ON decisions(success);
CREATE INDEX IF NOT EXISTS idx_positions_decision ON positions(decision_id);
CREATE INDEX IF NOT EXISTS idx_actions_decision ON decision_actions(decision_id);
CREATE INDEX IF NOT EXISTS idx_actions_timestamp ON decision_actions(timestamp);

-- Enable Row Level Security (RLS) - optional, but recommended for security
-- You can adjust policies based on your authentication setup
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_actions ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (adjust based on your needs)
-- Allow all operations for now (you can restrict based on trader_id or user authentication)
-- Drop existing policies if they exist, then recreate (makes migration idempotent)
DROP POLICY IF EXISTS "Allow all operations on decisions" ON decisions;
DROP POLICY IF EXISTS "Allow all operations on positions" ON positions;
DROP POLICY IF EXISTS "Allow all operations on decision_actions" ON decision_actions;

CREATE POLICY "Allow all operations on decisions" ON decisions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on positions" ON positions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on decision_actions" ON decision_actions FOR ALL USING (true) WITH CHECK (true);

-- Seed initial balance records for traders (cycle #0)
-- This ensures there's always a record to restore from, starting with 10000 USDT
-- Run this after creating the tables to initialize starting balances
-- 
-- Note: Update trader_id values to match your config.json trader IDs
INSERT INTO decisions (
    trader_id, 
    timestamp, 
    cycle_number, 
    input_prompt, 
    cot_trace, 
    decision_json, 
    raw_response,
    success, 
    error_message,
    account_total_balance, 
    account_available_balance, 
    account_unrealized_profit,
    account_position_count, 
    account_margin_used_pct,
    execution_log, 
    candidate_coins
)
SELECT 
    trader_id,
    CURRENT_TIMESTAMP,
    0 as cycle_number,  -- Cycle #0 = initial seed record
    'Initial seed record' as input_prompt,
    '' as cot_trace,
    '{"seed": true}' as decision_json,
    '' as raw_response,
    true as success,
    NULL as error_message,
    10000.0 as account_total_balance,      -- Starting balance: 10000 USDT
    10000.0 as account_available_balance,  -- All available initially
    0.0 as account_unrealized_profit,     -- No open positions
    0 as account_position_count,          -- No positions
    0.0 as account_margin_used_pct,       -- No margin used
    '[]' as execution_log,                -- Empty JSON array as text
    '[]' as candidate_coins               -- Empty JSON array as text
FROM (
    VALUES 
        ('openai_trader'),
        ('qwen_trader')
    -- Add more trader IDs here if you have additional traders
) AS seed_traders(trader_id)
WHERE NOT EXISTS (
    SELECT 1 FROM decisions 
    WHERE decisions.trader_id = seed_traders.trader_id 
    AND decisions.cycle_number = 0
)
ON CONFLICT (trader_id, cycle_number) DO NOTHING;

