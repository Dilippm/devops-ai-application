terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region

  # Tags added automatically to every resource this stack creates.
  default_tags {
    tags = {
      Project     = "devops-ai-application"
      ManagedBy   = "Terraform"
      Stack       = "main"
      Environment = "dev"
    }
  }
}