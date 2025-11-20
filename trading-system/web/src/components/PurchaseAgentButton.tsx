import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { t, type Language } from '../i18n/translations';

interface PurchaseAgentButtonProps {
  traderName?: string;
  traderId?: string;
  language: Language;
}

interface PurchaseLogEntry {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  raw: any;
}

const EVENT_META: Record<
  string,
  {
    icon: string;
    color: string;
    title: string;
  }
> = {
  status: { icon: '📣', color: '#F0B90B', title: 'Status' },
  tool: { icon: '🛠️', color: '#60a5fa', title: 'Tool' },
  payment: { icon: '💸', color: '#0ECB81', title: 'Payment' },
  workflow_step: { icon: '🧠', color: '#FCD535', title: 'Workflow' },
  agent_response: { icon: '🤖', color: '#C084FC', title: 'Agent' },
  response: { icon: '📬', color: '#EAECEF', title: 'Response' },
  agent_conversation: { icon: '💬', color: '#F472B6', title: 'Conversation' },
  complete: { icon: '✅', color: '#0ECB81', title: 'Complete' },
  error: { icon: '❌', color: '#F6465D', title: 'Error' },
  warning: { icon: '⚠️', color: '#FBBF24', title: 'Warning' },
  default: { icon: '📝', color: '#EAECEF', title: 'Event' },
};

const WORKFLOW_STEPS = [
  { id: 'discovery', label: 'Discovery', description: 'ERC-8004 agent lookup' },
  { id: 'payment', label: 'Payment', description: 'Hedera x402 transfer' },
  { id: 'signal', label: 'Signal', description: 'Fetch Binance futures data' },
  { id: 'execution', label: 'Execution', description: 'Send to trade executor' },
  { id: 'completion', label: 'Complete', description: 'Summarize workflow' },
] as const;

type WorkflowStepId = (typeof WORKFLOW_STEPS)[number]['id'];
type WorkflowStatus = 'pending' | 'active' | 'completed' | 'warning' | 'error';

const STEP_STATUS_STYLES: Record<
  WorkflowStatus,
  { circleBg: string; circleBorder: string; text: string; connector: string }
> = {
  pending: { circleBg: '#1E2329', circleBorder: '#2B3139', text: '#6B7280', connector: '#1F2A37' },
  active: { circleBg: '#F0B90B', circleBorder: '#F0B90B', text: '#000000', connector: '#F0B90B' },
  completed: { circleBg: '#0ECB81', circleBorder: '#0ECB81', text: '#000000', connector: '#0ECB81' },
  warning: { circleBg: '#FBBF24', circleBorder: '#FBBF24', text: '#000000', connector: '#FBBF24' },
  error: { circleBg: '#F6465D', circleBorder: '#F6465D', text: '#FFFFFF', connector: '#F6465D' },
};

const createInitialWorkflowState = (): Record<WorkflowStepId, WorkflowStatus> => {
  return WORKFLOW_STEPS.reduce((acc, step) => {
    acc[step.id] = 'pending';
    return acc;
  }, {} as Record<WorkflowStepId, WorkflowStatus>);
};

const normalizeErrorMessage = (message?: string) => {
  if (!message) return 'Purchase failed';
  if (/ECONNRESET|socket hang up/i.test(message)) {
    return 'Agent channel reset before responding. Please retry once the Hedera RPC stabilizes.';
  }
  return message;
};

const buildDefaultQuery = (traderName?: string, traderId?: string) =>
  [
    `1. Use discover_agents (ERC-8004) to locate the payment, signal, and trade executor agents for ${traderName || 'the selected model'} (id: ${
      traderId || 'unknown'
    }).`,
    '2. Retrieve their agent_card URLs and use those IDs/endpoints directly (do NOT call /api/agents/{name}).',
    '3. Process payment via x402/Hedera, include the transaction hash + HashScan URL.',
    '4. Send the trading signal request to the discovered data analyzer agent, collect the decisions/chain_of_thought.',
    '5. Forward the signal to the discovered trade executor agent.',
    '6. Return a final summary when all steps finish.',
  ].join(' ');

