import useSWR from 'swr';
import { api } from '../lib/api';
import type { DecisionRecord, Position, AccountInfo } from '../types';

interface AIDecisionViewProps {
  traderId: string;
  language: 'en' | 'zh' | 'ko';
}

export function AIDecisionView({ traderId, language }: AIDecisionViewProps) {
  // Fetch latest decisions (includes cot_trace)
  const { data: decisions, error: decisionsError } = useSWR<DecisionRecord[]>(
    `decisions/latest-${traderId}`,
    () => api.getLatestDecisions(traderId),
    {
      refreshInterval: 5000, // 5 seconds
      revalidateOnFocus: true,
    }
  );

  // Fetch positions
  const { data: positions, error: positionsError } = useSWR<Position[]>(
    `positions-${traderId}`,
    () => api.getPositions(traderId),
    {
      refreshInterval: 3000, // 3 seconds
      revalidateOnFocus: true,
    }
  );

  // Fetch account info
  const { data: account, error: accountError } = useSWR<AccountInfo>(
    `account-${traderId}`,
    () => api.getAccount(traderId),
    {
      refreshInterval: 3000, // 3 seconds
      revalidateOnFocus: true,
    }
  );

  const latestDecision = decisions && decisions.length > 0 ? decisions[0] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="binance-card p-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2" style={{ color: '#EAECEF' }}>
          <span className="text-3xl">🧠</span>
          AI Decision Analysis
        </h2>
        <p className="text-sm" style={{ color: '#848E9C' }}>
          Real-time view of AI thought process, positions, and decisions
        </p>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: AI Thought Process */}
        <div className="binance-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: '#EAECEF' }}>
              <span className="text-2xl">💭</span>
              AI Thought Process
            </h3>
            {latestDecision && (
              <div className="text-xs px-3 py-1 rounded" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366F1', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                Cycle #{latestDecision.cycle_number}
              </div>
            )}
          </div>

          {decisionsError ? (
            <div className="text-center py-8" style={{ color: '#F6465D' }}>
              ⚠️ Failed to load decisions
            </div>
          ) : !latestDecision ? (
            <div className="text-center py-16" style={{ color: '#848E9C' }}>
              <div className="text-6xl mb-4 opacity-50">💭</div>
              <div className="text-lg font-semibold mb-2">No decisions yet</div>
              <div className="text-sm">AI thought process will appear here</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Timestamp */}
              <div className="text-xs" style={{ color: '#848E9C' }}>
                {new Date(latestDecision.timestamp).toLocaleString('en-US', {
                  timeZone: 'Asia/Singapore',
                  dateStyle: 'medium',
                  timeStyle: 'long',
                })}
              </div>

              {/* Chain of Thought */}
              <div
                className="rounded-lg p-4 overflow-auto max-h-[600px]"
                style={{
                  background: '#1E2329',
                  border: '1px solid #2B3139',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                <div style={{ color: '#EAECEF' }}>
                  {latestDecision.cot_trace || 'No thought process available'}
                </div>
              </div>

              {/* Account State at Decision Time */}
              {latestDecision.account_state && (
                <div className="rounded-lg p-3" style={{ background: '#1E2329', border: '1px solid #2B3139' }}>
                  <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#848E9C' }}>
                    Account State (at decision time)
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span style={{ color: '#848E9C' }}>Equity:</span>
                      <span className="ml-2 font-mono font-bold" style={{ color: '#EAECEF' }}>
                        {latestDecision.account_state.total_balance.toFixed(2)} USDT
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#848E9C' }}>Available:</span>
                      <span className="ml-2 font-mono font-bold" style={{ color: '#EAECEF' }}>
                        {latestDecision.account_state.available_balance.toFixed(2)} USDT
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#848E9C' }}>Positions:</span>
                      <span className="ml-2 font-mono font-bold" style={{ color: '#EAECEF' }}>
                        {latestDecision.account_state.position_count}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#848E9C' }}>Margin Used:</span>
                      <span className="ml-2 font-mono font-bold" style={{ color: '#EAECEF' }}>
                        {latestDecision.account_state.margin_used_pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Positions & Decisions */}
        <div className="space-y-6">
          {/* Current Positions */}
          <div className="binance-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: '#EAECEF' }}>
                <span className="text-2xl">📊</span>
                Current Positions
              </h3>
              {positions && positions.length > 0 && (
                <div className="text-xs px-3 py-1 rounded" style={{ background: 'rgba(14, 203, 129, 0.1)', color: '#0ECB81', border: '1px solid rgba(14, 203, 129, 0.2)' }}>
                  {positions.length} active
                </div>
              )}
            </div>

            {positionsError ? (
              <div className="text-center py-8" style={{ color: '#F6465D' }}>
                ⚠️ Failed to load positions
              </div>
            ) : !positions || positions.length === 0 ? (
              <div className="text-center py-12" style={{ color: '#848E9C' }}>
                <div className="text-5xl mb-3 opacity-50">📊</div>
                <div className="text-sm font-semibold">No open positions</div>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((pos, i) => {
                  const positionValue = pos.quantity * pos.mark_price;
                  const marginUsed = positionValue / pos.leverage;
                  const pnlColor = pos.unrealized_pnl >= 0 ? '#0ECB81' : '#F6465D';

                  return (
                    <div
                      key={i}
                      className="rounded-lg p-4"
                      style={{
                        background: '#1E2329',
                        border: '1px solid #2B3139',
                      }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold font-mono" style={{ color: '#EAECEF' }}>
                            {pos.symbol}
                          </span>
                          <span
                            className="px-2 py-1 rounded text-xs font-bold"
                            style={
                              pos.side === 'long'
                                ? { background: 'rgba(14, 203, 129, 0.1)', color: '#0ECB81' }
                                : { background: 'rgba(246, 70, 93, 0.1)', color: '#F6465D' }
                            }
                          >
                            {pos.side.toUpperCase()}
                          </span>
                          <span className="px-2 py-1 rounded text-xs font-bold" style={{ background: 'rgba(240, 185, 11, 0.1)', color: '#F0B90B' }}>
                            {pos.leverage}x
                          </span>
                        </div>
                        <div className="text-sm font-bold font-mono" style={{ color: pnlColor }}>
                          {pos.unrealized_pnl >= 0 ? '+' : ''}
                          {pos.unrealized_pnl.toFixed(2)} USDT
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="mb-1" style={{ color: '#848E9C' }}>Entry Price</div>
                          <div className="font-mono font-semibold" style={{ color: '#EAECEF' }}>
                            {pos.entry_price.toFixed(4)}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1" style={{ color: '#848E9C' }}>Mark Price</div>
                          <div className="font-mono font-semibold" style={{ color: '#EAECEF' }}>
                            {pos.mark_price.toFixed(4)}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1" style={{ color: '#848E9C' }}>Quantity</div>
                          <div className="font-mono font-semibold" style={{ color: '#EAECEF' }}>
                            {pos.quantity.toFixed(4)}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1" style={{ color: '#848E9C' }}>Position Value</div>
                          <div className="font-mono font-semibold" style={{ color: '#EAECEF' }}>
                            {positionValue.toFixed(2)} USDT
                          </div>
                        </div>
                        <div>
                          <div className="mb-1" style={{ color: '#848E9C' }}>Margin Used</div>
                          <div className="font-mono font-semibold" style={{ color: '#F0B90B' }}>
                            {marginUsed.toFixed(2)} USDT
                          </div>
                        </div>
                        <div>
                          <div className="mb-1" style={{ color: '#848E9C' }}>Unrealized P&L</div>
                          <div className="font-mono font-semibold" style={{ color: pnlColor }}>
                            {pos.unrealized_pnl >= 0 ? '+' : ''}
                            {pos.unrealized_pnl.toFixed(2)} ({pos.unrealized_pnl_pct >= 0 ? '+' : ''}
                            {pos.unrealized_pnl_pct.toFixed(2)}%)
                          </div>
                        </div>
                        <div>
                          <div className="mb-1" style={{ color: '#848E9C' }}>Liquidation Price</div>
                          <div className="font-mono font-semibold" style={{ color: '#848E9C' }}>
                            {pos.liquidation_price.toFixed(4)}
                          </div>
                        </div>
                        {pos.margin_used && (
                          <div>
                            <div className="mb-1" style={{ color: '#848E9C' }}>Margin (API)</div>
                            <div className="font-mono font-semibold" style={{ color: '#848E9C' }}>
                              {pos.margin_used.toFixed(2)} USDT
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Total Summary */}
                {account && positions && positions.length > 0 && (
                  <div className="rounded-lg p-3 mt-4" style={{ background: 'rgba(240, 185, 11, 0.1)', border: '1px solid rgba(240, 185, 11, 0.2)' }}>
                    <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: '#F0B90B' }}>
                      Total Summary
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span style={{ color: '#848E9C' }}>Total Equity:</span>
                        <span className="ml-2 font-mono font-bold" style={{ color: '#EAECEF' }}>
                          {account.total_equity.toFixed(2)} USDT
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#848E9C' }}>Available:</span>
                        <span className="ml-2 font-mono font-bold" style={{ color: '#EAECEF' }}>
                          {account.available_balance.toFixed(2)} USDT
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#848E9C' }}>Total Unrealized P&L:</span>
                        <span
                          className="ml-2 font-mono font-bold"
                          style={{ color: (account.total_unrealized_pnl || 0) >= 0 ? '#0ECB81' : '#F6465D' }}
                        >
                          {(account.total_unrealized_pnl || 0) >= 0 ? '+' : ''}
                          {(account.total_unrealized_pnl || 0).toFixed(2)} USDT
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#848E9C' }}>Margin Used:</span>
                        <span className="ml-2 font-mono font-bold" style={{ color: '#EAECEF' }}>
                          {account.margin_used.toFixed(2)} USDT ({account.margin_used_pct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Latest Decisions */}
          <div className="binance-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: '#EAECEF' }}>
                <span className="text-2xl">📋</span>
                Latest Decisions
              </h3>
              {decisions && decisions.length > 0 && (
                <div className="text-xs px-3 py-1 rounded" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366F1', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  {decisions.length} cycles
                </div>
              )}
            </div>

            {decisionsError ? (
              <div className="text-center py-8" style={{ color: '#F6465D' }}>
                ⚠️ Failed to load decisions
              </div>
            ) : !decisions || decisions.length === 0 ? (
              <div className="text-center py-12" style={{ color: '#848E9C' }}>
                <div className="text-5xl mb-3 opacity-50">📋</div>
                <div className="text-sm font-semibold">No decisions yet</div>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {decisions.slice(0, 5).map((decision, i) => {
                  const decisionsToShow = decision.decisions || [];
                  
                  return (
                    <div
                      key={i}
                      className="rounded-lg p-4"
                      style={{
                        background: '#1E2329',
                        border: '1px solid #2B3139',
                      }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-semibold text-sm" style={{ color: '#EAECEF' }}>
                            Cycle #{decision.cycle_number}
                          </div>
                          <div className="text-xs" style={{ color: '#848E9C' }}>
                            {new Date(decision.timestamp).toLocaleString('en-US', {
                              timeZone: 'Asia/Singapore',
                            })}
                          </div>
                        </div>
                        <div
                          className="px-2 py-1 rounded text-xs font-bold"
                          style={
                            decision.success
                              ? { background: 'rgba(14, 203, 129, 0.1)', color: '#0ECB81' }
                              : { background: 'rgba(246, 70, 93, 0.1)', color: '#F6465D' }
                          }
                        >
                          {decision.success ? '✓ Success' : '✗ Failed'}
                        </div>
                      </div>

                      {/* Decisions List */}
                      {decisionsToShow.length > 0 ? (
                        <div className="space-y-2">
                          {decisionsToShow.map((action, j) => {
                            const isOpen = action.action?.includes('open');
                            const isClose = action.action?.includes('close');
                            const isWait = action.action === 'wait';
                            const isLong = action.action?.includes('long');
                            const isShort = action.action?.includes('short');

                            let actionColor = '#848E9C';
                            let actionIcon = '⚪';
                            if (isWait) {
                              actionColor = '#848E9C';
                              actionIcon = '⏸️';
                            } else if (isOpen && isLong) {
                              actionColor = '#0ECB81';
                              actionIcon = '📈';
                            } else if (isOpen && isShort) {
                              actionColor = '#F6465D';
                              actionIcon = '📉';
                            } else if (isClose) {
                              actionColor = '#60a5fa';
                              actionIcon = '🔚';
                            }

                            return (
                              <div
                                key={j}
                                className="rounded p-2 text-xs"
                                style={{
                                  background: 'rgba(132, 142, 156, 0.05)',
                                  border: `1px solid ${actionColor}`,
                                }}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span>{actionIcon}</span>
                                  <span className="font-bold font-mono" style={{ color: '#EAECEF' }}>
                                    {action.symbol || 'ALL'}
                                  </span>
                                  <span
                                    className="px-2 py-0.5 rounded font-bold"
                                    style={{
                                      background: actionColor,
                                      color: '#000',
                                    }}
                                  >
                                    {action.action?.toUpperCase() || 'UNKNOWN'}
                                  </span>
                                  {action.confidence !== undefined && (
                                    <span className="ml-auto" style={{ color: actionColor }}>
                                      {action.confidence}% confidence
                                    </span>
                                  )}
                                </div>
                                {action.reasoning && (
                                  <div className="text-xs mt-1" style={{ color: '#848E9C', fontStyle: 'italic' }}>
                                    {action.reasoning}
                                  </div>
                                )}
                                {action.position_size_usd && action.position_size_usd > 0 && (
                                  <div className="text-xs mt-1 font-mono" style={{ color: '#EAECEF' }}>
                                    Size: ${action.position_size_usd.toFixed(2)} USDT
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs" style={{ color: '#848E9C', fontStyle: 'italic' }}>
                          No actions this cycle
                        </div>
                      )}

                      {/* Error Message */}
                      {decision.error_message && (
                        <div className="mt-2 text-xs py-1 px-2 rounded" style={{ background: 'rgba(246, 70, 93, 0.15)', color: '#F6465D' }}>
                          ⚠️ {decision.error_message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

