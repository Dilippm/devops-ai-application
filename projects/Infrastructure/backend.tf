terraform {
  backend "s3" {
    bucket       = "devops-ai-bootstrap-484907528737"
    key          = "infrastructure/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}