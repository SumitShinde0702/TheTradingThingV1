import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { api } from '../lib/api';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface PortfolioData {
  total_equity: number;
  initial_balance: number;
  total_pnl: number;
  total_pnl_pct: number;
  total_positions: number;
  agent_count: number;
  is_running: boolean;
  agents: Array<{
    trader_id: string;
    trader_name: string;
    ai_model: string;
    equity: number;
    initial_balance: number;
    pnl: number;
    pnl_pct: number;
    position_count: number;
    is_running: boolean;
  }>;
}

interface PerformanceAnalysis {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  sharpe_ratio: number;
  recent_trades: Array<{
    symbol: string;
    side: string;
    pn_l: number;
    position_value: number;
    open_time: string;
    close_time: string;
  }>;
}

interface EquityPoint {
  timestamp: string;
  total_equity: number;
  total_pnl: number;
  total_pnl_pct: number;
}

export function PortfolioView() {
  const [retryCount, setRetryCount] = useState(0);
  const [_lastError, setLastError] = useState<Error | null>(null);
  
  const { data: portfolio, error, isLoading, mutate } = useSWR<PortfolioData>(
    'portfolio',
    async () => {
      try {
        const data = await api.getPortfolio();
        setLastError(null);
        setRetryCount(0);
        return data;
      } catch (err: any) {
        setLastError(err);
        if (retryCount < 3) {
          setRetryCount(prev => prev + 1);
          await new Promise(resolve => setTimeout(resolve, 2000));
          throw err;
        }
        throw err;
      }
    },
    {
      refreshInterval: 2000,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
      shouldRetryOnError: true,
      errorRetryCount: 3,
      errorRetryInterval: 2000,
      onErrorRetry: (_error, _key, _config, revalidate, { retryCount }) => {
        if (retryCount >= 3) return;
        setTimeout(() => revalidate({ retryCount }), 2000);
      },
    }
  );

  // Get performance data from first trader (as proxy for overall portfolio)
  const firstTraderId = portfolio?.agents?.[0]?.trader_id;
  const { data: performance } = useSWR<PerformanceAnalysis>(
    firstTraderId ? `performance-${firstTraderId}` : null,
    () => api.getPerformance(firstTraderId),
    { refreshInterval: 5000 }
  );

  // Get equity history for time-based P&L calculations
  const { data: equityHistory } = useSWR<EquityPoint[]>(
    firstTraderId ? `equity-history-${firstTraderId}` : null,
    () => api.getEquityHistory(firstTraderId),
    { refreshInterval: 5000 }
  );

  // Calculate time-based P&L
  const timeBasedPnL = useMemo(() => {
    if (!portfolio) {
      return {
        today: { pnl: 0, pnlPct: 0 },
        sevenDays: { pnl: 0, pnlPct: 0 },
        thirtyDays: { pnl: 0, pnlPct: 0 },
        lifetime: { pnl: 0, pnlPct: 0 },
      };
    }

    if (!equityHistory || equityHistory.length === 0) {
      return {
        today: { pnl: 0, pnlPct: 0 },
        sevenDays: { pnl: 0, pnlPct: 0 },
        thirtyDays: { pnl: 0, pnlPct: 0 },
        lifetime: { pnl: portfolio.total_pnl, pnlPct: portfolio.total_pnl_pct },
      };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Find equity at start of each period
    let todayStartEquity = portfolio.total_equity;
    let sevenDaysStartEquity = portfolio.total_equity;
    let thirtyDaysStartEquity = portfolio.total_equity;

    // Sort by timestamp to find earliest point in each period
    const sortedHistory = [...equityHistory].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (const point of sortedHistory) {
      const pointDate = new Date(point.timestamp);
      
      if (pointDate >= todayStart && todayStartEquity === portfolio.total_equity) {
        todayStartEquity = point.total_equity;
      }
      if (pointDate >= sevenDaysAgo && sevenDaysStartEquity === portfolio.total_equity) {
        sevenDaysStartEquity = point.total_equity;
      }
      if (pointDate >= thirtyDaysAgo && thirtyDaysStartEquity === portfolio.total_equity) {
        thirtyDaysStartEquity = point.total_equity;
      }
    }

    const currentEquity = portfolio.total_equity;

    const todayPnL = currentEquity - todayStartEquity;
    const todayPnLPct = todayStartEquity > 0 ? (todayPnL / todayStartEquity) * 100 : 0;

    const sevenDaysPnL = currentEquity - sevenDaysStartEquity;
    const sevenDaysPnLPct = sevenDaysStartEquity > 0 ? (sevenDaysPnL / sevenDaysStartEquity) * 100 : 0;

    const thirtyDaysPnL = currentEquity - thirtyDaysStartEquity;
    const thirtyDaysPnLPct = thirtyDaysStartEquity > 0 ? (thirtyDaysPnL / thirtyDaysStartEquity) * 100 : 0;

    return {
      today: { pnl: todayPnL, pnlPct: todayPnLPct },
      sevenDays: { pnl: sevenDaysPnL, pnlPct: sevenDaysPnLPct },
      thirtyDays: { pnl: thirtyDaysPnL, pnlPct: thirtyDaysPnLPct },
      lifetime: { pnl: portfolio.total_pnl, pnlPct: portfolio.total_pnl_pct },
    };
  }, [equityHistory, portfolio]);

  // Calculate daily P&L for chart
  const dailyPnL = useMemo(() => {
    if (!equityHistory || equityHistory.length === 0) return [];

    const dailyMap = new Map<string, { start: number; end: number }>();
    
    equityHistory.forEach((point) => {
      const date = new Date(point.timestamp);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { start: point.total_equity, end: point.total_equity });
      } else {
        const dayData = dailyMap.get(dateKey)!;
        dayData.end = point.total_equity;
      }
    });

    const dailyData = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        pnl: data.end - data.start,
        pnlPct: data.start > 0 ? ((data.end - data.start) / data.start) * 100 : 0,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7); // Last 7 days

    return dailyData;
  }, [equityHistory]);

  // Calculate profit/loss analysis from performance data
  const profitLossAnalysis = useMemo(() => {
    if (!performance || !performance.recent_trades) {
      return {
        totalProfit: 0,
        totalLoss: 0,
        netPnL: portfolio?.total_pnl || 0,
        tradingVolume: 0,
        winRate: 0,
        winningDays: 0,
        losingDays: 0,
        breakevenDays: 0,
        avgProfit: 0,
        avgLoss: 0,
        profitLossRatio: 0,
      };
    }

    const trades = performance.recent_trades;
    const totalProfit = trades.filter(t => t.pn_l > 0).reduce((sum, t) => sum + t.pn_l, 0);
    const totalLoss = Math.abs(trades.filter(t => t.pn_l < 0).reduce((sum, t) => sum + t.pn_l, 0));
    const tradingVolume = trades.reduce((sum, t) => sum + (t.position_value || 0), 0);

    // Calculate winning/losing/breakeven days from daily P&L
    const dailyResults = dailyPnL.map(d => d.pnl);
    const winningDays = dailyResults.filter(p => p > 0).length;
    const losingDays = dailyResults.filter(p => p < 0).length;
    const breakevenDays = dailyResults.filter(p => p === 0).length;

    return {
      totalProfit,
      totalLoss,
      netPnL: portfolio?.total_pnl || 0,
      tradingVolume,
      winRate: performance.win_rate || 0,
      winningDays,
      losingDays,
      breakevenDays,
      avgProfit: performance.avg_win || 0,
      avgLoss: Math.abs(performance.avg_loss || 0),
      profitLossRatio: performance.profit_factor || 0,
    };
  }, [performance, portfolio, dailyPnL]);

  if (isLoading || !portfolio) {
    return (
      <div className="space-y-6">
        <div className="binance-card p-8 animate-pulse">
          <div className="skeleton h-8 w-64 mb-4"></div>
          <div className="skeleton h-12 w-48"></div>
        </div>
      </div>
    );
  }

  if (error && retryCount >= 3) {
    return (
      <div className="binance-card p-6">
        <div className="text-center">
          <div className="text-6xl mb-4 opacity-50">📊</div>
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#EAECEF' }}>
            Connection Failed
          </h2>
              <button
                onClick={() => {
                  setRetryCount(0);
                  setLastError(null);
                  mutate();
                }}
                className="px-6 py-3 rounded-lg font-semibold mb-4 transition-all"
                style={{
                  background: 'linear-gradient(135deg, #F0B90B 0%, #FCD535 100%)',
                  color: '#000',
                }}
              >
                🔄 Retry Connection
              </button>
        </div>
      </div>
    );
  }
  
  if (error && retryCount < 3) {
    return (
      <div className="binance-card p-6">
        <div className="text-center">
          <div className="text-6xl mb-4 opacity-50 animate-pulse">📊</div>
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#EAECEF' }}>
            Connecting to ETF Portfolio...
          </h2>
        </div>
      </div>
    );
  }

  const sortedAgents = [...portfolio.agents].sort((a, b) => b.pnl_pct - a.pnl_pct);

  const formatCurrency = (num: number) => {
    return num.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Portfolio Header */}
      <div className="binance-card p-6" style={{
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%)',
        border: '1px solid rgba(139, 92, 246, 0.3)',
      }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ color: '#EAECEF' }}>
              📊 Portfolio Overview
            </h1>
            <p className="text-sm" style={{ color: '#848E9C' }}>
              {portfolio.agent_count} Agents Trading Together
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Status</div>
            <div className={`px-3 py-1 rounded text-sm font-bold ${
              portfolio.is_running ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {portfolio.is_running ? '● RUNNING' : '● STOPPED'}
            </div>
          </div>
        </div>
      </div>

      {/* Time-Based P&L Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="binance-card p-4">
          <div className="text-xs mb-2" style={{ color: '#848E9C' }}>Today's PNL</div>
          <div className={`text-2xl font-bold mb-1 ${
            timeBasedPnL.today.pnl >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {timeBasedPnL.today.pnl >= 0 ? '+' : ''}{timeBasedPnL.today.pnlPct.toFixed(2)}%
          </div>
          <div className={`text-sm ${
            timeBasedPnL.today.pnl >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {timeBasedPnL.today.pnl >= 0 ? '+' : ''}{formatCurrency(timeBasedPnL.today.pnl)} USD
          </div>
        </div>

        <div className="binance-card p-4">
          <div className="text-xs mb-2" style={{ color: '#848E9C' }}>7D PNL</div>
          <div className={`text-2xl font-bold mb-1 ${
            timeBasedPnL.sevenDays.pnl >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {timeBasedPnL.sevenDays.pnl >= 0 ? '+' : ''}{timeBasedPnL.sevenDays.pnlPct.toFixed(2)}%
          </div>
          <div className={`text-sm ${
            timeBasedPnL.sevenDays.pnl >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {timeBasedPnL.sevenDays.pnl >= 0 ? '+' : ''}{formatCurrency(timeBasedPnL.sevenDays.pnl)} USD
          </div>
        </div>

        <div className="binance-card p-4">
          <div className="text-xs mb-2" style={{ color: '#848E9C' }}>30D PNL</div>
          <div className={`text-2xl font-bold mb-1 ${
            timeBasedPnL.thirtyDays.pnl >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {timeBasedPnL.thirtyDays.pnl >= 0 ? '+' : ''}{timeBasedPnL.thirtyDays.pnlPct.toFixed(2)}%
          </div>
          <div className={`text-sm ${
            timeBasedPnL.thirtyDays.pnl >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {timeBasedPnL.thirtyDays.pnl >= 0 ? '+' : ''}{formatCurrency(timeBasedPnL.thirtyDays.pnl)} USD
          </div>
        </div>

        <div className="binance-card p-4">
          <div className="text-xs mb-2" style={{ color: '#848E9C' }}>Lifetime PNL</div>
          <div className={`text-2xl font-bold mb-1 ${
            timeBasedPnL.lifetime.pnl >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {timeBasedPnL.lifetime.pnl >= 0 ? '+' : ''}{timeBasedPnL.lifetime.pnlPct.toFixed(2)}%
          </div>
          <div className={`text-sm ${
            timeBasedPnL.lifetime.pnl >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {timeBasedPnL.lifetime.pnl >= 0 ? '+' : ''}{formatCurrency(timeBasedPnL.lifetime.pnl)} USD
            </div>
          </div>
        </div>

      {/* Profit and Loss Analysis */}
      <div className="binance-card p-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: '#EAECEF' }}>
          Profit and Loss Analysis
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Total Profit</div>
            <div className="text-lg font-bold text-green-400">
              {formatCurrency(profitLossAnalysis.totalProfit)} USD
            </div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Total Loss</div>
            <div className="text-lg font-bold text-red-400">
              {formatCurrency(profitLossAnalysis.totalLoss)} USD
            </div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Net Profit/Loss</div>
            <div className={`text-lg font-bold ${
              profitLossAnalysis.netPnL >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {formatCurrency(profitLossAnalysis.netPnL)} USD
            </div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Trading Volume</div>
            <div className="text-lg font-bold" style={{ color: '#EAECEF' }}>
              {formatCurrency(profitLossAnalysis.tradingVolume)} USD
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Win Rate</div>
            <div className="text-lg font-bold" style={{ color: '#EAECEF' }}>
              {profitLossAnalysis.winRate.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Winning Days</div>
            <div className="text-lg font-bold text-green-400">
              {profitLossAnalysis.winningDays} Days
            </div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Losing Days</div>
            <div className="text-lg font-bold text-red-400">
              {profitLossAnalysis.losingDays} Days
            </div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Breakeven Days</div>
            <div className="text-lg font-bold" style={{ color: '#848E9C' }}>
              {profitLossAnalysis.breakevenDays} Days
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          <div>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Average Profit</div>
            <div className="text-lg font-bold text-green-400">
              {formatCurrency(profitLossAnalysis.avgProfit)} USD
            </div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Average Loss</div>
            <div className="text-lg font-bold text-red-400">
              {formatCurrency(profitLossAnalysis.avgLoss)} USD
            </div>
          </div>
          <div>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Profit/Loss Ratio</div>
            <div className="text-lg font-bold" style={{ color: '#EAECEF' }}>
              {profitLossAnalysis.profitLossRatio.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Daily PNL Chart */}
      <div className="binance-card p-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: '#EAECEF' }}>
          Daily PNL
        </h2>
        {dailyPnL.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyPnL}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2B3139" />
              <XAxis 
                dataKey="date" 
                stroke="#848E9C"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#848E9C"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  background: '#1E2329',
                  border: '1px solid #2B3139',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [
                  `${value >= 0 ? '+' : ''}${formatCurrency(value)} USD`,
                  'PNL'
                ]}
              />
              <Bar 
                dataKey="pnl" 
                fill="#F0B90B"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-16" style={{ color: '#848E9C' }}>
            No daily P&L data available yet
          </div>
        )}
      </div>

      {/* Agent Performance Table */}
      <div className="binance-card p-6">
        <h2 className="text-xl font-bold mb-4" style={{ color: '#EAECEF' }}>
          Agent Performance
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: '#2B3139' }}>
                <th className="text-left pb-3 font-semibold" style={{ color: '#848E9C' }}>Rank</th>
                <th className="text-left pb-3 font-semibold" style={{ color: '#848E9C' }}>Agent</th>
                <th className="text-left pb-3 font-semibold" style={{ color: '#848E9C' }}>Model</th>
                <th className="text-right pb-3 font-semibold" style={{ color: '#848E9C' }}>Equity</th>
                <th className="text-right pb-3 font-semibold" style={{ color: '#848E9C' }}>P&L</th>
                <th className="text-right pb-3 font-semibold" style={{ color: '#848E9C' }}>P&L %</th>
                <th className="text-right pb-3 font-semibold" style={{ color: '#848E9C' }}>Positions</th>
                <th className="text-center pb-3 font-semibold" style={{ color: '#848E9C' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedAgents.map((agent, index) => (
                <tr key={agent.trader_id} className="border-b" style={{ borderColor: '#2B3139' }}>
                  <td className="py-3 font-bold" style={{ color: '#EAECEF' }}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </td>
                  <td className="py-3 font-semibold" style={{ color: '#EAECEF' }}>
                    {agent.trader_name}
                  </td>
                  <td className="py-3" style={{ color: '#848E9C' }}>
                    {agent.ai_model.toUpperCase()}
                  </td>
                  <td className="py-3 text-right font-mono" style={{ color: '#EAECEF' }}>
                    ${agent.equity.toFixed(2)}
                  </td>
                  <td className={`py-3 text-right font-mono font-bold ${
                    agent.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {agent.pnl >= 0 ? '+' : ''}{agent.pnl.toFixed(2)}
                  </td>
                  <td className={`py-3 text-right font-mono font-bold ${
                    agent.pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {agent.pnl_pct >= 0 ? '+' : ''}{agent.pnl_pct.toFixed(2)}%
                  </td>
                  <td className="py-3 text-right" style={{ color: '#EAECEF' }}>
                    {agent.position_count}
                  </td>
                  <td className="py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      agent.is_running ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {agent.is_running ? '●' : '○'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
