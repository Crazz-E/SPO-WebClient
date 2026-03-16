# SPO-WebClient — VPS Deployment Guide

Deploy the SPO-WebClient from git to a clean VPS. After following this procedure you will be able to open `https://spo.yourdomain.com`, see the login page, and connect to the official SPO game servers to play.

## Architecture

```
Browser ──wss:443──▶ nginx (TLS termination)
                        │
                        ▼ ws:8080 (localhost only)
                    Docker (Node.js gateway)
                        │
                        ├──TCP:1111──▶ www.starpeaceonline.com (RDO directory)
                        ├──TCP:80────▶ update.starpeaceonline.com (game assets)
                        └──TCP:*─────▶ dynamic world server IPs (gameplay)
```

## Prerequisites

- **VPS**: Ubuntu 22.04+ LTS, 1+ vCPU, 1GB+ RAM, 20GB+ disk
- **Domain**: A domain or subdomain you control (e.g. `spo.yourdomain.com`)
- **SSH key**: Public key authentication configured for VPS access

---

## Step 1: Initial Server Setup

SSH into your VPS as root:

```bash
ssh root@YOUR_VPS_IP
```

### 1.1 System Update

```bash
apt update && apt upgrade -y
timedatectl set-timezone UTC
apt install -y curl wget git ufw fail2ban unattended-upgrades \
  apt-transport-https ca-certificates gnupg lsb-release
```

### 1.2 Create Service User

```bash
adduser spo --disabled-password --gecos "SPO Service"
usermod -aG sudo spo

# Copy your SSH key to the new user
mkdir -p /home/spo/.ssh
cp /root/.ssh/authorized_keys /home/spo/.ssh/
chown -R spo:spo /home/spo/.ssh
chmod 700 /home/spo/.ssh
chmod 600 /home/spo/.ssh/authorized_keys
```

### 1.3 SSH Hardening

Edit `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers spo
```

```bash
systemctl restart sshd
```

> **WARNING**: Before closing your current SSH session, open a new terminal and verify you can SSH as `spo`.

### 1.4 Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (certbot + redirect)'
ufw allow 443/tcp comment 'HTTPS'
ufw enable
ufw status verbose
```

Outbound is allow-all because the app connects to game servers on dynamic IPs/ports discovered at runtime.

### 1.5 Fail2ban

```bash
cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = 22
maxretry = 5
bantime = 3600
findtime = 600

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
bantime = 600
EOF

systemctl enable fail2ban
systemctl start fail2ban
```

### 1.6 Automatic Security Updates

```bash
dpkg-reconfigure -plow unattended-upgrades
# Select "Yes"
```

---

## Step 2: Install Docker

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow spo user to run Docker without sudo
usermod -aG docker spo

systemctl enable docker
```

Log out and back in as `spo` for the group change to take effect:

```bash
su - spo
docker run --rm hello-world  # Verify Docker works
```

---

## Step 3: Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

---

## Step 4: DNS Configuration

At your DNS provider, create an A record:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `spo.yourdomain.com` | `YOUR_VPS_IP` | 300 |

If using **Cloudflare**: set to **DNS only (grey cloud)** initially so the Let's Encrypt HTTP-01 challenge works. You can enable the orange cloud proxy after HTTPS is confirmed working.

Verify propagation:

```bash
dig +short spo.yourdomain.com
# Should return YOUR_VPS_IP
```

---

## Step 5: Deploy the Application

### 5.1 Clone Repository

```bash
sudo mkdir -p /opt/spo-webclient
sudo chown spo:spo /opt/spo-webclient
cd /opt/spo-webclient
git clone https://github.com/YOUR_USERNAME/SPO-WebClient.git .
```

### 5.2 Create Environment File

```bash
cp deploy/.env.example .env
chmod 600 .env
```

Edit `.env` if you need to change any defaults. The defaults connect to the official SPO game servers.

### 5.3 Build and Start

```bash
docker compose build
docker compose up -d
```

First startup downloads game assets (30–90 seconds). Watch the logs:

```bash
docker compose logs -f --tail=100
```

Wait for: `[Gateway] Server ready at http://localhost:8080`

### 5.4 Verify Container

```bash
# Container running and healthy?
docker compose ps

# Local HTTP works?
curl -s http://localhost:8080/api/startup-status
# Expected: {"phase":"ready","progress":1,...}

# Can reach game servers?
docker compose exec spo-webclient node -e "
const net=require('net');
const s=net.connect(1111,'www.starpeaceonline.com',()=>{console.log('OK: RDO reachable');s.end()});
s.on('error',e=>{console.error('FAIL:',e.message);process.exit(1)});
s.setTimeout(5000,()=>{console.error('FAIL: timeout');s.destroy();process.exit(1)});"
```

---

## Step 6: Configure Nginx (HTTP only, for Certbot)

```bash
sudo mkdir -p /var/www/certbot

# Create initial HTTP config
sudo tee /etc/nginx/sites-available/spo-webclient << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name spo.yourdomain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Replace domain placeholder
sudo sed -i 's/spo.yourdomain.com/YOUR_ACTUAL_DOMAIN/g' /etc/nginx/sites-available/spo-webclient

# Enable site
sudo ln -sf /etc/nginx/sites-available/spo-webclient /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Verify HTTP works: open `http://spo.yourdomain.com` in a browser — you should see the login page.

---

## Step 7: Obtain TLS Certificate

