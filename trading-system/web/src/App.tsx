import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from './lib/api';
import { EquityChart } from './components/EquityChart';
import { CompetitionPage } from './components/CompetitionPage';
import { PortfolioView } from './components/PortfolioView';
import AILearning from './components/AILearning';
import { TradingSignal } from './components/TradingSignal';
import { PurchaseAgentButton } from './components/PurchaseAgentButton';
import { AIDecisionView } from './components/AIDecisionView';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { t, type Language } from './i18n/translations';
import type {
  SystemStatus,
  AccountInfo,
  Position,
  DecisionRecord,
  DecisionAction,
  Statistics,
  TraderInfo,
} from './types';

type Page = 'competition' | 'trader' | 'portfolio' | 'ai-decision';

function App() {
  const { language } = useLanguage();

  // 从URL hash读取初始页面状态（支持刷新保持页面）
  const getInitialPage = (): Page => {
    const hash = window.location.hash;
    if (hash === '#trader' || hash === '#details') {
      return 'trader';
    }
    if (hash === '#portfolio') {
      return 'portfolio';
    }
    if (hash === '#ai-decision') {
      return 'ai-decision';
    }
    return 'competition';
  };

  const [currentPage, setCurrentPage] = useState<Page>(getInitialPage());
  const [selectedTraderId, setSelectedTraderId] = useState<string | undefined>();
  const [lastUpdate, setLastUpdate] = useState<string>('--:--:--');

  // 监听URL hash变化，同步页面状态
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#trader' || hash === '#details') {
        setCurrentPage('trader');
      } else if (hash === '#portfolio') {
        setCurrentPage('portfolio');
      } else if (hash === '#ai-decision') {
        setCurrentPage('ai-decision');
      } else {
        setCurrentPage('competition');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // 切换页面时更新URL hash
  const navigateToPage = (page: Page) => {
    setCurrentPage(page);
    if (page === 'trader') {
      window.location.hash = '#trader';
    } else if (page === 'portfolio') {
      window.location.hash = '#portfolio';
    } else if (page === 'ai-decision') {
      window.location.hash = '#ai-decision';
    } else {
      window.location.hash = '';
    }
  };

  // 获取trader列表
  const { data: traders } = useSWR<TraderInfo[]>('traders', api.getTraders, {
    refreshInterval: 5000, // 5秒刷新
    revalidateOnFocus: true,
  });

  // 当获取到traders后，设置默认选中第一个
  useEffect(() => {
    if (traders && traders.length > 0 && !selectedTraderId) {
      setSelectedTraderId(traders[0].trader_id);
    }
  }, [traders, selectedTraderId]);

  // 获取系统状态 - 在Competition页面显示第一个trader的状态，在Details页面显示选中trader的状态
  const statusTraderId = currentPage === 'competition' 
    ? (traders && traders.length > 0 ? traders[0].trader_id : null)
    : selectedTraderId;
  
  const { data: status, error: statusError, isLoading: statusLoading } = useSWR<SystemStatus>(
    statusTraderId ? `status-${statusTraderId}` : null,
    () => api.getStatus(statusTraderId ?? undefined),
    {
      refreshInterval: 3000, // 3秒刷新 - 实时显示系统状态
      revalidateOnFocus: true, // 窗口聚焦时立即刷新
      dedupingInterval: 1500, // 1.5秒去重
    }
  );

  // Check if server is unreachable or deploying
  const isServerUnreachable = statusError !== undefined || (statusLoading && !status);

  const { data: account } = useSWR<AccountInfo>(
    currentPage === 'trader' && selectedTraderId
      ? `account-${selectedTraderId}`
      : null,
    () => api.getAccount(selectedTraderId),
    {
      refreshInterval: 2000, // 2秒刷新 - 实时显示账户信息
      revalidateOnFocus: true, // 窗口聚焦时立即刷新
      dedupingInterval: 1000, // 1秒去重
    }
  );

  const { data: positions } = useSWR<Position[]>(
    currentPage === 'trader' && selectedTraderId
      ? `positions-${selectedTraderId}`
      : null,
    () => api.getPositions(selectedTraderId),
    {
      refreshInterval: 3000, // 3秒刷新 - 实时显示持仓变化
      revalidateOnFocus: true, // 窗口聚焦时立即刷新
      dedupingInterval: 1500, // 1.5秒去重
    }
  );

  const { data: decisions } = useSWR<DecisionRecord[]>(
    currentPage === 'trader' && selectedTraderId
      ? `decisions/latest-${selectedTraderId}`
      : null,
    () => api.getLatestDecisions(selectedTraderId),
    {
      refreshInterval: 30000, // 30秒刷新（决策更新频率较低）
      revalidateOnFocus: false,
      dedupingInterval: 20000,
    }
  );

  const { data: stats } = useSWR<Statistics>(
    currentPage === 'trader' && selectedTraderId
      ? `statistics-${selectedTraderId}`
      : null,
    () => api.getStatistics(selectedTraderId),
    {
      refreshInterval: 30000, // 30秒刷新（统计数据更新频率较低）
      revalidateOnFocus: false,
      dedupingInterval: 20000,
    }
  );

  useEffect(() => {
    if (account) {
      const now = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Singapore'
      });
      setLastUpdate(now);
    }
  }, [account]);

  const selectedTrader = traders?.find((t) => t.trader_id === selectedTraderId);

  return (
    <div className="min-h-screen" style={{ background: '#0B0E11', color: '#EAECEF' }}>
      {/* Header - Binance Style */}
      <header className="glass sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-3 sm:py-4">
          {/* Mobile: Two rows, Desktop: Single row */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Left: Logo and Title */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden">
                <img 
                  src="/assets/logos/image.png" 
                  alt="AlphaNet Logo" 
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-bold leading-tight" style={{ color: '#EAECEF' }}>
                  {t('appTitle', language)}
                </h1>
                <p className="text-xs mono hidden sm:block" style={{ color: '#848E9C' }}>
                  {t('subtitle', language)}
                </p>
              </div>
            </div>

            {/* Right: Controls - Wrap on mobile */}
            <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
              {/* Page Toggle */}
              <div className="flex gap-0.5 sm:gap-1 rounded p-0.5 sm:p-1" style={{ background: '#1E2329' }}>
                <button
                  onClick={() => navigateToPage('competition')}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-semibold transition-all"
                  style={currentPage === 'competition'
                    ? { background: '#F0B90B', color: '#000' }
                    : { background: 'transparent', color: '#848E9C' }
                  }
                >
                  {t('competition', language)}
                </button>
                <button
                  onClick={() => navigateToPage('portfolio')}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-semibold transition-all"
                  style={currentPage === 'portfolio'
                    ? { background: '#F0B90B', color: '#000' }
                    : { background: 'transparent', color: '#848E9C' }
                  }
                >
                  📊 Portfolio
                </button>
                <button
                  onClick={() => navigateToPage('trader')}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-semibold transition-all"
                  style={currentPage === 'trader'
                    ? { background: '#F0B90B', color: '#000' }
                    : { background: 'transparent', color: '#848E9C' }
                  }
                >
                  {t('details', language)}
                </button>
                <button
                  onClick={() => navigateToPage('ai-decision')}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 rounded text-xs sm:text-sm font-semibold transition-all"
                  style={currentPage === 'ai-decision'
                    ? { background: '#F0B90B', color: '#000' }
                    : { background: 'transparent', color: '#848E9C' }
                  }
                >
                  🧠 AI Analysis
                </button>
              </div>

              {/* Trader Selector (show on trader and ai-decision pages) */}
              {(currentPage === 'trader' || currentPage === 'ai-decision') && traders && traders.length > 0 && (
                <select
                  value={selectedTraderId}
                  onChange={(e) => setSelectedTraderId(e.target.value)}
                  className="rounded px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium cursor-pointer transition-colors flex-1 sm:flex-initial"
                  style={{ background: '#1E2329', border: '1px solid #2B3139', color: '#EAECEF' }}
                >
                  {traders.map((trader) => (
                    <option key={trader.trader_id} value={trader.trader_id}>
                      {trader.trader_name} ({trader.ai_model.toUpperCase()})
                    </option>
                  ))}
                </select>
              )}

              {/* Status Indicator (show on both Competition and Details pages) */}
              {isServerUnreachable ? (
                <div
                  className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded animate-pulse"
                  style={{ background: 'rgba(255, 193, 7, 0.1)', color: '#FFC107', border: '1px solid rgba(255, 193, 7, 0.2)' }}
                >
                  <div
                    className="w-2 h-2 rounded-full animate-spin"
                    style={{ 
                      background: '#FFC107',
                      border: '2px solid transparent',
                      borderTopColor: '#FFC107',
                      borderRightColor: 'transparent'
                    }}
                  />
                  <span className="font-semibold mono text-xs">
                    CONNECTING...
                  </span>
                </div>
              ) : status ? (
                <div
                  className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded"
                  style={status.is_running
                    ? { background: 'rgba(14, 203, 129, 0.1)', color: '#0ECB81', border: '1px solid rgba(14, 203, 129, 0.2)' }
                    : { background: 'rgba(246, 70, 93, 0.1)', color: '#F6465D', border: '1px solid rgba(246, 70, 93, 0.2)' }
                  }
                >
                  <div
                    className={`w-2 h-2 rounded-full ${status.is_running ? 'pulse-glow' : ''}`}
                    style={{ background: status.is_running ? '#0ECB81' : '#F6465D' }}
                  />
                  <span className="font-semibold mono text-xs">
                    {t(status.is_running ? 'running' : 'stopped', language)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1920px] mx-auto px-6 py-6" style={{ position: 'relative', zIndex: 1 }}>
        {currentPage === 'competition' ? (
          <CompetitionPage />
        ) : currentPage === 'portfolio' ? (
          <PortfolioView />
        ) : currentPage === 'ai-decision' ? (
          selectedTraderId ? (
            <AIDecisionView traderId={selectedTraderId} language={language} />
          ) : (
            <div className="text-center py-16" style={{ color: '#848E9C' }}>
              <div className="text-6xl mb-4 opacity-50">🧠</div>
              <div className="text-lg font-semibold mb-2">Please select a trader</div>
              <div className="text-sm">Choose a trader from the dropdown above</div>
            </div>
          )
        ) : (
          <TraderDetailsPage
            selectedTrader={selectedTrader}
            status={status}
            account={account}
            positions={positions}
            decisions={decisions}
            stats={stats}
            lastUpdate={lastUpdate}
            language={language}
          />
        )}
      </main>
    </div>
  );
}

// Trader Details Page Component
function TraderDetailsPage({
  selectedTrader,
  status,
  account,
  positions,
  decisions,
  lastUpdate,
  language,
}: {
  selectedTrader?: TraderInfo;
  status?: SystemStatus;
  account?: AccountInfo;
  positions?: Position[];
  decisions?: DecisionRecord[];
  stats?: Statistics;
  lastUpdate: string;
  language: Language;
}) {
  if (!selectedTrader) {
    return (
      <div className="space-y-6">
        {/* Loading Skeleton - Binance Style */}
        <div className="binance-card p-6 animate-pulse">
          <div className="skeleton h-8 w-48 mb-3"></div>
          <div className="flex gap-4">
            <div className="skeleton h-4 w-32"></div>
            <div className="skeleton h-4 w-24"></div>
            <div className="skeleton h-4 w-28"></div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="binance-card p-5 animate-pulse">
              <div className="skeleton h-4 w-24 mb-3"></div>
              <div className="skeleton h-8 w-32"></div>
            </div>
          ))}
        </div>
        <div className="binance-card p-6 animate-pulse">
          <div className="skeleton h-6 w-40 mb-4"></div>
          <div className="skeleton h-64 w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Trader Header */}
      <div className="mb-6 rounded p-6 animate-scale-in" style={{ background: 'linear-gradient(135deg, rgba(240, 185, 11, 0.15) 0%, rgba(252, 213, 53, 0.05) 100%)', border: '1px solid rgba(240, 185, 11, 0.2)', boxShadow: '0 0 30px rgba(240, 185, 11, 0.15)' }}>
        <h2 className="text-2xl font-bold mb-3 flex items-center gap-2" style={{ color: '#EAECEF' }}>
          <span className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ background: 'linear-gradient(135deg, #F0B90B 0%, #FCD535 100%)' }}>
            🤖
          </span>
          {selectedTrader.trader_name}
        </h2>
        <div className="flex items-center gap-4 text-sm" style={{ color: '#848E9C' }}>
          <span>AI Model: <span className="font-semibold" style={{ color: selectedTrader.ai_model === 'qwen' ? '#c084fc' : '#60a5fa' }}>{selectedTrader.ai_model.toUpperCase()}</span></span>
          {status && (
            <>
              <span>•</span>
              <span>Cycles: {status.call_count}</span>
              <span>•</span>
              <span>Runtime: {status.runtime_minutes} min</span>
            </>
          )}
        </div>
      </div>

      {/* Debug Info */}
      {account && (
        <div className="mb-4 p-3 rounded text-xs font-mono" style={{ background: '#1E2329', border: '1px solid #2B3139' }}>
          <div style={{ color: '#848E9C' }}>
            🔄 Last Update: {lastUpdate} | Total Equity: {account.total_equity?.toFixed(2) || '0.00'} |
            Available: {account.available_balance?.toFixed(2) || '0.00'} | P&L: {account.total_pnl?.toFixed(2) || '0.00'}{' '}
            ({account.total_pnl_pct?.toFixed(2) || '0.00'}%)
          </div>
        </div>
      )}

      {/* Account Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          title={t('totalEquity', language)}
          value={`${account?.total_equity?.toFixed(2) || '0.00'} USDT`}
          change={account?.total_pnl_pct || 0}
          positive={(account?.total_pnl ?? 0) > 0}
        />
        <StatCard
          title={t('availableBalance', language)}
          value={`${account?.available_balance?.toFixed(2) || '0.00'} USDT`}
          subtitle={`${(account?.available_balance && account?.total_equity ? ((account.available_balance / account.total_equity) * 100).toFixed(1) : '0.0')}% ${t('free', language)}`}
        />
        <StatCard
          title={t('totalPnL', language)}
          value={`${account?.total_pnl !== undefined && account.total_pnl >= 0 ? '+' : ''}${account?.total_pnl?.toFixed(2) || '0.00'} USDT`}
          change={account?.total_pnl_pct || 0}
          positive={(account?.total_pnl ?? 0) >= 0}
        />
        <StatCard
          title={t('positions', language)}
          value={`${account?.position_count || 0}`}
          subtitle={`${t('margin', language)}: ${account?.margin_used_pct?.toFixed(1) || '0.0'}%`}
        />
      </div>

      {/* 主要内容区：左右分屏 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 lg:items-stretch">
        {/* 左侧：图表 + 持仓 */}
        <div className="flex flex-col space-y-6">
          {/* Equity Chart */}
          <div className="animate-slide-in" style={{ animationDelay: '0.1s' }}>
            <EquityChart traderId={selectedTrader.trader_id} />
          </div>

          {/* Latest Trading Signal */}
          <div className="animate-slide-in" style={{ animationDelay: '0.12s' }}>
            <TradingSignal traderId={selectedTrader.trader_id} language={language} compact={true} />
          </div>

          {/* Hedera Purchase Button */}
          <div className="animate-slide-in" style={{ animationDelay: '0.13s' }}>
            <PurchaseAgentButton
              traderName={selectedTrader.trader_name}
              traderId={selectedTrader.trader_id}
              language={language}
            />
          </div>

          {/* Current Positions */}
          <div className="binance-card p-6 animate-slide-in flex flex-col flex-1" style={{ animationDelay: '0.15s' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: '#EAECEF' }}>
            📈 {t('currentPositions', language)}
          </h2>
          {positions && positions.length > 0 && (
            <div className="text-xs px-3 py-1 rounded" style={{ background: 'rgba(240, 185, 11, 0.1)', color: '#F0B90B', border: '1px solid rgba(240, 185, 11, 0.2)' }}>
              {positions.length} {t('active', language)}
            </div>
          )}
        </div>
        {positions && positions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-b border-gray-800">
                <tr>
                  <th className="pb-3 font-semibold text-gray-400">{t('symbol', language)}</th>
                  <th className="pb-3 font-semibold text-gray-400">{t('side', language)}</th>
                  <th className="pb-3 font-semibold text-gray-400">{t('entryPrice', language)}</th>
                  <th className="pb-3 font-semibold text-gray-400">{t('markPrice', language)}</th>
                  <th className="pb-3 font-semibold text-gray-400">{t('quantity', language)}</th>
                  <th className="pb-3 font-semibold text-gray-400">{t('positionValue', language)}</th>
                  <th className="pb-3 font-semibold text-gray-400">{t('leverage', language)}</th>
                  <th className="pb-3 font-semibold text-gray-400">{t('unrealizedPnL', language)}</th>
                  <th className="pb-3 font-semibold text-gray-400">{t('liqPrice', language)}</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos, i) => (
                  <tr key={i} className="border-b border-gray-800 last:border-0">
                    <td className="py-3 font-mono font-semibold">{pos.symbol}</td>
                    <td className="py-3">
                      <span
                        className="px-2 py-1 rounded text-xs font-bold"
                        style={pos.side === 'long'
                          ? { background: 'rgba(14, 203, 129, 0.1)', color: '#0ECB81' }
                          : { background: 'rgba(246, 70, 93, 0.1)', color: '#F6465D' }
                        }
                      >
                        {t(pos.side === 'long' ? 'long' : 'short', language)}
                      </span>
                    </td>
                    <td className="py-3 font-mono" style={{ color: '#EAECEF' }}>{pos.entry_price.toFixed(4)}</td>
                    <td className="py-3 font-mono" style={{ color: '#EAECEF' }}>{pos.mark_price.toFixed(4)}</td>
                    <td className="py-3 font-mono" style={{ color: '#EAECEF' }}>{pos.quantity.toFixed(4)}</td>
                    <td className="py-3 font-mono font-bold" style={{ color: '#EAECEF' }}>
                      {(pos.quantity * pos.mark_price).toFixed(2)} USDT
                    </td>
                    <td className="py-3 font-mono" style={{ color: '#F0B90B' }}>{pos.leverage}x</td>
                    <td className="py-3 font-mono">
                      <span
                        style={{ color: pos.unrealized_pnl >= 0 ? '#0ECB81' : '#F6465D', fontWeight: 'bold' }}
                      >
                        {pos.unrealized_pnl >= 0 ? '+' : ''}
                        {pos.unrealized_pnl.toFixed(2)} ({pos.unrealized_pnl_pct.toFixed(2)}%)
                      </span>
                    </td>
                    <td className="py-3 font-mono" style={{ color: '#848E9C' }}>
                      {pos.liquidation_price.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16" style={{ color: '#848E9C' }}>
            <div className="text-6xl mb-4 opacity-50">📊</div>
            <div className="text-lg font-semibold mb-2">{t('noPositions', language)}</div>
            <div className="text-sm">{t('noActivePositions', language)}</div>
          </div>
        )}
          </div>
          </div>
        {/* 左侧结束 */}

        {/* 右侧：Recent Decisions - 卡片容器 */}
        <div className="flex flex-col lg:h-full">
          <div className="binance-card p-6 animate-slide-in flex flex-col flex-1" style={{ animationDelay: '0.2s', minHeight: 0 }}>
          {/* 标题 */}
          <div className="flex items-center gap-3 mb-5 pb-4 border-b flex-shrink-0" style={{ borderColor: '#2B3139' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
            }}>
              🧠
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: '#EAECEF' }}>{t('recentDecisions', language)}</h2>
              {decisions && decisions.length > 0 && (
                <div className="text-xs" style={{ color: '#848E9C' }}>
                  {t('lastCycles', language, { count: decisions.length })}
                </div>
              )}
            </div>
          </div>

          {/* 决策列表 - 可滚动 - 填充剩余空间 */}
          <div className="space-y-3 overflow-y-auto pr-2 flex-1" style={{ minHeight: 0 }}>
            {decisions && decisions.length > 0 ? (
              decisions.map((decision, i) => (
                <DecisionCard key={i} decision={decision} language={language} />
              ))
            ) : (
              <div className="py-16 text-center">
                <div className="text-6xl mb-4 opacity-30">🧠</div>
                <div className="text-lg font-semibold mb-2" style={{ color: '#EAECEF' }}>{t('noDecisionsYet', language)}</div>
                <div className="text-sm" style={{ color: '#848E9C' }}>{t('aiDecisionsWillAppear', language)}</div>
              </div>
            )}
          </div>
        </div>
        {/* 右侧结束 */}
      </div>
      </div>

      {/* AI Learning & Performance Analysis */}
      <div className="mb-6 animate-slide-in" style={{ animationDelay: '0.3s' }}>
        <AILearning traderId={selectedTrader.trader_id} />
      </div>
    </div>
  );
}

