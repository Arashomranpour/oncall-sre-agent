variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-1"
}

# Optional overrides for values normally read from 1_data remote state
variable "jobs_table_name" {
  type    = string
  default = ""
}

variable "jobs_table_arn" {
  type    = string
  default = ""
}

variable "sqs_queue_url" {
  type    = string
  default = ""
}

variable "sqs_queue_arn" {
  type    = string
  default = ""
}

variable "llm_model" {
  description = "LiteLLM model id used for bring-your-own-key runs (visitors supply their own key; none is stored)"
  type        = string
  default     = "groq/openai/gpt-oss-120b"
}

variable "clerk_jwks_url" {
  description = "https://<instance>.clerk.accounts.dev/.well-known/jwks.json. Empty = no auth (do not do this for a public URL)."
  type        = string
  default     = ""
}

variable "clerk_issuer" {
  type    = string
  default = ""
}

variable "cors_origins" {
  description = "Comma-separated allowed origins (add the CloudFront URL after Part 3)"
  type        = string
  default     = "http://localhost:3000"
}
