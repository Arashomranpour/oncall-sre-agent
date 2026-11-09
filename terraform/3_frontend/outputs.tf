output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "s3_bucket_name" {
  value = aws_s3_bucket.frontend.id
}

output "setup_instructions" {
  value = <<-EOT
    Live URL: https://${aws_cloudfront_distribution.main.domain_name}
    1. Add that URL to cors_origins in terraform/2_backend/terraform.tfvars and re-apply 2_backend.
    2. Build and upload the site:
       cd frontend && NODE_ENV=production npm run build
       aws s3 sync out/ s3://${aws_s3_bucket.frontend.id}/ --delete
       aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.main.id} --paths "/*"
  EOT
}
