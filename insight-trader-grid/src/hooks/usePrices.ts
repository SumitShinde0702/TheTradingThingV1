import { useState, useEffect, useRef } from 'react';
import { api, Prices } from '@/lib/api';

/**
 * Hook to fetch live cryptocurrency prices from nof1.ai via backend
 */
export function usePrices(enabled: boolean = true, refreshInterval: number = 5000) {
  const [prices, setPrices] = useState<Prices>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPrices = async () => {
    try {
      setError(null);
      const response = await api.getPrices();
      
      if (response.success && response.prices) {
        setPrices(response.prices);
      } else {
        setError('Failed to fetch prices');
      }
    } catch (err) {
      console.error('Error fetching prices:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Don't set fallback prices - return empty object
      setPrices({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;

    // Fetch immediately
    fetchPrices();

    // Set up interval to fetch prices periodically
    intervalRef.current = setInterval(() => {
      fetchPrices();
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, refreshInterval]);

  const getPrice = (symbol: string): number | null => {
    const upperSymbol = symbol.toUpperCase();
    return prices[upperSymbol as keyof Prices] || null;
  };

  return { prices, loading, error, getPrice, refresh: fetchPrices };
}

