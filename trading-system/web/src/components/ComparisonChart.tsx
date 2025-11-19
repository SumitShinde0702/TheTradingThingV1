import { Fragment, useMemo, useState, useEffect, useRef, type CSSProperties } from 'react';
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import useSWR from 'swr';
import { api } from '../lib/api';
import type { CompetitionTraderData } from '../types';
import { getTraderColor } from '../utils/traderColors';
import { useLanguage } from '../contexts/LanguageContext';
import { t } from '../i18n/translations';
import { ModelLogo } from './ModelLogo';

interface ComparisonChartProps {
  traders: CompetitionTraderData[];
  timePeriod?: TimePeriod;
  onStatsUpdate?: (stats: {
    displayDataLength: number;
    filteredDataLength: number;
    currentGap: number;
    lastUpdatedLabel: string;
  }) => void;
}

// Helper function for converting hex to rgba (currently unused)
// const hexToRgba = (hex: string, alpha: number): string => {
//   if (!hex) return `rgba(255, 255, 255, ${alpha})`;
//   let normalized = hex.replace('#', '').trim();
//   if (normalized.length === 3) {
//     normalized = normalized.split('').map((char) => char + char).join('');
//   }
//   if (normalized.length !== 6) return `rgba(255, 255, 255, ${alpha})`;
//   const r = parseInt(normalized.slice(0, 2), 16);
//   const g = parseInt(normalized.slice(2, 4), 16);
//   const b = parseInt(normalized.slice(4, 6), 16);
//   return `rgba(${r}, ${g}, ${b}, ${alpha})`;
// };

