$gh = "C:\Program Files\GitHub CLI\gh.exe"
$git = "C:\Program Files\Git\bin\git.exe"
Set-Location $PSScriptRoot

& $gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged into GitHub. Run: gh auth login"
  exit 1
}

& $gh repo create glory-goat-milk-soap --public --source=. --remote=origin --push
if ($LASTEXITCODE -ne 0) {
  & $git push -u origin main
}

$user = & $gh api user --jq .login

& $gh api "repos/$user/glory-goat-milk-soap/pages" -X POST `
  -f build_type=legacy `
  -f source[branch]=main `
  -f source[path]=/ 2>$null

if ($LASTEXITCODE -ne 0) {
  & $gh api "repos/$user/glory-goat-milk-soap/pages" -X PUT `
    -f build_type=legacy `
    -f source[branch]=main `
    -f source[path]=/
}

$pages = & $gh api "repos/$user/glory-goat-milk-soap/pages"
Write-Host ""
Write-Host "Site URL: https://$user.github.io/glory-goat-milk-soap/"
Write-Host "Custom domain (after DNS): https://glorygoatmilksoap.com"
Write-Host ""
Write-Host "Namecheap DNS:"
Write-Host "  A records @ -> 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153"
Write-Host "  CNAME www -> $user.github.io"
