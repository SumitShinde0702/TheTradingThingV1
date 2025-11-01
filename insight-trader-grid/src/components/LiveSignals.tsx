import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Signal } from '@/lib/api';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface LiveSignalsProps {
  signals: Signal[];
}

export function LiveSignals({ signals }: LiveSignalsProps) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <Card className="border-border bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>Live Signals</CardTitle>
        <CardDescription>Last 10 trading signals (FREE)</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-2 font-mono text-xs">
            {signals.length === 0 ? (
              <p className="text-center text-muted-foreground">Waiting for signals...</p>
            ) : (
              signals.map((signal, index) => (
                <div
                  key={`${signal.timestamp}-${index}`}
                  className="flex items-center justify-between rounded border border-border bg-background/50 p-2"
                >
                  <div className="flex items-center gap-2">
                    {signal.direction === 'BUY' ? (
                      <TrendingUp className="h-3 w-3 text-neon-lime" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-destructive" />
                    )}
                    <span className="text-muted-foreground">{formatTime(signal.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">
                      {signal.model}
                    </Badge>
                    <span className={signal.direction === 'BUY' ? 'text-neon-lime' : 'text-destructive'}>
                      {signal.direction}
                    </span>
                    <span className="text-muted-foreground">{signal.confidence}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
