#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Manual deploy script - run this on the EC2 instance
# Usage: ./deploy.sh
# ═══════════════════════════════════════════════════════════════
set -e

cd /opt/battleship

echo "=== Pulling latest image ==="
docker pull pbdaemon/battleship:latest

echo "=== Rolling restart (zero downtime) ==="
# Restart app-1 first
docker compose up -d --no-deps app-1
echo "Waiting for app-1 to be healthy..."
sleep 10

# Then app-2
docker compose up -d --no-deps app-2
echo "Waiting for app-2 to be healthy..."
sleep 10

# Restart nginx and cloudflared
docker compose up -d --no-deps nginx cloudflared

echo "=== Deploy complete ==="
docker compose ps
