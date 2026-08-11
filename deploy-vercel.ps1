$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "`n=== Glory Goat Milk Soap — Vercel Deploy ===" -ForegroundColor Cyan

Write-Host "`n1. Linking project..." -ForegroundColor Green
npx vercel link --yes --project glory-goat-milk-soap

Write-Host "`n2. Deploying to production..." -ForegroundColor Green
npx vercel --prod --yes

Write-Host "`n=== Done! ===" -ForegroundColor Cyan
Write-Host "Live preview: check the URL above"
Write-Host "`nAdd glorygoatmilksoap.com in Vercel -> Settings -> Domains"
Write-Host "Then in Namecheap Advanced DNS (same as braidappt.com):"
Write-Host "  A     @   -> 76.76.21.21"
Write-Host "  CNAME www -> cname.vercel-dns.com."
