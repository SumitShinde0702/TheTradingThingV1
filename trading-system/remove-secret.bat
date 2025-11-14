@echo off
REM Script to remove Groq API keys from Git history

echo This will rewrite Git history to remove API keys from all commits.
echo WARNING: This will change commit hashes. You'll need to force push after this.
echo.
pause

REM Set environment variable to suppress filter-branch warning
set FILTER_BRANCH_SQUELCH_WARNING=1

REM Create a temporary PowerShell script for the tree filter
echo powershell -Command "if (Test-Path 'trading-system/config-single.json') { $content = Get-Content 'trading-system/config-single.json' -Raw; $content = $content -replace '\"groq_key\":\s*\"[^\"]+\"', '\"groq_key\": \"\"'; Set-Content 'trading-system/config-single.json' -Value $content -NoNewline }" > temp-filter.ps1

REM Use git filter-branch to rewrite history
git filter-branch --force --tree-filter "powershell -ExecutionPolicy Bypass -File temp-filter.ps1" --prune-empty --tag-name-filter cat -- --all

REM Clean up
del temp-filter.ps1 2>nul

echo.
echo History rewritten. Now you need to force push:
echo   git push --force
echo.
echo WARNING: Force pushing will overwrite remote history. Make sure you coordinate with collaborators.


