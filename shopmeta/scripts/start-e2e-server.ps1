# scripts/start-e2e-server.ps1
# Kills any process on port 3000, then starts the Vite dev server.
# Called by Playwright's webServer config during E2E test runs.

param()

# Kill anything on port 3000 (silently — no error if nothing there)
try {
  $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Freed port 3000 (PID $($conn.OwningProcess))"
  }
} catch {
  # Nothing on port 3000 — that's fine
}

# Start the dev server
& pnpm dev
