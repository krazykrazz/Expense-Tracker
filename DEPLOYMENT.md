# Deployment Guide

Your Expense Tracker is a **unified full-stack application**. The backend serves both the API and the frontend static files.

## Quick Deploy

### 1. Build the Application

```bash
# Install all dependencies
npm run install-all

# Build the frontend
npm run build
```

This creates a production build in `frontend/dist/` that the backend will serve.

### 2. Start the Application

```bash
npm start
```

The app runs on port 2424 (or PORT environment variable).

## Deploy to Cloud Platforms

### Option 1: Render.com (Recommended - Free Tier)

1. Push your code to GitHub
2. Go to [Render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Build Command**: `npm run install-all && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node
5. Click "Create Web Service"

### Option 2: Railway.app (Simple - Free Tier)

1. Push to GitHub
2. Go to [Railway.app](https://railway.app)
3. New Project → Deploy from GitHub
4. Select your repo
5. Railway auto-detects and deploys
6. Add a volume for SQLite persistence:
   - Settings → Volumes → Add Volume
   - Mount path: `/app/backend/database`

### Option 3: Fly.io (Good Performance)

1. Install Fly CLI: `npm install -g flyctl`
2. Login: `fly auth login`
3. Create Dockerfile in root:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
RUN npm run install-all
COPY . .
RUN npm run build
EXPOSE 2424
CMD ["npm", "start"]
```

4. Deploy:
```bash
fly launch
fly deploy
```

### Option 4: Heroku

1. Install Heroku CLI
2. Login: `heroku login`
3. Create app: `heroku create your-expense-tracker`
4. Deploy:
```bash
git push heroku main
```

## Environment Variables

Set these on your hosting platform:

- `PORT` - Server port (default: 2424)
- `NODE_ENV` - Set to `production`

## Database Persistence

Your app uses SQLite. Make sure your hosting platform:
- Supports persistent storage/volumes
- Or migrate to PostgreSQL for cloud deployment

## Local Development

```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend (with hot reload)
npm run dev:frontend
```

Frontend: http://localhost:5173
Backend: http://localhost:2424

## Production Build Test

Test the production build locally:

```bash
npm run build
npm start
```

Visit http://localhost:2424
