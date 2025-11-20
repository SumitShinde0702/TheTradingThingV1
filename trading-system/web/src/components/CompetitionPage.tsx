import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CompetitionData } from '../types';
import { ComparisonChart, TimePeriodDropdown, StatsCards, type TimePeriod } from './ComparisonChart';
import { OpenTrades } from './OpenTrades';
import { useLanguage } from '../contexts/LanguageContext';
import { t } from '../i18n/translations';
import { getTraderColor } from '../utils/traderColors';
import { ModelLogo } from './ModelLogo';
import { PurchaseAgentButton } from './PurchaseAgentButton';

// Helper function to clean trader name - removes "Trader"
function cleanTraderName(name: string): string {
  if (!name) return name;
  return name
    .replace(/\bTrader\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ');
}

// Helper function to get the correct model name for logo
function getModelForLogo(trader: { trader_name: string; ai_model: string }): string {
  const nameLower = trader.trader_name.toLowerCase();
  if (nameLower.includes('openai')) {
    return 'openai';
  } else if (nameLower.includes('qwen')) {
    return 'qwen';
  }
  return trader.ai_model;
}

// Helper to determine trader type
function getTraderType(traderId: string, traderName: string): 'paper' | 'real' | 'etf' {
  if (traderId.includes('_binance_real') || traderId.includes('_real') || traderName.includes('(Binance Real)')) {
    return 'real';
  }
  if (traderId.includes('llama_scalper') || traderId.includes('llama_analyzer') || 
      traderId.includes('gpt20b_fast') || traderId.includes('qwen_single') || 
      traderId.includes('openai_multi') || traderId.includes('qwen_multi')) {
    // Check if it's from ETF (not single-agent)
    if (!traderId.includes('_single')) {
      return 'etf';
    }
  }
  return 'paper';
}

export function CompetitionPage() {
  const { language } = useLanguage();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('24h');
  const [chartStats, setChartStats] = useState<{
    displayDataLength: number;
    filteredDataLength: number;
    currentGap: number;
    lastUpdatedLabel: string;
  } | null>(null);
  const [purchaseTraderId, setPurchaseTraderId] = useState<string | undefined>(undefined);

  const { data: competition, error: competitionError, isLoading: competitionLoading } = useSWR<CompetitionData>(
    'competition',
    api.getCompetition,
    {
      refreshInterval: 2000, // 2秒刷新 - 实时显示最新P&L
      revalidateOnFocus: true, // 窗口聚焦时立即刷新
      dedupingInterval: 1000, // 1秒去重
    }
  );

  const filteredTraders = competition?.traders ?? [];
  const realOrCopyTraders = filteredTraders.filter((trader) => trader.trader_id && trader.trader_name);

  useEffect(() => {
    if (realOrCopyTraders.length > 0) {
      const hasSelection = purchaseTraderId && realOrCopyTraders.some((t) => t.trader_id === purchaseTraderId);
      if (!hasSelection) {
        setPurchaseTraderId(realOrCopyTraders[0].trader_id);
      }
    } else if (purchaseTraderId) {
      setPurchaseTraderId(undefined);
    }
  }, [realOrCopyTraders, purchaseTraderId]);

  const purchaseTrader =
    realOrCopyTraders.find((trader) => trader.trader_id === purchaseTraderId) || realOrCopyTraders[0];

  // Check if server is unreachable or deploying
  const isServerUnreachable = competitionError !== undefined || (competitionLoading && !competition);

  if (!competition || filteredTraders.length === 0) {
    return (
      <div className="space-y-6">
        <div className="binance-card p-8 animate-pulse">
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-3 flex-1">
              <div className="skeleton h-8 w-64"></div>
              <div className="skeleton h-4 w-48"></div>
            </div>
            <div className="skeleton h-12 w-32"></div>
          </div>
        </div>
        <div className="binance-card p-6">
          <div className="skeleton h-6 w-40 mb-4"></div>
          <div className="space-y-3">
            <div className="skeleton h-20 w-full rounded"></div>
            <div className="skeleton h-20 w-full rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  // 按收益率排序
  const sortedTraders = [...filteredTraders].sort(
    (a, b) => b.total_pnl_pct - a.total_pnl_pct
  );

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Hedera Purchase Section */}
      {purchaseTrader && (
        <div className="space-y-3">
          <div className="binance-card p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 w-full md:max-w-xs">
              <label className="text-xs font-semibold" style={{ color: '#848E9C' }}>
                {t('purchaseSelectTrader', language)}
              </label>
              <select
                value={purchaseTraderId}
                onChange={(e) => setPurchaseTraderId(e.target.value)}
                className="rounded px-3 py-2 text-sm font-medium"
                style={{ background: '#1E2329', border: '1px solid #2B3139', color: '#EAECEF' }}
              >
                {realOrCopyTraders.map((trader) => (
                  <option key={trader.trader_id} value={trader.trader_id}>
                    {trader.trader_name} ({trader.ai_model?.toUpperCase() || 'AI'})
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs" style={{ color: '#848E9C' }}>
              {t('purchaseReminder', language)}
            </div>
          </div>
          <PurchaseAgentButton traderName={purchaseTrader.trader_name} traderId={purchaseTrader.trader_id} language={language} />
        </div>
      )}

      {/* Left/Right Split: Performance Chart + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5">
        {/* Left: Performance Comparison Chart - Takes more space */}
        <div className="lg:col-span-8 binance-card p-3 sm:p-5 animate-slide-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <h2 className="text-base sm:text-lg font-bold" style={{ color: '#EAECEF' }}>
                {t('performanceComparison', language)}
              </h2>
              <span className="text-xs" style={{ color: '#848E9C' }}>
                ({Intl.DateTimeFormat().resolvedOptions().timeZone})
              </span>
            </div>
            <TimePeriodDropdown value={timePeriod} onChange={setTimePeriod} />
          </div>
          <ComparisonChart 
            traders={sortedTraders} 
            timePeriod={timePeriod}
            onStatsUpdate={setChartStats}
          />
        </div>

        {/* Right: Leaderboard - Smaller, compact */}
        <div className="lg:col-span-4 binance-card p-3 sm:p-4 animate-slide-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: '#EAECEF' }}>
              {t('leaderboard', language)}
            </h2>
            <div className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(240, 185, 11, 0.1)', color: '#F0B90B', border: '1px solid rgba(240, 185, 11, 0.2)' }}>
              {t('live', language)}
            </div>
          </div>
          <div className="space-y-3">
            {sortedTraders.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: '#848E9C' }}>
                No traders found
              </div>
            ) : sortedTraders.map((trader, index) => {
              const isLeader = index === 0;
              const traderColor = getTraderColor(sortedTraders, trader.trader_id);
              const pnlValue = trader.total_pnl ?? 0;
              const pnlPercent = trader.total_pnl_pct ?? 0;
              const traderType = getTraderType(trader.trader_id, trader.trader_name);
              const isReal = traderType === 'real';
              const isETF = traderType === 'etf';

              // Format numbers with commas
              const formatNumber = (num: number) => {
                return num.toLocaleString('en-US', { 
                  minimumFractionDigits: 0, 
                  maximumFractionDigits: 0 
                });
              };

              const formatCurrency = (num: number) => {
                return num.toLocaleString('en-US', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                });
              };

              return (
                <div
                  key={trader.trader_id}
                  className="rounded-lg p-4 transition-all duration-300 hover:translate-y-[-2px]"
                  style={{
                    background: isLeader 
                      ? 'linear-gradient(135deg, rgba(240, 185, 11, 0.12) 0%, rgba(240, 185, 11, 0.04) 100%)' 
                      : 'linear-gradient(135deg, #0B0E11 0%, #0F1419 100%)',
                    border: `2px solid ${isLeader ? 'rgba(240, 185, 11, 0.5)' : '#2B3139'}`,
                    boxShadow: isLeader 
                      ? '0 4px 20px rgba(240, 185, 11, 0.15), 0 0 0 1px rgba(240, 185, 11, 0.2)' 
                      : '0 2px 8px rgba(0, 0, 0, 0.4)'
                  }}
                >
                  {/* Top Row: Rank, Name, and Status */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-2xl flex-shrink-0">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                      </div>
                      <ModelLogo model={getModelForLogo(trader)} size={32} color={traderColor} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-sm truncate" style={{ color: '#EAECEF' }}>
                            {cleanTraderName(trader.trader_name)}
                          </div>
                          {isReal && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0" 
                              style={{ background: 'rgba(246, 70, 93, 0.15)', color: '#F6465D', border: '1px solid rgba(246, 70, 93, 0.3)' }}>
                              REAL
                            </span>
                          )}
                          {isETF && !isReal && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0" 
                              style={{ background: 'rgba(14, 203, 129, 0.15)', color: '#0ECB81', border: '1px solid rgba(14, 203, 129, 0.3)' }}>
                              ETF
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    {isServerUnreachable ? (
                      <div
                        className="px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 animate-pulse"
                        style={{ background: 'rgba(255, 193, 7, 0.15)', color: '#FFC107', border: '1px solid rgba(255, 193, 7, 0.3)' }}
                      >
                        <span className="text-base animate-spin">⟳</span>
                        <span>CONNECTING...</span>
                      </div>
                    ) : (
                      <div
                        className="px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
                        style={trader.is_running
                          ? { background: 'rgba(14, 203, 129, 0.15)', color: '#0ECB81', border: '1px solid rgba(14, 203, 129, 0.3)' }
                          : { background: 'rgba(246, 70, 93, 0.15)', color: '#F6465D', border: '1px solid rgba(246, 70, 93, 0.3)' }
                        }
                      >
                        <span className="text-base">{trader.is_running ? '●' : '○'}</span>
                        <span>{trader.is_running ? 'RUNNING' : 'STOPPED'}</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    {/* Total Equity */}
                    <div>
                      <div className="text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: '#848E9C' }}>
                        {t('equity', language)}
                      </div>
                      <div className="text-xl font-bold font-mono" style={{ color: '#EAECEF', letterSpacing: '0.5px' }}>
                        ${formatNumber(trader.total_equity || 0)}
                      </div>
                    </div>

                    {/* P&L */}
                    <div>
                      <div className="text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: '#848E9C' }}>
                        {t('pnl', language)}
                      </div>
                      <div className="space-y-1">
                        <div
                          className="text-xl font-bold font-mono"
                          style={{ color: pnlPercent >= 0 ? '#0ECB81' : '#F6465D' }}
                        >
                          {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                        </div>
                        <div 
                          className="text-sm font-mono" 
                          style={{ color: pnlValue >= 0 ? '#0ECB81' : '#F6465D', opacity: 0.9 }}
                        >
                          {pnlValue >= 0 ? '+' : ''}${formatCurrency(Math.abs(pnlValue))}
                        </div>
                      </div>
                    </div>

                    {/* Positions & Margin */}
                    <div>
                      <div className="text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: '#848E9C' }}>
                        {t('pos', language)} / {t('marginRate', language)}
                      </div>
                      <div className="space-y-1">
                        <div className="text-lg font-bold font-mono" style={{ color: '#EAECEF' }}>
                          {trader.position_count}
                        </div>
                        <div className="text-sm font-mono" style={{ color: '#848E9C' }}>
                          {(trader.margin_used_pct ?? 0).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stats Cards - Below the traders */}
          {chartStats && (
            <div className="mt-4">
              <StatsCards
                currentGap={chartStats.currentGap}
                lastUpdatedLabel={chartStats.lastUpdatedLabel}
              />
            </div>
          )}
        </div>
      </div>

      {/* Open Trades Section */}
      <OpenTrades />

      {/* Head-to-Head Stats */}
      {competition.traders.length === 2 && (
        <div className="binance-card p-5 animate-slide-in" style={{ animationDelay: '0.3s' }}>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: '#EAECEF' }}>
            {t('headToHead', language)}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {sortedTraders.map((trader, index) => {
              const isWinning = index === 0;
              const opponent = sortedTraders[1 - index];
              const gap = trader.total_pnl_pct - opponent.total_pnl_pct;

              return (
                <div
                  key={trader.trader_id}
                  className="p-4 rounded transition-all duration-300 hover:scale-[1.02]"
                  style={isWinning
                    ? {
                        background: 'linear-gradient(135deg, rgba(14, 203, 129, 0.08) 0%, rgba(14, 203, 129, 0.02) 100%)',
                        border: '2px solid rgba(14, 203, 129, 0.3)',
                        boxShadow: '0 3px 15px rgba(14, 203, 129, 0.12)'
                      }
                    : {
                        background: '#0B0E11',
                        border: '1px solid #2B3139',
                        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.3)'
                      }
                  }
                >
                  <div className="text-center">
                    <div
                      className="text-base font-bold mb-2"
                      style={{ color: getTraderColor(sortedTraders, trader.trader_id) }}
                    >
                      {trader.trader_name}
                    </div>
                    <div className="text-2xl font-bold mono mb-1" style={{ color: (trader.total_pnl ?? 0) >= 0 ? '#0ECB81' : '#F6465D' }}>
                      {(trader.total_pnl ?? 0) >= 0 ? '+' : ''}{trader.total_pnl_pct?.toFixed(2) || '0.00'}%
                    </div>
                    {isWinning && gap > 0 && (
                      <div className="text-xs font-semibold" style={{ color: '#0ECB81' }}>
                        {t('leadingBy', language, { gap: gap.toFixed(2) })}
                      </div>
                    )}
                    {!isWinning && gap < 0 && (
                      <div className="text-xs font-semibold" style={{ color: '#F6465D' }}>
                        {t('behindBy', language, { gap: Math.abs(gap).toFixed(2) })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
