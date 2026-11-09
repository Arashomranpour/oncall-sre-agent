output "jobs_table_name" {
  value = aws_dynamodb_table.jobs.name
}

output "jobs_table_arn" {
  value = aws_dynamodb_table.jobs.arn
}

output "sqs_queue_url" {
  value = aws_sqs_queue.jobs.id
}

output "sqs_queue_arn" {
  value = aws_sqs_queue.jobs.arn
}

output "setup_instructions" {
  value = <<-EOT
    Part 1 deployed in account ${data.aws_caller_identity.current.account_id}.
    Next: package the backend (cd backend && uv run python package_lambda.py), then deploy terraform/2_backend.
  EOT
}
