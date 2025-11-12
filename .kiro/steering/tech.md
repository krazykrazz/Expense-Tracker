# Technology Stack

## Frontend
- React 18 with functional components and hooks
- Vite as build tool and dev server
- Vanilla CSS3 for styling (no CSS frameworks)
- Component-based architecture with modular CSS files

## Backend
- Node.js with Express framework
- SQLite3 for data persistence
- CommonJS module system (require/module.exports)
- RESTful API design

## Infrastructure
- Docker and Docker Compose for containerization
- Development and production configurations
- Volume mounts for database persistence

## Common Commands

### Development
```bash
# Install all dependencies
npm run install-all

# Start backend (port 2424)
cd backend && npm start

# Start frontend dev server (port 5173)
cd frontend && npm run dev

# Docker development
docker-compose up
```

### Production
```bash
# Build frontend
npm run build

# Deploy (build + start)
npm run deploy

# Docker production
docker-compose -f docker-compose.prod.yml up -d
```

## API Configuration
- Backend runs on port 2424
- Frontend dev server on port 5173
- Both configured for local network access (0.0.0.0)
- API base URL configured in frontend/src/config.js
