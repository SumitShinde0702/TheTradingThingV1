import useSWR from 'swr';
import { useState } from 'react';
import { api } from '../lib/api';
import { useLanguage } from '../contexts/LanguageContext';
import { t } from '../i18n/translations';
import type { Position, TraderInfo } from '../types';
import { getTraderColor } from '../utils/traderColors';

interface TraderPositions {
  trader: TraderInfo;
  positions: Position[];
}

export function OpenTrades() {
  const { language } = useLanguage();
  const [closingPositions, setClosingPositions] = useState<Set<string>>(new Set());
  
  // Fetch all traders
  const { data: traders } = useSWR<TraderInfo[]>('traders', api.getTraders, {
    refreshInterval: 5000, // 5秒刷新
    revalidateOnFocus: true,
  });

  // Fetch positions for all traders
  const traderIds = traders?.map(t => t.trader_id) || [];
  const positionsKey = traderIds.length > 0 ? `all-positions-${traderIds.join('-')}` : null;
  const { data: allPositions, error: positionsError, mutate: mutatePositions } = useSWR<TraderPositions[]>(
    positionsKey,
    async () => {
      if (!traders || traders.length === 0) return [];
      
      const positionsPromises = traders.map(async (trader) => {
        try {
          const positions = await api.getPositions(trader.trader_id);
          return { trader, positions: positions || [] };
        } catch (error) {
          console.error(`Failed to fetch positions for ${trader.trader_id}:`, error);
          return { trader, positions: [] as Position[] };
        }
      });
      
      return Promise.all(positionsPromises);
    },
    {
      refreshInterval: 3000, // 3秒刷新 - 实时显示持仓变化
      revalidateOnFocus: true, // 窗口聚焦时立即刷新
      dedupingInterval: 1500, // 1.5秒去重
      onError: (err) => {
        console.error('Error fetching positions:', err);
      },
    }
  );

  // Handle close position
  const handleClosePosition = async (traderId: string, symbol: string, side: string) => {
    const positionKey = `${traderId}-${symbol}-${side}`;
    
    // Prevent double-closing
    if (closingPositions.has(positionKey)) {
      return;
    }

    // Validate inputs
    if (!traderId || !symbol || !side) {
      console.error('Missing required parameters:', { traderId, symbol, side });
      alert('Error: Missing required information to close position');
      return;
    }

    // Show confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to close this ${side.toUpperCase()} position for ${symbol}?\n\nThis action cannot be undone.`
    );
    
    if (!confirmed) {
      return;
    }

    console.log('Closing position:', { traderId, symbol, side });
    setClosingPositions(prev => new Set(prev).add(positionKey));

    try {
      // Try regular close first
      let result = await api.closePosition(traderId, symbol, side);
      
      // If regular close fails with "position not found", try force-close
      if (!result.success && result.error?.toLowerCase().includes('position not found')) {
        console.log('Regular close failed, trying force-close...');
        result = await api.forceClosePosition(traderId, symbol, side);
      }

      if (result.success) {
        // Refresh positions
        await mutatePositions();
        
        // Show success message (you could add a toast notification here)
        console.log(`✅ Successfully closed position: ${symbol} ${side}`);
      } else {
        // Show error message
        console.error(`❌ Failed to close position:`, result);
        const errorMsg = result.error || 'Unknown error';
        alert(`Failed to close position: ${errorMsg}\n\nPlease check:\n1. Backend server is running on port 8080\n2. Trader ID is correct\n3. Position still exists`);
      }
    } catch (error: any) {
      console.error('Error closing position:', error);
      alert(`Error closing position: ${error.message || 'Unknown error'}`);
    } finally {
      setClosingPositions(prev => {
        const next = new Set(prev);
        next.delete(positionKey);
        return next;
      });
    }
  };

  // Flatten all positions with trader info
  const allOpenTrades = allPositions?.flatMap(tp => 
    (tp.positions || []).map(pos => ({
      ...pos,
      trader_id: tp.trader.trader_id,
      trader_name: tp.trader.trader_name,
      ai_model: tp.trader.ai_model,
    }))
  ) || [];

  if (!traders || traders.length === 0) {
    return null;
  }

  // Handle loading state
  if (!allPositions && !positionsError) {
    return (
      <div className="binance-card p-6 animate-slide-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#EAECEF' }}>
            📊 {t('currentPositions', language)}
          </h2>
        </div>
        <div className="text-center py-8" style={{ color: '#848E9C' }}>
          <div className="text-sm">{t('loading', language)}</div>
        </div>
      </div>
    );
  }

  if (allOpenTrades.length === 0) {
    return (
      <div className="binance-card p-6 animate-slide-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#EAECEF' }}>
            📊 {t('currentPositions', language)}
          </h2>
        </div>
        <div className="text-center py-8" style={{ color: '#848E9C' }}>
          <div className="text-4xl mb-3 opacity-50">📭</div>
          <div className="text-sm font-semibold">{t('noPositions', language)}</div>
          <div className="text-xs mt-1">No active trades across all traders</div>
        </div>
      </div>
    );
  }

  // Sort by unrealized P&L (best first) and limit to max 3 positions
  const sortedTrades = [...allOpenTrades].sort((a, b) => b.unrealized_pnl - a.unrealized_pnl).slice(0, 3);

  return (
    <div className="binance-card p-5 animate-slide-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#EAECEF' }}>
          📊 {t('currentPositions', language)}
          <span className="text-xs font-normal px-2 py-1 rounded" style={{ 
            background: 'rgba(240, 185, 11, 0.15)', 
            color: '#F0B90B' 
          }}>
            {allOpenTrades.length}
          </span>
        </h2>
        <div className="text-xs" style={{ color: '#848E9C' }}>
          {t('active', language)}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-3 px-2 text-xs font-semibold" style={{ color: '#848E9C' }}>
                {t('symbol', language)}
              </th>
              <th className="text-left py-3 px-2 text-xs font-semibold" style={{ color: '#848E9C' }}>
                Trader
              </th>
              <th className="text-left py-3 px-2 text-xs font-semibold" style={{ color: '#848E9C' }}>
                {t('side', language)}
              </th>
              <th className="text-right py-3 px-2 text-xs font-semibold" style={{ color: '#848E9C' }}>
                {t('entryPrice', language)}
              </th>
              <th className="text-right py-3 px-2 text-xs font-semibold" style={{ color: '#848E9C' }}>
                {t('markPrice', language)}
              </th>
              <th className="text-right py-3 px-2 text-xs font-semibold" style={{ color: '#848E9C' }}>
                {t('quantity', language)}
              </th>
              <th className="text-right py-3 px-2 text-xs font-semibold" style={{ color: '#848E9C' }}>
                {t('leverage', language)}
              </th>
              <th className="text-right py-3 px-2 text-xs font-semibold" style={{ color: '#848E9C' }}>
                {t('unrealizedPnL', language)}
              </th>
              <th className="text-right py-3 px-2 text-xs font-semibold" style={{ color: '#848E9C' }}>
                {t('action', language)}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTrades.map((trade, i) => {
              const traderColor = traders ? getTraderColor(traders, trade.trader_id) : '#848E9C';
              
              return (
                <tr 
                  key={`${trade.trader_id}-${trade.symbol}-${trade.side}-${i}`}
                  className="border-b border-gray-800 last:border-0 hover:bg-gray-900/30 transition-colors"
                >
                  <td className="py-3 px-2 font-mono font-semibold" style={{ color: '#EAECEF' }}>
                    {trade.symbol}
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold" style={{ color: '#EAECEF' }}>
                        {trade.trader_name}
                      </span>
                      <span className="text-xs" style={{ color: traderColor }}>
                        {trade.ai_model.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <span
                      className="px-2 py-1 rounded text-xs font-bold"
                      style={trade.side === 'long'
                        ? { background: 'rgba(14, 203, 129, 0.1)', color: '#0ECB81' }
                        : { background: 'rgba(246, 70, 93, 0.1)', color: '#F6465D' }
                      }
                    >
                      {t(trade.side === 'long' ? 'long' : 'short', language)}
                    </span>
                  </td>
                  <td className="py-3 px-2 font-mono text-right" style={{ color: '#EAECEF' }}>
                    {trade.entry_price.toFixed(4)}
                  </td>
                  <td className="py-3 px-2 font-mono text-right" style={{ color: '#EAECEF' }}>
                    {trade.mark_price.toFixed(4)}
                  </td>
                  <td className="py-3 px-2 font-mono text-right" style={{ color: '#EAECEF' }}>
                    {trade.quantity.toFixed(4)}
                  </td>
                  <td className="py-3 px-2 font-mono text-right" style={{ color: '#F0B90B' }}>
                    {trade.leverage}x
                  </td>
                  <td className="py-3 px-2 font-mono text-right font-bold">
                    <span style={{ color: trade.unrealized_pnl >= 0 ? '#0ECB81' : '#F6465D' }}>
                      {trade.unrealized_pnl >= 0 ? '+' : ''}
                      {trade.unrealized_pnl.toFixed(2)} USDT
                    </span>
                    <div className="text-xs" style={{ color: '#848E9C' }}>
                      ({trade.unrealized_pnl >= 0 ? '+' : ''}{trade.unrealized_pnl_pct.toFixed(2)}%)
                    </div>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <button
                      onClick={() => handleClosePosition(trade.trader_id, trade.symbol, trade.side)}
                      disabled={closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`)}
                      className="px-3 py-1.5 rounded text-xs font-semibold transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`)
                          ? 'rgba(107, 114, 128, 0.2)'
                          : 'linear-gradient(135deg, rgba(246, 70, 93, 0.2) 0%, rgba(246, 70, 93, 0.1) 100%)',
                        border: `1px solid ${closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`) ? '#4B5563' : 'rgba(246, 70, 93, 0.4)'}`,
                        color: closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`) ? '#9CA3AF' : '#F6465D',
                        boxShadow: closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`) ? 'none' : '0 2px 6px rgba(246, 70, 93, 0.2)',
                      }}
                    >
                      {closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`) ? t('closing', language) : t('close', language)}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {sortedTrades.map((trade, i) => {
          const traderColor = traders ? getTraderColor(traders, trade.trader_id) : '#848E9C';
          
          return (
            <div
              key={`${trade.trader_id}-${trade.symbol}-${trade.side}-${i}`}
              className="rounded p-4 border"
              style={{
                background: '#0B0E11',
                borderColor: '#2B3139',
              }}
            >
              {/* Header: Symbol & Side */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-lg" style={{ color: '#EAECEF' }}>
                    {trade.symbol}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-xs font-bold"
                    style={trade.side === 'long'
                      ? { background: 'rgba(14, 203, 129, 0.1)', color: '#0ECB81' }
                      : { background: 'rgba(246, 70, 93, 0.1)', color: '#F6465D' }
                    }
                  >
                    {t(trade.side === 'long' ? 'long' : 'short', language)}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg" style={{ 
                    color: trade.unrealized_pnl >= 0 ? '#0ECB81' : '#F6465D' 
                  }}>
                    {trade.unrealized_pnl >= 0 ? '+' : ''}
                    {trade.unrealized_pnl.toFixed(2)}
                  </div>
                  <div className="text-xs" style={{ color: '#848E9C' }}>
                    ({trade.unrealized_pnl >= 0 ? '+' : ''}{trade.unrealized_pnl_pct.toFixed(2)}%)
                  </div>
                </div>
              </div>

              {/* Trader Info */}
              <div className="mb-3 pb-3 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold" style={{ color: '#EAECEF' }}>
                    {trade.trader_name}
                  </div>
                  <div className="text-xs px-1.5 py-0.5 rounded" style={{ 
                    background: 'rgba(240, 185, 11, 0.1)', 
                    color: traderColor 
                  }}>
                    {trade.ai_model.toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div>
                  <div className="text-xs mb-1" style={{ color: '#848E9C' }}>
                    {t('entryPrice', language)}
                  </div>
                  <div className="font-mono font-semibold" style={{ color: '#EAECEF' }}>
                    {trade.entry_price.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: '#848E9C' }}>
                    {t('markPrice', language)}
                  </div>
                  <div className="font-mono font-semibold" style={{ color: '#EAECEF' }}>
                    {trade.mark_price.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: '#848E9C' }}>
                    {t('quantity', language)}
                  </div>
                  <div className="font-mono font-semibold" style={{ color: '#EAECEF' }}>
                    {trade.quantity.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: '#848E9C' }}>
                    {t('leverage', language)}
                  </div>
                  <div className="font-mono font-semibold" style={{ color: '#F0B90B' }}>
                    {trade.leverage}x
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <div className="flex justify-end mt-3">
                <button
                  onClick={() => handleClosePosition(trade.trader_id, trade.symbol, trade.side)}
                  disabled={closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`)}
                  className="px-4 py-2 rounded text-xs font-semibold transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed w-full"
                  style={{
                    background: closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`)
                      ? 'rgba(107, 114, 128, 0.2)'
                      : 'linear-gradient(135deg, rgba(246, 70, 93, 0.2) 0%, rgba(246, 70, 93, 0.1) 100%)',
                    border: `1px solid ${closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`) ? '#4B5563' : 'rgba(246, 70, 93, 0.4)'}`,
                    color: closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`) ? '#9CA3AF' : '#F6465D',
                    boxShadow: closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`) ? 'none' : '0 2px 6px rgba(246, 70, 93, 0.2)',
                  }}
                >
                  {closingPositions.has(`${trade.trader_id}-${trade.symbol}-${trade.side}`) ? t('closing', language) : t('close', language)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

