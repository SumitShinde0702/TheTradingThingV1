import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '../lib/api';
import { EquityChart } from './EquityChart';
import AILearning from './AILearning';
import { TradingSignal } from './TradingSignal';
import { useLanguage } from '../contexts/LanguageContext';
import { type Language } from '../i18n/translations';
import type {
  SystemStatus,
  AccountInfo,
  Position,
  DecisionRecord,
  Statistics,
  TraderInfo,
  CompetitionData,
} from '../types';
import { ComparisonChart, TimePeriodDropdown, type TimePeriod } from './ComparisonChart';
import { OpenTrades } from './OpenTrades';

type ViewMode = 'dashboard' | 'trader';

// Pixelated Cyberpunk Experimental Dashboard
export function ExperimentalDashboard({ onExit }: { onExit: () => void }) {
  const { language } = useLanguage();
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [selectedTraderId, setSelectedTraderId] = useState<string | undefined>();
  const [scanlinesActive, setScanlinesActive] = useState(true);

  // Fetch traders
  const { data: traders } = useSWR('traders', api.getTraders, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });

  // Set default trader
  useEffect(() => {
    if (traders && traders.length > 0 && !selectedTraderId) {
      setSelectedTraderId(traders[0].trader_id);
    }
  }, [traders, selectedTraderId]);

  // Get selected trader
  const selectedTrader = traders?.find(t => t.trader_id === selectedTraderId);

  // Fetch data based on view mode
  const statusTraderId = viewMode === 'dashboard' 
    ? (traders && traders.length > 0 ? traders[0].trader_id : null)
    : selectedTraderId;

  const { data: status } = useSWR<SystemStatus>(
    statusTraderId ? `status-${statusTraderId}` : null,
    () => api.getStatus(statusTraderId ?? undefined),
    { refreshInterval: 3000 }
  );

  const { data: account } = useSWR<AccountInfo>(
    viewMode === 'trader' && selectedTraderId ? `account-${selectedTraderId}` : null,
    () => api.getAccount(selectedTraderId),
    { refreshInterval: 2000 }
  );

  const { data: positions } = useSWR<Position[]>(
    viewMode === 'trader' && selectedTraderId ? `positions-${selectedTraderId}` : null,
    () => api.getPositions(selectedTraderId ?? ''),
    { refreshInterval: 3000 }
  );

  const { data: decisions } = useSWR<DecisionRecord[]>(
    viewMode === 'trader' && selectedTraderId ? `decisions-${selectedTraderId}` : null,
    () => api.getDecisions(selectedTraderId),
    { refreshInterval: 30000 }
  );

  const { data: stats } = useSWR<Statistics>(
    viewMode === 'trader' && selectedTraderId ? `stats-${selectedTraderId}` : null,
    () => api.getStatistics(selectedTraderId ?? ''),
    { refreshInterval: 30000 }
  );

  const { data: competition } = useSWR<CompetitionData>(
    viewMode === 'dashboard' ? 'competition' : null,
    api.getCompetition,
    { refreshInterval: 2000 }
  );

  return (
    <div className="experimental-dashboard" style={{
      minHeight: '100vh',
      background: '#1a1a2e',
      position: 'relative',
      overflow: 'visible',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
    }}>
      {/* Old School CRT Scanlines */}
      {scanlinesActive && (
        <div className="scanlines" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.1) 2px, rgba(0, 0, 0, 0.1) 4px)',
          pointerEvents: 'none',
          zIndex: 9999,
        }} />
      )}

      {/* Retro Pixel Grid Background */}
      <div className="pixel-grid" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundImage: `
          repeating-linear-gradient(0deg, rgba(100, 100, 150, 0.05) 0px, transparent 1px, transparent 8px, rgba(100, 100, 150, 0.05) 9px),
          repeating-linear-gradient(90deg, rgba(100, 100, 150, 0.05) 0px, transparent 1px, transparent 8px, rgba(100, 100, 150, 0.05) 9px)
        `,
        backgroundSize: '8px 8px',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        
        @keyframes pixelBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        
        .experimental-dashboard * {
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
          image-rendering: crisp-edges;
        }
        
        .pixel-button {
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
          image-rendering: crisp-edges;
        }
      `}</style>

      {/* Header - Sticky to prevent content from overlapping */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: '#0d1117',
        borderBottom: '4px solid #58a6ff',
        borderStyle: 'double',
        padding: '1rem',
        marginBottom: '1rem',
        boxShadow: 'inset 0 -4px 0 #1f6feb',
      }}>
        <div style={{
          maxWidth: '1920px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}>
            <h1 style={{
              color: '#7bb3ff',
              fontSize: '1.25rem',
              fontWeight: 'normal',
              fontFamily: '"Press Start 2P", monospace',
              textShadow: '0 0 8px rgba(123, 179, 255, 0.6), 0 0 4px rgba(123, 179, 255, 0.4)',
              letterSpacing: '1px',
              filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))',
            }}>
              * TRADING SYSTEM v2.0 *
            </h1>
            
            {status && (
              <div style={{
                padding: '0.5rem 0.75rem',
                border: '3px solid',
                borderColor: status.is_running ? '#238636' : '#da3633',
                background: status.is_running ? '#1a1a2e' : '#1a1a2e',
                color: status.is_running ? '#3fb950' : '#f85149',
                fontSize: '0.625rem',
                fontFamily: '"Press Start 2P", monospace',
                imageRendering: 'pixelated',
                lineHeight: '1.5',
              }}>
                [{status.is_running ? 'RUN' : 'OFF'}]
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={onExit}
              className="pixel-button"
              style={{
                padding: '0.5rem 0.75rem',
                background: '#21262d',
                border: '3px solid #30363d',
                borderStyle: 'outset',
                color: '#7bb3ff',
                cursor: 'pointer',
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '0.5625rem',
                textShadow: '0 0 6px rgba(123, 179, 255, 0.5)',
                imageRendering: 'pixelated',
                fontWeight: 'normal',
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.borderStyle = 'inset';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.borderStyle = 'outset';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderStyle = 'outset';
              }}
            >
              [NORMAL]
            </button>

            <button
              onClick={() => setViewMode(viewMode === 'dashboard' ? 'trader' : 'dashboard')}
              className="pixel-button"
              style={{
                padding: '0.5rem 0.75rem',
                background: '#21262d',
                border: '3px solid #30363d',
                borderStyle: 'outset',
                color: '#7bb3ff',
                cursor: 'pointer',
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '0.5625rem',
                textShadow: '0 0 6px rgba(123, 179, 255, 0.5)',
                fontWeight: 'normal',
                imageRendering: 'pixelated',
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.borderStyle = 'inset';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.borderStyle = 'outset';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderStyle = 'outset';
              }}
            >
              [{viewMode === 'dashboard' ? 'TRADER' : 'DASHBOARD'}]
            </button>

            {viewMode === 'trader' && traders && traders.length > 0 && (
              <select
                value={selectedTraderId}
                onChange={(e) => setSelectedTraderId(e.target.value)}
                className="pixel-button"
                style={{
                  padding: '0.5rem 0.75rem',
                  background: '#21262d',
                  border: '3px solid #30363d',
                  color: '#7bb3ff',
                  fontFamily: '"Press Start 2P", monospace',
                  cursor: 'pointer',
                  fontSize: '0.5625rem',
                  imageRendering: 'pixelated',
                  fontWeight: 'normal',
                  textShadow: '0 0 6px rgba(123, 179, 255, 0.5)',
                }}
              >
                {traders.map(t => (
                  <option key={t.trader_id} value={t.trader_id} style={{ background: '#0d1117' }}>
                    {t.trader_name}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => setScanlinesActive(!scanlinesActive)}
              className="pixel-button"
              style={{
                padding: '0.5rem 0.75rem',
                background: scanlinesActive ? '#21262d' : '#1a1a2e',
                border: '3px solid #30363d',
                borderStyle: 'outset',
                color: scanlinesActive ? '#3fb950' : '#6e7681',
                cursor: 'pointer',
                fontFamily: '"Press Start 2P", monospace',
                fontSize: '0.5rem',
                imageRendering: 'pixelated',
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.borderStyle = 'inset';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.borderStyle = 'outset';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderStyle = 'outset';
              }}
            >
              [CRT:{scanlinesActive ? 'ON' : 'OFF'}]
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        position: 'relative',
        zIndex: 10,
        maxWidth: '1920px',
        margin: '0 auto',
        padding: '1rem',
        paddingTop: '1rem',
      }}>
        {viewMode === 'dashboard' ? (
          <DashboardView competition={competition} language={language} />
        ) : (
          <TraderView
            trader={selectedTrader}
            account={account}
            positions={positions}
            decisions={decisions}
            stats={stats}
            language={language}
          />
        )}
      </main>
    </div>
  );
}

// Dashboard View Component
function DashboardView({ 
  competition,
  language: _language
}: { 
  competition?: CompetitionData; 
  language: Language;
}) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('24h');
  
  const sortedTraders = competition?.traders 
    ? [...competition.traders].sort((a, b) => (b.total_pnl_pct ?? 0) - (a.total_pnl_pct ?? 0))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Performance Chart */}
      <PixelCard title="PERFORMANCE_COMPARISON.dat">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          gap: '1rem',
        }}>
          <div style={{
            color: '#b1bac4',
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '0.5625rem',
            imageRendering: 'pixelated',
            fontWeight: 'normal',
            textShadow: '0 0 4px rgba(177, 186, 196, 0.4)',
          }}>
            TIME_RANGE:
          </div>
          <div style={{ flexShrink: 0 }}>
            <TimePeriodDropdown 
              value={timePeriod} 
              onChange={setTimePeriod}
            />
          </div>
        </div>
        <div style={{ width: '100%', overflow: 'hidden' }}>
          {sortedTraders.length > 0 ? (
            <ComparisonChart traders={sortedTraders} timePeriod={timePeriod} />
          ) : (
            <div style={{ color: '#888', padding: '2rem', textAlign: 'center' }}>
              [NO_DATA_AVAILABLE]
            </div>
          )}
        </div>
      </PixelCard>

      {/* Leaderboard */}
      <PixelCard title="LEADERBOARD.sys">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {sortedTraders.map((trader, index) => {
              const isLeader = index === 0;
              const pnlValue = trader.total_pnl ?? 0;
              const pnlPercent = trader.total_pnl_pct ?? 0;
              
              // Format large numbers with commas
              const formatNumber = (num: number) => {
                return num.toLocaleString('en-US', { 
                  minimumFractionDigits: 0, 
                  maximumFractionDigits: 0 
                });
              };

              return (
                <div
                  key={trader.trader_id}
                  style={{
                    padding: '1.25rem',
                    border: '3px solid',
                    borderColor: isLeader ? '#f2cc60' : '#58a6ff',
                    borderStyle: 'double',
                    background: isLeader 
                      ? 'linear-gradient(135deg, rgba(242, 204, 96, 0.1) 0%, #1c2128 100%)' 
                      : 'linear-gradient(135deg, rgba(88, 166, 255, 0.05) 0%, #161b22 100%)',
                    borderRadius: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    imageRendering: 'pixelated',
                    boxShadow: isLeader 
                      ? '0 0 15px rgba(242, 204, 96, 0.2)' 
                      : '0 0 10px rgba(88, 166, 255, 0.1)',
                  }}
                >
                  {/* Top Row: Rank and Name */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                    }}>
                      <div style={{
                        color: isLeader ? '#ffd966' : '#7bb3ff',
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '0.8125rem',
                        textShadow: isLeader 
                          ? '0 0 8px rgba(255, 217, 102, 0.7), 0 0 4px rgba(255, 217, 102, 0.5)'
                          : '0 0 8px rgba(123, 179, 255, 0.6), 0 0 4px rgba(123, 179, 255, 0.4)',
                        imageRendering: 'pixelated',
                        minWidth: '60px',
                        fontWeight: 'normal',
                        filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))',
                      }}>
                        #{index + 1}
                      </div>
                      <div style={{ 
                        color: '#f0f6fc', 
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '0.8125rem',
                        textShadow: '0 0 6px rgba(240, 246, 252, 0.4), 0 0 3px rgba(240, 246, 252, 0.3)',
                        imageRendering: 'pixelated',
                        fontWeight: 'normal',
                        filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))',
                      }}>
                        {trader.trader_name}
                      </div>
                    </div>
                    
                    {/* Position Count Badge */}
                    <div style={{
                      padding: '0.5rem 0.75rem',
                      background: '#21262d',
                      border: '2px solid #30363d',
                      borderRadius: '2px',
                      color: '#8b949e',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                    }}>
                      {trader.position_count} Position{trader.position_count !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Bottom Row: Equity and P&L */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1.5rem',
                    alignItems: 'center',
                  }}>
                    {/* Equity */}
                    <div>
                      <div style={{
                        color: '#b1bac4',
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '0.5625rem',
                        marginBottom: '0.5rem',
                        imageRendering: 'pixelated',
                        fontWeight: 'normal',
                        textShadow: '0 0 4px rgba(177, 186, 196, 0.3)',
                      }}>
                        TOTAL EQUITY
                      </div>
                      <div style={{
                        color: '#7bb3ff',
                        fontFamily: 'monospace',
                        fontSize: '1.625rem',
                        fontWeight: 'bold',
                        textShadow: '0 0 10px rgba(123, 179, 255, 0.6), 0 0 5px rgba(123, 179, 255, 0.4)',
                        letterSpacing: '1px',
                        filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))',
                      }}>
                        ${formatNumber(trader.total_equity || 0)}
                      </div>
                    </div>

                    {/* P&L */}
                    <div>
                      <div style={{
                        color: '#b1bac4',
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '0.5625rem',
                        marginBottom: '0.5rem',
                        imageRendering: 'pixelated',
                        fontWeight: 'normal',
                        textShadow: '0 0 4px rgba(177, 186, 196, 0.3)',
                      }}>
                        TOTAL P&L
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '0.5rem',
                      }}>
                        <div style={{
                          color: pnlValue >= 0 ? '#56d364' : '#ff7b72',
                          fontFamily: 'monospace',
                          fontSize: '1.375rem',
                          fontWeight: 'bold',
                          textShadow: pnlValue >= 0
                            ? '0 0 10px rgba(86, 211, 100, 0.6), 0 0 5px rgba(86, 211, 100, 0.4)'
                            : '0 0 10px rgba(255, 123, 114, 0.6), 0 0 5px rgba(255, 123, 114, 0.4)',
                          filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))',
                        }}>
                          {pnlValue >= 0 ? '+' : ''}${formatNumber(Math.abs(pnlValue))}
                        </div>
                        <div style={{
                          color: pnlPercent >= 0 ? '#56d364' : '#ff7b72',
                          fontFamily: 'monospace',
                          fontSize: '1.0625rem',
                          fontWeight: 'bold',
                          background: pnlPercent >= 0 
                            ? 'rgba(86, 211, 100, 0.15)' 
                            : 'rgba(255, 123, 114, 0.15)',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '2px',
                          border: `1px solid ${pnlPercent >= 0 ? '#56d364' : '#ff7b72'}`,
                          textShadow: pnlPercent >= 0
                            ? '0 0 8px rgba(86, 211, 100, 0.5), 0 0 4px rgba(86, 211, 100, 0.3)'
                            : '0 0 8px rgba(255, 123, 114, 0.5), 0 0 4px rgba(255, 123, 114, 0.3)',
                          filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))',
                        }}>
                          {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </PixelCard>

      {/* Open Trades */}
      <PixelCard title="ACTIVE_POSITIONS.log">
        <OpenTrades />
      </PixelCard>
    </div>
  );
}

// Trader View Component
function TraderView({
  trader,
  account,
  positions,
  decisions,
  stats: _stats,
  language,
}: {
  trader?: TraderInfo;
  account?: AccountInfo;
  positions?: Position[];
  decisions?: DecisionRecord[];
  stats?: Statistics;
  language: Language;
}) {
  if (!trader) {
    return (
      <PixelCard title="ERROR.exe">
        <div style={{ color: '#ff0000', padding: '2rem', textAlign: 'center' }}>
          [TRADER_NOT_FOUND]
        </div>
      </PixelCard>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Trader Header */}
      <PixelCard title={`TRADER_PROFILE: ${trader.trader_name.toUpperCase()}.dat`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <StatBox label="AI_MODEL" value={trader.ai_model.toUpperCase()} color="#7bb3ff" />
            <StatBox 
              label="TOTAL_EQUITY" 
              value={`$${account?.total_equity?.toFixed(0) || '0'}`} 
              color="#7bb3ff"
            />
            <StatBox 
              label="AVAILABLE" 
              value={`$${account?.available_balance?.toFixed(0) || '0'}`} 
              color="#b1bac4"
            />
            <StatBox 
              label="TOTAL_P&L" 
              value={`${(account?.total_pnl ?? 0) >= 0 ? '+' : ''}${account?.total_pnl?.toFixed(2) || '0.00'}`}
              color={(account?.total_pnl ?? 0) >= 0 ? '#56d364' : '#ff7b72'}
            />
            <StatBox 
              label="POSITIONS" 
              value={account?.position_count?.toString() || '0'}
              color="#f2cc60"
            />
          </div>
      </PixelCard>

      {/* Trading Signal */}
      <PixelCard title="LATEST_SIGNAL.bin">
        <TradingSignal traderId={trader.trader_id} language={language} />
      </PixelCard>

      {/* Equity Chart */}
      <PixelCard title="EQUITY_CURVE.plot">
        <EquityChart traderId={trader.trader_id} />
      </PixelCard>

      {/* Positions */}
      <PixelCard title="OPEN_POSITIONS.tbl">
        {positions && positions.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse', 
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '0.5rem',
              imageRendering: 'pixelated',
            }}>
              <thead>
                <tr style={{ borderBottom: '3px solid #30363d', borderStyle: 'double' }}>
                  <th style={{ padding: '0.5rem', color: '#7bb3ff', textAlign: 'left', fontSize: '0.5625rem', textShadow: '0 0 6px rgba(123, 179, 255, 0.5)', fontWeight: 'normal' }}>SYMBOL</th>
                  <th style={{ padding: '0.5rem', color: '#7bb3ff', textAlign: 'left', fontSize: '0.5625rem', textShadow: '0 0 6px rgba(123, 179, 255, 0.5)', fontWeight: 'normal' }}>SIDE</th>
                  <th style={{ padding: '0.5rem', color: '#7bb3ff', textAlign: 'left', fontSize: '0.5625rem', textShadow: '0 0 6px rgba(123, 179, 255, 0.5)', fontWeight: 'normal' }}>ENTRY</th>
                  <th style={{ padding: '0.5rem', color: '#7bb3ff', textAlign: 'left', fontSize: '0.5625rem', textShadow: '0 0 6px rgba(123, 179, 255, 0.5)', fontWeight: 'normal' }}>MARK</th>
                  <th style={{ padding: '0.5rem', color: '#7bb3ff', textAlign: 'left', fontSize: '0.5625rem', textShadow: '0 0 6px rgba(123, 179, 255, 0.5)', fontWeight: 'normal' }}>QTY</th>
                  <th style={{ padding: '0.5rem', color: '#7bb3ff', textAlign: 'left', fontSize: '0.5625rem', textShadow: '0 0 6px rgba(123, 179, 255, 0.5)', fontWeight: 'normal' }}>P&L</th>
                  <th style={{ padding: '0.5rem', color: '#7bb3ff', textAlign: 'left', fontSize: '0.5625rem', textShadow: '0 0 6px rgba(123, 179, 255, 0.5)', fontWeight: 'normal' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos, i) => (
                  <tr key={i} style={{ borderBottom: '2px solid #21262d' }}>
                    <td style={{ padding: '0.5rem', color: '#7bb3ff', fontSize: '0.5625rem', textShadow: '0 0 6px rgba(123, 179, 255, 0.4)' }}>{pos.symbol}</td>
                    <td style={{ 
                      padding: '0.5rem', 
                      color: pos.side === 'long' ? '#56d364' : '#ff7b72',
                      fontSize: '0.5625rem',
                      textShadow: pos.side === 'long'
                        ? '0 0 6px rgba(86, 211, 100, 0.5)'
                        : '0 0 6px rgba(255, 123, 114, 0.5)',
                      fontWeight: 'normal',
                    }}>
                      {pos.side.toUpperCase()}
                    </td>
                    <td style={{ padding: '0.5rem', color: '#b1bac4', fontSize: '0.5625rem' }}>
                      {pos.entry_price.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.5rem', color: '#b1bac4', fontSize: '0.5625rem' }}>
                      {pos.mark_price.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.5rem', color: '#b1bac4', fontSize: '0.5625rem' }}>
                      {pos.quantity.toFixed(2)}
                    </td>
                    <td style={{
                      padding: '0.5rem',
                      color: pos.unrealized_pnl >= 0 ? '#56d364' : '#ff7b72',
                      fontSize: '0.5625rem',
                      textShadow: pos.unrealized_pnl >= 0
                        ? '0 0 6px rgba(86, 211, 100, 0.5)'
                        : '0 0 6px rgba(255, 123, 114, 0.5)',
                      fontWeight: 'bold',
                    }}>
                      {pos.unrealized_pnl >= 0 ? '+' : ''}
                      {pos.unrealized_pnl.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <button
                        onClick={() => {
                          if (confirm(`Close ${pos.symbol} ${pos.side}?`)) {
                            api.closePosition(trader.trader_id, pos.symbol, pos.side);
                          }
                        }}
                        className="pixel-button"
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#21262d',
                          border: '2px solid #30363d',
                          borderStyle: 'outset',
                          color: '#ff7b72',
                          cursor: 'pointer',
                          fontFamily: '"Press Start 2P", monospace',
                          fontSize: '0.5625rem',
                          imageRendering: 'pixelated',
                          textShadow: '0 0 6px rgba(255, 123, 114, 0.5)',
                          fontWeight: 'normal',
                        }}
                        onMouseDown={(e) => {
                          e.currentTarget.style.borderStyle = 'inset';
                        }}
                        onMouseUp={(e) => {
                          e.currentTarget.style.borderStyle = 'outset';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderStyle = 'outset';
                        }}
                      >
                        [CLOSE]
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ 
            color: '#8b949e', 
            padding: '2rem', 
            textAlign: 'center',
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '0.5rem',
            imageRendering: 'pixelated',
          }}>
            [NO_ACTIVE_POSITIONS]
          </div>
        )}
      </PixelCard>

      {/* AI Learning */}
      <PixelCard title="AI_LEARNING_ANALYSIS.log">
        <AILearning traderId={trader.trader_id} />
      </PixelCard>

      {/* Decisions */}
      <PixelCard title="RECENT_DECISIONS.log">
        {decisions && decisions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
            {decisions.map((decision, i) => (
              <div
                key={i}
                style={{
                  padding: '0.75rem',
                  border: '2px solid #30363d',
                  borderStyle: 'double',
                  background: '#161b22',
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: '0.5rem',
                  imageRendering: 'pixelated',
                  lineHeight: '1.5',
                }}
              >
                <div style={{ color: '#7bb3ff', marginBottom: '0.5rem', fontSize: '0.5625rem', textShadow: '0 0 6px rgba(123, 179, 255, 0.5)', fontWeight: 'normal' }}>
                  CYCLE #{decision.cycle_number}
                </div>
                <div style={{ 
                  color: decision.success ? '#56d364' : '#ff7b72', 
                  fontSize: '0.5625rem',
                  textShadow: decision.success
                    ? '0 0 6px rgba(86, 211, 100, 0.5)'
                    : '0 0 6px rgba(255, 123, 114, 0.5)',
                  fontWeight: 'normal',
                }}>
                  [{decision.success ? 'SUCCESS' : 'FAILED'}]
                </div>
                {decision.decisions && decision.decisions.length > 0 && (
                  <div style={{ color: '#56d364', marginTop: '0.5rem', fontSize: '0.5625rem', textShadow: '0 0 6px rgba(86, 211, 100, 0.5)', fontWeight: 'normal' }}>
                    {decision.decisions.map((d, idx) => (
                      <div key={idx}>
                        {d.action.toUpperCase()} {d.symbol} QTY:{d.quantity}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ 
            color: '#8b949e', 
            padding: '2rem', 
            textAlign: 'center',
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '0.5rem',
            imageRendering: 'pixelated',
          }}>
            [NO_DECISIONS_YET]
          </div>
        )}
      </PixelCard>
    </div>
  );
}

// Pixel Card Component
function PixelCard({ 
  title, 
  children 
}: { 
  title: string; 
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: '#0d1117',
      border: '4px solid #30363d',
      borderStyle: 'double',
      padding: '1rem',
      position: 'relative',
      boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.5)',
      imageRendering: 'pixelated',
    }}>
      <div style={{
        position: 'absolute',
        top: '-2px',
        left: '-2px',
        right: '-2px',
      height: '4px',
      background: '#7bb3ff',
    }} />
      
      <h2 style={{
        color: '#7bb3ff',
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '0.6875rem',
        fontWeight: 'normal',
        marginBottom: '1rem',
        textShadow: '0 0 8px rgba(123, 179, 255, 0.6), 0 0 4px rgba(123, 179, 255, 0.4)',
        letterSpacing: '1px',
        lineHeight: '1.5',
        imageRendering: 'pixelated',
        filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))',
      }}>
        &gt; {title}
      </h2>
      
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// Stat Box Component
function StatBox({ 
  label, 
  value, 
  color = '#58a6ff' 
}: { 
  label: string; 
  value: string; 
  color?: string;
}) {
  // Default to a brighter blue if no color specified
  const displayColor = color || '#7bb3ff';
  
  return (
    <div style={{
      padding: '0.75rem',
      border: '3px solid #30363d',
      borderStyle: 'double',
      background: '#161b22',
      imageRendering: 'pixelated',
    }}>
      <div style={{ 
        color: '#b1bac4', 
        fontSize: '0.5625rem', 
        marginBottom: '0.5rem', 
        fontFamily: '"Press Start 2P", monospace',
        lineHeight: '1.5',
        imageRendering: 'pixelated',
        fontWeight: 'normal',
        textShadow: '0 0 4px rgba(177, 186, 196, 0.3)',
      }}>
        {label}
      </div>
      <div style={{ 
        color: displayColor, 
        fontSize: '0.9375rem', 
        fontWeight: 'normal', 
        fontFamily: '"Press Start 2P", monospace',
        textShadow: `0 0 8px ${displayColor}66, 0 0 4px ${displayColor}44`,
        lineHeight: '1.5',
        imageRendering: 'pixelated',
        filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2))',
      }}>
        {value}
      </div>
    </div>
  );
}

