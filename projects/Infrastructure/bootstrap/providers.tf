# This file contains the provider configuration for AWS. 
#It specifies the region and default tags to be applied to all resources managed by Terraform in this project.
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      ManagedBy   = "Terraform"
      Stack       = var.stack_name
      Environment = var.environment
    }
  }
}