# ============================================================
# Stage 1: Build
# ============================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and build configs
COPY tsconfig.json tsconfig.client.json vite.config.ts ./
COPY src/ src/
COPY public/ public/

# Build server (TypeScript -> dist/) and client (Vite -> public/app.js + app.css)
RUN npm run build

# ============================================================
# Stage 2: Production
# ============================================================
FROM node:22-bookworm-slim AS production

# Install p7zip for CAB extraction (7zip-min needs 7za binary on Linux)
RUN apt-get update && \
    apt-get install -y --no-install-recommends p7zip-full && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user inside container
RUN groupadd -r spo && useradd -r -g spo -m spo

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built artifacts from builder stage
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/public/ ./public/

# Create runtime directories (mounted as volumes in production)
RUN mkdir -p /app/cache /app/webclient-cache && \
    chown -R spo:spo /app

# Switch to non-root user
USER spo

EXPOSE 8080

# Health check: startup can take 30-90s while downloading game assets
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD node -e "const http=require('http');const r=http.get('http://localhost:8080/api/startup-status',{timeout:4000},s=>{process.exit(s.statusCode===200?0:1)});r.on('error',()=>process.exit(1))"

CMD ["node", "--disable-warning=DEP0040", "dist/server/server.js"]
