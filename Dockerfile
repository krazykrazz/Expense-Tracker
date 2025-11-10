# Production Dockerfile for full-stack expense tracker
FROM node:18-alpine AS frontend-build

WORKDIR /app/frontend

# Build frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Backend with frontend build
FROM node:18-alpine

WORKDIR /app

# Copy backend files
COPY backend/package*.json ./
RUN npm install --production

COPY backend/ ./

# Copy frontend build to backend's client/dist directory
COPY --from=frontend-build /app/frontend/dist ./client/dist

# Expose port
EXPOSE 2424

# Set production environment
ENV NODE_ENV=production
ENV PORT=2424

# Start the server
CMD ["npm", "start"]
