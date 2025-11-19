import { useState } from 'react';
import useSWR from 'swr';
import { api } from '../lib/api';

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
        // Only throw after 3 failed attempts
        if (retryCount < 3) {
          setRetryCount(prev => prev + 1);
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
          throw err; // Let SWR retry
        }
        throw err;
      }
    },
    {
      refreshInterval: 2000, // 2秒刷新
      revalidateOnFocus: true,
      dedupingInterval: 1000,
      shouldRetryOnError: true,
      errorRetryCount: 3,
      errorRetryInterval: 2000,
      onErrorRetry: (_error, _key, _config, revalidate, { retryCount }) => {
        // Don't retry if we've already tried 3 times
        if (retryCount >= 3) return;
        // Retry after 2 seconds
        setTimeout(() => revalidate({ retryCount }), 2000);
      },
    }
  );

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

  // Show error only after multiple failed attempts
  if (error && retryCount >= 3) {
    return (
      <div className="binance-card p-6">
        <div className="text-center">
          <div className="text-6xl mb-4 opacity-50">📊</div>
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#EAECEF' }}>
            {isLoading ? 'Connecting...' : 'Connection Failed'}
          </h2>
          {isLoading ? (
            <div className="text-yellow-400 mb-4">
              🔄 Retrying connection... (Attempt {retryCount}/3)
            </div>
          ) : (
            <>
              <div className="text-red-400 mb-4">
                ⚠️ Failed to connect to portfolio API
              </div>
              <div className="text-sm mb-6" style={{ color: '#848E9C' }}>
                {error.message || 'Connection refused'}
              </div>
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
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                🔄 Retry Connection
              </button>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
                <div className="text-sm font-semibold mb-2" style={{ color: '#F0B90B' }}>
                  📋 Troubleshooting:
                </div>
                <ol className="text-left text-sm space-y-2" style={{ color: '#EAECEF' }}>
                  <li>1. Check if backend is running: <code className="bg-black/30 px-2 py-1 rounded">http://localhost:8082/api/portfolio</code></li>
                  <li>2. If not running, open terminal in <code className="bg-black/30 px-2 py-1 rounded">trading-system</code> folder</li>
                  <li>3. Run: <code className="bg-black/30 px-2 py-1 rounded">RUN_ETF_PORTFOLIO.bat</code></li>
                  <li>4. Wait for backend to start, then click "Retry Connection"</li>
                </ol>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  
  // Show loading state while retrying
  if (error && retryCount < 3) {
    return (
      <div className="binance-card p-6">
        <div className="text-center">
          <div className="text-6xl mb-4 opacity-50 animate-pulse">📊</div>
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#EAECEF' }}>
            Connecting to ETF Portfolio...
          </h2>
          <div className="text-yellow-400 mb-4">
            🔄 Retrying connection... (Attempt {retryCount + 1}/3)
          </div>
          <div className="text-sm" style={{ color: '#848E9C' }}>
            Please wait while we connect to the backend
          </div>
        </div>
      </div>
    );
  }

  const sortedAgents = [...portfolio.agents].sort((a, b) => b.pnl_pct - a.pnl_pct);

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
              📊 ETF Portfolio
            </h1>
            <p className="text-sm" style={{ color: '#848E9C' }}>
              {portfolio.agent_count} Agents Trading Independently
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

        {/* Portfolio Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded" style={{ background: '#1E2329', border: '1px solid #2B3139' }}>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Total Equity</div>
            <div className="text-2xl font-bold" style={{ color: '#EAECEF' }}>
              ${portfolio.total_equity.toFixed(2)}
            </div>
          </div>
          <div className="p-4 rounded" style={{ background: '#1E2329', border: '1px solid #2B3139' }}>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Total P&L</div>
            <div className={`text-2xl font-bold ${
              portfolio.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {portfolio.total_pnl >= 0 ? '+' : ''}{portfolio.total_pnl.toFixed(2)}
            </div>
            <div className={`text-sm ${
              portfolio.total_pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {portfolio.total_pnl_pct >= 0 ? '+' : ''}{portfolio.total_pnl_pct.toFixed(2)}%
            </div>
          </div>
          <div className="p-4 rounded" style={{ background: '#1E2329', border: '1px solid #2B3139' }}>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Total Positions</div>
            <div className="text-2xl font-bold" style={{ color: '#EAECEF' }}>
              {portfolio.total_positions}
            </div>
          </div>
          <div className="p-4 rounded" style={{ background: '#1E2329', border: '1px solid #2B3139' }}>
            <div className="text-xs mb-1" style={{ color: '#848E9C' }}>Active Agents</div>
            <div className="text-2xl font-bold" style={{ color: '#EAECEF' }}>
              {portfolio.agents.filter(a => a.is_running).length}/{portfolio.agent_count}
            </div>
          </div>
        </div>
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

