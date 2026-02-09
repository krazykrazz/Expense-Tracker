# Stage 1: Frontend Builder
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source code
COPY frontend/ ./

# Build React application
RUN npm run build

# Stage 2: Backend Dependencies
FROM node:20-alpine AS backend-deps

# Install build dependencies for native modules (sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /build/backend

# Copy backend package files
COPY backend/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Stage 3: Final Runtime
FROM node:20-alpine

# Build arguments for version info
ARG IMAGE_TAG=unknown
ARG BUILD_DATE=unknown
ARG GIT_COMMIT=unknown

# Install tzdata for timezone support
RUN apk add --no-cache tzdata wget

# Set working directory
WORKDIR /app

# Copy backend application code
COPY backend/ ./

# Copy frontend build from frontend-builder stage
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Copy production node_modules from backend-deps stage
COPY --from=backend-deps /build/backend/node_modules ./node_modules

# Create /config directory structure and set ownership
# Note: node:20-alpine already has a 'node' user with UID 1000
RUN mkdir -p /config/database /config/backups /config/config /config/invoices /config/invoices/temp && \
    chown -R node:node /config /app

# Switch to non-root user (node user has UID 1000)
USER node

# Expose port
EXPOSE 2424

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD wget --quiet --tries=1 --spider http://localhost:2424/api/health || exit 1

# Set environment variables
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    SERVICE_TZ=Etc/UTC \
    PORT=2424 \
    IMAGE_TAG=${IMAGE_TAG} \
    BUILD_DATE=${BUILD_DATE} \
    GIT_COMMIT=${GIT_COMMIT}

# Start the application
CMD ["node", "server.js"]
