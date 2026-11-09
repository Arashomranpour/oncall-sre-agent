# Part 2: API Lambda + worker Lambda (SQS-triggered) + HTTP API Gateway

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

data "terraform_remote_state" "data" {
  backend = "local"
  config = {
    path = "../1_data/terraform.tfstate"
  }
}

locals {
  name_prefix = "oncall-sre"

  common_tags = {
    Project   = "oncall-sre-agent"
    Part      = "2_backend"
    ManagedBy = "terraform"
  }

  # Explicit variables win over remote state
  jobs_table_name = var.jobs_table_name != "" ? var.jobs_table_name : try(data.terraform_remote_state.data.outputs.jobs_table_name, "")
  jobs_table_arn  = var.jobs_table_arn != "" ? var.jobs_table_arn : try(data.terraform_remote_state.data.outputs.jobs_table_arn, "")
  sqs_queue_url   = var.sqs_queue_url != "" ? var.sqs_queue_url : try(data.terraform_remote_state.data.outputs.sqs_queue_url, "")
  sqs_queue_arn   = var.sqs_queue_arn != "" ? var.sqs_queue_arn : try(data.terraform_remote_state.data.outputs.sqs_queue_arn, "")

  # Built by backend/package_lambda.py (one zip, two handlers)
  package_path = "${path.module}/../../backend/oncall_sre_lambda.zip"
  package_hash = fileexists(local.package_path) ? filebase64sha256(local.package_path) : null

  shared_env = {
    DEFAULT_AWS_REGION = var.aws_region
    JOBS_TABLE         = local.jobs_table_name
    SQS_QUEUE_URL      = local.sqs_queue_url
    LLM_MODEL          = var.llm_model
  }
}

# ---------- IAM (one role, scoped to exact ARNs) ----------

resource "aws_iam_role" "lambda" {
  name = "${local.name_prefix}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "access" {
  name = "${local.name_prefix}-access"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "JobsTable"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Scan"]
        Resource = local.jobs_table_arn
      },
      {
        Sid      = "InvokeWorkerForByok"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.name_prefix}-worker"
      },
      {
        Sid      = "Queue"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = local.sqs_queue_arn
      }
    ]
  })
}

# ---------- Lambdas ----------

resource "aws_lambda_function" "api" {
  function_name = "${local.name_prefix}-api"
  role          = aws_iam_role.lambda.arn
  handler       = "sre.handlers.api_handler"
  runtime       = "python3.12"
  architectures = ["x86_64"]
  timeout       = 30
  memory_size   = 512

  filename         = local.package_path
  source_code_hash = local.package_hash

  environment {
    variables = merge(local.shared_env, {
      WORKER_FUNCTION = "${local.name_prefix}-worker" # BYOK runs: direct async invoke, key never stored
      CLERK_JWKS_URL  = var.clerk_jwks_url
      CLERK_ISSUER    = var.clerk_issuer
      CORS_ORIGINS    = var.cors_origins
    })
  }

  tags = local.common_tags
}

resource "aws_lambda_function" "worker" {
  function_name = "${local.name_prefix}-worker"
  role          = aws_iam_role.lambda.arn
  handler       = "sre.handlers.worker_handler"
  runtime       = "python3.12"
  architectures = ["x86_64"]
  timeout       = 120
  memory_size   = 512

  filename         = local.package_path
  source_code_hash = local.package_hash

  environment {
    variables = local.shared_env
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${aws_lambda_function.worker.function_name}"
  retention_in_days = 7
  tags              = local.common_tags
}

resource "aws_lambda_event_source_mapping" "worker" {
  event_source_arn = local.sqs_queue_arn
  function_name    = aws_lambda_function.worker.arn
  batch_size       = 1
}

# ---------- HTTP API Gateway -> API Lambda ----------

resource "aws_apigatewayv2_api" "api" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"
  tags          = local.common_tags
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }

  tags = local.common_tags
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
