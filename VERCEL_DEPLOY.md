# Backend Vercel Deployment

This project is configured for Vercel serverless functions deployment.

## Features
- ✅ Serverless function support
- ✅ Express.js API
- ✅ MongoDB connection
- ✅ Environment variable support

## Deployment
1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel` in this directory
3. Set environment variables in Vercel dashboard:
   - `MONGODB_URI`
   - `CRICKET_API_KEY`
   - `CRICKET_API_BASE_URL`
   - `CACHE_UPDATE_INTERVAL`
4. Redeploy: `vercel --prod`

## Environment Variables
- `MONGODB_URI` - MongoDB connection string
- `CRICKET_API_KEY` - Cricket API key
- `CRICKET_API_BASE_URL` - Cricket API base URL
- `CACHE_UPDATE_INTERVAL` - Cache update interval in ms (default: 60000)
- `PORT` - Server port (optional, defaults to 5001)

## Notes
- Runs as serverless functions on Vercel
- MongoDB connection established per function invocation
- For production scheduled tasks, consider Vercel Cron Jobs

