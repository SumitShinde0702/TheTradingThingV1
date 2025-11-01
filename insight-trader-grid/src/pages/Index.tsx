import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { TradingChart } from '@/components/TradingChart';
import { ModelSelector } from '@/components/ModelSelector';
import { LiveSignals } from '@/components/LiveSignals';
import { TradingInsightsModal } from '@/components/TradingInsightsModal';
import { useWallet } from '@/hooks/useWallet';
import { useSignals } from '@/hooks/useSignals';
import { api } from '@/lib/api';
import { Wallet } from 'lucide-react';

const Index = () => {
  const { address, isConnecting, connectWallet } = useWallet();
  const [selectedModels, setSelectedModels] = useState<string[]>([
    'deepseek',
    'chatgpt',
    'groq',
    'grok',
    'mock-vendor',
  ]);
  const { signals, chartData } = useSignals(selectedModels, true);
  const [insightsModalOpen, setInsightsModalOpen] = useState(false);
  const [tradingAgentId, setTradingAgentId] = useState<string | null>(null);

  // Fetch trading agent ID on mount
  useEffect(() => {
    api.getAgents().then((data) => {
      const tradingAgent = data.agents?.find((a) => a.name === 'TradingAgent');
      if (tradingAgent) {
        setTradingAgentId(tradingAgent.id);
      }
    }).catch(console.error);
  }, []);

  // Persist selected models
  useEffect(() => {
    localStorage.setItem('selectedModels', JSON.stringify(selectedModels));
  }, [selectedModels]);

  const handlePurchaseInsights = () => {
    if (selectedModels.length === 0) {
      return;
    }
    setInsightsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border p-4">
        <div className="text-xl font-bold tracking-tight">The Trading Thing</div>
        <Button
          variant="outline"
          className="gap-2 glow-violet hover:glow-violet"
          onClick={connectWallet}
          disabled={isConnecting}
        >
          <Wallet className="h-4 w-4" />
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Connect Wallet'}
        </Button>
      </header>

      {/* Main Content */}
      <div className="flex min-h-[calc(100vh-73px)] gap-4 p-4">
        {/* Left: Trading Chart (65%) */}
        <div className="flex-[65] rounded-lg border border-border bg-card/30 p-6 backdrop-blur-sm">
          <TradingChart
            data={chartData}
            isStreaming={signals.length > 0}
          />
        </div>

        {/* Right: Sidebar (35%) */}
        <div className="flex-[35] space-y-4">
          <ModelSelector 
            selectedModels={selectedModels} 
            onModelsChange={setSelectedModels}
            onPurchaseInsights={handlePurchaseInsights}
          />
          <LiveSignals signals={signals} />
        </div>
      </div>

      {/* Trading Insights Modal */}
      <TradingInsightsModal
        isOpen={insightsModalOpen}
        onClose={() => setInsightsModalOpen(false)}
        selectedModels={selectedModels}
        tradingAgentId={tradingAgentId}
      />
    </div>
  );
};

export default Index;