const withAlpha = (hexColor: string, alpha: number) => {
  if (!hexColor) return `rgba(255, 255, 255, ${alpha})`;
  let normalized = hexColor.replace('#', '').trim();
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (normalized.length < 6) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  const numeric = parseInt(normalized.slice(0, 6), 16);
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export type TimePeriod = '10m' | '1h' | '6h' | '24h' | '7d' | '30d';

interface TimePeriodOption {
  value: TimePeriod;
  label: string;
}

const timePeriodOptions: TimePeriodOption[] = [
  { value: '10m', label: 'Last 10 Minutes' },
  { value: '1h', label: 'Last 1 Hour' },
  { value: '6h', label: 'Last 6 Hours' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last Month' },
];

// Custom styled dropdown component
export function TimePeriodDropdown({ value, onChange }: { value: TimePeriod; onChange: (value: TimePeriod) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const selectedOption = timePeriodOptions.find(opt => opt.value === value) || timePeriodOptions[0];

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        display: 'inline-block',
      }}
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '10px 40px 10px 16px',
          borderRadius: '12px',
          background: 'linear-gradient(145deg, rgba(30, 35, 41, 0.98) 0%, rgba(19, 24, 36, 0.95) 100%)',
          border: isOpen ? '1px solid #9AA8FF' : '1px solid rgba(43, 49, 57, 0.8)',
          color: '#EAECEF',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isOpen 
            ? '0 0 0 3px rgba(154, 168, 255, 0.15), 0 4px 12px rgba(0, 0, 0, 0.4)' 
            : '0 2px 8px rgba(0, 0, 0, 0.3)',
          minWidth: '160px',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'rgba(154, 168, 255, 0.4)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'rgba(43, 49, 57, 0.8)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
          }
        }}
      >
        <span>{selectedOption.label}</span>
        {/* Custom dropdown arrow */}
        <div
          style={{
            position: 'absolute',
            right: '14px',
            top: '50%',
            transform: isOpen ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
            transition: 'transform 0.2s ease',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '6px solid #9AA8FF',
          }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            zIndex: 1000,
            borderRadius: '12px',
            background: 'linear-gradient(145deg, rgba(30, 35, 41, 0.98) 0%, rgba(19, 24, 36, 0.95) 100%)',
            border: '1px solid rgba(43, 49, 57, 0.8)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(154, 168, 255, 0.1)',
            overflow: 'hidden',
            animation: 'fadeInDown 0.2s ease-out',
          }}
        >
          <style>{`
            @keyframes fadeInDown {
              from {
                opacity: 0;
                transform: translateY(-8px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
          {timePeriodOptions.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(154, 168, 255, 0.2) 0%, rgba(154, 168, 255, 0.1) 100%)'
                    : 'transparent',
                  border: 'none',
                  borderTop: index > 0 ? '1px solid rgba(43, 49, 57, 0.5)' : 'none',
                  color: isSelected ? '#9AA8FF' : '#EAECEF',
                  fontSize: '13px',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'rgba(154, 168, 255, 0.1)';
                    e.currentTarget.style.color = '#9AA8FF';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#EAECEF';
                  }
                }}
              >
                {isSelected && (
                  <span
                    style={{
                      position: 'absolute',
                      left: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#9AA8FF',
                      fontSize: '10px',
                    }}
                  >
                    ✓
                  </span>
                )}
                <span style={{ marginLeft: isSelected ? '20px' : '0' }}>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ComparisonChart({ traders, timePeriod = '24h', onStatsUpdate }: ComparisonChartProps) {
  const { language } = useLanguage();
  
  const [hoveredTraderId, setHoveredTraderId] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState(600);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  
  // Calculate responsive chart height and track window width
  useEffect(() => {
    const updateDimensions = () => {
      // Calculate available height: viewport height minus header, padding, and other elements
      // Use more vertical space (60% of viewport) to make graph bigger
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      // Ensure it fits well within screen, with min/max bounds for quality
      // On mobile, use less vertical space (50% instead of 60%)
      const heightMultiplier = vw < 768 ? 0.50 : 0.60;
      const calculatedHeight = Math.max(300, Math.min(800, Math.floor(vh * heightMultiplier)));
      setChartHeight(calculatedHeight);
      setWindowWidth(vw);
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  // 获取所有trader的历史数据 - 使用单个useSWR并发请求所有trader数据
  // 生成唯一的key，当traders变化时会触发重新请求
  const tradersKey = traders.map(t => t.trader_id).sort().join(',');

  const { data: allTraderHistories, isLoading } = useSWR(
    traders.length > 0 ? `all-equity-histories-${tradersKey}` : null,
    async () => {
      // 并发请求所有trader的历史数据
      // 后端会自动使用最早的可用记录作为基线（如果没有cycle #1）
      // Use Promise.allSettled to handle partial failures gracefully
      const promises = traders.map(trader =>
        api.getEquityHistory(trader.trader_id).catch(err => {
          console.warn(`Failed to fetch equity history for ${trader.trader_id}:`, err);
          return []; // Return empty array on error instead of failing entire request
        })
      );
      return Promise.all(promises);
    },
    {
      refreshInterval: 3000, // 3秒刷新 - 更快显示最新P&L
      revalidateOnFocus: true, // 窗口聚焦时立即刷新
      dedupingInterval: 1000, // 1秒去重 - 减少缓存时间
      onError: (err) => {
        console.warn('Error fetching equity histories:', err);
      },
    }
  );

  // 将数据转换为与原格式兼容的结构
  const traderHistories = useMemo(() => {
    if (!allTraderHistories) {
      return traders.map(() => ({ data: undefined }));
    }
    return allTraderHistories.map(data => ({ data }));
  }, [allTraderHistories, traders.length]);

  // 使用useMemo自动处理数据合并，直接使用data对象作为依赖
  const combinedData = useMemo(() => {
    // Show chart even if some traders don't have data yet (partial loading)
    // Only require at least one trader to have data
    const hasAnyData = traderHistories.some((h) => h.data && h.data.length > 0);
    if (!hasAnyData) return [];

    // 新方案：按时间戳分组，不再依赖 cycle_number（因为后端会重置）
    // Step 1: Collect all timestamps from all traders and normalize them
    const allTimestamps = new Set<string>();
    const timestampToDisplayTime = new Map<string, string>();
    
    traderHistories.forEach((history) => {
      if (!history.data) return;

      history.data.forEach((point: any) => {
        const ts = point.timestamp;
        
        // Parse timestamp - handle both ISO format and "2006-01-02 15:04:05" format
        // Database timestamps are stored in UTC, so treat timestamps without timezone as UTC
        let parsedTime: Date;
        if (ts.includes('T') || ts.includes('Z')) {
          parsedTime = new Date(ts);
        } else {
          // Parse "2006-01-02 15:04:05" format - treat as UTC by appending 'Z'
          // This ensures we convert from UTC to Singapore time correctly
          parsedTime = new Date(ts.replace(' ', 'T') + 'Z');
        }
        
        // For real-time points (cycle 0), use current time and normalize to minute precision
        if (point.cycle_number === 0) {
          const now = new Date();
          const roundedMinutes = new Date(now);
          roundedMinutes.setSeconds(0, 0);
          roundedMinutes.setMilliseconds(0);
          parsedTime = roundedMinutes;
        }
        
        // Round ALL timestamps to minute precision to ensure consistent grouping
        const rounded = new Date(parsedTime);
        rounded.setSeconds(0, 0);
        rounded.setMilliseconds(0);
        const tsKey = rounded.toISOString();
        
        allTimestamps.add(tsKey);
        
        // Store display time for this timestamp (Singapore timezone, UTC+8)
        if (!timestampToDisplayTime.has(tsKey)) {
          const displayTime = point.cycle_number === 0 
            ? new Date().toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Asia/Singapore'
              })
            : parsedTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Singapore'
              });
          timestampToDisplayTime.set(tsKey, displayTime);
        }
      });
    });

    // Step 2: Create timestamp map with all timestamps
    const timestampMap = new Map<string, {
      timestamp: string;
      time: string;
      traders: Map<string, { pnl_pct: number; equity: number }>;
    }>();
    
    allTimestamps.forEach(tsKey => {
      timestampMap.set(tsKey, {
        timestamp: tsKey,
        time: timestampToDisplayTime.get(tsKey) || tsKey,
        traders: new Map()
      });
    });

    // Step 3: Populate trader data into timestamp buckets
    traderHistories.forEach((history, index) => {
      const trader = traders[index];
      if (!history.data) return;

      history.data.forEach((point: any) => {
        const ts = point.timestamp;
        
        // Parse timestamp - handle both ISO format and "2006-01-02 15:04:05" format
        // Database timestamps are stored in UTC, so treat timestamps without timezone as UTC
        let parsedTime: Date;
        if (ts.includes('T') || ts.includes('Z')) {
          parsedTime = new Date(ts);
        } else {
          // Parse "2006-01-02 15:04:05" format - treat as UTC by appending 'Z'
          // This ensures we convert from UTC to Singapore time correctly
          parsedTime = new Date(ts.replace(' ', 'T') + 'Z');
        }
        
        // For real-time points, normalize to minute precision
        if (point.cycle_number === 0) {
          const now = new Date();
          const roundedMinutes = new Date(now);
          roundedMinutes.setSeconds(0, 0);
          roundedMinutes.setMilliseconds(0);
          parsedTime = roundedMinutes;
        }
        
        // Round to minute precision
        const rounded = new Date(parsedTime);
        rounded.setSeconds(0, 0);
        rounded.setMilliseconds(0);
        const tsKey = rounded.toISOString();

        // Store trader data in the timestamp bucket
        if (timestampMap.has(tsKey)) {
          timestampMap.get(tsKey)!.traders.set(trader.trader_id, {
            pnl_pct: point.total_pnl_pct,
            equity: point.total_equity
          });
        }
      });
    });

    // 按时间戳排序，转换为数组
    // Ensure real-time points (with future timestamps or cycle 0) are always last
    const sortedEntries = Array.from(timestampMap.entries())
      .sort(([tsA], [tsB]) => {
        const timeA = new Date(tsA).getTime();
        const timeB = new Date(tsB).getTime();
        return timeA - timeB;
      });

    // Forward-fill missing data points: ensure every trader has a value at every timestamp
    // Track the last known value for each trader and the index where it was last seen
    const lastKnownValues = new Map<string, { pnl_pct: number; equity: number; index: number }>();
    
    const combined = sortedEntries.map(([ts, data], index) => {
        const isLastPoint = index === sortedEntries.length - 1;
        // For the last point, use current time (rounded to minute) for all traders to ensure consistency (Singapore timezone)
        const displayTime = isLastPoint
          ? new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZone: 'Asia/Singapore'
            })
          : data.time;
        
        const entry: any = {
          index: index + 1,  // 使用序号代替cycle
          time: displayTime,
          timestamp: ts,
          isRealtime: isLastPoint
        };

        traders.forEach((trader, traderIndex) => {
          // For the last point, prioritize real-time data from competition API if available
          // This ensures the graph shows accurate current P&L even if equity history is slightly stale
          if (isLastPoint && trader.total_pnl_pct !== undefined && trader.total_pnl_pct !== null) {
            // Use real-time P&L from competition API for the last point
            entry[`${trader.trader_id}_pnl_pct`] = trader.total_pnl_pct;
            // Get equity from trader prop if available, otherwise fall back to history
            const traderHistory = traderHistories[traderIndex]?.data;
            entry[`${trader.trader_id}_equity`] = trader.total_equity || (traderHistory && traderHistory.length > 0 ? traderHistory[traderHistory.length - 1].total_equity : undefined);
          } else {
            const traderData = data.traders.get(trader.trader_id);
            if (traderData) {
              // Update last known value with current index
              lastKnownValues.set(trader.trader_id, { 
                ...traderData, 
                index 
              });
              entry[`${trader.trader_id}_pnl_pct`] = traderData.pnl_pct;
              entry[`${trader.trader_id}_equity`] = traderData.equity;
            } else {
              // Forward-fill: use last known value if available, but only if it's recent (within 10 data points)
              // This prevents creating flat lines when a trader has sparse data
              const lastValue = lastKnownValues.get(trader.trader_id);
              if (lastValue && (index - lastValue.index) <= 10) {
                entry[`${trader.trader_id}_pnl_pct`] = lastValue.pnl_pct;
                entry[`${trader.trader_id}_equity`] = lastValue.equity;
              }
              // If no recent last known value, leave undefined (will create a gap in the line, preventing flat appearance)
            }
          }
        });

        return entry;
      });

    // Always ensure the last point uses real-time data from competition API
    // This guarantees accurate current P&L display even if equity history is stale
    if (combined.length > 0 && traders.length > 0) {
      const lastEntry = combined[combined.length - 1];
      const currentTime = new Date();
      const currentTimestamp = new Date(currentTime);
      currentTimestamp.setSeconds(0, 0);
      currentTimestamp.setMilliseconds(0);
      
      // Update or create real-time point with latest data from competition API
      lastEntry.timestamp = currentTimestamp.toISOString();
      lastEntry.time = currentTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Singapore'
      });
      lastEntry.isRealtime = true;
      
      // Override with real-time data for all traders
      traders.forEach((trader) => {
        if (trader.total_pnl_pct !== undefined && trader.total_pnl_pct !== null) {
          lastEntry[`${trader.trader_id}_pnl_pct`] = trader.total_pnl_pct;
          // Use equity from trader prop if available, otherwise keep existing value
          if (trader.total_equity !== undefined && trader.total_equity !== null) {
            lastEntry[`${trader.trader_id}_equity`] = trader.total_equity;
          }
        }
      });
    }

    return combined;
  }, [allTraderHistories, traders]);

  // Filter data based on selected time period
  const filteredData = useMemo(() => {
    if (combinedData.length === 0) return [];
    
    const now = new Date();
    let cutoffTime: Date;
    
    switch (timePeriod) {
      case '10m':
        cutoffTime = new Date(now.getTime() - 10 * 60 * 1000);
        break;
      case '1h':
        cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        cutoffTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    return combinedData.filter((point) => {
      const pointTime = new Date(point.timestamp);
      return pointTime >= cutoffTime;
    });
  }, [combinedData, timePeriod]);

  // Constants and helper functions
  // When filtering by time period, show all filtered points (up to a reasonable max for performance)
  const MAX_DISPLAY_POINTS = 1000; // Increased to accommodate longer time periods
  const displayData = filteredData.slice(-MAX_DISPLAY_POINTS);
  const showDots = displayData.length < 50;
  const lastIndex = displayData.length - 1;

  const traderColor = (traderId: string) => getTraderColor(traders, traderId);

  const getModelForLogo = (trader: CompetitionTraderData) => {
    if (trader.ai_model.toLowerCase() === 'groq') {
      if (trader.trader_name.toLowerCase().includes('openai')) {
        return 'openai';
      } else if (trader.trader_name.toLowerCase().includes('qwen')) {
        return 'qwen';
      }
    }
    return trader.ai_model;
  };

  // Memoize logo configs first (before dotRenderers uses them)
  const logoConfigs = useMemo(() => {
    const configs = new Map<string, { src: string; alt: string; accent: string; scale: number } | null>();
    traders.forEach((trader) => {
      const modelName = getModelForLogo(trader);
      let config: { src: string; alt: string; accent: string; scale: number } | null = null;
      
      if (modelName === 'openai' || modelName.toLowerCase().includes('openai')) {
        config = {
          src: '/assets/logos/OpenAI_logo.svg',
          alt: 'OpenAI',
          accent: '#9AA8FF',
          scale: 0.72
        };
      } else if (modelName === 'qwen' || modelName.toLowerCase().includes('qwen')) {
        config = {
          src: '/assets/logos/Qwen_logo.svg',
          alt: 'Qwen',
          accent: '#3CD4FF',
          scale: 0.78
        };
      }
      
      configs.set(trader.trader_id, config);
    });
    return configs;
  }, [traders]);
  
  // Memoized dot renderers per trader - ensures stable function references to prevent flickering
  // Using useCallback for each renderer to ensure maximum stability
  const dotRenderers = useMemo(() => {
    const renderers = new Map<string, (dotProps: any) => JSX.Element | null>();
    const currentLastIndex = displayData.length - 1; // Capture current lastIndex
    
    traders.forEach((trader) => {
      const color = traderColor(trader.trader_id);
      const logoConfig = logoConfigs.get(trader.trader_id);
      const traderId = trader.trader_id; // Capture for closure
      
      // Create a stable renderer function using useCallback pattern
      const renderer = (dotProps: any) => {
        const isLast = dotProps.index === currentLastIndex;
        const { cx, cy, index } = dotProps;
        
        // Always validate coordinates
        if (cx === undefined || cy === undefined || isNaN(cx) || isNaN(cy)) {
          return null;
        }
        
        // For the last point, render logo if available
        if (isLast && logoConfig) {
          const logoSize = 28;
          const circleRadius = logoSize / 2 + 1;
          const imageSize = logoSize * logoConfig.scale;
          
          // Use stable key per trader (not index) so logo doesn't remount when position changes
          return (
            <g 
              key={`logo-${traderId}`}
              transform={`translate(${cx}, ${cy})`}
              className="logo-hover-group"
              style={{ 
                pointerEvents: 'all',
                cursor: 'pointer',
              }}
            >
              {/* White background circle - scales on hover */}
              <circle
                cx={0}
                cy={0}
                r={circleRadius}
                fill="#FFFFFF"
                stroke={logoConfig.accent}
                strokeWidth={1.5}
                opacity={0.95}
                className="logo-circle"
              />
              {/* Logo image using foreignObject */}
              <foreignObject
                x={-logoSize / 2}
                y={-logoSize / 2}
                width={logoSize}
                height={logoSize}
                style={{ 
                  overflow: 'visible',
                  pointerEvents: 'none',
                }}
              >
                <div
                  className="logo-container"
                  style={{
                    width: `${logoSize}px`,
                    height: `${logoSize}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  <img
                    src={logoConfig.src}
                    alt={logoConfig.alt}
                    style={{
                      width: `${imageSize}px`,
                      height: `${imageSize}px`,
                      objectFit: 'contain',
                      display: 'block',
                      transition: 'transform 0.2s ease',
                    }}
                    loading="eager"
                  />
                </div>
              </foreignObject>
            </g>
          );
        }
        
        // For non-last points, show regular dots if enabled
        if (!showDots) {
          return null;
        }
        
        // Key required for circle elements in list
        return (
          <circle
            key={`${traderId}-${index}`}
            cx={cx}
            cy={cy}
            r={3.2}
            fill={color}
            stroke="#0B1016"
            strokeWidth={1.4}
          />
        );
      };
      
      renderers.set(traderId, renderer);
    });
    
    return renderers;
  }, [traders, logoConfigs, lastIndex, showDots]);

  const chartPanelStyle: CSSProperties = {
    flex: '1',
    minWidth: '0', // Changed from '500px' to allow shrinking on mobile
    borderRadius: '20px',
    background:
      'linear-gradient(145deg, rgba(11, 14, 17, 0.98) 0%, rgba(19, 24, 36, 0.95) 100%)',
    border: '1px solid rgba(47, 55, 70, 0.65)',
    padding: '16px', // Reduced from '24px' for mobile
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
    position: 'relative',
    overflow: 'hidden',
  };

  const chartAmbientStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(circle at 20% 30%, rgba(154, 168, 255, 0.08) 0%, transparent 50%)',
    pointerEvents: 'none',
    zIndex: 0,
  };

  const calculateYDomain = () => {
    if (displayData.length === 0 || traders.length === 0) return [-5, 5];
    const values = displayData.flatMap((point) =>
      traders.map((trader) => point[`${trader.trader_id}_pnl_pct`] ?? 0)
    ).filter(v => !isNaN(v) && isFinite(v));
    
    if (values.length === 0) return [-5, 5];
    
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    
    // Ensure symmetric domain when both traders are profitable for better visualization
    // Use the larger absolute value to create a balanced range
    const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
    const padding = Math.max(absMax * 0.2, 1);
    
    // If both are profitable (minVal >= 0), ensure we show from 0 or slightly below
    // If both are negative (maxVal <= 0), ensure we show to 0 or slightly above
    // Otherwise use symmetric range around the data
    if (minVal >= 0 && maxVal >= 0) {
      // Both profitable: show from 0 to max + padding
      return [Math.max(-1, -padding), Math.ceil(maxVal + padding)];
    } else if (maxVal <= 0 && minVal <= 0) {
      // Both negative: show from min - padding to 0
      return [Math.floor(minVal - padding), Math.min(1, padding)];
    } else {
      // Mixed: use symmetric range
      return [Math.floor(-absMax - padding), Math.ceil(absMax + padding)];
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      // Get data from the first payload (all payloads should have the same data point)
      const data = payload[0].payload;
      
      return (
        <div
          className="rounded p-3 shadow-xl"
          style={{ background: '#1E2329', border: '1px solid #2B3139' }}
        >
          <div className="text-xs mb-2" style={{ color: '#848E9C' }}>
            {data.time} - #{data.index}
          </div>
          {traders.map((trader) => {
            const pnlPct = data[`${trader.trader_id}_pnl_pct`];
            const equity = data[`${trader.trader_id}_equity`];
            
            // Show trader even if data is missing (with placeholder)
            const hasData = pnlPct !== undefined && pnlPct !== null && !isNaN(pnlPct);

            return (
              <div
                key={trader.trader_id}
                className="mb-1.5 last:mb-0 flex items-center gap-2"
              >
                <ModelLogo
                  model={getModelForLogo(trader)}
                  size={18}
                  color={traderColor(trader.trader_id)}
                />
                <div className="flex-1">
                  <div
                    className="text-xs font-semibold mb-0.5"
                    style={{ color: traderColor(trader.trader_id) }}
                  >
                    {trader.trader_name}
                  </div>
                  {hasData ? (
                    <div
                      className="text-sm mono font-bold"
                      style={{ color: pnlPct >= 0 ? '#0ECB81' : '#F6465D' }}
                    >
                      {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                      <span className="text-xs ml-2 font-normal" style={{ color: '#848E9C' }}>
                        ({equity?.toFixed(2) ?? '0.00'} USDT)
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs" style={{ color: '#848E9C' }}>
                      No data at this point
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };


  // Calculate current gap from traders' actual current P&L values, not from chart data
  // This ensures we show the real-time gap even if chart data is missing or incomplete
  // Sort traders by P&L to get top 2, then calculate the gap between them
  const currentGap = useMemo(() => {
    if (traders.length < 2) return 0;
    
    // Sort by total_pnl_pct descending to get top performers
    const sorted = [...traders].sort((a, b) => (b.total_pnl_pct ?? 0) - (a.total_pnl_pct ?? 0));
    const topTrader = sorted[0]?.total_pnl_pct ?? 0;
    const secondTrader = sorted[1]?.total_pnl_pct ?? 0;
    
    return Math.abs(topTrader - secondTrader);
  }, [traders]);

  const lastUpdatedLabel = displayData.length > 0
    ? new Date(displayData[displayData.length - 1].timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Singapore'
      })
    : '--';

  // Notify parent component of stats updates
  useEffect(() => {
    if (onStatsUpdate) {
      onStatsUpdate({
        displayDataLength: displayData.length,
        filteredDataLength: filteredData.length,
        currentGap,
        lastUpdatedLabel,
      });
    }
  }, [displayData.length, filteredData.length, currentGap, lastUpdatedLabel, onStatsUpdate]);

  // Show chart even while loading if we have some data
  // Only show loading spinner if we have NO data at all
  const showLoadingSpinner = isLoading && (!allTraderHistories || combinedData.length === 0);
  
  if (showLoadingSpinner) {
    return (
      <div>
        <div
        style={{
          position: 'relative',
          marginBottom: '28px',
        }}
      >
        <div style={chartPanelStyle}>
          <div style={chartAmbientStyle} />
          {/* CSS for logo hover effects */}
          <style>{`
            @keyframes logoFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .logo-hover-group {
              animation: logoFadeIn 0.3s ease-in;
            }
            .logo-hover-group:hover .logo-circle {
              transform: scale(1.1);
              transition: transform 0.2s ease;
            }
            .logo-hover-group:hover .logo-container {
              transform: scale(1.1);
            }
            .logo-hover-group:hover .logo-container img {
              transform: scale(1.1);
            }
          `}</style>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart
              data={displayData}
              margin={{ 
                top: 20, 
                right: windowWidth < 768 ? 20 : 120, // Responsive right margin
                left: windowWidth < 768 ? 10 : 20,  // Responsive left margin
                bottom: windowWidth < 768 ? 40 : 60   // Responsive bottom margin
              }}
            >
              <defs>
                {traders.map((trader) => {
                  const color = traderColor(trader.trader_id);
                  return (
                    <Fragment key={`gradient-${trader.trader_id}`}>
                      <linearGradient
                        id={`line-gradient-${trader.trader_id}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={color} stopOpacity={1} />
                        <stop offset="100%" stopColor={color} stopOpacity={1} />
                      </linearGradient>
                      <linearGradient
                        id={`area-gradient-${trader.trader_id}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={withAlpha(color, 0.28)} />
                        <stop offset="80%" stopColor={withAlpha(color, 0.05)} />
                      </linearGradient>
                    </Fragment>
                  );
                })}
              </defs>

              <CartesianGrid
                strokeDasharray="4 14"
                stroke="rgba(70, 78, 90, 0.35)"
                vertical={false}
              />

              <XAxis
                dataKey="time"
                stroke="#5E6673"
                tick={{ 
                  fill: '#9199AB', 
                  fontSize: windowWidth < 768 ? 9 : 11, // Smaller font on mobile
                  fontWeight: 500 
                }}
                tickLine={{ stroke: 'rgba(57, 63, 74, 0.6)' }}
                axisLine={{ stroke: 'rgba(57, 63, 74, 0.6)' }}
                interval={Math.max(1, Math.floor(displayData.length / (windowWidth < 768 ? 6 : 10)))}
                angle={windowWidth < 768 ? -45 : -12} // Steeper angle on mobile
                tickMargin={windowWidth < 768 ? 8 : 14}
                height={windowWidth < 768 ? 48 : 64}
              />

              <YAxis
                stroke="#5E6673"
                tick={{ 
                  fill: '#9199AB', 
                  fontSize: windowWidth < 768 ? 10 : 12, // Smaller font on mobile
                  fontWeight: 500 
                }}
                tickLine={{ stroke: 'rgba(57, 63, 74, 0.6)' }}
                axisLine={{ stroke: 'rgba(57, 63, 74, 0.6)' }}
                domain={calculateYDomain()}
                tickFormatter={(value) =>
                  `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
                }
                width={windowWidth < 768 ? 50 : 72} // Narrower on mobile
              />

              <Tooltip
                content={<CustomTooltip />}
                shared={true}
                cursor={{
                  stroke: 'rgba(148, 158, 172, 0.35)',
                  strokeWidth: 1.2,
                  strokeDasharray: '6 10',
                }}
              />

              <ReferenceLine
                y={0}
                stroke="rgba(132, 142, 156, 0.6)"
                strokeDasharray="5 6"
                strokeWidth={1.5}
                label={{
                  value: t('breakEven', language),
                  fill: '#7D8697',
                  fontSize: 11,
                  position: 'right' as const,
                  offset: 15,
                }}
              />

              {traders.map((trader) => {
                const isHovered = hoveredTraderId === trader.trader_id;
                const isDimmed = hoveredTraderId !== null && !isHovered;
                const areaOpacity = isDimmed ? 0.25 : (isHovered ? 1 : 0.65);
                return (
                  <Area
                    key={`area-${trader.trader_id}`}
                    type="monotone"
                    dataKey={`${trader.trader_id}_pnl_pct`}
                    stroke="none"
                    fill={`url(#area-gradient-${trader.trader_id})`}
                    fillOpacity={areaOpacity}
                    isAnimationActive={false}
                    connectNulls
                    legendType="none"
                  />
                );
              })}

              {traders.map((trader) => {
                const color = traderColor(trader.trader_id);
                const dataKey = `${trader.trader_id}_pnl_pct`;
                const isHovered = hoveredTraderId === trader.trader_id;
                const isDimmed = hoveredTraderId !== null && !isHovered;
                const lineOpacity = isDimmed ? 0.3 : (isHovered ? 1 : 0.85);
                const strokeWidth = isHovered ? 4.2 : (isDimmed ? 2.5 : 3.4);
                return (
                  <Line
                    key={`line-${trader.trader_id}`}
                    type="monotone"
                    dataKey={dataKey}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeOpacity={lineOpacity}
                    strokeLinecap="round"
                    dot={(props: any) => {
                      const renderer = dotRenderers.get(trader.trader_id);
                      if (!renderer) {
                        return false as any;
                      }
                      const result = renderer(props);
                      return result || (false as any);
                    }}
                    activeDot={false}
                    name={trader.trader_name}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                );
              })}

              <Legend
                wrapperStyle={{ paddingTop: 8, paddingBottom: 4 }}
                iconType="plainline"
                formatter={(value: string, _entry: any) => {
                  const trader = traders.find((t) => t.trader_name === value);
                  if (!trader) return value;
                  const color = traderColor(trader.trader_id);
                  return (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#EAECEF',
                        fontWeight: 500,
                        fontSize: '11px',
                        cursor: 'pointer',
                        opacity: hoveredTraderId !== null && hoveredTraderId !== trader.trader_id ? 0.3 : 1,
                        transition: 'opacity 0.2s ease',
                      }}
                      onMouseEnter={() => setHoveredTraderId(trader.trader_id)}
                      onMouseLeave={() => setHoveredTraderId(null)}
                    >
                      <ModelLogo
                        model={getModelForLogo(trader)}
                        size={14}
                        color={color}
                      />
                      <span>{trader.trader_name}</span>
                    </span>
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
    );
  }

  return (
    <div>
      <div
        style={{
          position: 'relative',
          marginBottom: '28px',
        }}
      >
        <div style={chartPanelStyle}>
          <div style={chartAmbientStyle} />
          {/* CSS for logo hover effects */}
          <style>{`
            @keyframes logoFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .logo-hover-group {
              animation: logoFadeIn 0.3s ease-in;
            }
            .logo-hover-group:hover .logo-circle {
              transform: scale(1.1);
              transition: transform 0.2s ease;
            }
            .logo-hover-group:hover .logo-container {
              transform: scale(1.1);
            }
            .logo-hover-group:hover .logo-container img {
              transform: scale(1.1);
            }
          `}</style>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart
              data={displayData}
              margin={{ 
                top: 20, 
                right: windowWidth < 768 ? 20 : 120, // Responsive right margin
                left: windowWidth < 768 ? 10 : 20,  // Responsive left margin
                bottom: windowWidth < 768 ? 40 : 60   // Responsive bottom margin
              }}
            >
              <defs>
                {traders.map((trader) => {
                  const color = traderColor(trader.trader_id);
                  return (
                    <Fragment key={`gradient-${trader.trader_id}`}>
                      <linearGradient
                        id={`line-gradient-${trader.trader_id}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={color} stopOpacity={1} />
                        <stop offset="100%" stopColor={color} stopOpacity={1} />
                      </linearGradient>
                      <linearGradient
                        id={`area-gradient-${trader.trader_id}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={withAlpha(color, 0.28)} />
                        <stop offset="80%" stopColor={withAlpha(color, 0.05)} />
                      </linearGradient>
                    </Fragment>
                  );
                })}
              </defs>

              <CartesianGrid
                strokeDasharray="4 14"
                stroke="rgba(70, 78, 90, 0.35)"
                vertical={false}
              />

              <XAxis
                dataKey="time"
                stroke="#5E6673"
                tick={{ 
                  fill: '#9199AB', 
                  fontSize: windowWidth < 768 ? 9 : 11, // Smaller font on mobile
                  fontWeight: 500 
                }}
                tickLine={{ stroke: 'rgba(57, 63, 74, 0.6)' }}
                axisLine={{ stroke: 'rgba(57, 63, 74, 0.6)' }}
                interval={Math.max(1, Math.floor(displayData.length / (windowWidth < 768 ? 6 : 10)))}
                angle={windowWidth < 768 ? -45 : -12} // Steeper angle on mobile
                tickMargin={windowWidth < 768 ? 8 : 14}
                height={windowWidth < 768 ? 48 : 64}
              />

              <YAxis
                stroke="#5E6673"
                tick={{ 
                  fill: '#9199AB', 
                  fontSize: windowWidth < 768 ? 10 : 12, // Smaller font on mobile
                  fontWeight: 500 
                }}
                tickLine={{ stroke: 'rgba(57, 63, 74, 0.6)' }}
                axisLine={{ stroke: 'rgba(57, 63, 74, 0.6)' }}
                domain={calculateYDomain()}
                tickFormatter={(value) =>
                  `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
                }
                width={windowWidth < 768 ? 50 : 72} // Narrower on mobile
              />

              <Tooltip
                content={<CustomTooltip />}
                shared={true}
                cursor={{
                  stroke: 'rgba(148, 158, 172, 0.35)',
                  strokeWidth: 1.2,
                  strokeDasharray: '6 10',
                }}
              />

              <ReferenceLine
                y={0}
                stroke="rgba(132, 142, 156, 0.6)"
                strokeDasharray="5 6"
                strokeWidth={1.5}
                label={{
                  value: t('breakEven', language),
                  fill: '#7D8697',
                  fontSize: 11,
                  position: 'right' as const,
                  offset: 15,
                }}
              />

              {traders.map((trader) => {
                const isHovered = hoveredTraderId === trader.trader_id;
                const isDimmed = hoveredTraderId !== null && !isHovered;
                const areaOpacity = isDimmed ? 0.25 : (isHovered ? 1 : 0.65);
                return (
                  <Area
                    key={`area-${trader.trader_id}`}
                    type="monotone"
                    dataKey={`${trader.trader_id}_pnl_pct`}
                    stroke="none"
                    fill={`url(#area-gradient-${trader.trader_id})`}
                    fillOpacity={areaOpacity}
                    isAnimationActive={false}
                    connectNulls
                    legendType="none"
                  />
                );
              })}

              {traders.map((trader) => {
                const color = traderColor(trader.trader_id);
                const dataKey = `${trader.trader_id}_pnl_pct`;
                const isHovered = hoveredTraderId === trader.trader_id;
                const isDimmed = hoveredTraderId !== null && !isHovered;
                const lineOpacity = isDimmed ? 0.3 : (isHovered ? 1 : 0.85);
                const strokeWidth = isHovered ? 4.2 : (isDimmed ? 2.5 : 3.4);
                return (
                  <Line
                    key={`line-${trader.trader_id}`}
                    type="monotone"
                    dataKey={dataKey}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeOpacity={lineOpacity}
                    strokeLinecap="round"
                    dot={(props: any) => {
                      const renderer = dotRenderers.get(trader.trader_id);
                      if (!renderer) {
                        return false as any;
                      }
                      const result = renderer(props);
                      return result || (false as any);
                    }}
                    activeDot={false}
                    name={trader.trader_name}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                );
              })}

              <Legend
                wrapperStyle={{ paddingTop: 8, paddingBottom: 4 }}
                iconType="plainline"
                formatter={(value: string, _entry: any) => {
                  const trader = traders.find((t) => t.trader_name === value);
                  if (!trader) return value;
                  const color = traderColor(trader.trader_id);
                  return (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#EAECEF',
                        fontWeight: 500,
                        fontSize: '11px',
                        cursor: 'pointer',
                        opacity: hoveredTraderId !== null && hoveredTraderId !== trader.trader_id ? 0.3 : 1,
                        transition: 'opacity 0.2s ease',
                      }}
                      onMouseEnter={() => setHoveredTraderId(trader.trader_id)}
                      onMouseLeave={() => setHoveredTraderId(null)}
                    >
                      <ModelLogo
                        model={getModelForLogo(trader)}
                        size={14}
                        color={color}
                      />
                      <span>{trader.trader_name}</span>
                    </span>
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// Export stats cards component to be used separately
export function StatsCards({ 
  currentGap,
  lastUpdatedLabel 
}: { 
  currentGap: number;
  lastUpdatedLabel: string;
}) {
  const { language } = useLanguage();
  const primaryAccent = '#9AA8FF';
  const secondaryAccent = '#3CD4FF';

  const statsCards = [
    {
      key: 'gap',
      label: t('currentGap', language),
      value: `${currentGap.toFixed(2)}%`,
      subtitle: currentGap > 1 ? 'Diverging curves' : 'Neck and neck',
      accent: currentGap > 1 ? secondaryAccent : primaryAccent,
    },
    {
      key: 'update',
      label: 'Last Update',
      value: lastUpdatedLabel === '--' || !lastUpdatedLabel
        ? 'Awaiting live tick'
        : lastUpdatedLabel,
      subtitle: '',
      accent: primaryAccent,
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-3"
    >
      {statsCards.map((card) => (
        <div
          key={card.key}
          style={{
            position: 'relative',
            borderRadius: '16px',
            padding: '16px 18px',
            background:
              'linear-gradient(150deg, rgba(13, 17, 26, 0.92) 0%, rgba(19, 24, 36, 0.9) 100%)',
            border: '1px solid rgba(47, 55, 70, 0.65)',
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.38)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(135deg, ${withAlpha(
                card.accent,
                0.14
              )} 0%, transparent 70%)`,
              opacity: 0.9,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#8E99AC',
              marginBottom: '8px',
            }}
          >
            {card.label}
          </div>
          <div
            style={{
              color: '#EAECEF',
              fontWeight: 700,
              fontSize: '18px',
              letterSpacing: '0.02em',
            }}
          >
            {card.value}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: '#9EA9BC',
              marginTop: '6px',
              letterSpacing: '0.02em',
            }}
          >
            {card.subtitle}
          </div>
        </div>
      ))}
    </div>
  );
}

