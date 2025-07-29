# Archive of Obselis - Kubernetes Deployment Manifest

This directory contains the complete Kubernetes deployment configuration for the Archive of Obselis media server.

## 🏗️ Architecture Overview

### 4-Node Kubernetes Cluster
- **ROG Strix**: Master + Primary Worker (RTX 2070S, Always On)
- **Aorus**: Opportunistic Worker (RTX 5070 Ti, Gaming Priority)
- **Raspberry Pi**: Lightweight Worker (Always On)
- **Raspberry Pi NAS**: Storage Node (M.2 SSD, Always On)

### Domain Structure
- **Main Website**: `https://archiveofobselis.com`
- **API Endpoints**: `https://api.archiveofobselis.com`
- **Media Streaming**: `https://media.archiveofobselis.com`

## 📁 Manifest Files

### Core Configuration
- `namespace.yaml` - Kubernetes namespace for the media server
- `configmaps.yaml` - Application configuration and environment variables
- `secrets.yaml` - Sensitive data (passwords, API keys, etc.)

### Storage
- `storage.yaml` - Persistent volumes and storage classes
  - Media files: 2TB (NFS)
  - Database: 500GB (NFS)
  - Transcoded files: 1TB (NFS)
  - Thumbnails: 100GB (NFS)
  - Temp files: 500GB (Local SSD)

### Database & Cache
- `database.yaml` - PostgreSQL StatefulSet with persistent storage
- `redis.yaml` - Redis cache for session management and caching

### Applications
- `backend.yaml` - Node.js API server deployment
- `frontend.yaml` - React frontend application deployment

### Networking
- `ingress.yaml` - Traefik ingress controller with SSL/TLS
- `load-balancer.yaml` - MetalLB load balancer for external access

### Monitoring
- `monitoring.yaml` - Prometheus and Grafana configurations

### Deployment
- `deployment-script.sh` - Automated deployment script

## 🚀 Quick Start

### Prerequisites
1. **Kubernetes Cluster**: k3s installed on all nodes
2. **NVIDIA Device Plugin**: For GPU access
3. **MetalLB**: For load balancing
4. **Traefik**: Ingress controller
5. **cert-manager**: For SSL certificates

### Installation Steps

#### 1. Update Configuration
```bash
# Edit secrets.yaml with your actual values
nano k8s/deployment-manifest/secrets.yaml

# Update IP addresses in storage.yaml
nano k8s/deployment-manifest/storage.yaml
```

#### 2. Build Docker Images
```bash
# Build backend image
docker build -t archiveofobselis/backend:latest ./backend

# Build frontend image
docker build -t archiveofobselis/frontend:latest ./frontend

# Push to your registry (if using remote registry)
docker push archiveofobselis/backend:latest
docker push archiveofobselis/frontend:latest
```

#### 3. Deploy to Kubernetes
```bash
# Make deployment script executable
chmod +x k8s/deployment-manifest/deployment-script.sh

# Run deployment
./k8s/deployment-manifest/deployment-script.sh
```

#### 4. Configure Cloudflare
1. Add DNS records pointing to your home IP
2. Enable SSL/TLS (Full mode)
3. Configure security headers and WAF rules

## 🔧 Configuration Details

### Environment Variables
The application uses ConfigMaps for configuration:

```yaml
# Domain configuration
DOMAIN: "archiveofobselis.com"
API_DOMAIN: "api.archiveofobselis.com"
MEDIA_DOMAIN: "media.archiveofobselis.com"

# Database configuration
DB_HOST: "postgres-service"
DB_PORT: "5432"
DB_NAME: "media_server"
DB_TYPE: "postgresql"

# Transcoding configuration
MAX_CONCURRENT_JOBS: "2"
GPU_MEMORY_LIMIT: "4G"
ENABLE_GPU: "true"
```

### Secrets Management
Sensitive data is stored in Kubernetes secrets:

```yaml
# Database password
DB_PASSWORD: "base64_encoded_password"

# JWT secret
JWT_SECRET: "base64_encoded_secret"

# API keys
TMDB_API_KEY: "base64_encoded_key"
OMDB_API_KEY: "base64_encoded_key"

# Email configuration
EMAIL_HOST: "smtp.gmail.com"
EMAIL_USER: "yourEmail@gmail.com"
EMAIL_PASS: "your_email_password"
```

### Storage Configuration
Different storage types for different data:

- **NFS Storage**: For persistent data (media files, database)
- **Local SSD**: For temporary files and caching
- **Network Storage**: Raspberry Pi NAS with M.2 SSD

## 🎮 Gaming Integration

### Aorus Node Configuration
The Aorus node is configured as an opportunistic worker:

- **Gaming Priority**: Automatically scales down when gaming
- **GPU Access**: RTX 5070 Ti for high-performance transcoding
- **Auto-registration**: Joins cluster when powered on
- **Graceful shutdown**: Removes itself when powered off

### Resource Management
- **Gaming Detection**: Monitors for gaming processes
- **Automatic Scaling**: Moves workloads to ROG Strix when gaming
- **Performance Optimization**: Uses RTX 2070S as fallback

## 📊 Monitoring & Observability

### Prometheus Metrics
- Transcoding job progress
- GPU utilization per node
- Storage usage and performance
- User bandwidth consumption
- Database performance metrics

### Grafana Dashboards
- Cluster overview
- Transcoding performance
- Storage utilization
- Gaming mode status
- User activity metrics

