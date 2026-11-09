variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "github_repository" {
  description = "owner/repo allowed to deploy, e.g. Arashomranpour/oncall-sre-agent"
  type        = string
}

variable "github_owner_id" {
  description = "Numeric owner id: gh api repos/<owner>/<repo> --jq .owner.id"
  type        = string
  default     = ""
}

variable "github_repository_id" {
  description = "Numeric repo id: gh api repos/<owner>/<repo> --jq .id"
  type        = string
  default     = ""
}

variable "cloudfront_distribution_id" {
  description = "From 3_frontend output cloudfront_distribution_id"
  type        = string
}

variable "create_oidc_provider" {
  description = "false if this account already has the GitHub OIDC provider"
  type        = bool
  default     = true
}
