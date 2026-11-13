# Creates the S3 bucket that stores Terraform state for the main infrastructure.

# This data source retrieves information about the AWS account and user making the request. 
#It can be used to get the account ID, user ARN, and other details.
data "aws_caller_identity" "current" {}

# This resource creates an S3 bucket to store the Terraform state for the project.
resource "aws_s3_bucket" "bootstrap_bucket" {
  bucket = "${var.bucket_prefix}-${data.aws_caller_identity.current.account_id}"
  force_destroy = true

}
# This resource enables versioning for the S3 bucket, allowing multiple versions of objects to be stored.
resource "aws_s3_bucket_versioning" "bootstrap_bucket" {
  bucket = aws_s3_bucket.bootstrap_bucket.id

  versioning_configuration {
    status = "Enabled"
  }
}
# This resource configures server-side encryption for the S3 bucket, ensuring that all objects stored in the bucket are encrypted using AES256.
resource "aws_s3_bucket_server_side_encryption_configuration" "bootstrap_bucket" {
  bucket = aws_s3_bucket.bootstrap_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
# This resource sets up a public access block for the S3 bucket, preventing public access to the bucket and its objects.
resource "aws_s3_bucket_public_access_block" "bootstrap_bucket" {
  bucket = aws_s3_bucket.bootstrap_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}