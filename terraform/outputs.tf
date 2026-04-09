# ═══════════════════════════════════════════════════════════════
# OUTPUTS - Values displayed after terraform apply
# ═══════════════════════════════════════════════════════════════
# Outputs are like return values. After terraform apply finishes,
# these values are printed to your terminal. You can also access
# them with: terraform output <name>

output "instance_id" {
  description = "The ID of the EC2 instance (useful for AWS CLI commands)"
  value       = aws_instance.battleship.id
}

output "public_ip" {
  description = "The public IP of the server (Elastic IP)"
  value       = aws_eip.battleship.public_ip
}

output "ssh_command" {
  description = "Copy-paste this to SSH into your server"
  value       = "ssh -i ${var.key_name}.pem ec2-user@${aws_eip.battleship.public_ip}"
}

output "ssh_key_file" {
  description = "Path to the generated SSH private key"
  value       = "${var.key_name}.pem"
}

output "game_url" {
  description = "The URL where your game will be accessible"
  value       = "https://battleship.pbcv.dev"
}

output "next_steps" {
  description = "What to do after terraform apply"
  value       = <<-EOT

    ╔═══════════════════════════════════════════════════════════╗
    ║  NEXT STEPS:                                              ║
    ║  1. SSH into the server:                                  ║
    ║     ssh -i ${var.key_name}.pem ec2-user@${aws_eip.battleship.public_ip}
    ║                                                           ║
    ║  2. Wait ~2 min for Docker setup to complete              ║
    ║     Check progress: sudo cloud-init status                ║
    ║                                                           ║
    ║  3. Check containers: cd /opt/battleship && docker compose ps
    ║                                                           ║
    ║  4. Game URL: https://battleship.pbcv.dev                 ║
    ╚═══════════════════════════════════════════════════════════╝
  EOT
}
