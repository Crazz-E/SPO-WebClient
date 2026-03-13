# Deployment Security Guide

## TLS/HTTPS (Required for Production)

The SPO-WebClient gateway serves HTTP on port 8080 by default. **TLS must be terminated at a reverse proxy** (nginx, Caddy, etc.) before production deployment — credentials travel in WebSocket messages and must be encrypted.

### nginx Example

```nginx
server {
    listen 443 ssl http2;
    server_name spo.example.com;

    ssl_certificate     /etc/letsencrypt/live/spo.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/spo.example.com/privkey.pem;

    # TLS hardening
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # HSTS (also available via ENABLE_HSTS env var in the app)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket upgrade
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name spo.example.com;
    return 301 https://$host$request_uri;
}
```

### Caddy Example

```
spo.example.com {
    reverse_proxy localhost:8080
}
```

Caddy handles TLS certificates, HSTS, and WebSocket upgrades automatically.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listening port |
| `TRUST_PROXY` | `false` | Set to `true` when behind a reverse proxy — enables `X-Forwarded-For` for rate limiting |
| `SPO_GM_USERS` | *(empty)* | Comma-separated GM usernames (e.g., `admin,moderator`). No default — must be explicitly set |
| `ENABLE_HSTS` | `false` | Set to `true` to add `Strict-Transport-Security` header (use when TLS is terminated upstream) |
| `LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | *(unset)* | Set to `production` to disable source maps and dev features |
| `RDO_DIR_HOST` | `www.starpeaceonline.com` | RDO directory server hostname |

## Production Checklist

- [ ] TLS termination configured at reverse proxy
- [ ] `TRUST_PROXY=true` set (if behind proxy)
- [ ] `ENABLE_HSTS=true` set (if TLS is active)
- [ ] `SPO_GM_USERS` explicitly configured (no default GM users)
- [ ] `NODE_ENV=production` set (disables source maps, debug features)
- [ ] `LOG_LEVEL=warn` or `error` set (reduces log verbosity)
- [ ] Firewall: only port 443 exposed publicly; port 8080 bound to localhost or internal network
- [ ] Run `npm audit` and resolve any vulnerabilities before deployment
