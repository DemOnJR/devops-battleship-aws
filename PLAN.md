# Battleship Game - Project Plan

## Overview
A multiplayer Battleship browser game with a Pirates of the Caribbean / Jack Sparrow comedy theme.
Deployed on AWS using Terraform, served via Cloudflare Tunnel on `battleship.pbcv.dev`.

---

## 1. Game Features

- **Multiplayer Battleship**: Classic 10x10 grid, place ships, take turns firing
- **Matchmaking**: Create a game with an invite link OR join a random queue
- **In-game Chat**: Players can chat during the game
- **Jack Sparrow Auto-Comments**: When a player hits or misses, Jack Sparrow drops a funny pirate-themed comment in the chat automatically
- **Pirate Theme**: Full Pirates of the Caribbean visual style - wooden textures, compass, treasure map vibes

---

## 2. Tech Stack

| Layer          | Technology                        |
|----------------|-----------------------------------|
| Frontend       | HTML5, CSS3, Vanilla JS (no framework needed for a simple game) |
| Backend        | Node.js + Express + Socket.IO     |
| Real-time      | WebSockets via Socket.IO          |
| Containerization | Docker + Docker Compose          |
| Reverse Proxy  | Nginx (load balances between 2 app replicas) |
| Tunnel         | Cloudflare Tunnel (cloudflared)   |
| Infrastructure | Terraform on AWS                  |
| OS             | Amazon Linux 2023 (free tier AMI) |

---

## 3. Infrastructure Architecture

```
                    Internet
                       |
              [Cloudflare Network]
                       |
              [CF Tunnel (cloudflared)]
                       |
            ------[Nginx :80]------
           |                       |
     [App Container 1]      [App Container 2]
        (Node.js:3000)        (Node.js:3001)
```

### How It Works (DevOps Learning Notes)

#### Terraform
Terraform is an Infrastructure-as-Code (IaC) tool. Instead of clicking around in the AWS console,
you write `.tf` files that describe what you want, and Terraform creates/updates/destroys it for you.

- `terraform init` - Downloads provider plugins (like the AWS provider)
- `terraform plan` - Shows what will be created/changed/destroyed (dry run)
- `terraform apply` - Actually creates the infrastructure
- `terraform destroy` - Tears everything down

#### AWS Resources We Create

1. **VPC (Virtual Private Cloud)** - Your own isolated network in AWS. Think of it as your private
   data center. We use the default VPC to save costs.

2. **Security Group** - A firewall for your EC2 instance. We allow:
   - Port 22 (SSH) - so you can connect to the server
   - Port 80 (HTTP) - for the web traffic (CF tunnel connects here internally)
   - All outbound traffic - so the server can download packages, connect to CF, etc.

3. **EC2 Instance (t3.micro)** - A virtual server. t3.micro gives you:
   - 2 vCPUs, 1 GB RAM - enough for our game
   - Free tier eligible for 12 months
   - We use Amazon Linux 2023 (lightweight, optimized for AWS)

4. **Key Pair** - SSH key to securely connect to your instance

5. **Elastic IP** - A static public IP that stays the same even if you restart the instance.
   (Note: Free while attached to a running instance, $3.65/month if instance is stopped)

#### Docker Compose Setup

- **nginx** container: Receives all traffic on port 80, load-balances between 2 app containers.
  If one app container dies, nginx sends traffic to the healthy one = zero downtime.
- **app-1** container: First instance of our Node.js game server (port 3000)
- **app-2** container: Second instance of our Node.js game server (port 3001)
- **cloudflared** container: Establishes a secure tunnel to Cloudflare's network, so traffic
  from battleship.pbcv.dev reaches our nginx without exposing any ports to the internet.

#### Cloudflare Tunnel
Instead of opening ports to the internet and managing SSL certificates, CF Tunnel creates an
outbound-only connection from your server to Cloudflare. Cloudflare handles SSL, DDoS protection,
and routes traffic through the tunnel to your nginx. This means:
- No need for a public IP exposed to the internet
- Free SSL/TLS
- DDoS protection included
- The security group doesn't even need port 80 open to the world

#### Zero Downtime Strategy
- 2 app containers behind nginx with health checks
- To update: restart one container at a time (rolling restart)
- Nginx automatically stops sending traffic to unhealthy containers
- Socket.IO has reconnection built-in, so players auto-reconnect if their container restarts

---

## 4. Cost Breakdown (Estimated Monthly)

| Resource              | Cost          |
|-----------------------|---------------|
| EC2 t3.micro          | FREE (12 months free tier) |
| Elastic IP (attached) | FREE          |
| EBS Storage (8GB gp3) | FREE (30GB free tier) |
| Data Transfer         | FREE (100GB/month free tier) |
| Cloudflare Tunnel     | FREE          |
| **Total**             | **$0/month** (within free tier) |

After free tier expires: ~$8.50/month for t3.micro on-demand.

---

## 5. Directory Structure

```
battleship/
  PLAN.md                  # This file
  terraform/
    main.tf                # Main infrastructure definition
    variables.tf           # Input variables
    outputs.tf             # Output values (IP, instance ID, etc.)
    user-data.sh           # Bootstrap script that runs on EC2 first boot
  docker/
    docker-compose.yml     # Defines all containers
    nginx/
      nginx.conf           # Nginx load balancer config
    app/
      Dockerfile           # How to build the game container
      package.json         # Node.js dependencies
      server.js            # Game server (Express + Socket.IO)
      public/
        index.html         # Main game page
        style.css          # Pirate-themed styles
        game.js            # Client-side game logic
        jack-quotes.js     # Jack Sparrow quotes database
```

---

## 6. Deployment Steps

1. `cd terraform && terraform init && terraform apply` - Create AWS infra
2. SSH into the EC2 instance
3. Clone/copy the docker directory to the server
4. `docker compose up -d` - Start everything
5. Verify at https://battleship.pbcv.dev

---

## 7. Jack Sparrow Comedy System

Jack auto-comments in chat based on game events:
- **Hit**: "You sunk me... wait, that's not my ship. Carry on!" / "That's got to be the best shot I've ever seen!"
- **Miss**: "You missed?! I could've hit that blindfolded... and drunk... which I usually am."
- **Sunk a ship**: "That ship had rum on it, you monster!"
- **Game start**: "This is the day you will always remember as the day you almost beat Captain Jack Sparrow!"
- **Game over**: "The problem is not the problem. The problem is your attitude about the problem. Savvy?"
- **Idle too long**: "Are you going to shoot or just stare at the sea like a confused pelican?"

30+ unique quotes per category for variety.
