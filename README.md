# SocialApp (No-Politics Social Platform)

Android-first social app built with React Native (Expo) and an AWS serverless backend.

## Product Constraints
- Political content is explicitly prohibited.
- V1 is Android-first.
- Architecture should support iOS and web later.
- Keep AWS spend under **$50/month** at early usage.

## Repository Layout
- `mobile/` — Expo React Native client (TypeScript)
- `backend/` — AWS Lambda handlers + SAM infrastructure template
- `docs/` — policy, roadmap, and operations notes

## Quick Start (after installing Node.js)
1. Install Node.js LTS (18+ recommended).
   - Windows: https://nodejs.org/
   - Verify: `node -v` and `npm -v`
2. Mobile app:
   - `cd mobile`
   - `npm install`
   - Copy env template: `copy .env.example .env`
   - `npm run start`
3. Backend services:
   - `cd backend`
   - `npm install`
   - `npm run build`
   - Local API: `npm run local-api`

## Local-First Development Modes
- Default mode is local and low-cost.
- Mobile env variables (`mobile/.env`):
  - `EXPO_PUBLIC_API_BASE_URL` (default local API: `http://127.0.0.1:3001`)
  - `EXPO_PUBLIC_AUTH_MODE=mock` (use `cognito` later when integrating AWS auth)
- Current mock auth mode lets you build UI and flows without deploying AWS auth yet.

## Local Demo Data Seeding (Developer)

To make feature testing easier, local API now includes **dev-only seed/reset endpoints** plus helper scripts.

### 1) Start local API
- `npm --prefix backend run local-api`

### 2) Seed demo data
- `npm --prefix backend run dev:seed`

### 3) Reset to minimal default data
- `npm --prefix backend run dev:reset`

### 4) Reset + reseed in one command
- `npm --prefix backend run dev:reseed`

Notes:
- These endpoints are local/dev only (disabled when `NODE_ENV=production`).
- Optional base URL override for scripts:
  - `SOCIALAPP_LOCAL_API_URL=http://127.0.0.1:3001`

Seeded demo scenarios include:
- multi-user follows + close-circle relationships
- clubs with mixed membership roles
- projects linked to clubs
- milestones/tasks with mixed DONE/OPEN states
- project highlights + commons/club posts
- feed events for project created/highlight/progress and posts
- comments/reactions that generate notifications

This is intended to exercise Home dashboard, Commons activity, club updates, project progress, and notifications.

## Multi-User Local Testing (Real-World Style)
- Run one shared local backend: `npm --prefix backend run local-api`
- Run frontend: `npm --prefix mobile run web -- --port 8082`
- Open multiple browser sessions (normal + incognito, or different browsers/devices)
- In each session, use the in-app **Test as user** selector (Alex/Jamie/Taylor)
- Create a post in one session, then refresh another to verify cross-user feed visibility
- Verify moderation behavior by trying prohibited political phrases from different users

## AWS Deployment (SAM)
From `backend/`:
1. `sam build`
2. `sam deploy --guided`
3. During guided deploy, set a real email for budget alert subscribers in `template.yaml`.

The template includes:
- API Gateway + Lambda
- DynamoDB tables
- S3 media bucket
- Cognito user pool/client
- AWS Budget alert thresholds

## Moderation Model (V1)
Every post/comment is evaluated server-side before publish:
1. Normalize text
2. Detect banned political terms/phrases
3. Block with explanatory response + strike metadata

See `docs/moderation-policy.md` for details.

## Next Expansion Path
- iOS: reuse React Native code and add signing/release config.
- Web: add React web client consuming the same `/posts` and moderation APIs.
- Moderation v2: add ML/OCR checks while keeping server-side policy gate as source of truth.
