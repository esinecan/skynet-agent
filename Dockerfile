# Multi-stage build for optimal image size
FROM node:18-alpine AS base

# Install dependencies needed for runtime
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Stage 1: Dependencies
FROM base AS deps
# Install production dependencies only
RUN npm ci --only=production

# Stage 2: Build
FROM base AS build
# Copy all files
COPY . .

# Install all dependencies (including dev)
RUN npm install --legacy-peer-deps

# Build the application
RUN npm run build:server

# Stage 3: Runtime
FROM base AS runtime

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy built application
COPY --from=build /app/dist ./dist

# Copy necessary files
COPY --from=build /app/src ./src
COPY --from=build /app/client ./client
COPY --from=build /app/config.json ./config.json
COPY --from=build /app/.env* ./

# Create data directories
RUN mkdir -p /app/data/memory /app/data/sessions

# Set environment to production
ENV NODE_ENV=production

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
