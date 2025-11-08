# API Endpoints for Your Friend

## Base URL
```
http://172.16.8.171:8080
```

## Available Endpoints

### Basic Info Endpoints
```
http://172.16.8.171:8080/health
http://172.16.8.171:8080/api/competition
http://172.16.8.171:8080/api/traders
```

### Trader-Specific Endpoints

Replace `xxx` with actual trader ID (e.g., `grok_trader`, `openai_trader`, `qwen_trader`)

```
http://172.16.8.171:8080/api/status?trader_id=xxx
http://172.16.8.171:8080/api/account?trader_id=xxx
http://172.16.8.171:8080/api/positions?trader_id=xxx
http://172.16.8.171:8080/api/decisions?trader_id=xxx
http://172.16.8.171:8080/api/decisions/latest?trader_id=xxx
http://172.16.8.171:8080/api/statistics?trader_id=xxx
http://172.16.8.171:8080/api/equity-history?trader_id=xxx
http://172.16.8.171:8080/api/performance?trader_id=xxx
```

### Trading Signal Endpoints

By model:
```
http://172.16.8.171:8080/api/trading-signal?model=openai
http://172.16.8.171:8080/api/trading-signal?model=grok
http://172.16.8.171:8080/api/trading-signal?model=qwen
```

By trader ID:
```
http://172.16.8.171:8080/api/trading-signal?trader_id=openai_trader
```

## Quick Start Examples

1. **Get list of all traders:**
   ```
   http://172.16.8.171:8080/api/traders
   ```

2. **Get competition overview (compare all traders):**
   ```
   http://172.16.8.171:8080/api/competition
   ```

3. **Get account info for a specific trader:**
   ```
   http://172.16.8.171:8080/api/account?trader_id=grok_trader
   ```

4. **Get equity history (for charts):**
   ```
   http://172.16.8.171:8080/api/equity-history?trader_id=grok_trader
   ```

5. **Get latest trading signal:**
   ```
   http://172.16.8.171:8080/api/trading-signal?model=grok
   ```

## Response Format

All endpoints return JSON data. You can:
- Open directly in browser to view
- Use with curl: `curl http://172.16.8.171:8080/api/competition`
- Use in any HTTP client or programming language

