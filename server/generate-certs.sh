#!/bin/bash
# Generate self-signed SSL certificates for HTTPS development

mkdir -p certs

echo "Generating self-signed SSL certificate..."
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

echo "✅ SSL certificates generated in certs/ directory"
echo "   - certs/key.pem"
echo "   - certs/cert.pem"

