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

# The eks module is called to create the EKS cluster and node group.
module "eks" {
  source = "./modules/eks"

  cluster_name    = var.cluster_name
  node_group_name = var.node_group_name

  instance_types = var.instance_types
  min_size       = var.min_size
  desired_size   = var.desired_size
  max_size       = var.max_size
  capacity_type  = var.capacity_type
  disk_size      = var.disk_size
  subnet_ids     = module.vpc.subnet_ids
  depends_on     = [module.vpc]
}

module "ecr" {
  source = "./modules/ecr"

  repositories = var.repositories
}


## Kubernetes and Helm Providers
# The kubernetes provider is configured to connect to the EKS cluster using the cluster endpoint, certificate authority data, and authentication token. 
#The helm provider is also configured to use the same connection details for deploying Helm charts to the EKS cluster.
provider "kubernetes" {
  alias                  = "eks"
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

# The helm provider is configured to connect to the EKS cluster using the same connection details as the kubernetes provider.
provider "helm" {
  alias = "eks"

  kubernetes = {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec = {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }

  }
}

module "argocd" {
  source = "./modules/argocd"

  providers = {
    kubernetes = kubernetes.eks
    helm       = helm.eks
  }

  depends_on = [module.eks]
}