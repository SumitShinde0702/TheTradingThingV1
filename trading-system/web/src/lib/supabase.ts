import { createClient } from '@supabase/supabase-js';

// Supabase configuration
// Get from environment variables (create .env file in web/ directory)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gboezrzwcsdktdmzmjwn.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Check if Supabase is properly configured
const isSupabaseKeyValid = SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== '' && SUPABASE_ANON_KEY !== 'dummy-key' && SUPABASE_ANON_KEY.length > 20;

// Only warn if Supabase is enabled but key is missing (don't warn if intentionally disabled)
if (!isSupabaseKeyValid && import.meta.env.VITE_USE_SUPABASE !== 'false') {
  // Silent - will fall back to API automatically
}

// Create Supabase client (will use dummy key if not configured, but functions check before using)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || 'dummy-key');

// Helper function to fetch decisions for a trader
export async function fetchDecisionsFromSupabase(traderId: string, limit?: number) {
  try {
    // Check if Supabase is properly configured
    if (!isSupabaseKeyValid) {
      throw new Error('Supabase not configured');
    }

    // Direct query with limit (more efficient than two-step query)
    let query = supabase
      .from('decisions')
      .select('*')
      .eq('trader_id', traderId)
      .order('timestamp', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data: decisionData, error: queryError } = await query;

    if (queryError) {
      console.error('Supabase query error:', queryError);
      throw queryError;
    }

    if (!decisionData || decisionData.length === 0) {
      console.log(`No decisions found for trader: ${traderId}`);
      return [];
    }

    // Get decision IDs for fetching related data
    const ids = decisionData.map((d: any) => d.id);

    // Fetch related positions and actions
    const { data: positionsData } = await supabase
      .from('positions')
      .select('*')
      .in('decision_id', ids);

    const { data: actionsData } = await supabase
      .from('decision_actions')
      .select('*')
      .in('decision_id', ids);

    // Group positions and actions by decision_id
    const positionsByDecision: Record<number, any[]> = {};
    const actionsByDecision: Record<number, any[]> = {};

    positionsData?.forEach(pos => {
      if (!positionsByDecision[pos.decision_id]) {
        positionsByDecision[pos.decision_id] = [];
      }
      positionsByDecision[pos.decision_id].push(pos);
    });

    actionsData?.forEach(action => {
      if (!actionsByDecision[action.decision_id]) {
        actionsByDecision[action.decision_id] = [];
      }
      actionsByDecision[action.decision_id].push({
        action: action.action,
        symbol: action.symbol,
        quantity: action.quantity,
        leverage: action.leverage,
        price: action.price,
        order_id: action.order_id,
        timestamp: action.timestamp,
        success: action.success,
        error: action.error,
      });
    });

    // Transform Supabase data to match DecisionRecord format
    return decisionData.map((record: any) => ({
      timestamp: record.timestamp,
      cycle_number: record.cycle_number,
      input_prompt: record.input_prompt,
      cot_trace: record.cot_trace,
      decision_json: record.decision_json,
      raw_response: record.raw_response,
      success: record.success,
      error_message: record.error_message,
      account_state: {
        total_balance: record.account_total_balance,
        available_balance: record.account_available_balance,
        total_unrealized_profit: record.account_unrealized_profit,
        position_count: record.account_position_count,
        margin_used_pct: record.account_margin_used_pct,
      },
      positions: (positionsByDecision[record.id] || []).map((pos: any) => ({
        symbol: pos.symbol,
        side: pos.side,
        position_amt: pos.position_amt,
        entry_price: pos.entry_price,
        mark_price: pos.mark_price,
        unrealized_profit: pos.unrealized_profit,
        leverage: pos.leverage,
        liquidation_price: pos.liquidation_price,
      })),
      candidate_coins: Array.isArray(record.candidate_coins) 
        ? record.candidate_coins 
        : (record.candidate_coins ? JSON.parse(record.candidate_coins) : []),
      decisions: actionsByDecision[record.id] || [],
      execution_log: Array.isArray(record.execution_log)
        ? record.execution_log
        : (record.execution_log ? JSON.parse(record.execution_log) : []),
    }));
  } catch (error) {
    console.error('Failed to fetch from Supabase:', error);
    throw error;
  }
}

// Fetch all decisions (for equity history)
export async function fetchAllDecisionsFromSupabase(traderId: string) {
  try {
    // Check if Supabase is properly configured
    if (!isSupabaseKeyValid) {
      throw new Error('Supabase not configured');
    }
    
    const { data, error } = await supabase
      .from('decisions')
      .select('*')
      .eq('trader_id', traderId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Supabase query error:', error);
      throw error;
    }

    // Transform to DecisionRecord format
    return data?.map((record: any) => ({
      timestamp: record.timestamp,
      cycle_number: record.cycle_number,
      input_prompt: record.input_prompt || '',
      cot_trace: record.cot_trace || '',
      decision_json: record.decision_json || '',
      success: record.success ?? true,
      error_message: record.error_message || '',
      account_state: {
        total_balance: record.account_total_balance || 0,
        available_balance: record.account_available_balance || 0,
        total_unrealized_profit: record.account_unrealized_profit || 0,
        position_count: record.account_position_count || 0,
        margin_used_pct: record.account_margin_used_pct || 0,
      },
      // Parse JSON fields
      candidate_coins: Array.isArray(record.candidate_coins)
        ? record.candidate_coins
        : (record.candidate_coins ? JSON.parse(record.candidate_coins) : []),
      execution_log: Array.isArray(record.execution_log)
        ? record.execution_log
        : (record.execution_log ? JSON.parse(record.execution_log) : []),
      positions: [],
      decisions: [],
    })) || [];
  } catch (error) {
    console.error('Failed to fetch all decisions from Supabase:', error);
    throw error;
  }
}

// Fetch statistics
export async function fetchStatisticsFromSupabase(traderId: string) {
  try {
    // Check if Supabase is properly configured
    if (!isSupabaseKeyValid) {
      throw new Error('Supabase not configured');
    }
    
    // Get total cycles
    const { count: totalCycles } = await supabase
      .from('decisions')
      .select('*', { count: 'exact', head: true })
      .eq('trader_id', traderId);

    // Get successful/failed cycles
    const { data: successData } = await supabase
      .from('decisions')
      .select('success')
      .eq('trader_id', traderId);

    let successfulCycles = 0;
    let failedCycles = 0;
    if (successData) {
      successData.forEach((d: any) => {
        if (d.success) successfulCycles++;
        else failedCycles++;
      });
    }

    // Get decision IDs first
    const { data: decisionIds } = await supabase
      .from('decisions')
      .select('id')
      .eq('trader_id', traderId);

    const ids = decisionIds?.map(d => d.id) || [];

    // Get decision actions counts
    const { data: actionsData } = await supabase
      .from('decision_actions')
      .select('action, success')
      .in('decision_id', ids);

    let totalOpenPositions = 0;
    let totalClosePositions = 0;
    if (actionsData) {
      actionsData.forEach((action: any) => {
        if (action.success) {
          if (action.action === 'open_long' || action.action === 'open_short') {
            totalOpenPositions++;
          } else if (action.action === 'close_long' || action.action === 'close_short') {
            totalClosePositions++;
          }
        }
      });
    }

    return {
      total_cycles: totalCycles || 0,
      successful_cycles: successfulCycles,
      failed_cycles: failedCycles,
      total_open_positions: totalOpenPositions,
      total_close_positions: totalClosePositions,
    };
  } catch (error) {
    console.error('Failed to fetch statistics from Supabase:', error);
    throw error;
  }
}

