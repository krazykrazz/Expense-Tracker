# Expense Tracker Frontend

React-based frontend for the Expense Tracker application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure API endpoint (optional):
```bash
cp .env.example .env
# Edit .env to set VITE_API_BASE_URL if needed
```

3. Start development server:
```bash
npm run dev
```

The application will be available at http://localhost:5173

## Build

To create a production build:
```bash
npm run build
```

## API Configuration

The frontend communicates with the backend API. By default, it connects to `http://localhost:2424`.

You can override this by setting the `VITE_API_BASE_URL` environment variable in a `.env` file.
