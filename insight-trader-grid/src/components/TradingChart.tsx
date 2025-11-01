import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';

interface ChartData {
  timestamp: number;
  value: number;
  model: string;
}

interface TradingChartProps {
  data: ChartData[];
  isStreaming: boolean;
}

const modelColors: Record<string, string> = {
  deepseek: '#a855f7', // violet
  chatgpt: '#06b6d4', // cyan
  groq: '#84cc16', // lime
  grok: '#f97316', // orange
  'mock-vendor': '#ec4899', // pink
};

export function TradingChart({ data, isStreaming }: TradingChartProps) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatValue = (value: number) => {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Get latest value for each model
  const latestValues = data.reduce((acc, point) => {
    if (!acc[point.model] || point.timestamp > acc[point.model].timestamp) {
      acc[point.model] = point;
    }
    return acc;
  }, {} as Record<string, ChartData>);

  return (
    <div className="relative h-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Total Account Value</h2>
          <p className="text-sm text-muted-foreground">Multi-model trading performance</p>
        </div>
        {isStreaming && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-neon-lime" />
            <span className="text-xs text-neon-lime">LIVE</span>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTime}
            stroke="hsl(var(--chart-axis))"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            domain={[0, 25000]}
            tickFormatter={formatValue}
            stroke="hsl(var(--chart-axis))"
            style={{ fontSize: '12px' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
            }}
            labelFormatter={formatTime}
            formatter={(value: any) => [formatValue(value), 'Value']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Model performance badges */}
      <div className="absolute right-4 top-16 flex flex-col gap-2">
        {Object.entries(latestValues).map(([model, point]) => {
          const change = ((point.value - 10000) / 10000) * 100;
          const isPositive = change >= 0;

          return (
            <div
              key={model}
              className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-2 backdrop-blur-sm"
            >
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: modelColors[model] || '#fff' }}
              />
              <div className="flex-1">
                <div className="text-xs font-medium capitalize">{model}</div>
                <div className={`text-xs ${isPositive ? 'text-neon-lime' : 'text-destructive'}`}>
                  {isPositive ? '+' : ''}{change.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