const formatEventMessage = (type: string, data: any): string => {
  if (!data || typeof data !== 'object') {
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  switch (type) {
    case 'status':
      return data.message || data.type || JSON.stringify(data);
    case 'payment':
      return `${data.stage ? `[${data.stage}] ` : ''}${data.message || 'Processing payment'}${
        data.txHash ? ` (${data.txHash.slice(0, 10)}...)` : ''
      }`;
    case 'tool':
      return `${data.tool ? `${data.tool}: ` : ''}${data.status || 'running'}${data.message ? ` — ${data.message}` : ''}`;
    case 'workflow_step':
      return `${data.step || 'Step'}${data.status ? ` (${data.status})` : ''}${
        data.message ? ` — ${data.message}` : ''
      }`;
    case 'agent_response':
    case 'response':
      return data.message || data.response || data.text || JSON.stringify(data);
    case 'agent_conversation':
      return data.content || data.message || JSON.stringify(data);
    case 'complete':
      return data.message || 'Purchase complete';
    case 'error':
      return normalizeErrorMessage(data?.error || data?.message);
    case 'warning':
      return data.message || JSON.stringify(data);
    default:
      return data.message || JSON.stringify(data);
  }
};

const getLogStep = (entry: PurchaseLogEntry): WorkflowStepId | null => {
  const { type, raw } = entry;
  
  // Discovery logs
  if (type === 'tool' && raw?.tool === 'discover_agents') return 'discovery';
  if (type === 'workflow_step' && raw?.step === 'discovery') return 'discovery';
  
  // Payment logs
  if (type === 'tool' && raw?.tool === 'process_payment') return 'payment';
  if (type === 'workflow_step' && raw?.step === 'payment') return 'payment';
  if (type === 'payment') return 'payment';
  if (raw?.txHash || raw?.hashscanUrl || raw?.result?.txHash || raw?.result?.hashscanUrl) return 'payment';
  
  // Signal logs
  if (type === 'workflow_step' && raw?.step === 'signal') return 'signal';
  if (type === 'agent_response' && (raw?.from === 'DataAnalyzer' || raw?.agentName === 'DataAnalyzer')) return 'signal';
  if (type === 'agent_conversation' && raw?.to?.toLowerCase().includes('dataanalyzer')) return 'signal';
  
  // Execution logs
  if (type === 'workflow_step' && raw?.step === 'execution') return 'execution';
  if (type === 'agent_response' && (raw?.from === 'TradeExecutor' || raw?.agentName === 'TradeExecutor')) return 'execution';
  if (type === 'agent_conversation' && raw?.to?.toLowerCase().includes('tradeexecutor')) return 'execution';
  
  // Completion logs
  if (type === 'complete') return 'completion';
  if (type === 'workflow_step' && raw?.step === 'completion') return 'completion';
  
  return null;
};

const renderMessageWithLinks = (message: string): React.ReactNode => {
  // Match HashScan URLs (hashscan.io/testnet/transaction/...)
  const hashscanRegex = /(https?:\/\/hashscan\.io\/[^\s\)]+)/gi;
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match;
  let keyCounter = 0;

  while ((match = hashscanRegex.exec(message)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(message.slice(lastIndex, match.index));
    }
    
    // Add the clickable link
    const url = match[0];
    parts.push(
      <a
        key={`link-${keyCounter++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-semibold hover:opacity-80 transition-opacity"
        style={{ color: '#60a5fa' }}
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < message.length) {
    parts.push(message.slice(lastIndex));
  }
  
  return parts.length > 0 ? <>{parts}</> : message;
};

export function PurchaseAgentButton({ traderName, traderId, language }: PurchaseAgentButtonProps) {
  const [query, setQuery] = useState(() => buildDefaultQuery(traderName, traderId));
  const [isDirty, setIsDirty] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [statusText, setStatusText] = useState(() => t('purchaseIdleStatus', language));
  const [logEntries, setLogEntries] = useState<PurchaseLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState<Record<WorkflowStepId, WorkflowStatus>>(() => createInitialWorkflowState());
  const cleanupRef = useRef<null | (() => void)>(null);

  const resetWorkflowState = () => {
    setWorkflowState(() => {
      const reset = createInitialWorkflowState();
      reset.discovery = 'active';
      return reset;
    });
  };

  const markWorkflowStep = (step: WorkflowStepId, status: WorkflowStatus) => {
    setWorkflowState((prev) => {
      if (!step || prev[step] === status) return prev;
      const updated = { ...prev, [step]: status };
      
      // Auto-advance: when a step completes, mark next as active if it's still pending
      if (status === 'completed') {
        const currentIndex = WORKFLOW_STEPS.findIndex(s => s.id === step);
        if (currentIndex >= 0 && currentIndex < WORKFLOW_STEPS.length - 1) {
          const nextStep = WORKFLOW_STEPS[currentIndex + 1];
          if (updated[nextStep.id] === 'pending') {
            updated[nextStep.id] = 'active';
          }
        }
      }
      
      return updated;
    });
  };

  const isWorkflowStep = (value: unknown): value is WorkflowStepId =>
    typeof value === 'string' && WORKFLOW_STEPS.some((step) => step.id === value);

  // Update default query when trader changes (unless user edited)
  useEffect(() => {
    if (!isDirty) {
      setQuery(buildDefaultQuery(traderName, traderId));
    }
  }, [traderName, traderId, isDirty]);

  // Reset idle status when language changes
  useEffect(() => {
    if (!isPurchasing) {
      setStatusText(t('purchaseIdleStatus', language));
    }
  }, [language, isPurchasing]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  const addLogEntry = (type: string, data: any) => {
    setLogEntries((prev) => {
      const entry: PurchaseLogEntry = {
        id: `${Date.now()}-${prev.length}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        message: formatEventMessage(type, data),
        raw: data,
      };
      return [...prev.slice(-20), entry];
    });
  };

  const handlePurchase = async () => {
    if (isPurchasing) return;

    setIsPurchasing(true);
    setError(null);
    setStatusText(t('purchaseConnecting', language));
    setLogEntries([]);
    resetWorkflowState();

    try {
      const cleanup = await api.purchaseAgent(
        query,
        (eventType, data) => {
          addLogEntry(eventType, data);

          if (eventType === 'status' && data?.message) {
            setStatusText(data.message);
          }

          if (eventType === 'payment' && data?.message) {
            setStatusText(data.message);
          }

          if (eventType === 'workflow_step') {
            const stepId = data?.step;
            const status = data?.status;
            if (isWorkflowStep(stepId) && typeof status === 'string') {
              if (status === 'starting') {
                markWorkflowStep(stepId, 'active');
              } else if (status === 'completed') {
                markWorkflowStep(stepId, 'completed');
              } else if (status === 'warning') {
                markWorkflowStep(stepId, 'warning');
              } else if (status === 'error') {
                markWorkflowStep(stepId, 'error');
              }
            }
          }

          // Auto-detect step completions from other events
          if (eventType === 'tool' && data?.tool === 'process_payment' && data?.status === 'completed') {
            markWorkflowStep('payment', 'completed');
          }
          if (eventType === 'tool' && data?.tool === 'discover_agents' && data?.status === 'completed') {
            markWorkflowStep('discovery', 'completed');
          }
          if (eventType === 'agent_response' && data?.from === 'DataAnalyzer') {
            markWorkflowStep('signal', 'completed');
          }
          if (eventType === 'agent_response' && data?.from === 'TradeExecutor') {
            markWorkflowStep('execution', 'completed');
          }

          if (eventType === 'complete') {
            markWorkflowStep('completion', 'completed');
            setStatusText(data?.message || t('purchaseComplete', language));
            setIsPurchasing(false);
            cleanupRef.current?.();
            cleanupRef.current = null;
          }

          if (eventType === 'error') {
            const friendly = normalizeErrorMessage(data?.error || data?.message);
            if (isWorkflowStep(data?.step)) {
              markWorkflowStep(data.step, 'error');
            }
            setError(friendly);
            setStatusText(t('purchaseFailed', language));
            setIsPurchasing(false);
            cleanupRef.current?.();
            cleanupRef.current = null;
          }
        },
        { traderId, traderName }
      );

      cleanupRef.current = cleanup;
    } catch (err: any) {
      console.error('[PurchaseAgentButton] Purchase error:', err);
      setError(err?.message || 'Purchase request failed');
      setStatusText(t('purchaseFailed', language));
      setIsPurchasing(false);
    }
  };

  return (
    <div className="binance-card p-5 animate-slide-in" style={{ animationDelay: '0.14s' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: '#EAECEF' }}>
            🪙 {t('hederaPurchaseTitle', language)}
          </h2>
          <p className="text-sm" style={{ color: '#848E9C' }}>
            {t('hederaPurchaseSubtitle', language)}
          </p>
        </div>
        <div className="text-xs px-3 py-1 rounded-full font-semibold" style={{ background: 'rgba(96, 165, 250, 0.12)', color: '#93C5FD' }}>
          Hedera × X402
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <label className="text-xs font-semibold" style={{ color: '#848E9C' }}>
          {t('purchasePromptLabel', language)}
        </label>
        <textarea
          value={query}
          onChange={(e) => {
            setIsDirty(true);
            setQuery(e.target.value);
          }}
          className="w-full rounded-lg border border-gray-800 bg-[#0B0E11] text-sm p-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
          rows={3}
          placeholder={t('purchasePromptPlaceholder', language)}
          disabled={isPurchasing}
        />
      </div>

      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="text-xs font-mono" style={{ color: '#F0B90B' }}>
          {statusText}
        </div>
        <button
          onClick={handlePurchase}
          disabled={isPurchasing}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            isPurchasing ? 'opacity-70 cursor-not-allowed' : 'hover:-translate-y-0.5'
          }`}
          style={{
            background: 'linear-gradient(135deg, #F0B90B 0%, #FCD535 100%)',
            color: '#000',
          }}
        >
          {isPurchasing ? t('purchaseInProgress', language) : t('purchaseButtonLabel', language)}
        </button>
      </div>

      {error && (
        <div className="rounded bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs mb-4" style={{ color: '#FCA5A5' }}>
          ❌ {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-800 bg-[#0B0E11] p-4 mb-4">
        <div className="flex flex-col gap-6">
          {WORKFLOW_STEPS.map((step, index) => {
            const status = workflowState[step.id];
            const styles = STEP_STATUS_STYLES[status] || STEP_STATUS_STYLES.pending;
            const connectorColor =
              status === 'pending' ? '#1F2A37' : styles.connector;
            const isLast = index === WORKFLOW_STEPS.length - 1;
            
            // Filter logs for this step
            const stepLogs = logEntries.filter(entry => getLogStep(entry) === step.id);

            // Find HashScan link for this step
            const stepHashscanUrl = stepLogs.find(entry => {
              const hashscanUrl = entry.raw?.hashscanUrl || entry.raw?.result?.hashscanUrl || entry.raw?.payment?.hashscanUrl;
              return hashscanUrl;
            })?.raw?.hashscanUrl || 
            stepLogs.find(entry => entry.raw?.result?.hashscanUrl)?.raw?.result?.hashscanUrl ||
            stepLogs.find(entry => entry.raw?.payment?.hashscanUrl)?.raw?.payment?.hashscanUrl;
            
            const stepTxHash = stepLogs.find(entry => {
              const txHash = entry.raw?.txHash || entry.raw?.result?.txHash || entry.raw?.payment?.txHash;
              return txHash;
            })?.raw?.txHash || 
            stepLogs.find(entry => entry.raw?.result?.txHash)?.raw?.result?.txHash ||
            stepLogs.find(entry => entry.raw?.payment?.txHash)?.raw?.payment?.txHash;

            return (
              <div key={step.id} className="grid grid-cols-1 lg:grid-cols-[auto_200px_1fr] gap-2 lg:gap-1 items-start">
                {/* Circle indicator */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className="w-10 h-10 rounded-full border-2 text-sm font-bold flex items-center justify-center transition-all duration-300 shadow-lg"
                    style={{
                      background: styles.circleBg,
                      borderColor: styles.circleBorder,
                      color: styles.text,
                      boxShadow: status !== 'pending' ? `0 0 12px ${styles.circleBorder}40` : 'none',
                    }}
                  >
                    {index + 1}
                  </div>
                  {!isLast && (
                    <div
                      className="w-0.5 flex-1 min-h-[60px] mt-2 transition-all duration-300"
                      style={{ 
                        background: connectorColor, 
                        opacity: status === 'pending' ? 0.3 : 1 
                      }}
                    ></div>
                  )}
                </div>
                
                {/* Step info - fixed width to align log boxes */}
                <div className="pt-1 min-w-0 lg:min-w-[200px]">
                  <div className="text-base font-bold mb-1" style={{ color: status === 'pending' ? '#6B7280' : styles.text === '#000000' ? '#EAECEF' : styles.text }}>
                    {step.label}
                  </div>
                  <div className="text-sm leading-relaxed" style={{ color: '#9CA3AF' }}>
                    {step.description}
                  </div>
                  {/* HashScan link directly under description */}
                  {(stepHashscanUrl || stepTxHash) && (
                    <div className="mt-2">
                      {stepHashscanUrl ? (
                        <a
                          href={stepHashscanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold underline hover:opacity-80 transition-opacity inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/20"
                          style={{ color: '#60a5fa' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          🔗 View on HashScan
                        </a>
                      ) : stepTxHash ? (
                        <a
                          href={`https://hashscan.io/testnet/transaction/${stepTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold underline hover:opacity-80 transition-opacity inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/20"
                          style={{ color: '#60a5fa' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          🔗 View Transaction
                        </a>
                      ) : null}
                    </div>
                  )}
                  {status === 'active' && (
                    <div className="mt-2 text-xs font-medium animate-pulse" style={{ color: styles.circleBorder }}>
                      In progress...
                    </div>
                  )}
                  {status === 'completed' && (
                    <div className="mt-2 text-xs font-medium" style={{ color: '#0ECB81' }}>
                      ✓ Completed
                    </div>
                  )}
                  {status === 'error' && (
                    <div className="mt-2 text-xs font-medium" style={{ color: '#F6465D' }}>
                      ✗ Failed
                    </div>
                  )}
                </div>
                
                {/* Step-specific log box - aligned to top */}
                {stepLogs.length > 0 ? (
                  <div className="rounded-lg border border-gray-700 bg-[#0F1419] p-3 max-h-96 overflow-y-auto min-w-0">
                    <div className="text-xs font-semibold mb-2 flex items-center justify-between" style={{ color: '#848E9C' }}>
                      <span>{step.label} Logs</span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-800" style={{ color: '#9CA3AF' }}>
                        {stepLogs.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {stepLogs.map((entry) => {
                        const meta = EVENT_META[entry.type] || EVENT_META.default;
                        const hashscanUrl = entry.raw?.hashscanUrl || entry.raw?.result?.hashscanUrl || entry.raw?.payment?.hashscanUrl;
                        const txHash = entry.raw?.txHash || entry.raw?.result?.txHash || entry.raw?.payment?.txHash;
                        
                        return (
                          <div key={entry.id} className="text-xs space-y-1 pb-2 border-b border-gray-800 last:border-0">
                            <div className="flex items-start gap-2">
                              <span className="flex-shrink-0" style={{ color: meta.color }}>{meta.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold mb-1" style={{ color: meta.color }}>
                                  {meta.title}
                                </div>
                                <div className="leading-relaxed break-words" style={{ color: '#EAECEF' }}>
                                  {renderMessageWithLinks(entry.message)}
                                </div>
                                {(hashscanUrl || txHash) && (
                                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                    {hashscanUrl && (
                                      <a
                                        href={hashscanUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-semibold underline hover:opacity-80 transition-opacity px-2 py-0.5 rounded bg-blue-500/20 inline-flex items-center gap-1"
                                        style={{ color: '#60a5fa' }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        🔗 View on HashScan
                                      </a>
                                    )}
                                    {txHash && !hashscanUrl && (
                                      <a
                                        href={`https://hashscan.io/testnet/transaction/${txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-semibold underline hover:opacity-80 transition-opacity px-2 py-0.5 rounded bg-blue-500/20 inline-flex items-center gap-1"
                                        style={{ color: '#60a5fa' }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        🔗 View Transaction
                                      </a>
                                    )}
                                    {txHash && (
                                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800" style={{ color: '#9CA3AF' }}>
                                        {txHash.slice(0, 10)}...{txHash.slice(-8)}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="text-[10px] mt-1" style={{ color: '#6B7280' }}>
                                  {entry.timestamp}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-700 bg-[#0F1419] p-3 min-h-[96px] flex items-center justify-center">
                    <div className="text-xs" style={{ color: '#6B7280' }}>
                      No logs yet...
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-[#0B0E11] p-3 max-h-64 overflow-y-auto">
        {logEntries.length === 0 ? (
          <div className="text-xs text-gray-500">{t('purchaseNoLogs', language)}</div>
        ) : (
          <ul className="space-y-3">
            {logEntries.map((entry) => {
              const meta = EVENT_META[entry.type] || EVENT_META.default;
              const hashscanUrl = entry.raw?.hashscanUrl || entry.raw?.result?.hashscanUrl || entry.raw?.payment?.hashscanUrl;
              const txHash = entry.raw?.txHash || entry.raw?.result?.txHash || entry.raw?.payment?.txHash;
              
              return (
                <li key={entry.id} className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      <span style={{ color: meta.color }}>{meta.icon}</span>
                      <div className="flex-1">
                        <div className="text-xs font-semibold" style={{ color: meta.color }}>
                          {meta.title}
                        </div>
                        <div className="text-xs leading-relaxed" style={{ color: '#EAECEF' }}>
                          {renderMessageWithLinks(entry.message)}
                        </div>
                        {(hashscanUrl || txHash) && (
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {hashscanUrl && (
                              <a
                                href={hashscanUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-semibold underline hover:opacity-80 transition-opacity"
                                style={{ color: '#60a5fa' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                🔗 View on HashScan
                              </a>
                            )}
                            {txHash && !hashscanUrl && (
                              <a
                                href={`https://hashscan.io/testnet/transaction/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-semibold underline hover:opacity-80 transition-opacity"
                                style={{ color: '#60a5fa' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                🔗 View Transaction
                              </a>
                            )}
                            {txHash && (
                              <span className="text-[10px] font-mono" style={{ color: '#9CA3AF' }}>
                                {txHash.slice(0, 10)}...{txHash.slice(-8)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] whitespace-nowrap" style={{ color: '#6B7280' }}>
                      {entry.timestamp}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono rounded bg-black/30 px-2 py-1" style={{ color: '#9CA3AF' }}>
                    {JSON.stringify(entry.raw).slice(0, 240)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-3 text-[11px]" style={{ color: '#6B7280' }}>
        {t('purchaseDisclaimer', language)}
      </div>
    </div>
  );
}

