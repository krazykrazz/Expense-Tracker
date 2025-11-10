# Expense Tracker

A full-stack expense tracking application built with React and Node.js.

## Features

- 📝 Add, edit, and delete expenses
- 🔍 Search and filter expenses by type and payment method
- 📊 View monthly summaries with weekly breakdowns
- 💰 Track monthly gross income and net balance
- 📅 Filter expenses by month and year
- 💾 Backup database functionality
- 🌐 Access from any device on your local network

## Tech Stack

**Frontend:**
- React 18
- Vite
- CSS3

**Backend:**
- Node.js
- Express
- SQLite3

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm

### Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd expense-tracker
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

## Running the Application

### Development Mode

1. Start the backend server:
```bash
cd backend
npm start
```
The backend will run on http://localhost:2424

2. In a new terminal, start the frontend:
```bash
cd frontend
npm run dev
```
The frontend will run on http://localhost:5173

### Access from Other Devices

Both servers are configured to accept connections from your local network. Find your local IP address and use:
- Frontend: http://YOUR_LOCAL_IP:5173
- Backend: http://YOUR_LOCAL_IP:2424

## Usage

1. **Add Expenses**: Click the "+ Add Expense" button in the header
2. **Edit Expenses**: Click the edit button (✏️) next to any expense
3. **Delete Expenses**: Click the delete button (🗑️) next to any expense
4. **Filter**: Use the dropdowns to filter by type or payment method
5. **Search**: Use the search bar to find expenses by place or notes
6. **Set Monthly Income**: Click the edit button next to Monthly Gross Income
7. **Backup**: Click the "💾 Backup" button to download your database

## Project Structure

```
expense-tracker/
├── backend/
│   ├── controllers/      # Request handlers
│   ├── database/         # Database setup and SQLite file
│   ├── repositories/     # Data access layer
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Helper functions
│   └── server.js        # Express server
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── App.jsx      # Main app component
│   │   └── config.js    # API configuration
│   └── index.html
└── README.md
```

## API Endpoints

- `POST /api/expenses` - Create a new expense
- `GET /api/expenses` - Get all expenses (with optional filters)
- `PUT /api/expenses/:id` - Update an expense
- `DELETE /api/expenses/:id` - Delete an expense
- `GET /api/expenses/summary` - Get monthly summary
- `GET /api/monthly-gross` - Get monthly gross income
- `POST /api/monthly-gross` - Set monthly gross income
- `GET /api/backup` - Download database backup

## Database Schema

### Expenses Table
- id (INTEGER PRIMARY KEY)
- date (TEXT)
- place (TEXT)
- notes (TEXT)
- amount (REAL)
- type (TEXT) - 'Other', 'Food', or 'Gas'
- week (INTEGER) - 1-5
- method (TEXT) - Payment method
- created_at (TEXT)

### Monthly Gross Table
- id (INTEGER PRIMARY KEY)
- year (INTEGER)
- month (INTEGER)
- gross_amount (REAL)
- created_at (TEXT)

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.
