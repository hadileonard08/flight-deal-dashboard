# Setup Instructions

## Prerequisites Setup

### 1. PostgreSQL Installation

You need to install and configure PostgreSQL locally. Here are the recommended options:

#### Option A: Install via Homebrew (Recommended)
```bash
# Install PostgreSQL
brew install postgresql@16

# Start PostgreSQL service
brew services start postgresql@16

# Create database
createdb flight_tracker

# Create user (if needed)
psql postgres
CREATE USER postgres WITH PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE flight_tracker TO postgres;
\q
```

#### Option B: Use Postgres.app (Easier)
1. Download and install Postgres.app from https://postgresapp.com/
2. Open Postgres.app and start the server
3. Create a database named `flight_tracker`
4. The default connection string will be: `postgresql://postgres@localhost:5432/flight_tracker`

#### Option C: Use Docker
```bash
docker run --name flight-tracker-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=flight_tracker \
  -p 5432:5432 \
  -d postgres:16
```

### 2. API Keys Setup

You need to obtain the following API keys:

#### OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Sign up or log in
3. Create a new API key
4. Copy the key

#### Discord Webhook URL
1. Go to your Discord server settings
2. Create a new webhook in a channel
3. Copy the webhook URL

#### Seats.aero API Key (Optional - for future scraper implementation)
1. Visit https://seats.aero/ to get API access

### 3. Environment Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and replace the placeholder values:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flight_tracker"
OPENAI_API_KEY="your_actual_openai_api_key"
SEATS_AERO_API_KEY="your_seats_aero_api_key"
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/your_actual_webhook_id/your_actual_webhook_token"
```

## Running the Application

### 1. Database Setup

Run the database migration to create tables:
```bash
npm run db:push
```

### 2. Test the Pipeline

Run the flight deal pipeline with mock data:
```bash
npm run run:pipeline
```

This will:
- Process mock flight data
- Evaluate deals using AI
- Generate honeymoon itineraries for good deals
- Send Discord notifications (if webhook is configured)
- Store results in the database

### 3. Start the Web Dashboard

Run the Next.js development server:
```bash
npm run dev
```

Visit http://localhost:3000 to see the flight deals dashboard.

## Project Structure

```
autonomous-travel-agent/
├── src/
│   ├── agents/
│   │   ├── graph.ts              # LangGraph multi-agent system
│   │   ├── agent2-evaluator.ts   # Deal evaluation agent
│   │   └── agent3-notifier.ts    # Discord notification agent
│   ├── app/
│   │   ├── api/deals/route.ts    # API endpoint for deals
│   │   ├── page.tsx              # Dashboard UI
│   │   ├── layout.tsx            # Root layout
│   │   └── globals.css           # Global styles
│   ├── db/
│   │   ├── index.ts              # Database connection
│   │   └── schema.ts             # Drizzle schema
│   ├── lib/
│   │   └── config.ts             # Regional configuration
│   └── scripts/
│       ├── runner.ts             # Pipeline orchestrator
│       └── setup-db.ts           # Database setup helper
├── drizzle.config.ts             # Drizzle configuration
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── tailwind.config.ts            # Tailwind config
└── next.config.js                # Next.js config
```

## Future Enhancements

1. **Agent 1 - Scraper**: Implement actual Seats.aero API integration
2. **Scheduled Runs**: Set up cron jobs for continuous monitoring
3. **Deal Filtering**: Add more sophisticated deal criteria
4. **User Preferences**: Allow customization of destinations and dates
5. **Email Notifications**: Add email as an alternative to Discord
6. **Historical Data**: Track deal trends over time

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running
- Check the DATABASE_URL in `.env`
- Verify the database exists: `psql -l`

### API Key Issues
- Verify your OpenAI API key is valid
- Check Discord webhook URL format
- Ensure keys are properly set in `.env`

### Build Errors
- Run `npm install` to ensure all dependencies are installed
- Check Node.js version (should be 18+)
- Clear `.next` folder and rebuild: `rm -rf .next && npm run build`
