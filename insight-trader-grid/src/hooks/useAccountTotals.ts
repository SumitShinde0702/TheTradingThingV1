import { useState, useEffect, useRef } from 'react';
import { api, AccountTotal } from '@/lib/api';

/**
 * Hook to fetch account totals from nof1.ai for chart data
 */
export function useAccountTotals(enabled: boolean = true, refreshInterval: number = 30000) {
  const [accountTotals, setAccountTotals] = useState<AccountTotal[]>([]);
  // Store historical data as grouped by timestamp (one object per timestamp with all models)
  const [historicalData, setHistoricalData] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAccountTotals = async () => {
    try {
      setError(null);
      const response = await api.getAccountTotals();
      
      if (response.success && response.accountTotals && Array.isArray(response.accountTotals)) {
        setAccountTotals(response.accountTotals);
        
        // Add new data points to historical data grouped by timestamp
        setHistoricalData(prev => {
          const now = Date.now();
          
          // Create a single data point with all models at this timestamp
          const timestampDataPoint: Record<string, any> = { timestamp: now };
          
          response.accountTotals.forEach(total => {
            if (total.modelName && total.dollarEquity !== undefined) {
              timestampDataPoint[total.modelName] = total.dollarEquity;
            }
          });
          
          // Add to previous data and keep last 200 timestamps
          const combined = [...prev, timestampDataPoint];
          const kept = combined.slice(-200);
          
          return kept;
        });
      } else {
        const errorMsg = response.error || 'Failed to fetch account totals';
        setError(errorMsg);
        setAccountTotals([]);
      }
    } catch (err) {
      console.error('Error fetching account totals:', err);
      // Check if it's a JSON parse error (HTML response)
      if (err instanceof SyntaxError) {
        setError('Server returned HTML instead of JSON - endpoint may not exist');
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
      setAccountTotals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;

    // Fetch immediately
    fetchAccountTotals();

    // Set up interval to fetch periodically
    intervalRef.current = setInterval(() => {
      fetchAccountTotals();
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, refreshInterval]);

  // Get account total for a specific model
  const getAccountTotal = (modelName: string): AccountTotal | null => {
    return accountTotals.find(total => 
      total.modelName === modelName.toLowerCase() || 
      total.modelId === modelName.toLowerCase()
    ) || null;
  };

  // Get chart data - return both formats for flexibility
  const getChartData = () => {
    // Use historical data if available - return grouped format
    if (historicalData.length > 0) {
      return historicalData;
    }
    
    // Fallback: create a single data point with current totals
    const currentPoint: Record<string, any> = { timestamp: Date.now() };
    accountTotals.forEach(total => {
      if (total.modelName && total.dollarEquity !== undefined) {
        currentPoint[total.modelName] = total.dollarEquity;
      }
    });
    return [currentPoint];
  };

  // Also provide individual points format for backwards compatibility
  const getChartDataAsPoints = () => {
    const grouped = getChartData();
    return grouped.flatMap(point => {
      return Object.keys(point)
        .filter(key => key !== 'timestamp')
        .map(model => ({
          timestamp: point.timestamp,
          value: point[model],
          model: model
        }));
    });
  };

  return { 
    accountTotals, 
    loading, 
    error, 
    getAccountTotal, 
    getChartData,
    refresh: fetchAccountTotals 
  };
}

