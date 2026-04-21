#!/bin/bash

SECRET="sabor_notify_2026_secret"

echo "Sending Saturday push..."
curl -s -X POST https://sabor-api.vercel.app/api/notify \
  -H "Content-Type: application/json" \
  -H "X-API-Secret: $SECRET" \
  -d '{"type":"event","title":"🌶️ This Saturday in Chicago","body":"Did you know? Cafecito Latin Brunch at Vista Rooftop 11am–4pm. Open SABOR for details."}'

echo ""
echo "Sending Sunday push..."
curl -s -X POST https://sabor-api.vercel.app/api/notify \
  -H "Content-Type: application/json" \
  -H "X-API-Secret: $SECRET" \
  -d '{"type":"event","title":"☕ This Sunday in Chicago","body":"Did you know? Cafecito con Conchas at Sater Tasa & Las Casas Playroom. Tap to see all events."}'

echo ""
echo "Done."
