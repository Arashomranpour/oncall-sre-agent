output "api_gateway_url" {
  value = aws_apigatewayv2_api.api.api_endpoint
}

output "api_gateway_domain" {
  value = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")
}

output "api_function_name" {
  value = aws_lambda_function.api.function_name
}

output "worker_function_name" {
  value = aws_lambda_function.worker.function_name
}

output "setup_instructions" {
  value = <<-EOT
    API: ${aws_apigatewayv2_api.api.api_endpoint}/api/health
    Auth: ${var.clerk_jwks_url != "" ? "Clerk JWT required" : "WARNING: no Clerk configured, the API is open"}
    Engine: rule-based by default; visitors can paste their own Groq key for live LLM agents (never stored)
    Next: deploy terraform/3_frontend.
  EOT
}
