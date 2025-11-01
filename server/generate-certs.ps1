# PowerShell script to generate self-signed SSL certificates for HTTPS development

if (-not (Test-Path "certs")) {
    New-Item -ItemType Directory -Path "certs"
}

Write-Host "Generating self-signed SSL certificate..."

# Check if OpenSSL is available
$openssl = Get-Command openssl -ErrorAction SilentlyContinue
if (-not $openssl) {
    Write-Host "❌ OpenSSL not found. Please install OpenSSL or use Windows certificate tools."
    Write-Host "   Alternative: Use 'New-SelfSignedCertificate' PowerShell cmdlet"
    exit 1
}

openssl req -x509 -newkey rsa:4096 `
  -keyout certs/key.pem `
  -out certs/cert.pem `
  -days 365 `
  -nodes `
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ SSL certificates generated in certs/ directory"
    Write-Host "   - certs/key.pem"
    Write-Host "   - certs/cert.pem"
} else {
    Write-Host "❌ Failed to generate certificates"
}

