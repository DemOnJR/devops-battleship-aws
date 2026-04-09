# ═══════════════════════════════════════════════════════════════
# VARIABLES - Input values for our Terraform configuration
# ═══════════════════════════════════════════════════════════════
# Variables make your Terraform code reusable. Instead of hardcoding
# values, you define them here and reference them as var.name_here.
# You can override them via command line: terraform apply -var="region=eu-west-1"
# Or via a terraform.tfvars file.

variable "region" {
  description = "AWS region to deploy into. us-east-1 has the most free tier services."
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = <<-EOT
    EC2 instance type. t3.micro is free tier eligible (750 hrs/month for 12 months).
    t3.micro = 2 vCPUs, 1 GB RAM — plenty for a Node.js game server.
    If you need more power later, just change this value and terraform apply.
  EOT
  type        = string
  default     = "t3.micro"
}

variable "key_name" {
  description = "Name for the SSH key pair. You'll use this to SSH into the server."
  type        = string
  default     = "battleship-key"
}

variable "cf_tunnel_token" {
  description = "Cloudflare Tunnel token for connecting to CF network"
  type        = string
  sensitive   = true # Marks this as secret — won't show in terraform plan output
}

variable "project_name" {
  description = "Name tag for all resources — makes them easy to find in AWS console"
  type        = string
  default     = "battleship"
}
