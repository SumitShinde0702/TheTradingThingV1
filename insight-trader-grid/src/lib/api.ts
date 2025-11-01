const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8443';

export interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  status: string;
  registered: boolean;
  walletAddress: string;
}

export interface PaymentInfo {
  requestId: string;
  amount: string;
  token: string;
  address: string;
  recipient: string;
  description: string;
  facilitator: string;
}

export interface TradingInsight {
  success: boolean;
  agentId: string;
  agentName: string;
  message: string;
  response: string;
  aiEnabled: boolean;
  timestamp: number;
}

export interface Signal {
  timestamp: number;
  model: string;
  direction: 'BUY' | 'SELL';
  confidence: number;
  symbol: string;
  price: string;
  reasoning: string;
}

export const api = {
  health: async () => {
    const res = await fetch(`${API_BASE_URL}/health`);
    return await res.json();
  },

  getAgents: async (): Promise<{ success: boolean; agents: Agent[] }> => {
    const res = await fetch(`${API_BASE_URL}/api/agents`);
    return await res.json();
  },

  getTradingInsights: async (
    tradingAgentId: string,
    modelName: string,
    txHash?: string | null
  ): Promise<TradingInsight | { paymentRequired: true; payment: PaymentInfo }> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (txHash) headers['X-Payment'] = txHash;

    const res = await fetch(`${API_BASE_URL}/api/agents/${tradingAgentId}/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: `Provide trading insights and buy/sell recommendations for ${modelName}. Focus on actionable recommendations.`,
        fromAgentId: 'user-client',
        payment: txHash
          ? {
              required: true,
              amount: '4',
              token: '0.0.429274',
              txHash,
            }
          : {
              required: true,
              amount: '4',
              token: '0.0.429274',
            },
      }),
    });

    if (res.status === 402) {
      const data = await res.json();
      return { paymentRequired: true, payment: data.payment };
    }

    return await res.json();
  },

  getBalance: async (address: string) => {
    const res = await fetch(`${API_BASE_URL}/api/payments/balance/${address}`);
    return await res.json();
  },

  getPaymentStatus: async (requestId: string) => {
    const res = await fetch(`${API_BASE_URL}/api/payments/status/${requestId}`);
    return await res.json();
  },
};
