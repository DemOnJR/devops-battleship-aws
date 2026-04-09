# Battleship - Pirates of the Caribbean Edition

A multiplayer Battleship game with a Pirates of the Caribbean comedy theme, featuring Jack Sparrow quotes, animated pirate characters, cannon sound effects, and real-time chat.

**Play now:** [battleship.pbcv.dev](https://battleship.pbcv.dev)

---

## The Game

### How to Play

1. **Enter your pirate name** and either create a game (generates an invite link) or find a random opponent
2. **Deploy your fleet** on the board - click a ship, then click the board to place it. Press `R` to rotate
3. **Fire cannons** at your opponent's board - take turns clicking squares to find and sink their ships
4. **First to sink all 5 ships wins!**

### Ships

| Ship | Size |
|------|------|
| Carrier | 5 |
| Battleship | 4 |
| Cruiser | 3 |
| Submarine | 3 |
| Destroyer | 2 |

### Features

- **Multiplayer** - Play against friends via invite link or match with random opponents
- **Real-time chat** - Talk trash with your opponent during battle
- **Jack Sparrow commentary** - Jack auto-comments on hits, misses, sunk ships, idle players, and chat messages with 60+ unique pirate quotes
- **Sound effects** - Synthesized cannon fire, splashes, reload sounds, ship sinking, and ambient ocean/wind/creaking (Web Audio API, no audio files)
- **Animated characters** - CSS-animated flying parrot with 3D wing flapping, SVG Jack Sparrow and monkey with idle/reaction animations
- **Persistent sessions** - Refresh your browser or lose connection without losing game progress (60-second reconnect window). Game state survives container restarts via Redis.
- **Mobile responsive** - Playable on phones, tablets, and desktops

---

## Infrastructure

### Architecture Overview

```
                         Internet
                            |
                     Cloudflare Edge
                      (DDoS protection,
                       SSL termination)
                            |
                   Cloudflare Tunnel
                (outbound connection only -
                 no public IP, no open ports)
                            |
  +---------------------------------------------------------+
  |                   EC2 Instance (t3.micro)                |
  |                   Amazon Linux 2023                      |
  |                   eu-west-1 (Ireland)                    |
  |                                                         |
  |  +---------------------------------------------------+  |
  |  |              cloudflared container                 |  |
  |  |    Maintains persistent tunnel to Cloudflare edge  |  |
  |  +-------------------------+-------------------------+  |
  |                            |                            |
  |  +-------------------------+-------------------------+  |
  |  |              nginx (reverse proxy)                |  |
  |  |    ip_hash sticky sessions for WebSocket affinity |  |
  |  |    86400s read/send timeouts for long connections  |  |
  |  +------------+-------------------+-----------------+  |
  |               |                   |                    |
  |  +------------+------+  +---------+---------+          |
  |  |      app-1        |  |      app-2        |          |
  |  |  Node.js+Express  |  |  Node.js+Express  |          |
  |  |  Socket.IO server |  |  Socket.IO server |          |
  |  |  Port 3000        |  |  Port 3000        |          |
  |  +--------+----------+  +--------+----------+          |
  |           |                       |                     |
  |           | Socket.IO Redis       | ioredis             |
  |           | Adapter (pub/sub)     | (Sentinel client)   |
  |           |                       |                     |
  |  +--------+-----------------------+----------+          |
  |  |            Redis Sentinel Cluster         |          |
  |  |                                           |          |
  |  |  +-------------+    +---------------+     |          |
  |  |  | redis-master |<---| redis-replica |    |          |
  |  |  | (read/write) |    | (read-only    |    |          |
  |  |  | AOF persist. |    |  hot standby) |    |          |
  |  |  +------+------+    +---------------+     |          |
  |  |         |                                  |          |
  |  |  +------+------+------+                   |          |
  |  |  | sentinel-1  | sentinel-2 | sentinel-3  |          |
  |  |  | (monitor)   | (monitor)  | (monitor)   |          |
  |  |  | Quorum: 2/3 to trigger failover        |          |
  |  |  +----------------------------------------+          |
  |  +---------------------------------------------------+  |
  |                                                         |
  |  +---------------------------------------------------+  |
  |  |              watchtower container                  |  |
  |  |    Polls Docker Hub every 30s for new images       |  |
  |  |    Rolling restart (one container at a time)       |  |
  |  +---------------------------------------------------+  |
  +---------------------------------------------------------+

  Security Group: ZERO inbound rules, all outbound allowed
  No public IP, no SSH key, no Elastic IP
```

### How It All Works Together

#### Request Flow
1. User visits `battleship.pbcv.dev` - request hits **Cloudflare's edge** (nearest PoP)
2. Cloudflare terminates SSL and routes through the **Tunnel** to `cloudflared` on EC2
3. `cloudflared` forwards to **nginx** on port 80
4. nginx uses **ip_hash** to route the request to **app-1** or **app-2** (same client always hits the same app for WebSocket session affinity)
5. The app reads/writes game state from **Redis** (shared between both app instances)
6. Socket.IO events are broadcast across instances via the **Redis adapter** (pub/sub)

#### High Availability & Failover

**App failover:**
- Two app instances run behind nginx. If app-1 crashes, nginx routes all traffic to app-2
- Game state is in Redis, not in-memory - so no games are lost when a container restarts
- Socket.IO Redis adapter ensures events reach players regardless of which instance they're on

**Redis failover:**
- Redis master handles all reads/writes with AOF persistence (data survives restarts)
- Redis replica is a hot standby that continuously replicates from master
- 3 Sentinel processes monitor the master. If master goes down:
  - Sentinels detect failure within 5 seconds (`down-after-milliseconds: 5000`)
  - 2 out of 3 sentinels must agree (quorum) before triggering failover
  - Sentinel promotes the replica to master within 10 seconds (`failover-timeout: 10000`)
  - App instances auto-reconnect to the new master via `ioredis` Sentinel client
  - The old master becomes a replica when it comes back up

**Deploy failover:**
- Watchtower does rolling restarts: updates app-1 first, waits for it to be healthy, then updates app-2
- At no point are both app instances down simultaneously

#### Session Persistence
- Player ID stored in browser `localStorage` - survives page refreshes
- Game state (boards, ships, shots, chat) stored in Redis with 1-hour TTL
- On disconnect, server waits 60 seconds before forfeiting (disconnect time stored in Redis, not in-memory timers)
- On reconnect, full game state is restored from Redis: boards, shots, sunk ships, chat history

### Key Design Decisions

- **No public IP, no SSH** - Zero inbound firewall rules. All traffic flows through Cloudflare Tunnel (outbound). Saves ~$3.60/month on Elastic IP and eliminates attack surface.
- **Redis for shared state** - Both app instances share game state via Redis. Games survive container restarts and deploys.
- **Sentinel for Redis HA** - Automatic failover if Redis master dies. No manual intervention needed.
- **Pull-based deploys** - Watchtower pulls new images from Docker Hub. No SSH or public IP needed for deployments.
- **Sticky sessions** - nginx `ip_hash` ensures WebSocket connections always hit the same app instance, reducing cross-instance chatter.
- **No secrets in git** - CF Tunnel token stored in HashiCorp Vault, injected via Terraform at infrastructure creation. GitHub Actions only needs Docker Hub credentials.

### Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Game server | Node.js + Express + Socket.IO | Real-time multiplayer WebSocket game |
| Frontend | Vanilla HTML/CSS/JS | No build step, no framework overhead |
| Sound | Web Audio API | Synthesized effects, no audio files to load |
| State store | Redis 7 (master + replica + 3 sentinels) | Shared game state with automatic failover |
| Cross-instance sync | Socket.IO Redis Adapter | Broadcast events across app instances |
| Reverse proxy | nginx (ip_hash) | Load balancing with WebSocket sticky sessions |
| Containers | Docker + Docker Compose | 10 containers orchestrated together |
| Tunnel | Cloudflare Tunnel (cloudflared) | Secure ingress without public IP |
| Auto-deploy | Watchtower | Polls Docker Hub, rolling restarts |
| IaC | Terraform | EC2, Security Group, all AWS resources |
| CI/CD | GitHub Actions | Build Docker image, push to registry |
| Cloud | AWS EC2 (t3.micro, free tier) | 2 vCPUs, 1 GB RAM, 8 GB gp3 SSD |
| Secrets | HashiCorp Vault | CF Tunnel token at `kv/AWS` |
| Registry | Docker Hub | `pbdaemon/battleship:latest` |

### Container Inventory

| Container | Image | Memory | Purpose |
|-----------|-------|--------|---------|
| app-1 | pbdaemon/battleship | ~50 MB | Game server instance 1 |
| app-2 | pbdaemon/battleship | ~50 MB | Game server instance 2 |
| nginx | nginx:alpine | ~5 MB | Reverse proxy |
| redis-master | redis:7-alpine | ~10 MB | Primary data store (AOF persistence) |
| redis-replica | redis:7-alpine | ~10 MB | Hot standby replica |
| sentinel-1 | redis:7-alpine | ~5 MB | Failover monitor |
| sentinel-2 | redis:7-alpine | ~5 MB | Failover monitor |
| sentinel-3 | redis:7-alpine | ~5 MB | Failover monitor |
| cloudflared | cloudflare/cloudflared | ~30 MB | Tunnel to Cloudflare edge |
| watchtower | containrrr/watchtower | ~15 MB | Auto-deploy on image push |
| **Total** | | **~185 MB** | Fits in t3.micro (1 GB RAM) |

---

## CI/CD Pipeline

```
  Developer pushes to main
           |
           v
  +------------------+
  |  GitHub Actions   |
  |  (ubuntu-latest)  |
  |                   |
  |  1. Checkout code |
  |  2. Docker login  |
  |  3. Build image   |
  |  4. Push to Hub   |
  +--------+---------+
           |
           v
  +------------------+
  |   Docker Hub      |
  |   pbdaemon/       |
  |   battleship      |
  |   :latest         |
  |   :sha-xxxxx      |
  +--------+---------+
           |
           | (Watchtower polls every 30s)
           v
  +------------------+
  |   EC2 Instance    |
  |                   |
  |   Watchtower      |
  |   detects new     |
  |   image digest    |
  |        |          |
  |        v          |
  |   Rolling restart |
  |   app-1 -> app-2  |
  |   (zero downtime) |
  +------------------+
```

**Trigger:** Push to `main` branch (paths: `app/**`, `docker-compose.yml`, `nginx/**`, `.github/workflows/**`)

1. **GitHub Actions** checks out code, builds Docker image from `app/Dockerfile`, pushes to Docker Hub with `latest` and `sha-xxxxx` tags
2. **Watchtower** on EC2 detects the new `latest` image within 30 seconds (compares image digests)
3. **Rolling restart** - Watchtower restarts app-1 first, waits for health check, then restarts app-2. Zero downtime.

---

## Project Structure

```
battleship/
├── app/
│   ├── server.js              # Game server (Express + Socket.IO + Redis)
│   ├── package.json           # Dependencies: socket.io, ioredis, redis-adapter
│   ├── Dockerfile             # Multi-stage Node.js build
│   └── public/
│       ├── index.html          # Game UI (4 screens: menu, placement, battle, gameover)
│       ├── style.css           # Pirate theme, CSS bird animation, responsive design
│       ├── game.js             # Client game logic, board rendering, Socket.IO events
│       ├── sounds.js           # Web Audio API sound engine (cannon, splash, ambient)
│       ├── jack-quotes.js      # 60+ Jack Sparrow quotes by category
│       └── pirates.svg         # SVG sprites (Jack Sparrow, monkey)
├── nginx/
│   └── nginx.conf              # Reverse proxy: ip_hash, WebSocket upgrade, 86400s timeout
├── docker-compose.yml          # 10 containers: 2 apps, nginx, redis cluster, CF tunnel, watchtower
├── terraform/
│   ├── main.tf                 # EC2, Security Group (zero inbound rules)
│   ├── variables.tf            # Region, instance type, CF token
│   ├── outputs.tf              # Instance ID, game URL
│   ├── user-data.sh            # Bootstrap: install Docker, start all containers
│   └── terraform.tfvars        # Variable values (gitignored - contains secrets)
└── .github/
    └── workflows/
        └── deploy.yml          # Build & push to Docker Hub (no SSH deploy needed)
```

---

## Local Development

```bash
cd app
npm install
node server.js
# Open http://localhost:3000
# Note: Redis features require a running Redis instance
# For local dev without Redis, the server falls back gracefully
```

With Redis locally:
```bash
docker run -d -p 6379:6379 redis:7-alpine
cd app && npm install && node server.js
```

## Deploy from Scratch

### Prerequisites

- AWS account with CLI configured (`aws configure`)
- Terraform installed
- Cloudflare Tunnel token (from Cloudflare Zero Trust dashboard)
- Docker Hub account

### Steps

```bash
# 1. Set up Terraform variables
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: set cf_tunnel_token

# 2. Create infrastructure
terraform init
terraform plan    # Review what will be created
terraform apply   # Creates EC2 + Security Group

# 3. Set up GitHub repo secrets
# DOCKERHUB_USERNAME = your Docker Hub username
# DOCKERHUB_TOKEN = Docker Hub access token

# 4. Push code to trigger CI/CD
git push origin main
# GitHub Actions builds image -> Watchtower auto-deploys

# 5. Configure Cloudflare Tunnel hostname
# In Cloudflare Zero Trust dashboard:
# Tunnel -> Public Hostname -> Add:
#   Subdomain: battleship
#   Domain: your-domain.com
#   Service: http://nginx:80

# 6. Visit your game!
# https://battleship.your-domain.com
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |

---

## Debugging (without SSH)

Since the server has no public IP and no SSH access:

- **AWS Systems Manager > Session Manager** - browser-based terminal, no SSH needed
- **EC2 Instance Connect** - requires temporarily adding an SSH rule to the Security Group
- **CloudWatch Logs** - if configured

Common commands via SSM:
```bash
cd /opt/battleship

# Check all containers
docker compose ps

# Follow logs
docker compose logs -f

# Check Redis
docker exec -it battleship-redis-master-1 redis-cli info replication

# Check Sentinel status
docker exec -it battleship-sentinel-1-1 redis-cli -p 26379 sentinel master mymaster

# Check app health
curl localhost:80/health
```
