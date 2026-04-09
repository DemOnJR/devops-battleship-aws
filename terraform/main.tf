# ═══════════════════════════════════════════════════════════════
# BATTLESHIP GAME - AWS INFRASTRUCTURE
# ═══════════════════════════════════════════════════════════════
# Creates: SSH Key, Security Group, EC2 instance, Elastic IP
# Cost: $0/month (free tier)
#
# Usage:
#   terraform init    - download provider plugins
#   terraform plan    - preview changes
#   terraform apply   - create infrastructure
#   terraform destroy - tear everything down
# ═══════════════════════════════════════════════════════════════

# ─── PROVIDER ────────────────────────────────────────────────
# Tells Terraform to use AWS. Credentials come from:
#   export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
#   or: aws configure
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# ─── SSH KEY PAIR ────────────────────────────────────────────
# Generates an SSH key pair so you can connect to the server.
# Private key = stays on your machine (.pem file)
# Public key = goes to AWS, placed on EC2 instance
resource "tls_private_key" "battleship" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

# Register public key with AWS
resource "aws_key_pair" "battleship" {
  key_name   = var.key_name
  public_key = tls_private_key.battleship.public_key_openssh
  tags = { Name = "${var.project_name}-key", Project = var.project_name }
}

# Save private key locally (chmod 0400 = read-only, SSH requires this)
resource "local_file" "private_key" {
  content         = tls_private_key.battleship.private_key_pem
  filename        = "${path.module}/${var.key_name}.pem"
  file_permission = "0400"
}

# ─── DEFAULT VPC ─────────────────────────────────────────────
# Every AWS account has a default VPC (Virtual Private Cloud).
# VPC = your isolated network in AWS. Using the default saves cost.
data "aws_vpc" "default" {
  default = true
}

# ─── SECURITY GROUP (Firewall) ───────────────────────────────
# Controls what traffic can reach your EC2 instance.
# Ingress = inbound rules, Egress = outbound rules
resource "aws_security_group" "battleship" {
  name        = "${var.project_name}-sg"
  description = "Firewall for Battleship game server"
  vpc_id      = data.aws_vpc.default.id

  # Allow SSH (port 22) from anywhere - for server management
  ingress {
    description = "SSH access - for managing the server"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow HTTP (port 80) - for testing directly via IP
  ingress {
    description = "HTTP - for testing and health checks"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow all outbound - server needs to pull Docker images, connect to CF, etc.
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-sg", Project = var.project_name }
}

# ─── AMI (Operating System Image) ───────────────────────────
# Finds the latest Amazon Linux 2023 AMI automatically.
# AMI = template that defines what OS your server runs.
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
  filter {
    name   = "state"
    values = ["available"]
  }
}

# ─── EC2 INSTANCE ────────────────────────────────────────────
# The virtual server that runs your game.
# t3.micro = 2 vCPUs, 1 GB RAM, free tier eligible (750 hrs/month)
# user_data = script that runs on first boot (installs Docker, starts app)
resource "aws_instance" "battleship" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.battleship.key_name
  vpc_security_group_ids = [aws_security_group.battleship.id]

  # 8GB SSD storage (free tier gives 30GB)
  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
    tags        = { Name = "${var.project_name}-volume" }
  }

  # Bootstrap script - installs Docker and starts the app
  user_data = templatefile("${path.module}/user-data.sh", {
    cf_tunnel_token = var.cf_tunnel_token
  })

  lifecycle {
    ignore_changes = [user_data]
  }

  tags = { Name = "${var.project_name}-server", Project = var.project_name }
}

# ─── ELASTIC IP ──────────────────────────────────────────────
# Static public IP - stays the same even if you restart the instance.
# Free while attached to a running instance.
resource "aws_eip" "battleship" {
  instance = aws_instance.battleship.id
  domain   = "vpc"
  tags     = { Name = "${var.project_name}-eip", Project = var.project_name }
}
