#!/bin/bash
# Minimal bootstrap: install Docker + Compose, create app directory
set -e

dnf update -y
dnf install -y docker git jq

systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

mkdir -p /opt/battleship/nginx

cat > /opt/battleship/nginx/nginx.conf << 'NGINXEOF'
upstream battleship_app {
    ip_hash;
    server app-1:3000 max_fails=3 fail_timeout=10s;
    server app-2:3000 max_fails=3 fail_timeout=10s;
}
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://battleship_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
    location /health {
        proxy_pass http://battleship_app;
        proxy_set_header Host $host;
    }
}
NGINXEOF

cat > /opt/battleship/docker-compose.yml << 'COMPOSEEOF'
services:
  redis-master:
    image: redis:7-alpine
    command: redis-server --appendonly yes --save 60 1 --maxmemory 128mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-master-data:/data
    restart: always
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 3
    networks:
      - battleship-net
  redis-replica:
    image: redis:7-alpine
    command: redis-server --appendonly yes --replicaof redis-master 6379 --maxmemory 128mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-replica-data:/data
    restart: always
    depends_on:
      redis-master:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 3
    networks:
      - battleship-net
  sentinel-1:
    image: redis:7-alpine
    command: >
      sh -c "echo 'port 26379
      sentinel monitor mymaster redis-master 6379 2
      sentinel down-after-milliseconds mymaster 5000
      sentinel failover-timeout mymaster 10000
      sentinel parallel-syncs mymaster 1' > /tmp/sentinel.conf && redis-sentinel /tmp/sentinel.conf"
    restart: always
    depends_on:
      redis-master:
        condition: service_healthy
    networks:
      - battleship-net
  sentinel-2:
    image: redis:7-alpine
    command: >
      sh -c "echo 'port 26379
      sentinel monitor mymaster redis-master 6379 2
      sentinel down-after-milliseconds mymaster 5000
      sentinel failover-timeout mymaster 10000
      sentinel parallel-syncs mymaster 1' > /tmp/sentinel.conf && redis-sentinel /tmp/sentinel.conf"
    restart: always
    depends_on:
      redis-master:
        condition: service_healthy
    networks:
      - battleship-net
  sentinel-3:
    image: redis:7-alpine
    command: >
      sh -c "echo 'port 26379
      sentinel monitor mymaster redis-master 6379 2
      sentinel down-after-milliseconds mymaster 5000
      sentinel failover-timeout mymaster 10000
      sentinel parallel-syncs mymaster 1' > /tmp/sentinel.conf && redis-sentinel /tmp/sentinel.conf"
    restart: always
    depends_on:
      redis-master:
        condition: service_healthy
    networks:
      - battleship-net
  app-1:
    image: pbdaemon/battleship:latest
    environment:
      - PORT=3000
      - INSTANCE_ID=app-1
      - REDIS_SENTINEL_HOSTS=sentinel-1:26379,sentinel-2:26379,sentinel-3:26379
      - REDIS_MASTER_NAME=mymaster
    restart: always
    depends_on:
      redis-master:
        condition: service_healthy
      sentinel-1:
        condition: service_started
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 10s
      timeout: 3s
      retries: 3
    networks:
      - battleship-net
  app-2:
    image: pbdaemon/battleship:latest
    environment:
      - PORT=3000
      - INSTANCE_ID=app-2
      - REDIS_SENTINEL_HOSTS=sentinel-1:26379,sentinel-2:26379,sentinel-3:26379
      - REDIS_MASTER_NAME=mymaster
    restart: always
    depends_on:
      redis-master:
        condition: service_healthy
      sentinel-1:
        condition: service_started
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 10s
      timeout: 3s
      retries: 3
    networks:
      - battleship-net
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      app-1:
        condition: service_healthy
      app-2:
        condition: service_healthy
    restart: always
    networks:
      - battleship-net
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run --token $${CF_TUNNEL_TOKEN}
    restart: always
    depends_on:
      - nginx
    networks:
      - battleship-net
  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_POLL_INTERVAL=30
      - WATCHTOWER_ROLLING_RESTART=true
      - WATCHTOWER_INCLUDE_STOPPED=false
    restart: always
    networks:
      - battleship-net
volumes:
  redis-master-data:
  redis-replica-data:
networks:
  battleship-net:
    driver: bridge
COMPOSEEOF

echo "CF_TUNNEL_TOKEN=${cf_tunnel_token}" > /opt/battleship/.env

cd /opt/battleship
docker compose pull
docker compose up -d

echo "=== BOOTSTRAP COMPLETE ==="
