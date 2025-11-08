import type {
  SystemStatus,
  AccountInfo,
  Position,
  DecisionRecord,
  Statistics,
  TraderInfo,
  CompetitionData,
} from '../types';
import { 
  fetchDecisionsFromSupabase, 
  fetchAllDecisionsFromSupabase,
  fetchStatisticsFromSupabase 
} from './supabase';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE !== 'false'; // Default to true if not set

// Helper to check if Supabase is properly configured
const isSupabaseConfigured = () => {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return USE_SUPABASE && key && key !== '' && key !== 'dummy-key' && key.length > 20;
};

// Helper to add timeout to promises
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    )
  ]);
};

export const api = {
  // 竞赛相关接口
  async getCompetition(): Promise<CompetitionData> {
    const res = await fetch(`${API_BASE}/competition`);
    if (!res.ok) throw new Error('获取竞赛数据失败');
    return res.json();
  },

  async getTraders(): Promise<TraderInfo[]> {
    const res = await fetch(`${API_BASE}/traders`);
    if (!res.ok) throw new Error('获取trader列表失败');
    return res.json();
  },

  // 获取系统状态（支持trader_id）
  async getStatus(traderId?: string): Promise<SystemStatus> {
    const url = traderId
      ? `${API_BASE}/status?trader_id=${traderId}`
      : `${API_BASE}/status`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('获取系统状态失败');
    return res.json();
  },

  // 获取账户信息（支持trader_id）
  async getAccount(traderId?: string): Promise<AccountInfo> {
    const url = traderId
      ? `${API_BASE}/account?trader_id=${traderId}`
      : `${API_BASE}/account`;
    
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Account API error (${res.status}):`, errorText);
        throw new Error(`获取账户信息失败: ${res.status} ${errorText.substring(0, 100)}`);
      }
      
      const data = await res.json();
      console.log(`✅ Account data loaded for trader ${traderId || 'default'}:`, {
        total_equity: data.total_equity,
        available_balance: data.available_balance,
        total_pnl: data.total_pnl,
        position_count: data.position_count
      });
      return data;
    } catch (error) {
      console.error('Account API fetch error:', error);
      throw error;
    }
  },

  // 获取持仓列表（支持trader_id）
  async getPositions(traderId?: string): Promise<Position[]> {
    const url = traderId
      ? `${API_BASE}/positions?trader_id=${traderId}`
      : `${API_BASE}/positions`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('获取持仓列表失败');
    return res.json();
  },

  // 获取决策日志（支持trader_id）
  async getDecisions(traderId?: string): Promise<DecisionRecord[]> {
    // Use Supabase if enabled and traderId is provided
    if (isSupabaseConfigured() && traderId) {
      try {
        // Add 2 second timeout to Supabase requests to fail fast
        const data = await withTimeout(fetchAllDecisionsFromSupabase(traderId), 2000);
        return data;
      } catch (error: any) {
        // Silently fall back to backend API - don't log timeout or API key errors
        // This prevents console spam and allows fast fallback
      }
    }
    
    // Fallback to backend API
    const url = traderId
      ? `${API_BASE}/decisions?trader_id=${traderId}`
      : `${API_BASE}/decisions`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('获取决策日志失败');
    return res.json();
  },

  // 获取最新决策（支持trader_id）
  async getLatestDecisions(traderId?: string): Promise<DecisionRecord[]> {
    // Use Supabase if enabled and traderId is provided
    if (isSupabaseConfigured() && traderId) {
      try {
        // Add 2 second timeout to Supabase requests to fail fast
        const data = await withTimeout(fetchDecisionsFromSupabase(traderId, 10), 2000);
        console.log(`✅ Fetched ${data.length} decisions from Supabase for trader: ${traderId}`);
        if (data && data.length > 0) {
          return data;
        }
        // If Supabase returns empty array, still try backend API as fallback
        console.log('⚠️ Supabase returned empty results, trying backend API...');
      } catch (error: any) {
        // Silently fall back to backend API - don't log timeout or API key errors
        // This prevents console spam and allows fast fallback
      }
    }
    
    // Fallback to backend API (or use if Supabase not configured)
    const url = traderId
      ? `${API_BASE}/decisions/latest?trader_id=${traderId}`
      : `${API_BASE}/decisions/latest`;
    const res = await fetch(url);
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Backend API error (${res.status}):`, errorText);
      throw new Error(`获取最新决策失败: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    console.log(`✅ Fetched ${data.length} decisions from backend API for trader: ${traderId}`);
    return data;
  },

  // 获取统计信息（支持trader_id）
  async getStatistics(traderId?: string): Promise<Statistics> {
    // Use Supabase if enabled and traderId is provided
    if (isSupabaseConfigured() && traderId) {
      try {
        // Add 2 second timeout to Supabase requests to fail fast
        const data = await withTimeout(fetchStatisticsFromSupabase(traderId), 2000);
        return data;
      } catch (error: any) {
        // Silently fall back to backend API - don't log timeout or API key errors
        // This prevents console spam and allows fast fallback
      }
    }
    
    // Fallback to backend API
    const url = traderId
      ? `${API_BASE}/statistics?trader_id=${traderId}`
      : `${API_BASE}/statistics`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('获取统计信息失败');
    return res.json();
  },

  // 获取收益率历史数据（支持trader_id和startCycle参数）
  async getEquityHistory(traderId?: string, startCycle?: number): Promise<any[]> {
    // Use Supabase if enabled and traderId is provided
    if (isSupabaseConfigured() && traderId) {
      try {
        // Add 2 second timeout to Supabase requests to fail fast
        const decisions = await withTimeout(fetchAllDecisionsFromSupabase(traderId), 2000);
        
        // Filter by startCycle if provided
        let filtered = decisions;
        if (startCycle !== undefined && startCycle > 0) {
          filtered = decisions.filter(d => d.cycle_number >= startCycle);
        }
        
        // Transform to equity history format
        const initialBalance = filtered.length > 0 ? filtered[0].account_state.total_balance : 0;
        
        return filtered.map(record => ({
          timestamp: record.timestamp,
          total_equity: record.account_state.total_balance,
          available_balance: record.account_state.available_balance,
          total_pnl: record.account_state.total_balance - initialBalance,
          total_pnl_pct: initialBalance > 0 
            ? ((record.account_state.total_balance - initialBalance) / initialBalance) * 100 
            : 0,
          position_count: record.account_state.position_count,
          margin_used_pct: record.account_state.margin_used_pct,
          cycle_number: record.cycle_number,
        }));
      } catch (error: any) {
        // Silently fall back to backend API - don't log timeout or API key errors
        // This prevents console spam and allows fast fallback
      }
    }
    
    // Fallback to backend API
    let url = traderId
      ? `${API_BASE}/equity-history?trader_id=${traderId}`
      : `${API_BASE}/equity-history`;
    
    // 如果指定了startCycle，添加到URL参数
    if (startCycle !== undefined && startCycle > 0) {
      url += traderId ? `&startCycle=${startCycle}` : `?startCycle=${startCycle}`;
    }
    
    const res = await fetch(url);
    if (!res.ok) throw new Error('获取历史数据失败');
    return res.json();
  },

  // 获取AI学习表现分析（支持trader_id）
  async getPerformance(traderId?: string): Promise<any> {
    const url = traderId
      ? `${API_BASE}/performance?trader_id=${traderId}`
      : `${API_BASE}/performance`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('获取AI学习数据失败');
    return res.json();
  },

  // 获取最新交易信号（支持trader_id或model）
  async getTradingSignal(traderId?: string, model?: string): Promise<any> {
    let url = `${API_BASE}/trading-signal`;
    const params = new URLSearchParams();
    if (traderId) {
      params.append('trader_id', traderId);
    } else if (model) {
      params.append('model', model);
    }
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error('获取交易信号失败');
    return res.json();
  },

  // Close position
  async closePosition(traderId: string, symbol: string, side: string): Promise<{ success: boolean; symbol: string; side: string; result?: any; error?: string }> {
    // Normalize side to lowercase
    const normalizedSide = side.toLowerCase();
    const url = `${API_BASE}/positions/close?trader_id=${encodeURIComponent(traderId)}`;
    console.log('🔵 Calling close position API:', { url, traderId, symbol, side: normalizedSide });
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol, side: normalizedSide }),
      });

      console.log('🔵 Close position response:', { status: res.status, statusText: res.statusText, ok: res.ok });

      if (!res.ok) {
        // Try to get error response as text first, then parse as JSON
        const responseText = await res.text();
        console.error('🔴 Close position error response (raw):', responseText);
        
        let errorData: any = {};
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          console.error('Failed to parse error response as JSON, using raw text');
          errorData = { error: responseText || `HTTP ${res.status} ${res.statusText}` };
        }
        
        console.error('🔴 Close position error:', errorData);
        
        // Build detailed error message
        let errorMsg = errorData.error || `Failed to close position: HTTP ${res.status}`;
        
        // Add available trader IDs if provided
        if (errorData.available_ids && Array.isArray(errorData.available_ids)) {
          errorMsg += `\n\nAvailable trader IDs: ${errorData.available_ids.join(', ')}`;
        }
        
        // Add requested trader ID if provided
        if (errorData.trader_id) {
          errorMsg += `\n\nRequested trader ID: "${errorData.trader_id}"`;
        }
        
        // For 404 errors, provide helpful troubleshooting
        if (res.status === 404) {
          if (!errorData.available_ids) {
            errorMsg += '\n\nPossible causes:';
            errorMsg += '\n- Backend server may not be running on port 8080';
            errorMsg += '\n- API endpoint may not be registered';
            errorMsg += '\n- Check browser console and backend logs for details';
          }
        }
        
        return {
          success: false,
          symbol,
          side: normalizedSide,
          error: errorMsg,
        };
      }

      const data = await res.json();
      return data;
    } catch (error: any) {
      console.error('Close position API error:', error);
      return {
        success: false,
        symbol,
        side: normalizedSide,
        error: error.message || 'Failed to close position. Please check if the server is running.',
      };
    }
  },

  // Force close position (bypasses cache, allows manual quantity)
  async forceClosePosition(traderId: string, symbol: string, side: string, quantity?: number): Promise<{ success: boolean; symbol: string; side: string; result?: any; error?: string }> {
    // Normalize side to lowercase
    const normalizedSide = side.toLowerCase();
    const url = `${API_BASE}/positions/force-close?trader_id=${encodeURIComponent(traderId)}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol, side: normalizedSide, quantity: quantity || 0 }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return {
          success: false,
          symbol,
          side: normalizedSide,
          error: errorData.error || `Failed to force-close position: ${res.status} ${res.statusText}`,
        };
      }

      const data = await res.json();
      return data;
    } catch (error: any) {
      console.error('Force close position API error:', error);
      return {
        success: false,
        symbol,
        side,
        error: error.message || 'Failed to force-close position. Please check if the server is running.',
      };
    }
  },

  // Pay for model access
  // Note: This endpoint should point to TheTradingThingV1 server (port 8443)
  async payForModel(modelName: string): Promise<{ success: boolean; payment?: any; error?: string }> {
    const AI_SERVER_URL = (import.meta as any).env?.VITE_AI_SERVER_URL || 'http://localhost:8443';
    
    try {
      const response = await fetch(`${AI_SERVER_URL}/api/payments/model-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ modelName }),
      });

      // Check if response is OK and is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text.substring(0, 200));
        return {
          success: false,
          error: `Server returned non-JSON response (${response.status}): ${text.substring(0, 100)}`
        };
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        return {
          success: false,
          error: errorData.error || `Payment request failed: ${response.status} ${response.statusText}`
        };
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('Payment API error:', error);
      return {
        success: false,
        error: error.message || 'Payment request failed. Please check if the server is running on port 8443.'
      };
    }
  },

  // AI Agent Purchase with SSE
  // Note: This endpoint should point to TheTradingThingV1 server (port 8443)
  async purchaseAgent(query: string, onEvent: (eventType: string, data: any) => void): Promise<() => void> {
    const AI_SERVER_URL = (import.meta as any).env?.VITE_AI_SERVER_URL || 'http://localhost:8443';
    
    const response = await fetch(`${AI_SERVER_URL}/api/ai/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Purchase request failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('Response body is not readable');
    }

    let buffer = '';

    const processStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            if (!chunk.trim()) continue;
            
            const lines = chunk.split('\n');
            let eventType = 'message';
            let data = null;

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.substring(7).trim();
              } else if (line.startsWith('data: ')) {
                try {
                  data = JSON.parse(line.substring(6));
                } catch (e) {
                  console.error('Failed to parse SSE data:', e, line);
                }
              }
            }

            if (data !== null) {
              onEvent(eventType, data);
            }
          }
        }
      } catch (error: any) {
        console.error('SSE stream error:', error);
        onEvent('error', { error: error?.message || 'Unknown error' });
      }
    };

    processStream();

    // Return cleanup function
    return () => {
      reader.cancel();
    };
  },
};
