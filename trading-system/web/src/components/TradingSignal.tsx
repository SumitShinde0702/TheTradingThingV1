import { useState } from 'react';
import useSWR from 'swr';
import { api } from '../lib/api';
import { t, type Language } from '../i18n/translations';
import type { TradingSignal } from '../types';

interface TradingSignalProps {
  traderId?: string;
  model?: string;
  language: Language;
  autoRefresh?: boolean;
  compact?: boolean;
}

export function TradingSignal({ traderId, model, language, autoRefresh = true, compact = false }: TradingSignalProps) {
  const [showCoT, setShowCoT] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);

  const { data: signal, error, isLoading } = useSWR<TradingSignal>(
    traderId ? `trading-signal-${traderId}` : model ? `trading-signal-model-${model}` : null,
    () => {
      console.log('[TradingSignal] Fetching signal for:', { traderId, model });
      return api.getTradingSignal(traderId, model);
    },
    {
      refreshInterval: autoRefresh ? 5000 : 0,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
      onError: (err) => {
        console.error('[TradingSignal] Error fetching:', err);
      },
      onSuccess: (data) => {
        console.log('[TradingSignal] Data received:', data);
      },
    }
  );

  // Debug: Always show something if traderId or model is provided
  console.log('[TradingSignal] Render:', { traderId, model, isLoading, error, hasSignal: !!signal });

  const paddingClass = compact ? 'p-4' : 'p-6';
  const headerIconSize = compact ? 'w-10 h-10 text-xl' : 'w-12 h-12 text-2xl';
  const headerTitleSize = compact ? 'text-lg' : 'text-xl';
  const headerMargin = compact ? 'mb-3 pb-3' : 'mb-5 pb-4';
  const sectionMargin = compact ? 'mb-3' : 'mb-4';
  const timestampMargin = compact ? 'mb-3' : 'mb-4';

  if (!traderId && !model) {
    return (
      <div className={`binance-card ${paddingClass}`} style={{ border: '1px solid rgba(246, 70, 93, 0.3)' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: '#F6465D' }}>
          <span>⚠️</span>
          <span>No trader ID or model specified for trading signal</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`binance-card ${paddingClass}`}>
        <div className="flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full"></div>
          <div className="text-sm" style={{ color: '#EAECEF' }}>
            {t('loading', language)} {t('latestTradingSignal', language)}...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    console.error('[TradingSignal] Error details:', error);
    return (
      <div className={`binance-card ${paddingClass}`} style={{ border: '1px solid rgba(246, 70, 93, 0.3)' }}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#F6465D' }}>
            <span>⚠️</span>
            <span>{t('failedToLoadTradingSignal', language)}</span>
          </div>
          <div className="text-xs font-mono" style={{ color: '#848E9C' }}>
            {error.message || String(error)}
          </div>
          <div className="text-xs" style={{ color: '#848E9C' }}>
            API Endpoint: /api/trading-signal{traderId ? `?trader_id=${traderId}` : model ? `?model=${model}` : ''}
          </div>
        </div>
      </div>
    );
  }

  if (!signal) {
    return (
      <div className={`binance-card ${paddingClass}`} style={{ border: '1px solid rgba(246, 70, 93, 0.3)' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: '#F6465D' }}>
          <span>ℹ️</span>
          <span>No trading signal data available</span>
        </div>
        <div className="text-xs mt-2" style={{ color: '#848E9C' }}>
          The trading system may not have generated any signals yet, or the endpoint may not be accessible.
        </div>
      </div>
    );
  }

  return (
    <div className={`binance-card ${paddingClass} animate-slide-in`}>
      {/* Header */}
      <div className={`flex items-center justify-between ${headerMargin} border-b`} style={{ borderColor: '#2B3139' }}>
        <div className="flex items-center gap-3">
          <div
            className={`${headerIconSize} rounded-xl flex items-center justify-center`}
            style={{
              background: 'linear-gradient(135deg, #F0B90B 0%, #FCD535 100%)',
              boxShadow: '0 4px 14px rgba(240, 185, 11, 0.4)',
            }}
          >
            📡
          </div>
          <div>
            <h2 className={`${headerTitleSize} font-bold`} style={{ color: '#EAECEF' }}>
              {t('latestTradingSignal', language)}
            </h2>
            <div className="text-xs mt-1" style={{ color: '#848E9C' }}>
              {signal.trader_name} • {signal.ai_model.toUpperCase()} • {t('cycle', language)} #{signal.cycle_number}
            </div>
          </div>
        </div>
        <div
          className="px-3 py-1.5 rounded text-xs font-bold"
          style={
            signal.success
              ? { background: 'rgba(14, 203, 129, 0.1)', color: '#0ECB81', border: '1px solid rgba(14, 203, 129, 0.2)' }
              : { background: 'rgba(246, 70, 93, 0.1)', color: '#F6465D', border: '1px solid rgba(246, 70, 93, 0.2)' }
          }
        >
          {t(signal.success ? 'success' : 'failed', language)}
        </div>
      </div>

      {/* Timestamp */}
      <div className={`${timestampMargin} text-xs font-mono`} style={{ color: '#848E9C' }}>
        {new Date(signal.timestamp).toLocaleString('en-US', {
          timeZone: 'Asia/Singapore'
        })}
      </div>

      {/* Account State Summary */}
      {signal.account_state && (
        <div className={`${sectionMargin} ${compact ? 'p-3' : 'p-4'} rounded`} style={{ background: '#0B0E11', border: '1px solid #2B3139' }}>
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${compact ? 'text-xs' : 'text-sm'}`}>
            <div>
              <div className="text-xs mb-1" style={{ color: '#848E9C' }}>{t('totalEquity', language)}</div>
              <div className="font-bold font-mono" style={{ color: '#EAECEF' }}>
                {signal.account_state.total_equity?.toFixed(2) || '0.00'} USDT
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: '#848E9C' }}>{t('availableBalance', language)}</div>
              <div className="font-bold font-mono" style={{ color: '#EAECEF' }}>
                {signal.account_state.available_balance?.toFixed(2) || '0.00'} USDT
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: '#848E9C' }}>{t('positions', language)}</div>
              <div className="font-bold font-mono" style={{ color: '#EAECEF' }}>
                {signal.account_state.position_count || 0}
              </div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: '#848E9C' }}>{t('marginRate', language)}</div>
              <div className="font-bold font-mono" style={{ color: '#EAECEF' }}>
                {signal.account_state.margin_used_pct?.toFixed(1) || '0.0'}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decisions */}
      {signal.decisions && signal.decisions.length > 0 && (
        <div className={sectionMargin}>
          <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold ${compact ? 'mb-2' : 'mb-3'}`} style={{ color: '#EAECEF' }}>
            {t('tradingDecisions', language)} ({signal.decisions.length})
          </h3>
          <div className="space-y-2">
            {signal.decisions.map((decision, idx) => (
              <div
                key={idx}
                className={`${compact ? 'p-2' : 'p-3'} rounded`}
                style={{ background: '#0B0E11', border: '1px solid #2B3139' }}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono font-bold text-sm" style={{ color: '#EAECEF' }}>
                    {decision.symbol || 'ALL'}
                  </span>
                  <span
                    className="px-2 py-1 rounded text-xs font-bold"
                    style={
                      decision.action?.includes('open')
                        ? { background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa' }
                        : decision.action?.includes('close')
                        ? { background: 'rgba(240, 185, 11, 0.1)', color: '#F0B90B' }
                        : { background: 'rgba(132, 142, 156, 0.1)', color: '#848E9C' }
                    }
                  >
                    {decision.action}
                  </span>
                  {decision.leverage && (
                    <span className="text-xs font-mono" style={{ color: '#F0B90B' }}>
                      {decision.leverage}x
                    </span>
                  )}
                  {decision.price && (
                    <span className="text-xs font-mono" style={{ color: '#848E9C' }}>
                      @{decision.price.toFixed(4)}
                    </span>
                  )}
                  {decision.success !== undefined && (
                    <span style={{ color: decision.success ? '#0ECB81' : '#F6465D' }}>
                      {decision.success ? '✓' : '✗'}
                    </span>
                  )}
                </div>
                {decision.reasoning && (
                  <div className="mt-2 text-xs" style={{ color: '#848E9C' }}>
                    {decision.reasoning}
                  </div>
                )}
                {decision.error && (
                  <div className="mt-2 text-xs" style={{ color: '#F6465D' }}>
                    ❌ {decision.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chain of Thought - Collapsible */}
      {signal.chain_of_thought && (
        <div className={sectionMargin}>
          <button
            onClick={() => setShowCoT(!showCoT)}
            className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'} transition-colors ${compact ? 'mb-1' : 'mb-2'}`}
            style={{ color: '#F0B90B' }}
          >
            <span className="font-semibold">💭 {t('aiThinking', language)}</span>
            <span className="text-xs">{showCoT ? t('collapse', language) : t('expand', language)}</span>
          </button>
          {showCoT && (
            <div
              className={`rounded ${compact ? 'p-3' : 'p-4'} ${compact ? 'text-xs' : 'text-sm'} font-mono whitespace-pre-wrap ${compact ? 'max-h-48' : 'max-h-96'} overflow-y-auto`}
              style={{ background: '#0B0E11', border: '1px solid #2B3139', color: '#EAECEF' }}
            >
              {signal.chain_of_thought}
            </div>
          )}
        </div>
      )}

      {/* Input Prompt - Collapsible */}
      {signal.input_prompt && (
        <div className={sectionMargin}>
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'} transition-colors ${compact ? 'mb-1' : 'mb-2'}`}
            style={{ color: '#60a5fa' }}
          >
            <span className="font-semibold">📥 {t('inputPrompt', language)}</span>
            <span className="text-xs">{showPrompt ? t('collapse', language) : t('expand', language)}</span>
          </button>
          {showPrompt && (
            <div
              className={`rounded ${compact ? 'p-3' : 'p-4'} ${compact ? 'text-xs' : 'text-sm'} font-mono whitespace-pre-wrap ${compact ? 'max-h-48' : 'max-h-96'} overflow-y-auto`}
              style={{ background: '#0B0E11', border: '1px solid #2B3139', color: '#EAECEF' }}
            >
              {signal.input_prompt}
            </div>
          )}
        </div>
      )}

      {/* Raw Response - Collapsible */}
      {signal.raw_response && (
        <div className={sectionMargin}>
          <button
            onClick={() => setShowRawResponse(!showRawResponse)}
            className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'} transition-colors ${compact ? 'mb-1' : 'mb-2'}`}
            style={{ color: '#c084fc' }}
          >
            <span className="font-semibold">🔍 {t('rawResponse', language)}</span>
            <span className="text-xs">{showRawResponse ? t('collapse', language) : t('expand', language)}</span>
          </button>
          {showRawResponse && (
            <div
              className={`rounded ${compact ? 'p-3' : 'p-4'} ${compact ? 'text-xs' : 'text-sm'} font-mono whitespace-pre-wrap ${compact ? 'max-h-48' : 'max-h-96'} overflow-y-auto`}
              style={{ background: '#0B0E11', border: '1px solid #2B3139', color: '#EAECEF' }}
            >
              {signal.raw_response}
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {signal.error_message && (
        <div
          className="text-sm rounded px-4 py-3 mt-4"
          style={{ color: '#F6465D', background: 'rgba(246, 70, 93, 0.1)', border: '1px solid rgba(246, 70, 93, 0.2)' }}
        >
          ❌ {signal.error_message}
        </div>
      )}

      {/* Auto-refresh indicator */}
      {autoRefresh && (
        <div className={compact ? 'mt-3' : 'mt-4'} style={{ color: '#848E9C' }}>
          <div className={`${compact ? 'text-xs' : 'text-xs'} text-center`}>
            {t('autoRefreshEnabled', language)} (5s)
          </div>
        </div>
      )}
    </div>
  );
}