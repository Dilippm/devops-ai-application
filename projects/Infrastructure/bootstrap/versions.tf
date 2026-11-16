# This file is used to define the required Terraform version and providers for the project. 
#It ensures that the correct versions are used when running Terraform commands, preventing compatibility issues.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}