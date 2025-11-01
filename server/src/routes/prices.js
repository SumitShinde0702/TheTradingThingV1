import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Prices routes - fetch live cryptocurrency prices from nof1.ai
 */
export function createPricesRoutes() {
  const router = express.Router();

  // Cache for prices to avoid rate limiting
  let priceCache = {
    data: null,
    timestamp: null,
    ttl: 5000 // 5 seconds cache
  };

  /**
   * Fetch prices from nof1.ai
   * GET /api/prices
   */
  router.get("/", async (req, res) => {
    try {
      // Check cache first
      const now = Date.now();
      if (priceCache.data && priceCache.timestamp && (now - priceCache.timestamp) < priceCache.ttl) {
        return res.json({
          success: true,
          prices: priceCache.data,
          cached: true,
          timestamp: priceCache.timestamp
        });
      }

      // Try to fetch from nof1.ai API first (if available)
      let prices = null;

      // Helper function to extract prices from account-totals format
      function extractPricesFromResponse(data) {
        const extracted = {};
        if (data.accountTotals && Array.isArray(data.accountTotals)) {
          data.accountTotals.forEach(account => {
            if (account.positions) {
              Object.values(account.positions).forEach(position => {
                if (position.symbol && position.current_price) {
                  extracted[position.symbol] = position.current_price;
                }
              });
            }
          });
        }
        return extracted;
      }

      // Use nof1.ai's actual crypto-prices API
      try {
        console.log('Fetching prices from nof1.ai/api/crypto-prices...');
        const apiResponse = await axios.get('https://nof1.ai/api/crypto-prices', {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        });
        
        if (apiResponse.data) {
          // The API might return prices in different formats
          // Try to extract prices from the response
          if (Array.isArray(apiResponse.data)) {
            // If it's an array, map it
            const priceMap = {};
            apiResponse.data.forEach(item => {
              if (item.symbol && item.price) {
                priceMap[item.symbol] = item.price;
              }
            });
            prices = priceMap;
          } else if (typeof apiResponse.data === 'object') {
            // Check for common price structures
            if (apiResponse.data.prices) {
              prices = apiResponse.data.prices;
            } else if (apiResponse.data.BTC || apiResponse.data.ETH) {
              // Direct price object
              prices = apiResponse.data;
            } else {
              // Try to extract from positions if account-totals format
              prices = extractPricesFromResponse(apiResponse.data);
            }
          }
          
          if (prices && Object.keys(prices).length > 0) {
            console.log('Successfully fetched prices from nof1.ai:', prices);
          } else {
            throw new Error('No prices found in response');
          }
        }
      } catch (apiError) {
        console.error('Error fetching from nof1.ai/api/crypto-prices:', apiError.message);
        // Will fall through to CoinGecko fallback below
      }

      // Fallback to CoinGecko API if nof1.ai fails
      if (!prices || Object.keys(prices).length === 0) {
        try {
          console.log('Fetching prices from CoinGecko API...');
          const coingeckoResponse = await axios.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,dogecoin,ripple&vs_currencies=usd',
            {
              timeout: 5000,
              headers: {
                'Accept': 'application/json'
              }
            }
          );

          if (coingeckoResponse.data) {
            // Map CoinGecko IDs to our symbols
            const symbolMap = {
              'bitcoin': 'BTC',
              'ethereum': 'ETH',
              'solana': 'SOL',
              'binancecoin': 'BNB',
              'dogecoin': 'DOGE',
              'ripple': 'XRP'
            };

            prices = {};
            Object.entries(coingeckoResponse.data).forEach(([coinId, data]) => {
              const symbol = symbolMap[coinId];
              if (symbol && data && data.usd) {
                prices[symbol] = data.usd;
              }
            });

            console.log('Successfully fetched prices from CoinGecko:', prices);
          }
        } catch (coingeckoError) {
          console.error('Error fetching from CoinGecko:', coingeckoError.message);
          
          // Last resort: try scraping nof1.ai
          try {
            const htmlResponse = await axios.get('https://nof1.ai', {
              timeout: 10000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
              }
            });

            const pageText = htmlResponse.data;
            prices = {};

            // Better regex patterns to match the actual structure from nof1.ai
            const pricePatterns = [
              { symbol: 'BTC', pattern: /BTC\s*BTC.*?\$?([\d,]+(?:\.\d{2})?)/i },
              { symbol: 'ETH', pattern: /ETH\s*ETH.*?\$?([\d,]+(?:\.\d{2})?)/i },
              { symbol: 'SOL', pattern: /SOL\s*SOL.*?\$?([\d,]+(?:\.\d{2})?)/i },
              { symbol: 'BNB', pattern: /BNB\s*BNB.*?\$?([\d,]+(?:\.\d{2})?)/i },
              { symbol: 'DOGE', pattern: /DOGE\s*DOGE.*?\$?([\d,]+(?:\.\d{4})?)/i },
              { symbol: 'XRP', pattern: /XRP\s*XRP.*?\$?([\d,]+(?:\.\d{2})?)/i },
            ];

            // Use cheerio for better HTML parsing
            const $ = cheerio.load(pageText);
            
            // Try to find price elements
            $('*').each((i, elem) => {
              const $elem = $(elem);
              const text = $elem.text().trim();
              
              pricePatterns.forEach(({ symbol, pattern }) => {
                const match = text.match(pattern);
                if (match && match[1] && !prices[symbol]) {
                  const price = parseFloat(match[1].replace(/,/g, ''));
                  if (!isNaN(price) && price > 0) {
                    prices[symbol] = price;
                  }
                }
              });
            });

            // Also try direct regex on the entire page text
            pricePatterns.forEach(({ symbol, pattern }) => {
              if (!prices[symbol]) {
                const matches = pageText.match(new RegExp(pattern.source, 'gi'));
                if (matches && matches.length > 0) {
                  const match = matches[0].match(/\$?([\d,]+(?:\.\d{2,4})?)/);
                  if (match && match[1]) {
                    const price = parseFloat(match[1].replace(/,/g, ''));
                    if (!isNaN(price) && price > 0 && price < 1000000) {
                      prices[symbol] = price;
                    }
                  }
                }
              }
            });

          } catch (scrapeError) {
            console.error('Error scraping nof1.ai:', scrapeError.message);
            prices = null;
          }
        }
      }

      // If we still don't have prices, return empty object (no fallback)
      if (!prices || Object.keys(prices).length === 0) {
        prices = {};
      }

      // Update cache only if we have valid prices
      if (prices && Object.keys(prices).length > 0) {
        priceCache = {
          data: prices,
          timestamp: now,
          ttl: 5000
        };
      } else {
        // Clear cache if no valid prices
        priceCache = {
          data: null,
          timestamp: null,
          ttl: 5000
        };
      }

      res.json({
        success: true,
        prices,
        cached: false,
        timestamp: now,
        source: prices && Object.keys(prices).length > 0 ? 'nof1.ai' : 'fallback'
      });

    } catch (error) {
      console.error('Error fetching prices:', error.message);
      
      // Return empty prices on error (no fallback)
      res.json({
        success: false,
        prices: {},
        cached: false,
        timestamp: Date.now(),
        source: 'error',
        error: 'Failed to fetch from nof1.ai'
      });
    }
  });

  /**
   * Get price for a specific symbol
   * GET /api/prices/:symbol
   */
  router.get("/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      
      // Fetch all prices
      const allPricesResponse = await axios.get(`${req.protocol}://${req.get('host')}/api/prices`, {
        timeout: 5000
      });
      
      if (allPricesResponse.data.success && allPricesResponse.data.prices[symbol]) {
        res.json({
          success: true,
          symbol,
          price: allPricesResponse.data.prices[symbol],
          timestamp: allPricesResponse.data.timestamp
        });
      } else {
        res.status(404).json({
          success: false,
          error: `Price not found for symbol: ${symbol}`
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

