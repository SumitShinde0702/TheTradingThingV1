package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Println("🧹 Cleaning up repository...\n")

	filesToRemove := []string{
		// Build artifacts
		"lia.exe",
		"lia.exe~",
		"lia_test.exe",
		"nofx.exe",
		"nofx.exe~",
		"nofx_test.exe",
		"test_build.exe",
		
		// Archives
		"ngrok.zip",
		
		// Old trader logs (if not currently used)
		"decision_logs/grok_trader",
		"decision_logs/groq_trader",
	}

	dirsToCheck := []string{
		// Build output directories
		"web/dist",
		"web/.vite",
		
		// Cache directories
		"coin_pool_cache",
	}

	removed := 0
	checked := 0

	fmt.Println("📁 Removing files and old trader logs:")
	for _, path := range filesToRemove {
		if _, err := os.Stat(path); err == nil {
			if err := os.RemoveAll(path); err != nil {
				fmt.Printf("  ⚠️  Failed to remove %s: %v\n", path, err)
			} else {
				fmt.Printf("  ✅ Removed: %s\n", path)
				removed++
			}
		} else {
			checked++
		}
	}

	fmt.Println("\n📂 Checking directories (safe to remove if empty or build artifacts):")
	for _, dir := range dirsToCheck {
		if info, err := os.Stat(dir); err == nil {
			if info.IsDir() {
				// Check if directory is empty or only contains build artifacts
				entries, _ := os.ReadDir(dir)
				if len(entries) == 0 {
					fmt.Printf("  ℹ️  Empty directory: %s (safe to remove manually if needed)\n", dir)
				} else {
					fmt.Printf("  ℹ️  Contains files: %s (%d items - review before removing)\n", dir, len(entries))
				}
			}
		}
	}

	fmt.Printf("\n✅ Cleanup complete: %d items removed, %d items already cleaned\n", removed, checked)
	fmt.Println("\n📝 Remaining items to review manually:")
	fmt.Println("   - web/dist/ (frontend build output - can be regenerated)")
	fmt.Println("   - web/.vite/ (Vite cache - can be regenerated)")
	fmt.Println("   - coin_pool_cache/ (if exists - can be regenerated)")
}

