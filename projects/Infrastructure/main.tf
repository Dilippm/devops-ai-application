# This file contains the main Terraform configuration for the infrastructure project.
#the mmodules are defined in the modules folder and are called here to create the resources.
module "vpc" {
  source = "./modules/vpc"

  vpc_name           = var.vpc_name
  cidr_block         = var.vpc_cidr
  subnet_cidrs       = [for s in var.subnets : s.cidr_block]
  availability_zones = [for s in var.subnets : s.availability_zone]
  cluster_name       = var.cluster_name
}

module "ecr" {
  source = "./modules/ecr"

  repositories = var.repositories
}