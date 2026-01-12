# Deployment Notes

## Hosting
- **Platform:** Railway (railway.app)
- **Domain:** pennysarcade.games
- **DNS:** Cloudflare

## How it works
- Code is pushed to GitHub: https://github.com/dan057/pennys-arcade
- Railway auto-deploys from the `main` branch when changes are pushed
- The `server` service runs both the Express backend and serves the React frontend

## Environment Variables (set in Railway)
- `JWT_SECRET` - Authentication secret
- `NODE_ENV` - Set to `production`
- `FRONTEND_URL` - https://pennysarcade.games

## To deploy changes
1. Make changes locally
2. `git add -A && git commit -m "message" && git push`
3. Railway auto-deploys within a few minutes

## Project structure
- `/client` - React + Vite frontend
- `/server` - Express + SQLite backend
- Server builds client during deployment and serves static files
