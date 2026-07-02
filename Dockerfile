# ─── Stage 1: Build React frontend ───────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies needed for Vite build)
RUN npm ci

# Copy source code
COPY index.html vite.config.js ./
COPY src/ ./src/
COPY public/ ./public/

# Build the React app into /app/dist
RUN npm run build


# ─── Stage 2: Production runtime ─────────────────────────────────────────────
FROM node:22-alpine AS runner

# Install dumb-init for proper signal handling in containers
RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy server source
COPY server/ ./server/

# Copy the built React app from Stage 1
COPY --from=builder /app/dist ./dist

# Expose the port
EXPOSE 3001

# Use dumb-init to handle PID 1 signals correctly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/server.js"]
