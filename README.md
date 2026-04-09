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
- **Mobile responsive** - Playable on phones, tablets, and desktops

---

## Infrastructure

### Architecture Overview

```
                    Internet
                       |
                  Cloudflare Edge
                       |
              Cloudflare Tunnel
                  (outbound)
                       |
            +----------+----------+
            |     EC2 Instance    |
            |     (t3.micro)      |
            |                     |
            |  +---------------+  |
            |  |  cloudflared  |  |  <-- outbound tunnel to CF
            |  +-------+-------+  |
            |          |          |
            |  +-------+-------+  |
            |  |     nginx     |  |  <-- reverse proxy, sticky sessions
            |  +---+-------+---+  |
            |      |       |      |
            |  +---+--+ +--+---+ |
            |  |app-1 | |app-2 | |  <-- Node.js + Socket.IO
            |  +------+ +------+ |
            |                     |
            |  +---------------+  |
            |  |  watchtower   |  |  <-- auto-pulls new images
            |  +---------------+  |
            +---------------------+
```

### Key Design Decisions

- **No public IP, no SSH** - The server has zero inbound firewall rules. All traffic flows through Cloudflare Tunnel (outbound connection from EC2 to Cloudflare edge). Saves ~$3.60/month on Elastic IP.
- **Zero-downtime deploys** - Watchtower polls Docker Hub every 30 seconds, detects new images, and performs rolling restarts automatically.
- **Sticky sessions** - nginx uses `ip_hash` to ensure WebSocket connections from the same client always hit the same app instance (required for Socket.IO).
- **No secrets in git** - CF Tunnel token stored in HashiCorp Vault, injected at infrastructure creation via Terraform. GitHub Actions only needs Docker Hub credentials.

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Game server | Node.js + Express + Socket.IO |
| Frontend | Vanilla HTML/CSS/JS |
| Sound | Web Audio API (synthesized, no audio files) |
| Reverse proxy | nginx (ip_hash sticky sessions) |
| Containers | Docker + Docker Compose |
| Tunnel | Cloudflare Tunnel (cloudflared) |
| Auto-deploy | Watchtower |
| IaC | Terraform |
| CI/CD | GitHub Actions |
| Cloud | AWS EC2 (t3.micro, free tier) |
| Secrets | HashiCorp Vault |
| Registry | Docker Hub |

---

## CI/CD Pipeline

```
  Push to main
       |
       v
  GitHub Actions
  (build & push)
       |
       v
  Docker Hub
  (pbdaemon/battleship:latest)
       |
       v
  Watchtower on EC2
  (polls every 30s)
       |
       v
  Rolling restart
  (app-1 -> app-2)
```

1. **Push code** to the `main` branch (triggers on changes to `app/`, `docker-compose.yml`, `nginx/`, `.github/workflows/`)
2. **GitHub Actions** builds the Docker image and pushes to Docker Hub with `latest` and `sha-xxxxx` tags
3. **Watchtower** on EC2 detects the new `latest` image within 30 seconds
4. **Rolling restart** - Watchtower restarts containers one at a time for zero downtime

---

## Project Structure

```
battleship/
├── app/
│   ├── server.js              # Game server (Express + Socket.IO)
│   ├── package.json
│   ├── Dockerfile
│   └── public/
│       ├── index.html          # Game UI (4 screens: menu, placement, battle, gameover)
│       ├── style.css           # Pirate theme, animations, responsive design
│       ├── game.js             # Client game logic, board rendering, Socket.IO events
│       ├── sounds.js           # Web Audio API sound engine
│       ├── jack-quotes.js      # 60+ Jack Sparrow quotes by category
│       └── pirates.svg         # SVG sprites (Jack Sparrow, monkey)
├── nginx/
│   └── nginx.conf              # Reverse proxy with WebSocket support
├── docker-compose.yml          # app-1, app-2, nginx, cloudflared, watchtower
├── terraform/
│   ├── main.tf                 # EC2, Security Group (zero inbound rules)
│   ├── variables.tf            # Region, instance type, CF token
│   ├── outputs.tf              # Instance ID, game URL
│   ├── user-data.sh            # Bootstrap: install Docker, start containers
│   └── terraform.tfvars        # Variable values (gitignored)
└── .github/
    └── workflows/
        └── deploy.yml          # Build & push to Docker Hub
```

---

## Local Development

```bash
cd app
npm install
node server.js
# Open http://localhost:3000
```

## Deploy from Scratch

### Prerequisites

- AWS account with CLI configured (`aws configure`)
- Terraform installed
- Cloudflare Tunnel token
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
# https://your-domain.com
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |

---

## Debugging (without SSH)

Since the server has no public IP and no SSH access, use AWS Console:

- **AWS Systems Manager > Session Manager** - terminal access without SSH
- **EC2 Instance Connect** - requires temporarily adding an SSH rule to the Security Group
- **CloudWatch Logs** - if configured

To check container status via SSM:
```bash
cd /opt/battleship && docker compose ps
docker compose logs -f
```
