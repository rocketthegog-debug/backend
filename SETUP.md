# Backend Setup Guide - CrickBuzz API

Complete setup guide for the CrickBuzz backend API.

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/rocketthegog-debug/backend.git
cd backend

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# 4. Start development server
npm run dev
```

## Detailed Setup

### Step 1: Prerequisites

Install required software:

- **Node.js** (v18.0.0 or higher)
  ```bash
  node --version  # Should be v18+
  ```

- **MongoDB**
  - Local: Install from [mongodb.com](https://www.mongodb.com/try/download/community)
  - Cloud: Use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free tier available)

- **Cricket API Key**
  - Sign up at [cricapi.com](https://www.cricapi.com/)
  - Get your API key from dashboard

### Step 2: Clone and Install

```bash
git clone https://github.com/rocketthegog-debug/backend.git
cd backend
npm install
```

### Step 3: MongoDB Setup

#### Option A: Local MongoDB

1. Install MongoDB locally
2. Start MongoDB service:
   ```bash
   # Mac (Homebrew)
   brew services start mongodb-community

   # Linux
   sudo systemctl start mongod

   # Windows
   # Start MongoDB service from Services
   ```

3. Connection string:
   ```env
   MONGODB_URI=mongodb://localhost:27017/crickbuzz
   ```

#### Option B: MongoDB Atlas (Cloud)

1. Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Get connection string from Atlas dashboard
4. Replace `<password>` with your database password
5. Add your IP to whitelist (or use `0.0.0.0/0` for development)

Example:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/crickbuzz?retryWrites=true&w=majority
```

### Step 4: Environment Variables

1. Copy example file:
```bash
cp .env.example .env
```

2. Edit `.env` file:

```env
# MongoDB - REQUIRED
MONGODB_URI=mongodb://localhost:27017/crickbuzz

# Server - Optional
PORT=5001
NODE_ENV=development

# Frontend URL - For CORS
FRONTEND_URL=http://localhost:5173

# Cricket API - REQUIRED
CRICKET_API_KEY=your_api_key_here
CRICKET_API_BASE_URL=https://api.cricapi.com/v1

# Cache - Optional
CACHE_UPDATE_INTERVAL=60000

# Vercel - Auto-set on Vercel
VERCEL=
```

### Step 5: Get Cricket API Key

1. Visit [cricapi.com](https://www.cricapi.com/)
2. Sign up for free account
3. Navigate to Dashboard → API Keys
4. Copy your API key
5. Add to `.env` as `CRICKET_API_KEY`

### Step 6: Start Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

You should see:
```
✅ MongoDB Connected
🚀 Server running on port 5001
```

### Step 7: Verify Setup

Test the API:

```bash
# Health check
curl http://localhost:5001/api/health

# Should return:
# {"status":"OK","message":"CrickBuzz API is running"}
```

## Create Admin User

After setup, create an admin user:

```bash
node scripts/create-admin.js
```

Follow the prompts to create your admin account.

## Vercel Deployment

### Prerequisites

1. Vercel account ([vercel.com](https://vercel.com))
2. Vercel CLI installed:
   ```bash
   npm i -g vercel
   ```

### Deployment Steps

1. **Login to Vercel:**
   ```bash
   vercel login
   ```

2. **Deploy:**
   ```bash
   vercel
   ```
   - Follow prompts
   - Link to existing project or create new

3. **Set Environment Variables:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add all variables from `.env.example`:
     - `MONGODB_URI`
     - `CRICKET_API_KEY`
     - `FRONTEND_URL` (your frontend URL)
     - `NODE_ENV=production`
     - `CRICKET_API_BASE_URL`
     - `CACHE_UPDATE_INTERVAL`

4. **Production Deploy:**
   ```bash
   vercel --prod
   ```

### Vercel Configuration

The `vercel.json` file is already configured:
- Serverless function setup
- Route configuration
- Function timeout (30 seconds)

## API Testing

### Using cURL

```bash
# Health check
curl http://localhost:5001/api/health

# Register user
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "1234567890",
    "name": "Test User",
    "password": "password123"
  }'

# Login
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "1234567890",
    "password": "password123"
  }'

# Get matches
curl http://localhost:5001/api/cricket/matches
```

### Using Postman

1. Import collection (if available)
2. Set base URL: `http://localhost:5001/api`
3. Test endpoints

## Common Issues

### Issue: MongoDB Connection Failed

**Error:** `MongoServerError: connection timed out`

**Solutions:**
- Check MongoDB is running: `mongosh` or check service status
- Verify connection string format
- For Atlas: Check IP whitelist and credentials
- Check firewall/network settings

### Issue: Cricket API Errors

**Error:** `CRICKET_API_KEY is not configured`

**Solutions:**
- Verify `.env` file exists and has `CRICKET_API_KEY`
- Check API key is valid (not expired)
- Verify API quota hasn't been exceeded
- Restart server after changing `.env`

### Issue: Port Already in Use

**Error:** `EADDRINUSE: address already in use :::5001`

**Solutions:**
```bash
# Find process using port
lsof -i :5001

# Kill process
kill -9 <PID>

# Or use different port
PORT=3000 npm run dev
```

### Issue: CORS Errors

**Error:** `Access-Control-Allow-Origin` errors

**Solutions:**
- Check `FRONTEND_URL` in `.env` matches your frontend URL
- Verify CORS configuration in `server.js`
- For production, use actual frontend domain

### Issue: Vercel Deployment Fails

**Error:** Build or runtime errors

**Solutions:**
- Check all environment variables are set in Vercel
- Verify MongoDB connection string is accessible from Vercel
- Check function logs in Vercel dashboard
- Ensure `vercel.json` is correct

## Development Tips

1. **Use nodemon**: Automatically restarts on file changes
2. **Check Logs**: Monitor console for errors and warnings
3. **Test Endpoints**: Use Postman or cURL to test APIs
4. **Environment Variables**: Never commit `.env` file
5. **Database**: Use MongoDB Compass for database visualization

## Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Use secure MongoDB connection (Atlas recommended)
- [ ] Set proper `FRONTEND_URL` for production
- [ ] Configure CORS for production domain
- [ ] Set up environment variables in hosting platform
- [ ] Enable MongoDB authentication
- [ ] Review and secure API keys
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy for MongoDB

## Next Steps

After setup:
1. ✅ Verify MongoDB connection
2. ✅ Test API endpoints
3. ✅ Create admin user
4. ✅ Test cricket API integration
5. ✅ Connect frontend application
6. ✅ Deploy to Vercel (optional)

## Need Help?

- Check [README.md](./README.md) for API documentation
- Review [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md) for Vercel specifics
- Open an issue on GitHub for bugs or questions

---

Happy coding! 🚀

