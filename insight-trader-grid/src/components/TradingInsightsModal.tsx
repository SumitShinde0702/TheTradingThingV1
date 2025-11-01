import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { api, PaymentInfo } from '@/lib/api';
import { toast } from 'sonner';

interface TradingInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModels: string[];
  tradingAgentId: string | null;
}

export function TradingInsightsModal({ isOpen, onClose, selectedModels, tradingAgentId }: TradingInsightsModalProps) {
  const [insights, setInsights] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<PaymentInfo | null>(null);

  const totalPrice = selectedModels.length * 4;
  const modelNames = selectedModels.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ');

  const requestInsights = async () => {
    if (!tradingAgentId || selectedModels.length === 0) {
      toast.error('Please select at least one model.');
      return;
    }

    setLoading(true);
    try {
      // Request insights for all selected models
      const results: Record<string, string> = {};
      
      for (const modelName of selectedModels) {
        const result = await api.getTradingInsights(tradingAgentId, modelName);

        if ('paymentRequired' in result && result.paymentRequired) {
          // Only set payment request once (for the total amount)
          if (!paymentRequest) {
            // Adjust payment amount for multiple models
            const adjustedPayment = {
              ...result.payment,
              amount: totalPrice.toString(),
              description: `Trading insights for ${selectedModels.length} model${selectedModels.length !== 1 ? 's' : ''}`,
            };
            setPaymentRequest(adjustedPayment);
            handlePayment(adjustedPayment);
          }
          return;
        } else if ('success' in result && result.success) {
          results[modelName] = result.response;
        }
      }

      setInsights(results);
      toast.success('Trading insights received!');
    } catch (error: any) {
      console.error('Request failed:', error);
      toast.error(error.message || 'Failed to get trading insights');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = (payment: PaymentInfo) => {
    const facilitatorUrl = payment.facilitator;
    const paymentWindow = window.open(
      `${facilitatorUrl}/pay?${new URLSearchParams({
        requestId: payment.requestId,
        amount: payment.amount,
        token: payment.token,
        address: payment.address,
      })}`,
      'payment',
      'width=600,height=700'
    );

    const messageHandler = (event: MessageEvent) => {
      if (event.data.type === 'x402-payment-success') {
        const { txHash } = event.data;
        retryWithPayment(txHash, payment);
        paymentWindow?.close();
        window.removeEventListener('message', messageHandler);
      }
    };

    window.addEventListener('message', messageHandler);
  };

  const retryWithPayment = async (txHash: string, payment: PaymentInfo) => {
    if (!tradingAgentId) return;

    setLoading(true);
    try {
      const results: Record<string, string> = {};
      
      // Fetch insights for all selected models using the same payment
      for (const modelName of selectedModels) {
        const result = await api.getTradingInsights(tradingAgentId, modelName, txHash);

        if ('success' in result && result.success) {
          results[modelName] = result.response;
        }
      }

      setInsights(results);
      toast.success('Payment confirmed! Insights received.');
    } catch (error: any) {
      console.error('Retry failed:', error);
      toast.error(error.message || 'Failed to verify payment');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setInsights({});
    setPaymentRequest(null);
    onClose();
  };

  const hasInsights = Object.keys(insights).length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl border-border bg-card">
        <DialogHeader>
          <DialogTitle>Trading Insights for {selectedModels.length} Model{selectedModels.length !== 1 ? 's' : ''}</DialogTitle>
          <DialogDescription>
            AI-powered buy/sell recommendations: {modelNames}
          </DialogDescription>
        </DialogHeader>

        {!hasInsights ? (
          <div className="space-y-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Get detailed trading insights for {selectedModels.length} AI model{selectedModels.length !== 1 ? 's' : ''}
            </p>
            <div className="rounded-lg border border-border bg-background/50 p-4">
              <div className="text-2xl font-bold text-primary">{totalPrice} USDC</div>
              <div className="text-xs text-muted-foreground">
                {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} × 4 USDC each
              </div>
              <div className="mt-2 text-xs font-mono text-muted-foreground">Token: 0.0.429274</div>
            </div>
            <Button
              onClick={requestInsights}
              disabled={loading}
              className="w-full"
              variant="default"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing Payment...
                </>
              ) : (
                `Purchase Insights ({totalPrice} USDC)`
              )}
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-6">
              {selectedModels.map((model) => (
                <div key={model} className="space-y-2">
                  <h3 className="text-lg font-semibold capitalize border-b border-border pb-2">
                    {model}
                  </h3>
                  <div className="whitespace-pre-wrap text-sm">
                    {insights[model] || 'Loading insights...'}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-border bg-background/50 p-3 text-xs">
              <div className="text-muted-foreground">
                <strong>Total Price:</strong> {totalPrice} USDC • <strong>Models:</strong> {modelNames}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
