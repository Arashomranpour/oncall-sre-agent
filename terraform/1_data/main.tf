# Part 1: job table (DynamoDB, pay per request) + work queue (SQS) with a dead-letter queue

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Local backend: state lives in terraform.tfstate here (gitignored)
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  name_prefix = "oncall-sre"

  common_tags = {
    Project   = "oncall-sre-agent"
    Part      = "1_data"
    ManagedBy = "terraform"
  }
}

resource "aws_dynamodb_table" "jobs" {
  name         = "${local.name_prefix}-jobs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = local.common_tags
}

# Messages that fail 3 times land here instead of looping forever
resource "aws_sqs_queue" "dlq" {
  name                      = "${local.name_prefix}-jobs-dlq"
  message_retention_seconds = 1209600
  tags                      = local.common_tags
}

resource "aws_sqs_queue" "jobs" {
  name                       = "${local.name_prefix}-jobs"
  visibility_timeout_seconds = 180 # must exceed the worker Lambda timeout
  message_retention_seconds  = 86400

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.common_tags
}
