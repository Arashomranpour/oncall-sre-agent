variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "api_gateway_domain" {
  description = "Override for the API Gateway domain (normally read from 2_backend state)"
  type        = string
  default     = ""
}