### Alerting Rules
- High GPU utilization
- Storage space warnings
- Database connection issues
- Transcoding job failures
- Node health issues

## 🔒 Security Configuration

### Network Security
- **Ingress Security**: TLS termination with Let's Encrypt
- **CORS Configuration**: Properly configured for cross-origin requests
- **Rate Limiting**: Protection against abuse
- **Security Headers**: XSS protection, content type sniffing prevention

### Data Security
- **Encrypted Storage**: Sensitive data encrypted at rest
- **Secure Secrets**: Kubernetes secrets for sensitive configuration
- **Database Encryption**: PostgreSQL with encryption
- **Backup Encryption**: Encrypted backups

## 🌐 Cloudflare Integration

### DNS Configuration
```
A Records:
- archiveofobselis.com → Your home IP
- api.archiveofobselis.com → Your home IP
- media.archiveofobselis.com → Your home IP

CNAME Records:
- www.archiveofobselis.com → archiveofobselis.com
```

### SSL/TLS Configuration
- **SSL Mode**: Full (strict)
- **Certificate Management**: Automatic via Let's Encrypt
- **HSTS**: Enabled for additional security
- **TLS 1.3**: Enforced for modern encryption

### Security Features
- **DDoS Protection**: Automatic protection against attacks
- **WAF Rules**: Custom rules for media server protection
- **Bot Management**: Block malicious bots
- **Geographic Blocking**: Optional region restrictions

## 🚀 Scaling & Performance

### Horizontal Pod Autoscaling
```yaml
# Backend API scaling
minReplicas: 2
maxReplicas: 10
targetCPUUtilizationPercentage: 70
```

### Resource Allocation
- **ROG Strix**: Primary workload handling
- **Aorus**: Performance boost when available
- **Raspberry Pi**: Lightweight services
- **Pi NAS**: Centralized storage

### Performance Optimization
- **GPU Acceleration**: RTX 2070S + RTX 5070 Ti
- **Storage Optimization**: M.2 SSD for high I/O
- **Network Optimization**: 2.5GbE connections
- **Caching**: Redis for session and data caching

## 🔧 Management Commands

### View Status
```bash
# Check all pods
kubectl get pods -n media-server

# Check services
kubectl get services -n media-server

# Check ingress
kubectl get ingress -n media-server

# Check persistent volumes
kubectl get pv,pvc -n media-server
```

### View Logs
```bash
# Backend logs
kubectl logs -f deployment/backend-api -n media-server

# Frontend logs
kubectl logs -f deployment/frontend-app -n media-server

# Database logs
kubectl logs -f statefulset/postgres-db -n media-server
```

### Scaling
```bash
# Scale backend
kubectl scale deployment backend-api --replicas=3 -n media-server

# Scale frontend
kubectl scale deployment frontend-app --replicas=3 -n media-server
```

### Troubleshooting
```bash
# Access pod shell
kubectl exec -it <pod-name> -n media-server -- /bin/bash

# Check events
kubectl get events -n media-server

# Describe resources
kubectl describe pod <pod-name> -n media-server
```

## 📈 Performance Expectations

### Transcoding Performance
- **RTX 2070S**: 2-3x real-time for 1080p
- **RTX 5070 Ti**: 4-6x real-time for 1080p
- **Concurrent Jobs**: 2-6 simultaneous (depending on GPU availability)

### Streaming Performance
- **Concurrent Streams**: 8-12 simultaneous
- **Quality Levels**: 480p, 720p, 1080p, 4K
- **Adaptive Bitrate**: Automatic quality adjustment

### Storage Performance
- **M.2 SSD**: 3,500+ MB/s sequential read/write
- **Network Storage**: 1GbE network performance
- **Concurrent Access**: Multiple pods can access simultaneously

## ⚠️ Important Notes

### Before Deployment
1. **Update Secrets**: Replace placeholder values with actual secrets
2. **Network Configuration**: Update IP addresses for your network
3. **Storage Setup**: Ensure Raspberry Pi NAS is properly configured
4. **GPU Drivers**: Install NVIDIA drivers and device plugin

### After Deployment
1. **DNS Configuration**: Set up Cloudflare DNS records
2. **Port Forwarding**: Configure router for ports 80, 443, 8080
3. **SSL Certificates**: Verify Let's Encrypt certificates are working
4. **Monitoring**: Set up alerting and monitoring dashboards

### Maintenance
1. **Regular Updates**: Keep Kubernetes and applications updated
2. **Backup Strategy**: Implement regular database and file backups
3. **Security Updates**: Monitor for security vulnerabilities
4. **Performance Monitoring**: Track resource usage and optimize

## 🆘 Troubleshooting

### Common Issues
1. **Pod Startup Failures**: Check resource limits and storage
2. **Database Connection**: Verify PostgreSQL is running and accessible
3. **GPU Access**: Ensure NVIDIA device plugin is installed
4. **Storage Issues**: Check NFS connectivity and permissions
5. **SSL Certificate**: Verify cert-manager is working correctly

### Support
For issues and questions:
1. Check Kubernetes events: `kubectl get events -n media-server`
2. Review application logs: `kubectl logs -f <pod-name> -n media-server`
3. Verify network connectivity between nodes
4. Check storage mount points and permissions

This deployment manifest provides a complete, production-ready setup for your Archive of Obselis media server with gaming priority, high performance, and comprehensive monitoring. 