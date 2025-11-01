import { useState, useEffect, useRef } from 'react';
import { Signal } from '@/lib/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8443';

export function useSignals(models: string[], enabled: boolean = true) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const mockIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || !models || models.length === 0) return;

    // Try SSE first, fallback to mock
    try {
      const eventSource = new EventSource(
        `${API_BASE_URL}/api/ai/signals?models=${models.join(',')}`
      );

      eventSource.onmessage = (event) => {
        const signal: Signal = JSON.parse(event.data);
        updateSignals(signal);
      };

      eventSource.onerror = () => {
        // Fallback to mock if SSE fails
        eventSource.close();
        startMockSignals();
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      // Fallback to mock
      startMockSignals();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (mockIntervalRef.current) {
        clearInterval(mockIntervalRef.current);
      }
    };
  }, [models.join(','), enabled]);

  const startMockSignals = () => {
    const directions: ('BUY' | 'SELL')[] = ['BUY', 'SELL'];
    let accountValue = 10000;

    mockIntervalRef.current = setInterval(() => {
      const model = models[Math.floor(Math.random() * models.length)];
      const direction = directions[Math.floor(Math.random() * directions.length)];
      const confidence = Math.floor(Math.random() * 40) + 60;
      
      // Simulate account value changes
      const change = (Math.random() - 0.45) * 500;
      accountValue = Math.max(0, Math.min(25000, accountValue + change));

      const signal: Signal = {
        timestamp: Date.now(),
        model,
        direction,
        confidence,
        symbol: 'HBAR/USDC',
        price: (Math.random() * 0.1 + 0.04).toFixed(4),
        reasoning: 'AI-generated trading signal based on market analysis',
      };

      updateSignals(signal);
      updateChart(accountValue, model);
    }, 3000);
  };

  const updateSignals = (signal: Signal) => {
    setSignals((prev) => [signal, ...prev].slice(0, 10)); // Keep last 10
  };

  const updateChart = (value: number, model: string) => {
    setChartData((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        value,
        model,
      },
    ].slice(-50)); // Keep last 50 data points
  };

  const stopSignals = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
    }
  };

  return { signals, chartData, stopSignals };
}
