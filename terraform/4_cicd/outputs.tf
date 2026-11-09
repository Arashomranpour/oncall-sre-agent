output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "setup_instructions" {
  value = <<-EOT
    Set repository variables (not secrets):
      gh variable set AWS_ROLE_ARN --body ${aws_iam_role.github_deploy.arn}
      gh variable set AWS_REGION --body ${var.aws_region}
      gh variable set FRONTEND_BUCKET --body oncall-sre-frontend-${local.account_id}
      gh variable set CLOUDFRONT_DISTRIBUTION_ID --body ${var.cloudfront_distribution_id}
  EOT
}
