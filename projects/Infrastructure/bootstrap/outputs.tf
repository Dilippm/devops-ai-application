# This file exposes values from main.tf so they are printed after apply
# and can be copied into the main infrastructure's backend.tf.

output "account_id" {
  value = data.aws_caller_identity.current.account_id
}
output "state_bucket_name" {
  description = "Name of the S3 bucket that stores Terraform state"
  value       = aws_s3_bucket.bootstrap_bucket.bucket
}

output "state_bucket_arn" {
  description = "ARN of the S3 state bucket (used in IAM policies)"
  value       = aws_s3_bucket.bootstrap_bucket.arn
}

output "state_bucket_region" {
  description = "Region where the state bucket lives (needed in backend.tf)"
  value       = aws_s3_bucket.bootstrap_bucket.region
}
