#!/bin/bash

# Archive of Obselis - Media Server Kubernetes Deployment Script
# This script deploys the complete media server to your Kubernetes cluster

set -e

echo "🚀 Starting Archive of Obselis Media Server Deployment"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if kubectl is installed
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed. Please install kubectl first."
        exit 1
    fi
    
    if ! command -v helm &> /dev/null; then
        print_warning "Helm is not installed. Some components may not deploy correctly."
    fi
    
    print_success "Prerequisites check completed"
}

# Create namespace
create_namespace() {
    print_status "Creating media-server namespace..."
    kubectl apply -f k8s/deployment-manifest/namespace.yaml
    print_success "Namespace created"
}

# Deploy storage
deploy_storage() {
    print_status "Deploying storage configuration..."
    kubectl apply -f k8s/deployment-manifest/storage.yaml
    print_success "Storage configuration deployed"
}

# Deploy secrets and configmaps
deploy_configuration() {
    print_status "Deploying configuration..."
    kubectl apply -f k8s/deployment-manifest/configmaps.yaml
    kubectl apply -f k8s/deployment-manifest/secrets.yaml
    print_success "Configuration deployed"
}

# Deploy database
deploy_database() {
    print_status "Deploying PostgreSQL database..."
    kubectl apply -f k8s/deployment-manifest/database.yaml
    
    # Wait for database to be ready
    print_status "Waiting for database to be ready..."
    kubectl wait --for=condition=ready pod -l app=postgres -n media-server --timeout=300s
    print_success "Database deployed and ready"
}

# Deploy Redis
deploy_redis() {
    print_status "Deploying Redis cache..."
    kubectl apply -f k8s/deployment-manifest/redis.yaml
    
    # Wait for Redis to be ready
    print_status "Waiting for Redis to be ready..."
    kubectl wait --for=condition=ready pod -l app=redis -n media-server --timeout=300s
    print_success "Redis deployed and ready"
}

# Deploy backend
deploy_backend() {
    print_status "Deploying backend API server..."
    kubectl apply -f k8s/deployment-manifest/backend.yaml
    
    # Wait for backend to be ready
    print_status "Waiting for backend to be ready..."
    kubectl wait --for=condition=ready pod -l app=backend -n media-server --timeout=300s
    print_success "Backend deployed and ready"
}

# Deploy frontend
deploy_frontend() {
    print_status "Deploying frontend application..."
    kubectl apply -f k8s/deployment-manifest/frontend.yaml
    
    # Wait for frontend to be ready
    print_status "Waiting for frontend to be ready..."
    kubectl wait --for=condition=ready pod -l app=frontend -n media-server --timeout=300s
    print_success "Frontend deployed and ready"
}

# Deploy ingress and load balancer
deploy_networking() {
    print_status "Deploying networking components..."
    kubectl apply -f k8s/deployment-manifest/ingress.yaml
    kubectl apply -f k8s/deployment-manifest/load-balancer.yaml
    print_success "Networking components deployed"
}

# Deploy monitoring
deploy_monitoring() {
    print_status "Deploying monitoring components..."
    kubectl apply -f k8s/deployment-manifest/monitoring.yaml
    print_success "Monitoring components deployed"
}

# Verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Check all pods are running
    kubectl get pods -n media-server
    
    # Check services
    kubectl get services -n media-server
    
    # Check ingress
    kubectl get ingress -n media-server
    
    print_success "Deployment verification completed"
}

# Display access information
display_access_info() {
    echo ""
    echo "🎉 Archive of Obselis Media Server Deployment Complete!"
    echo "=================================================="
    echo ""
    echo "🌐 Access URLs:"
    echo "   Main Website: https://archiveofobselis.com"
    echo "   API Endpoints: https://api.archiveofobselis.com"
    echo "   Media Streaming: https://media.archiveofobselis.com"
    echo ""
    echo "🔧 Management Commands:"
    echo "   View pods: kubectl get pods -n media-server"
    echo "   View logs: kubectl logs -f deployment/backend-api -n media-server"
    echo "   Scale backend: kubectl scale deployment backend-api --replicas=3 -n media-server"
    echo "   Access shell: kubectl exec -it <pod-name> -n media-server -- /bin/bash"
    echo ""
    echo "📊 Monitoring:"
    echo "   Grafana Dashboard: http://localhost:3000 (if exposed)"
    echo "   Prometheus: http://localhost:9090 (if exposed)"
    echo ""
    echo "⚠️  Next Steps:"
    echo "   1. Configure Cloudflare DNS to point to your home IP"
    echo "   2. Set up port forwarding on your router (ports 80, 443, 8080)"
    echo "   3. Update secrets with actual values"
    echo "   4. Test all functionality"
    echo ""
}

# Main deployment function
main() {
    check_prerequisites
    create_namespace
    deploy_storage
    deploy_configuration
    deploy_database
    deploy_redis
    deploy_backend
    deploy_frontend
    deploy_networking
    deploy_monitoring
    verify_deployment
    display_access_info
}

# Run main function
main "$@" 