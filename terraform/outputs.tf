# ═══════════════════════════════════════════════════════════════
# OUTPUTS - Values displayed after terraform apply
# ═══════════════════════════════════════════════════════════════

output "instance_id" {
  description = "The ID of the EC2 instance (useful for AWS CLI commands)"
  value       = aws_instance.battleship.id
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
    ║                                                           ║
    ║  1. Wait ~2 min for Docker setup to complete              ║
    ║                                                           ║
    ║  2. Game URL: https://battleship.pbcv.dev                 ║
    ║                                                           ║
    ║  No SSH needed - Watchtower auto-deploys new images       ║
    ║  No public IP - all traffic via Cloudflare Tunnel         ║
    ║                                                           ║
    ║  Debug via AWS Console: SSM Session Manager or            ║
    ║  EC2 Instance Connect (requires adding SSH SG rule)       ║
    ╚═══════════════════════════════════════════════════════════╝
  EOT
}