// Stat Card Component - Binance Style Enhanced
function StatCard({
  title,
  value,
  change,
  positive,
  subtitle,
}: {
  title: string;
  value: string;
  change?: number;
  positive?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="stat-card animate-fade-in">
      <div className="text-xs mb-2 mono uppercase tracking-wider" style={{ color: '#848E9C' }}>{title}</div>
      <div className="text-2xl font-bold mb-1 mono" style={{ color: '#EAECEF' }}>{value}</div>
      {change !== undefined && (
        <div className="flex items-center gap-1">
          <div
            className="text-sm mono font-bold"
            style={{ color: positive ? '#0ECB81' : '#F6465D' }}
          >
            {positive ? '▲' : '▼'} {positive ? '+' : ''}
            {change.toFixed(2)}%
          </div>
        </div>
      )}
      {subtitle && <div className="text-xs mt-2 mono" style={{ color: '#848E9C' }}>{subtitle}</div>}
    </div>
  );
}

// Decision Card Component - Enhanced with all decision_json details
function DecisionCard({ decision, language }: { decision: DecisionRecord; language: Language }) {
  // Parse decision_json if available, otherwise use decisions array
  let decisionsToShow: DecisionAction[] = decision.decisions || [];
  
  // Try to parse decision_json if decisions array is empty or to get full details
  if (decision.decision_json) {
    try {
      const parsed = JSON.parse(decision.decision_json);
      if (Array.isArray(parsed)) {
        decisionsToShow = parsed;
      } else if (parsed.decisions && Array.isArray(parsed.decisions)) {
        decisionsToShow = parsed.decisions;
      }
    } catch (e) {
      // If parsing fails, use decisions array if available
      if (decisionsToShow.length === 0) {
        decisionsToShow = [];
      }
    }
  }

  return (
    <div className="rounded p-4 transition-all" style={{ border: '1px solid #2B3139', background: '#1E2329' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold text-sm" style={{ color: '#EAECEF' }}>
            {t('cycle', language)} #{decision.cycle_number}
          </div>
          <div className="text-xs" style={{ color: '#848E9C' }}>
            {new Date(decision.timestamp).toLocaleString('en-US', {
              timeZone: 'Asia/Singapore'
            })}
          </div>
        </div>
        <div
          className="px-2 py-0.5 rounded text-xs font-bold"
          style={decision.success
            ? { background: 'rgba(14, 203, 129, 0.1)', color: '#0ECB81' }
            : { background: 'rgba(246, 70, 93, 0.1)', color: '#F6465D' }
          }
        >
          {decision.success ? '✓' : '✗'}
        </div>
      </div>

      {/* Decisions with Full Details */}
      {decisionsToShow.length > 0 ? (
        <div className="space-y-3">
          {decisionsToShow.map((action, j) => {
            // Determine action type
            const isOpen = action.action?.includes('open');
            const isClose = action.action?.includes('close');
            const isWait = action.action === 'wait';
            const isHold = action.action === 'hold';
            const isLong = action.action?.includes('long');
            const isShort = action.action?.includes('short');

            // Get action icon and color
            let actionIcon = '⚪';
            let actionLabel = action.action || 'Unknown';
            let actionColor = '#848E9C';

            if (isWait) {
              actionIcon = '⏸️';
              actionLabel = 'Wait';
              actionColor = '#848E9C';
            } else if (isHold) {
              actionIcon = '🔒';
              actionLabel = 'Hold';
              actionColor = '#F0B90B';
            } else if (isOpen && isLong) {
              actionIcon = '📈';
              actionLabel = 'Open Long';
              actionColor = '#0ECB81';
            } else if (isOpen && isShort) {
              actionIcon = '📉';
              actionLabel = 'Open Short';
              actionColor = '#F6465D';
            } else if (isClose && isLong) {
              actionIcon = '🔚';
              actionLabel = 'Close Long';
              actionColor = '#60a5fa';
            } else if (isClose && isShort) {
              actionIcon = '🔚';
              actionLabel = 'Close Short';
              actionColor = '#60a5fa';
            }

            return (
              <div
                key={j}
                className="rounded-lg p-3 border"
                style={{
                  borderColor: action.success !== false ? actionColor : '#F6465D',
                  borderWidth: '1px',
                  background: 'rgba(132, 142, 156, 0.05)',
                }}
              >
                {/* Action Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{actionIcon}</span>
                    <div>
                      <span className="font-bold text-sm" style={{ color: '#EAECEF' }}>
                        {action.symbol || 'ALL'}
                      </span>
                      <span
                        className="ml-2 px-2 py-0.5 rounded text-xs font-bold"
                        style={{
                          background: actionColor,
                          color: '#000',
                        }}
                      >
                        {actionLabel.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  {action.success !== undefined && (
                    <span style={{ color: action.success !== false ? '#0ECB81' : '#F6465D' }}>
                      {action.success !== false ? '✓' : '✗'}
                    </span>
                  )}
                </div>

                {/* Reasoning */}
                {action.reasoning && (
                  <div className="text-xs mb-2 py-1.5 px-2 rounded" style={{ background: 'rgba(132, 142, 156, 0.1)', color: '#EAECEF', fontStyle: 'italic' }}>
                    💭 {action.reasoning}
                  </div>
                )}

                {/* Details Grid */}
                {(isOpen || isClose) && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* Position Size */}
                    {action.position_size_usd && action.position_size_usd > 0 && (
                      <div>
                        <div className="mb-0.5" style={{ color: '#848E9C' }}>Position Size</div>
                        <div className="font-semibold font-mono" style={{ color: '#EAECEF' }}>
                          ${action.position_size_usd.toFixed(2)} USDT
                        </div>
                      </div>
                    )}

                    {/* Quantity */}
                    {action.quantity && action.quantity > 0 && (
                      <div>
                        <div className="mb-0.5" style={{ color: '#848E9C' }}>Quantity</div>
                        <div className="font-semibold font-mono" style={{ color: '#EAECEF' }}>
                          {action.quantity.toFixed(4)}
                        </div>
                      </div>
                    )}

                    {/* Leverage */}
                    {action.leverage && action.leverage > 0 && (
                      <div>
                        <div className="mb-0.5" style={{ color: '#848E9C' }}>Leverage</div>
                        <div className="font-semibold" style={{ color: '#F0B90B' }}>
                          {action.leverage}x
                        </div>
                      </div>
                    )}

                    {/* Price */}
                    {action.price && action.price > 0 && (
                      <div>
                        <div className="mb-0.5" style={{ color: '#848E9C' }}>Price</div>
                        <div className="font-semibold font-mono" style={{ color: '#EAECEF' }}>
                          ${action.price.toFixed(4)}
                        </div>
                      </div>
                    )}

                    {/* Stop Loss */}
                    {action.stop_loss && action.stop_loss > 0 && (
                      <div>
                        <div className="mb-0.5" style={{ color: '#848E9C' }}>Stop Loss</div>
                        <div className="font-semibold font-mono" style={{ color: '#F6465D' }}>
                          ${action.stop_loss.toFixed(4)}
                        </div>
                      </div>
                    )}

                    {/* Take Profit */}
                    {action.take_profit && action.take_profit > 0 && (
                      <div>
                        <div className="mb-0.5" style={{ color: '#848E9C' }}>Take Profit</div>
                        <div className="font-semibold font-mono" style={{ color: '#0ECB81' }}>
                          ${action.take_profit.toFixed(4)}
                        </div>
                      </div>
                    )}

                    {/* Confidence */}
                    {action.confidence !== undefined && action.confidence >= 0 && (
                      <div>
                        <div className="mb-0.5" style={{ color: '#848E9C' }}>Confidence</div>
                        <div className="font-semibold" style={{ color: action.confidence >= 75 ? '#0ECB81' : action.confidence >= 50 ? '#F0B90B' : '#F6465D' }}>
                          {action.confidence}%
                        </div>
                      </div>
                    )}

                    {/* Risk USD */}
                    {action.risk_usd && action.risk_usd > 0 && (
                      <div>
                        <div className="mb-0.5" style={{ color: '#848E9C' }}>Max Risk</div>
                        <div className="font-semibold font-mono" style={{ color: '#F6465D' }}>
                          ${action.risk_usd.toFixed(2)} USDT
                        </div>
                      </div>
                    )}

                    {/* Order ID */}
                    {action.order_id && action.order_id > 0 && (
                      <div>
                        <div className="mb-0.5" style={{ color: '#848E9C' }}>Order ID</div>
                        <div className="font-semibold font-mono text-xs" style={{ color: '#848E9C' }}>
                          #{action.order_id}
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    {action.timestamp && (
                      <div>
                        <div className="mb-0.5" style={{ color: '#848E9C' }}>Time</div>
                        <div className="font-semibold text-xs" style={{ color: '#848E9C' }}>
                          {new Date(action.timestamp).toLocaleTimeString('en-US', {
                            timeZone: 'Asia/Singapore'
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Error Message */}
                {action.error && (
                  <div className="mt-2 text-xs py-1 px-2 rounded" style={{ background: 'rgba(246, 70, 93, 0.15)', color: '#F6465D' }}>
                    ⚠️ {action.error}
                  </div>
                )}

                {/* Wait/Hold Message */}
                {(isWait || isHold) && !action.reasoning && (
                  <div className="text-xs py-1" style={{ color: '#848E9C', fontStyle: 'italic' }}>
                    {isWait ? 'Waiting for better opportunities' : 'Holding current positions'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm py-1" style={{ color: '#848E9C', fontStyle: 'italic' }}>
          {t('noDecisionsThisCycle', language)}
        </div>
      )}
    </div>
  );
}

// Wrap App with LanguageProvider
export default function AppWithLanguage() {
  return (
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
}
