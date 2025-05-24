# Use Node.js 18 Alpine for a smaller image
FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy source code first (needed for client directory)
COPY . .

# Install dependencies for both server and client
RUN npm run install:all

# Build the application
RUN npm run build

# Create data directory for memory storage
RUN mkdir -p /app/data/memory

# Expose the port the app runs on
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "start"]
