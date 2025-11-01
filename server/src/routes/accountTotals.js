import express from "express";
import axios from "axios";

/**
 * Account totals routes - fetch trading account data from nof1.ai
 */
export function createAccountTotalsRoutes() {
  const router = express.Router();

  // Cache for account totals
  let cache = {
    data: null,
    timestamp: null,
    ttl: 30000 // 30 seconds cache
  };

  // Model name mapping from nof1.ai to our internal names
  const modelMapping = {
    'deepseek-chat-v3.1': 'deepseek',
    'gpt-5': 'chatgpt',
    'grok-4': 'grok',
    // Note: 'groq' doesn't exist on nof1.ai - we'll filter it out
    // If you want to show claude as groq, uncomment the line below:
    // 'claude-sonnet-4-5': 'groq',
    'claude-sonnet-4-5': 'claude', // Keep claude as its own model
    'qwen3-max': 'qwen', // Separate qwen from mock-vendor
    'gemini-2.5-pro': 'gemini' // Separate gemini from mock-vendor
  };

  /**
   * Fetch account totals from nof1.ai
   * GET /api/account-totals
   */
  router.get("/", async (req, res) => {
    try {
      // Check cache first
      const now = Date.now();
      if (cache.data && cache.timestamp && (now - cache.timestamp) < cache.ttl) {
        return res.json({
          success: true,
          accountTotals: cache.data,
          cached: true,
          timestamp: cache.timestamp
        });
      }

      // Get the latest hourly marker (you can pass it as query param or we'll fetch latest)
      const lastHourlyMarker = req.query.lastHourlyMarker || null;

      let url = 'https://nof1.ai/api/account-totals';
      if (lastHourlyMarker) {
        url += `?lastHourlyMarker=${lastHourlyMarker}`;
      }

      console.log(`Fetching account totals from ${url}...`);
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      if (!response.data || !response.data.accountTotals) {
        throw new Error('Invalid response from nof1.ai');
      }

      // Map the account totals to our model structure
      const mappedTotals = response.data.accountTotals.map(account => {
        const ourModelName = modelMapping[account.model_id] || account.model_id;
        return {
          id: account.id,
          modelId: account.model_id,
          modelName: ourModelName,
          timestamp: account.timestamp * 1000, // Convert to milliseconds
          dollarEquity: account.dollar_equity,
          realizedPnl: account.realized_pnl,
          totalUnrealizedPnl: account.total_unrealized_pnl,
          cumPnlPct: account.cum_pnl_pct,
          sharpeRatio: account.sharpe_ratio,
          positions: account.positions || {}
        };
      });

      // Also extract current prices from positions
      const currentPrices = {};
      response.data.accountTotals.forEach(account => {
        if (account.positions) {
          Object.values(account.positions).forEach(position => {
            if (position.symbol && position.current_price) {
              currentPrices[position.symbol] = position.current_price;
            }
          });
        }
      });

      // Update cache
      cache = {
        data: mappedTotals,
        timestamp: now,
        ttl: 30000
      };

      res.json({
        success: true,
        accountTotals: mappedTotals,
        currentPrices: currentPrices,
        lastHourlyMarker: response.data.lastHourlyMarkerRead,
        serverTime: response.data.serverTime,
        cached: false,
        timestamp: now,
        source: 'nof1.ai'
      });

    } catch (error) {
      console.error('Error fetching account totals:', error.message);
      
      // Check if error response contains HTML (404 page)
      if (error.response && error.response.headers['content-type']?.includes('text/html')) {
        return res.status(404).json({
          success: false,
          accountTotals: [],
          cached: false,
          timestamp: Date.now(),
          source: 'error',
          error: 'Endpoint not found - nof1.ai API may have changed or requires authentication'
        });
      }
      
      res.status(500).json({
        success: false,
        accountTotals: [],
        cached: false,
        timestamp: Date.now(),
        source: 'error',
        error: error.message || 'Failed to fetch from nof1.ai'
      });
    }
  });

  /**
   * Get account total for a specific model
   * GET /api/account-totals/:modelId
   */
  router.get("/:modelId", async (req, res) => {
    try {
      const modelId = req.params.modelId;
      
      // Fetch all account totals
      const allTotalsResponse = await axios.get(`${req.protocol}://${req.get('host')}/api/account-totals`, {
        timeout: 5000
      });
      
      if (allTotalsResponse.data.success) {
        const modelTotal = allTotalsResponse.data.accountTotals.find(
          total => total.modelId === modelId || total.modelName === modelId
        );
        
        if (modelTotal) {
          res.json({
            success: true,
            accountTotal: modelTotal,
            timestamp: allTotalsResponse.data.timestamp
          });
        } else {
          res.status(404).json({
            success: false,
            error: `Account total not found for model: ${modelId}`
          });
        }
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch account totals'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

