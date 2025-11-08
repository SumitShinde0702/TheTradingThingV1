# Multi-Agent Trading System (Experimental)

This is a **separate experimental implementation** of multi-agent consensus trading. It does NOT affect the existing `nofx.exe` or any working code.

## 🎯 What This Is

- **Experimental multi-agent decision system**
- **Runs in parallel** - Multiple AI agents analyze the same market data
- **Consensus mechanism** - Combines decisions from multiple agents
- **Completely separate** - Doesn't touch existing code

## 📁 Structure

```
multi-agent/
├── engine.go          # Multi-agent decision engine
├── config.go          # Multi-agent configuration
├── consensus.go       # Consensus logic (voting, weighted, etc.)
├── main_test.go       # Test/example main file
└── README.md          # This file
```

## 🚀 Quick Start

1. **Configure agents** in `config.json` (add multi-agent section)
2. **Run test**: `go run multi-agent/main_test.go`
3. **Compare** with single-agent results

## ⚠️ Important

- This is **experimental** - test thoroughly before using
- Existing `nofx.exe` continues to work normally
- This folder is completely isolated

