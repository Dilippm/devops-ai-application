# this resource block creates a VPC with the specified CIDR block and 
#enables DNS support and hostnames. 
#The VPC is tagged with the provided name for easy identification.
resource "aws_vpc" "vpc" {
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = {
    Name = var.vpc_name
  }
}

# This resource block creates an Internet Gateway and 
#associates it with the VPC created above.
resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.vpc.id
  tags = {
    Name = "${var.vpc_name}-igw"
  }

}

# This resource block creates a public route table for the VPC and
#adds a default route to the Internet Gateway.
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = {
    Name = "${var.vpc_name}-public-rt"
  }
}

# This resource block associates the public route table with each 
#of the subnets created in the VPC.
resource "aws_route_table_association" "public" {
  count = length(aws_subnet.subnets)

  subnet_id      = aws_subnet.subnets[count.index].id
  route_table_id = aws_route_table.public.id
}

# This resource block creates subnets in the VPC using 
#the provided CIDR blocks and availability zones.
resource "aws_subnet" "subnets" {
  count = length(var.subnet_cidrs)

  vpc_id                  = aws_vpc.vpc.id
  cidr_block              = var.subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name                                        = "${var.vpc_name}-subnet-${count.index + 1}"
    "kubernetes.io/role/elb"                    = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "owned"
  }
}