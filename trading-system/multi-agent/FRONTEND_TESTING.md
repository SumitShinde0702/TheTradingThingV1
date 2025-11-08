# Frontend Testing Guide

## 🎯 Goal
Test multi-agent system with the existing frontend (localhost:8080) without breaking `nofx.exe`.

## ✅ Solution: Create Separate Executable

### Option 1: Build Separate Executable (Recommended)

1. **Create `main_multiagent.go`** in the root `trading-system/` folder
2. **Build it**: `go build -o nofx-multiagent.exe main_multiagent.go`
3. **Run it**: `./nofx-multiagent.exe` (uses same port 8080)
4. **Frontend works** - Same API, just multi-agent decisions!

### Option 2: Use Same Port, Different Process

1. **Stop `nofx.exe`** (Ctrl+C)
2. **Run multi-agent version** on same port (8080)
3. **Frontend automatically connects** to new process
4. **Switch back anytime** - Just restart `nofx.exe`

## 📝 Quick Steps

### Step 1: Create Multi-Agent Main File

Create `trading-system/main_multiagent.go` (I'll create this for you)

### Step 2: Build

```bash
cd trading-system
go build -o nofx-multiagent.exe main_multiagent.go
```

### Step 3: Test

1. **Stop current `nofx.exe`** (if running)
2. **Run**: `./nofx-multiagent.exe`
3. **Frontend**: Open `http://localhost:3000` (or your frontend URL)
4. **Same API**: All endpoints work the same!

### Step 4: Compare

- **Single-agent**: Run `nofx.exe` → Check decisions
- **Multi-agent**: Run `nofx-multiagent.exe` → Check decisions
- **Compare**: See difference in decision quality

## 🔄 Switching Between Versions

```bash
# Use single-agent
./nofx.exe

# Use multi-agent  
./nofx-multiagent.exe

# Both use same port (8080) and same API
# Frontend works with both!
```

## ⚠️ Important Notes

- **Same port**: Both use 8080 (can't run both at once)
- **Same API**: Frontend doesn't need changes
- **Same config**: Uses same `config.json` (just add multi-agent section)
- **Safe**: Original `nofx.exe` untouched

## 🎯 What You'll See

When using multi-agent:
- **Logs show**: "🤖 [Multi-Agent] Starting decision with X agents"
- **Decisions**: Combined from multiple agents
- **Chain of Thought**: Shows all agents' reasoning
- **Frontend**: Shows same data, just better decisions!

Want me to create the `main_multiagent.go` file now?

