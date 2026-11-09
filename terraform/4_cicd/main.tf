# Part 4: GitHub Actions deploy role over OIDC (no AWS keys stored in GitHub)

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  common_tags = {
    Project   = "oncall-sre-agent"
    Part      = "4_cicd"
    ManagedBy = "terraform"
  }

  github_owner = split("/", var.github_repository)[0]
  github_repo  = split("/", var.github_repository)[1]

  # GitHub's OIDC "sub" has two exact forms; accept both, main branch only.
  github_subjects = compact([
    "repo:${var.github_repository}:ref:refs/heads/main",
    var.github_owner_id != "" && var.github_repository_id != "" ? "repo:${local.github_owner}@${var.github_owner_id}/${local.github_repo}@${var.github_repository_id}:ref:refs/heads/main" : "",
  ])
}

# An account can have only one GitHub OIDC provider: toggle creation
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags           = local.common_tags
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

resource "aws_iam_role" "github_deploy" {
  name        = "oncall-sre-github-deploy"
  description = "GitHub Actions deploy role for ${var.github_repository} (main branch only)"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = local.github_subjects
        }
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "oncall-sre-deploy"
  role = aws_iam_role.github_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListFrontendBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::oncall-sre-frontend-${local.account_id}"
      },
      {
        Sid      = "WriteFrontendObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::oncall-sre-frontend-${local.account_id}/*"
      },
      {
        Sid      = "InvalidateCdn"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
        Resource = "arn:aws:cloudfront::${local.account_id}:distribution/${var.cloudfront_distribution_id}"
      },
      {
        Sid    = "UpdateLambdaCode"
        Effect = "Allow"
        Action = ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"]
        Resource = [
          for name in ["api", "worker"] :
          "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:oncall-sre-${name}"
        ]
      }
    ]
  })
}
