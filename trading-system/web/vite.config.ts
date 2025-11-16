import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Allow ngrok and other tunnel hosts
    allowedHosts: [
      '.ngrok.io',
      '.ngrok-free.app',
      '.ngrok.app',
      '.trycloudflare.com',
      'localhost',
      '4edf24d7ae82.ngrok-free.app'
    ],
    proxy: {
      // Default backend (port 8080)
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      // Binance Real backend (port 8083) - route via /api-binance path
      '/api-binance': {
        target: 'http://localhost:8083',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-binance/, '/api'),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.log('Binance proxy error', err);
          });
        },
      },
      // Multi-agent backend (port 8081) - route via /api-multi path
      '/api-multi': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-multi/, '/api'),
      },
      // ETF Portfolio backend (port 8082) - route via /api-etf path
      '/api-etf': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-etf/, '/api'),
      },
    },
  },
  // Note: The frontend makes direct API calls to different ports (8080, 8081, 8082, 8083)
  // based on trader ID. For public access via ngrok, you'll need to either:
  // 1. Use ngrok on port 3000 only (frontend) and ensure backend is accessible
  // 2. Or update the frontend API client to use relative URLs when behind a proxy
})
