# This file contains variable definitions for the Terraform configuration.
variable "aws_region" {
  description = "The AWS region to deploy resources in"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "The name of the project"
  type        = string
  default     = "devops-ai-application"
}
variable "stack_name" {
  description = "The name of the stack"
  type        = string
  default     = "devops-ai-stack"
}
variable "environment" {
  description = "The environment for the deployment (e.g., dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "bucket_prefix" {
  description = "The prefix for the S3 bucket name"
  type        = string
  default     = "devops-ai-bootstrap"
}