-- Reset ALL Traders to 10000 USDT Starting Balance (Complete Reset)
-- This resets both single-agent and multi-agent traders
-- Run this script in Supabase SQL Editor to reset all traders back to 10000 USDT
-- 
-- This will:
-- 1. Delete all existing records (decisions, positions, decision_actions) for ALL traders
-- 2. Reset ID sequences to start from 1 (fresh ID numbering)
-- 3. Seed cycle #0 with 10000 USDT for all 4 traders:
--    - openai_trader_single (Single-Agent)
--    - qwen_trader_single (Single-Agent)
--    - openai_trader_multi (Multi-Agent)
--    - qwen_trader_multi (Multi-Agent)
-- 4. System will restart from cycle #1 after this

BEGIN;

-- Step 1: Delete all existing records (in correct order due to foreign keys)
DELETE FROM decision_actions;
DELETE FROM positions;
DELETE FROM decisions;

-- Step 1.5: Reset ID sequences to start from 1 (fresh start)
ALTER SEQUENCE decisions_id_seq RESTART WITH 1;
ALTER SEQUENCE positions_id_seq RESTART WITH 1;
ALTER SEQUENCE decision_actions_id_seq RESTART WITH 1;

-- Step 2: Seed initial balance records (cycle #0) with 10000 USDT for all traders
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
) VALUES
    -- OpenAI Trader (Single-Agent)
    (
        'openai_trader_single',
        CURRENT_TIMESTAMP,
        0,
        'Initial seed record',
        '',
        '{"seed": true}',
        '',
        true,
        NULL,
        10000.0,
        10000.0,
        0.0,
        0,
        0.0,
        '[]',
        '[]'
    ),
    -- Qwen Trader (Single-Agent)
    (
        'qwen_trader_single',
        CURRENT_TIMESTAMP,
        0,
        'Initial seed record',
        '',
        '{"seed": true}',
        '',
        true,
        NULL,
        10000.0,
        10000.0,
        0.0,
        0,
        0.0,
        '[]',
        '[]'
    ),
    -- OpenAI Trader (Multi-Agent)
    (
        'openai_trader_multi',
        CURRENT_TIMESTAMP,
        0,
        'Initial seed record',
        '',
        '{"seed": true}',
        '',
        true,
        NULL,
        10000.0,
        10000.0,
        0.0,
        0,
        0.0,
        '[]',
        '[]'
    ),
    -- Qwen Trader (Multi-Agent)
    (
        'qwen_trader_multi',
        CURRENT_TIMESTAMP,
        0,
        'Initial seed record',
        '',
        '{"seed": true}',
        '',
        true,
        NULL,
        10000.0,
        10000.0,
        0.0,
        0,
        0.0,
        '[]',
        '[]'
    )
ON CONFLICT (trader_id, cycle_number) DO UPDATE SET
    account_total_balance = 10000.0,
    account_available_balance = 10000.0,
    account_unrealized_profit = 0.0,
    account_position_count = 0,
    account_margin_used_pct = 0.0,
    timestamp = CURRENT_TIMESTAMP;

-- Verify the reset
DO $$
DECLARE
    openai_single_count INTEGER;
    qwen_single_count INTEGER;
    openai_multi_count INTEGER;
    qwen_multi_count INTEGER;
    openai_single_balance REAL;
    qwen_single_balance REAL;
    openai_multi_balance REAL;
    qwen_multi_balance REAL;
BEGIN
    -- Check OpenAI Single-Agent trader
    SELECT COUNT(*) INTO openai_single_count
    FROM decisions 
    WHERE trader_id = 'openai_trader_single' AND cycle_number = 0;
    
    SELECT account_total_balance INTO openai_single_balance
    FROM decisions 
    WHERE trader_id = 'openai_trader_single' AND cycle_number = 0
    LIMIT 1;
    
    -- Check Qwen Single-Agent trader
    SELECT COUNT(*) INTO qwen_single_count
    FROM decisions 
    WHERE trader_id = 'qwen_trader_single' AND cycle_number = 0;
    
    SELECT account_total_balance INTO qwen_single_balance
    FROM decisions 
    WHERE trader_id = 'qwen_trader_single' AND cycle_number = 0
    LIMIT 1;
    
    -- Check OpenAI Multi-Agent trader
    SELECT COUNT(*) INTO openai_multi_count
    FROM decisions 
    WHERE trader_id = 'openai_trader_multi' AND cycle_number = 0;
    
    SELECT account_total_balance INTO openai_multi_balance
    FROM decisions 
    WHERE trader_id = 'openai_trader_multi' AND cycle_number = 0
    LIMIT 1;
    
    -- Check Qwen Multi-Agent trader
    SELECT COUNT(*) INTO qwen_multi_count
    FROM decisions 
    WHERE trader_id = 'qwen_trader_multi' AND cycle_number = 0;
    
    SELECT account_total_balance INTO qwen_multi_balance
    FROM decisions 
    WHERE trader_id = 'qwen_trader_multi' AND cycle_number = 0
    LIMIT 1;
    
    RAISE NOTICE '✅ Reset Complete!';
    RAISE NOTICE '';
    RAISE NOTICE 'Single-Agent Traders:';
    RAISE NOTICE '  openai_trader_single: % records, Balance: % USDT', openai_single_count, openai_single_balance;
    RAISE NOTICE '  qwen_trader_single: % records, Balance: % USDT', qwen_single_count, qwen_single_balance;
    RAISE NOTICE '';
    RAISE NOTICE 'Multi-Agent Traders:';
    RAISE NOTICE '  openai_trader_multi: % records, Balance: % USDT', openai_multi_count, openai_multi_balance;
    RAISE NOTICE '  qwen_trader_multi: % records, Balance: % USDT', qwen_multi_count, qwen_multi_balance;
END $$;

COMMIT;

-- After running this script:
-- ⚠️  IMPORTANT: You MUST restart BOTH backend servers after running this script!
-- 
-- Why? The paper trader stores positions in-memory. Even though the database is reset,
-- the running backends still have old positions in memory. Restart is required to:
-- 1. Clear in-memory positions
-- 2. Restore state from cycle #0 (10000 USDT, no positions)
-- 3. Start fresh from cycle #1
--
-- Steps:
-- 1. Run this SQL script in Supabase SQL Editor
-- 2. Stop both backends (Ctrl+C):
--    - nofx-single.exe (port 8080)
--    - nofx-multiagent.exe (port 8081)
-- 3. Restart both backends:
--    - nofx-single.exe config-single.json
--    - nofx-multiagent.exe config.json
-- 4. The system will restore from cycle #0 and start with 10000 USDT
-- 5. New cycles will start from #1 with no positions
-- 6. All 4 traders will begin fresh from 10000 USDT

