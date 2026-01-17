# Deployment Notes

## Hosting
- **Platform:** Railway (railway.app)
- **Domain:** pennysarcade.games
- **DNS:** Cloudflare

## How it works
- Code is pushed to GitHub: https://github.com/pennysarcade/pennys-arcade
- Railway auto-deploys from the `main` branch when changes are pushed
- The `server` service runs both the Express backend and serves the React frontend

## Environment Variables (set in Railway)

### Required
- `DATABASE_URL` - PostgreSQL connection string (Railway provides this automatically)
- `JWT_SECRET` - Authentication secret for signing tokens
- `NODE_ENV` - Set to `production`
- `FRONTEND_URL` - https://pennysarcade.games

### Optional
- `DISCORD_CLIENT_ID` - Discord OAuth app client ID
- `DISCORD_CLIENT_SECRET` - Discord OAuth app secret
- `DISCORD_REDIRECT_URI` - Discord OAuth callback URL
- `RESEND_API_KEY` - Resend.com API key for email verification
- `ADMIN_EMAIL` - Email address that auto-promotes to admin on registration
- `AVATARS_DIR` - Custom path for avatar storage (defaults to `server/avatars`)

### Special (use with caution)
- `WIPE_USERS_ON_DEPLOY` - Set to `true` to wipe all user data on next deploy (one-time use)

## To deploy changes
1. Make changes locally
2. `git add -A && git commit -m "message" && git push`
3. Railway auto-deploys within a few minutes

## Project structure
- `/client` - React + Vite frontend
- `/server` - Express + PostgreSQL backend
- `/docs` - Documentation
- Server builds client during deployment and serves static files
