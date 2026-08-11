# Finish Glory Goat admin setup (Supabase schema + service role on Vercel)
#
# Prerequisites:
#   1. Supabase access token: https://supabase.com/dashboard/account/tokens
#   2. Service role key: Supabase → Project rnjkssiuzqkpawakxwry → Settings → API
#
# Usage:
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
#   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
#   .\scripts\finish-setup.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host "Set SUPABASE_ACCESS_TOKEN first (Supabase dashboard → Account → Access Tokens)" -ForegroundColor Yellow
  exit 1
}

if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
  Write-Host "Set SUPABASE_SERVICE_ROLE_KEY first (Supabase → Settings → API → service_role)" -ForegroundColor Yellow
  exit 1
}

$env:SUPABASE_URL = "https://rnjkssiuzqkpawakxwry.supabase.co"

Write-Host "Applying schema..." -ForegroundColor Cyan
node --env-file=.env.admin-setup scripts/apply-schema.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Updating Vercel env..." -ForegroundColor Cyan
$env:SUPABASE_URL | npx vercel env add SUPABASE_URL production --force | Out-Null
$env:SUPABASE_SERVICE_ROLE_KEY | npx vercel env add SUPABASE_SERVICE_ROLE_KEY production --force | Out-Null
Write-Host "  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Green

Write-Host "Deploying..." -ForegroundColor Cyan
npx vercel --prod --yes

Write-Host ""
Write-Host "Done. Admin: https://glorygoatmilksoap.com/ops.html (code in .env.admin-setup)" -ForegroundColor Green
