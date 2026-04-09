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
- **Persistent sessions** - Refresh your browser without losing game progress (60-second reconnect window)
- **High availability** - Two app replicas with Redis shared state. If one container fails, the other picks up all active games with zero data loss
- **Mobile responsive** - Playable on phones, tablets, and desktops

---

## Infrastructure

### Architecture Overview

```
    User Browser
         |
         | HTTPS (443)
         v
  +------+------+
  |  Cloudflare  |    CDN edge (SSL termination, DDoS protection)
  |    Edge      |    Domain: battleship.pbcv.dev
  +------+------+
         |
         | Cloudflare Tunnel (encrypted, outbound-only)
         | No public IP needed - cloudflared initiates connection FROM EC2
         v
  +------+---------------------------------------------------+
  |  AWS EC2 Instance (t3.micro, eu-west-1)                   |
  |  Amazon Linux 2023 | 2 vCPU, 1GB RAM | Free Tier          |
  |  Security Group: ZERO inbound rules (fully locked down)   |
  |                                                           |
  |  +-----------------------------------------------------+ |
  |  |  Docker Compose (6 containers)                       | |
  |  |                                                      | |
  |  |  +--------------+                                    | |
  |  |  | cloudflared  |  Tunnel agent - connects outbound  | |
  |  |  |              |  to Cloudflare edge network        | |
  |  |  +------+-------+                                    | |
  |  |         |                                            | |
  |  |         v                                            | |
  |  |  +------+-------+                                    | |
  |  |  |    nginx     |  Reverse proxy + load balancer     | |
  |  |  |              |  ip_hash sticky sessions for       | |
  |  |  |              |  WebSocket/Socket.IO affinity      | |
  |  |  +---+------+---+                                    | |
  |  |      |      |                                        | |
  |  |      v      v                                        | |
  |  |  +---+--+ +-+----+                                   | |
  |  |  |app-1 | |app-2 |  Node.js + Express + Socket.IO    | |
  |  |  |:3000 | |:3000 |  Two replicas for high            | |
  |  |  |      | |      |  availability & zero-downtime     | |
  |  |  +---+--+ +-+----+  deploys (rolling restart)        | |
  |  |      |      |                                        | |
  |  |      v      v                                        | |
  |  |  +---+------+---+                                    | |
  |  |  |    redis     |  Shared game state, chat logs,     | |
  |  |  |   (7-alpine) |  player sessions. Persisted to     | |
  |  |  |              |  disk via Docker volume. Socket.IO  | |
  |  |  |              |  Redis adapter syncs events        | |
  |  |  |              |  between app-1 and app-2           | |
  |  |  +--------------+                                    | |
  |  |                                                      | |
  |  |  +--------------+                                    | |
  |  |  | watchtower   |  Polls Docker Hub every 30s for    | |
  |  |  |              |  new images. Auto rolling-restart  | |
  |  |  |              |  when new version detected.        | |
  |  |  |              |  Replaces SSH-based deploys.       | |
  |  |  +--------------+                                    | |
  |  +-----------------------------------------------------+ |
  +-----------------------------------------------------------+
```

### How It All Works

1. **User visits `battleship.pbcv.dev`** - Cloudflare routes the request through an encrypted tunnel to the EC2 instance. The tunnel is outbound-only (initiated by cloudflared on EC2), so the server needs zero open ports.

2. **nginx receives the request** and routes it to one of two app instances using `ip_hash` sticky sessions. This ensures the same player always hits the same app, which is required for WebSocket (Socket.IO) connections to stay alive.

3. **app-1 and app-2** are identical Node.js game servers. They handle all game logic: lobby, ship placement, firing, chat, and Jack Sparrow commentary. Both instances read/write game state to Redis, so they share the same data.

4. **Redis** stores all game state (boards, shots, ships, chat history, player sessions). This means:
   - If app-1 crashes or restarts, app-2 can serve all players with no data loss
   - During rolling deployments, active games continue uninterrupted
   - The Socket.IO Redis adapter ensures real-time events (hits, chat) reach both players even if they're connected to different app instances

5. **Watchtower** monitors Docker Hub for new `pbdaemon/battleship:latest` images. When a new version is pushed (by GitHub Actions), Watchtower detects it within 30 seconds and performs a rolling restart - updating one app container at a time so the game never goes down.

### Key Design Decisions

- **No public IP, no SSH** - The server has zero inbound firewall rules. All traffic flows through Cloudflare Tunnel (outbound connection from EC2 to Cloudflare edge). Saves ~$3.60/month on Elastic IP and eliminates attack surface.
- **Zero-downtime deploys** - Watchtower polls Docker Hub every 30 seconds, detects new images, and performs rolling restarts automatically. No SSH needed.
- **Sticky sessions** - nginx uses `ip_hash` to ensure WebSocket connections from the same client always hit the same app instance (required for Socket.IO).
- **Redis shared state** - Game state stored in Redis so both app instances share it. If one container restarts or fails, the other picks up active games with no data loss. Socket.IO Redis adapter syncs real-time events across instances.
- **No secrets in git** - CF Tunnel token stored in HashiCorp Vault (`vault.pbcv.dev`), injected at infrastructure creation via Terraform. GitHub Actions only needs Docker Hub credentials. The repo is public.

### Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Game server | Node.js + Express + Socket.IO | Real-time multiplayer game logic |
| Frontend | Vanilla HTML/CSS/JS | Game UI, animations, board rendering |
| Sound | Web Audio API | Synthesized cannon/ocean sounds (no audio files) |
| Session store | Redis 7 Alpine | Shared game state + Socket.IO adapter |
| Reverse proxy | nginx Alpine | Load balancing with ip_hash sticky sessions |
| Containers | Docker + Docker Compose | 6 containers orchestrated together |
| Tunnel | Cloudflare Tunnel (cloudflared) | Secure ingress without public IP |
| Auto-deploy | Watchtower | Pull-based deploys from Docker Hub |
| IaC | Terraform | EC2, Security Group, provisioning |
| CI/CD | GitHub Actions | Build Docker image, push to registry |
| Cloud | AWS EC2 (t3.micro, free tier) | Compute (eu-west-1, Ireland) |
| Secrets | HashiCorp Vault | CF Tunnel token at `kv/data/AWS` |
| Registry | Docker Hub | `pbdaemon/battleship` image |

### What Terraform Creates

| Resource | Description |
|----------|-------------|
| `aws_security_group` | Firewall with zero inbound rules, all outbound allowed |
| `aws_instance` (t3.micro) | EC2 running Amazon Linux 2023 with Docker |
| `user-data.sh` | Bootstrap script: installs Docker, writes docker-compose.yml + nginx.conf, pulls images, starts all 6 containers |

No Elastic IP, no SSH key pair, no NAT Gateway. Minimal resources = minimal cost.

---

## CI/CD Pipeline

```
  Developer pushes to main
         |
         v
  +------+------+
  | GitHub      |  Trigger: push to main (app/**, docker-compose.yml,
  | Actions     |  nginx/**, .github/workflows/**)
  +------+------+
         |
         | docker build + push
         v
  +------+------+
  | Docker Hub  |  Tags: pbdaemon/battleship:latest
  |             |         pbdaemon/battleship:sha-<commit>
  +------+------+
         |
         | Watchtower polls every 30s
         v
  +------+------+
  | EC2         |  Watchtower detects new :latest
  | Watchtower  |  Rolling restart: app-1 -> app-2
  +-------------+  Game sessions preserved in Redis
```

1. **Push code** to the `main` branch (triggers on changes to `app/`, `docker-compose.yml`, `nginx/`, `.github/workflows/`)
2. **GitHub Actions** builds the Docker image and pushes to Docker Hub with `latest` and `sha-xxxxx` tags
3. **Watchtower** on EC2 detects the new `latest` image within 30 seconds
4. **Rolling restart** - Watchtower restarts containers one at a time for zero downtime
5. **Redis preserves state** - active games continue uninterrupted during deploys

---

## Project Structure

```
battleship/
├── app/
│   ├── server.js              # Game server (Express + Socket.IO + Redis)
│   ├── package.json
│   ├── Dockerfile             # Multi-stage build (deps + runtime)
│   └── public/
│       ├── index.html          # Game UI (4 screens: menu, placement, battle, gameover)
│       ├── style.css           # Pirate theme, CSS animations, responsive design
│       ├── game.js             # Client game logic, board rendering, Socket.IO events
│       ├── sounds.js           # Web Audio API sound engine (synthesized effects)
│       ├── jack-quotes.js      # 60+ Jack Sparrow quotes by category
│       └── pirates.svg         # SVG sprites (Jack Sparrow, monkey)
├── nginx/
│   └── nginx.conf              # Reverse proxy with WebSocket support + ip_hash
├── docker-compose.yml          # 6 containers: redis, app-1, app-2, nginx, cloudflared, watchtower
├── terraform/
│   ├── main.tf                 # EC2, Security Group (zero inbound rules)
│   ├── variables.tf            # Region, instance type, CF token
│   ├── outputs.tf              # Instance ID, game URL
│   ├── user-data.sh            # Bootstrap: install Docker, start all containers
│   └── terraform.tfvars        # Variable values (gitignored, contains CF token)
└── .github/
    └── workflows/
        └── deploy.yml          # Build & push to Docker Hub (Watchtower handles deploy)
```

---

## Local Development

```bash
cd app
npm install
node server.js
# Open http://localhost:3000
# Note: requires Redis running locally (redis-server) or set REDIS_URL
```

With Docker (full stack):
```bash
docker compose up --build
# Open http://localhost:80
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
# Edit terraform.tfvars with your CF tunnel token

# 2. Create infrastructure
terraform init
terraform plan
terraform apply

# 3. Push code to trigger CI/CD
git push origin main
# GitHub Actions builds image -> Watchtower deploys automatically

# 4. Visit your game
# https://your-domain.com (after Cloudflare Tunnel is configured)
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |

---

## Debugging (without SSH)

Since the server has no public IP and no SSH access, use AWS Console:

- **AWS Systems Manager > Session Manager** - terminal access without SSH or open ports
- **EC2 Instance Connect** - requires temporarily adding an SSH rule to the Security Group
- **CloudWatch Logs** - if configured

To check container status via SSM:
```bash
cd /opt/battleship && docker compose ps
docker compose logs -f
docker compose logs redis    # check Redis
docker compose logs app-1    # check app instance
docker compose logs watchtower  # check auto-deploy status
```
