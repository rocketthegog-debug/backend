# MongoDB Atlas Setup for Vercel Deployment

This guide explains how to configure MongoDB Atlas to work with Vercel serverless functions.

## The Problem

Vercel serverless functions run from dynamic IP addresses. MongoDB Atlas by default blocks connections from IPs that aren't whitelisted, causing connection timeouts.

## Solution: Network Access Configuration

### Option 1: Allow Access from Anywhere (Recommended for Development)

1. Go to [MongoDB Atlas Dashboard](https://cloud.mongodb.com/)
2. Navigate to **Network Access** (under Security)
3. Click **Add IP Address**
4. Click **Allow Access from Anywhere**
5. This will add `0.0.0.0/0` to your whitelist
6. Click **Confirm**

**⚠️ Security Note:** This allows access from any IP. For production, consider Option 2.

### Option 2: Whitelist Vercel IP Ranges (More Secure)

Vercel uses specific IP ranges. However, these can change. The most practical approach is:

1. Go to MongoDB Atlas → Network Access
2. Add IP: `0.0.0.0/0` (temporary for testing)
3. Once confirmed working, you can restrict if needed
4. For production, use MongoDB Atlas IP Access List with Vercel's current IPs

### Option 3: Use MongoDB Atlas Private Endpoint (Enterprise)

For enterprise deployments, use MongoDB Atlas Private Endpoint with VPC peering.

## Connection String Configuration

Ensure your `MONGODB_URI` in Vercel environment variables includes:

```
mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
```

**Important Parameters:**
- `retryWrites=true` - Enables retry on write operations
- `w=majority` - Write concern for replica sets

## Environment Variables on Vercel

Set these in Vercel Dashboard → Settings → Environment Variables:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/crickbuzz?retryWrites=true&w=majority
```

## Connection Optimization

The backend is configured with serverless-optimized connection options:

- **serverSelectionTimeoutMS**: 5 seconds (faster timeout)
- **socketTimeoutMS**: 45 seconds
- **maxPoolSize**: 10 connections
- **bufferCommands**: false (prevents buffering issues)

## Testing Connection

After deployment, test the connection:

```bash
curl https://your-backend.vercel.app/api/health
```

Should return:
```json
{
  "status": "OK",
  "message": "CrickBuzz API is running",
  "mongodb": "connected"
}
```

## Troubleshooting

### Error: "Could not connect to any servers"

**Cause:** IP not whitelisted or connection string incorrect

**Solution:**
1. Check Network Access in MongoDB Atlas
2. Verify `MONGODB_URI` is correct in Vercel
3. Ensure username/password are correct
4. Check if database user has proper permissions

### Error: "Operation buffering timed out"

**Cause:** Connection not established before query

**Solution:**
- The updated connection configuration handles this
- Connection is retried on each request
- Consider using connection pooling

### Error: "Authentication failed"

**Cause:** Wrong username/password or database user doesn't exist

**Solution:**
1. Verify credentials in MongoDB Atlas → Database Access
2. Check user has read/write permissions
3. Ensure password doesn't have special characters that need URL encoding

## Security Best Practices

1. **Use Strong Passwords**: Generate strong passwords for database users
2. **Limit Network Access**: For production, restrict IP ranges if possible
3. **Use Environment Variables**: Never commit connection strings
4. **Regular Rotation**: Rotate database passwords periodically
5. **Monitor Access**: Check MongoDB Atlas logs for suspicious activity

## Quick Checklist

- [ ] MongoDB Atlas cluster created
- [ ] Database user created with read/write permissions
- [ ] Network Access configured (0.0.0.0/0 for Vercel)
- [ ] Connection string copied to Vercel environment variables
- [ ] Connection string includes `retryWrites=true&w=majority`
- [ ] Health check endpoint returns "connected" status

## Additional Resources

- [MongoDB Atlas Network Access](https://www.mongodb.com/docs/atlas/security-whitelist/)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Mongoose Connection Options](https://mongoosejs.com/docs/connections.html#options)

---

**Note:** The backend code has been optimized for serverless environments with proper connection handling and timeouts.

