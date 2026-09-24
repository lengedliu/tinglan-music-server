# Multi-stage Dockerfile for TingLan Music Server with Xiaomi Speaker Support
# Stage 1: Build Frontend and Bundled Server
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies required for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install all dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build Vite frontend assets and bundle server.ts to dist/server.cjs
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install runtime utilities (curl for healthcheck, ca-certificates)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create folders for music storage and persistent data
RUN mkdir -p /app/music /app/data && chown -R node:node /app

# Copy production artifacts and install production dependencies
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER node

# Expose HTTP port for Web UI, API, and Xiaomi Speaker audio streaming
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the bundled Express server
CMD ["node", "dist/server.cjs"]