```bash
sudo apt install -y certbot

sudo certbot certonly --webroot \
    -w /var/www/certbot \
    -d spo.yourdomain.com \
    --non-interactive \
    --agree-tos \
    --email your-email@example.com
```

---

## Step 8: Enable HTTPS in Nginx

Replace the nginx config with the full HTTPS version shipped in the repo:

```bash
sudo cp /opt/spo-webclient/deploy/nginx/spo-webclient.conf /etc/nginx/sites-available/spo-webclient

# Replace domain placeholder with your actual domain
sudo sed -i 's/spo.yourdomain.com/YOUR_ACTUAL_DOMAIN/g' /etc/nginx/sites-available/spo-webclient

sudo nginx -t && sudo systemctl reload nginx
```

### 8.1 Verify Certbot Auto-Renewal

```bash
sudo certbot renew --dry-run

# Verify systemd timer exists
systemctl list-timers | grep certbot
```

If no timer exists, add a cron:

```bash
echo "0 3 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'" \
    | sudo tee /etc/cron.d/certbot-renew
```

---

## Step 9: End-to-End Verification

Run these checks in order:

### Infrastructure

```bash
docker compose ps                          # Status: running (healthy)
ss -tlnp | grep 8080                      # Bound to 127.0.0.1 only
sudo systemctl status nginx                # Active: active (running)
```

### HTTPS & WebSocket

```bash
# HTTPS working?
curl -sI https://spo.yourdomain.com/ | head -20
# Expected: HTTP/2 200, security headers present

# HTTP redirects to HTTPS?
curl -sI http://spo.yourdomain.com/ | head -5
# Expected: 301 → https://...

# API endpoint?
curl -s https://spo.yourdomain.com/api/startup-status
# Expected: {"phase":"ready",...}
```

### Browser Test

1. Open `https://spo.yourdomain.com/`
2. Login screen should appear with Starpeace branding
3. DevTools Console: no CSP errors, no mixed-content warnings
4. DevTools Network: WebSocket `wss://spo.yourdomain.com/ws` should connect
5. Log in with valid credentials → select world → game map loads

### Security

```bash
# Port 8080 NOT externally accessible:
nmap -p 8080 YOUR_VPS_IP   # filtered or closed

# Security headers appear exactly once (no duplication):
curl -sI https://spo.yourdomain.com/ | grep -ci content-security-policy  # 1

# TLS grade:
# Visit https://www.ssllabs.com/ssltest/analyze.html?d=spo.yourdomain.com
# Expected: A or A+
```

---

## Operations

### View Logs

```bash
# Application logs
docker compose logs -f --tail=100

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Update (Deploy New Code)

```bash
cd /opt/spo-webclient
git pull origin main
docker compose build
docker compose up -d
docker compose logs -f --tail=50
```

Asset cache persists in Docker volumes — no re-download on update.

### Rollback

```bash
cd /opt/spo-webclient
git log --oneline -5
git checkout <commit-hash>
docker compose build
docker compose up -d
```

### Container Debugging

```bash
docker compose exec spo-webclient sh
ls -la /app/cache/            # Game assets
ls -la /app/webclient-cache/  # Dynamic image cache
```

### Restart

```bash
docker compose restart        # Restart container
sudo systemctl restart nginx  # Restart nginx
```

---

## Troubleshooting

| Symptom | Check | Fix |
|---------|-------|-----|
| Container won't start | `docker compose logs` | Check build errors, npm ci failures |
| "Server ready" never appears | Logs for UpdateService errors | Check outbound to `update.starpeaceonline.com:80` |
| 502 Bad Gateway | `curl http://127.0.0.1:8080/` | Container not running or port binding wrong |
| WebSocket won't connect | Browser DevTools Network tab | Check nginx `/ws` block has Upgrade headers |
| CSP errors in console | `curl -sI` and count CSP headers | If duplicated, remove from nginx (app handles them) |
| Login times out | Container logs for RDO errors | Check outbound TCP to `www.starpeaceonline.com:1111` |
| Map blank / no textures | Browser console for CDN errors | Verify `CHUNK_CDN_URL=https://spo.zz.works` in `.env` |
| All clients rate-limited (429) | Check `TRUST_PROXY=true` in `.env` | Without it, all clients appear as 127.0.0.1 |
| Images broken (1x1 transparent) | Container logs for download failures | Check outbound HTTP to game server image URLs |

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | — | Set `production` for production |
| `PORT` | `8080` | Internal HTTP/WebSocket port |
| `RDO_DIR_HOST` | `www.starpeaceonline.com` | Game directory server |
| `CHUNK_CDN_URL` | `https://spo.zz.works` | Terrain/object asset CDN |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `TRUST_PROXY` | `false` | Set `true` behind nginx (required for rate limiting) |
| `ENABLE_HSTS` | `false` | Set `true` when serving over HTTPS |
| `SPO_GM_USERS` | — | Comma-separated GM usernames (optional) |

---

## Security Summary

| Layer | Protection |
|-------|-----------|
| **SSH** | Key-only auth, no root login, fail2ban |
| **Firewall** | UFW: only 22, 80, 443 inbound |
| **TLS** | Let's Encrypt, TLSv1.2+, OCSP stapling |
| **Nginx** | Rate limiting (30r/s), request size limit |
| **Docker** | Non-root user, localhost-only port, 512MB memory limit |
| **App** | CSP, HSTS, X-Frame-Options, SSRF protection, rate limiting, WS origin validation |
| **OS** | Automatic security updates via unattended-upgrades |
