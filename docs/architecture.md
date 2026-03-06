# Architecture

**Last Updated:** 2026-03-06 (America/Los_Angeles)

This document is the architecture source of truth for SocialApp. Future tasks should use it as the first context file before making structural changes.

## Project Overview
- **What the app is:** SocialApp is an Android-first social platform centered on hobbies, projects, clubs, and positive community interaction.
- **Product goals:**
  - Enable social sharing around hobbies/interests
  - Support clubs and projects with collaboration features
  - Keep moderation and safety strong from day one
  - Stay low-cost in early stages
- **Core constraints:**
  - Political content is prohibited
  - Architecture should remain compatible with later iOS/web expansion
  - Early development optimized for local-first workflows and low AWS spend
- **Tone/community standards:** positive, hobby-focused, non-political, anti-extremism.

## Tech Stack
- **Frontend framework:** React Native + Expo + TypeScript (`mobile/`)
- **Backend framework/services:** Node.js + Express TypeScript local API (`backend/src/localServer.ts`)
- **Development data modes:** `mock`, `local-api`, `remote-dev` (frontend-selectable; local-api remains default)
- **Database:**
  - Current local runtime: in-memory arrays in `localServer.ts`
  - Target infra: DynamoDB via SAM template (`backend/template.yaml`)
- **Auth:**
  - Current: mock auth/user switching in mobile (`mobile/src/auth/session.ts`)
  - Planned/infra: Cognito (documented in README/template)
- **Storage:** target S3 (SAM template), not the primary path in local runtime
- **Hosting/deployment:**
  - Local dev server (`npm --prefix backend run local-api`)
  - AWS SAM deployment path exists in backend template
- **Tooling:** TypeScript, npm scripts, Expo CLI, AWS SAM

## App Navigation
Top-level app structure (`mobile/App.tsx`):
- **Commons**: main feed + composer + thread responses
- **Clubs**: club discovery/creation/membership flows
- **Projects**: project detail, milestones, tasks, highlights, project-club links
- **Profile**: user profile content tabs + network management
- **Search**: nav action opens search UI; supports live suggestions and explicit Find/Enter execution

Current nav row pattern: **SocialApp | Commons | Clubs | Projects | Profile | Search**

## Core Social Model
- **Follow:** one-way relationship (`Follow`)
- **Close Circle:** invite/accept model (`CloseCircleInvite` with PENDING/ACCEPTED/DECLINED/BLOCKED)
- **Visibility model:** `PUBLIC`, `FOLLOWERS`, `CLOSE_CIRCLE`, `CLUB`, `PROJECT`
- **Policy evaluation:** `canViewPost(...)` in `backend/src/domain/policy.ts`
  - author can always view own content
  - hidden moderation state blocks visibility
  - visibility gates depend on follower/close-circle/club/project context

## Commons Feed Projection Model
- Commons now supports an activity-projection layer via `FeedEvent` while preserving the legacy post feed path.
- Source entities remain canonical (`Post`, `Project`, milestone/task records, highlights); `FeedEvent` is a derived activity layer.
- MVP `FeedEvent` taxonomy:
  - `POST_CREATED`
  - `CLUB_POST_CREATED`
  - `PROJECT_HIGHLIGHT_CREATED`
  - `MILESTONE_COMPLETED`
  - `TASK_COMPLETED`
  - `PROJECT_CREATED`
- Feed events are emitted only for feed-worthy user-visible actions after successful canonical writes.
- Commons supports filters by: `source`, `eventType`, `clubId`, `projectId`, `actorId`.
- Visibility enforcement reuses policy logic (`canViewEvent` wrapper over shared visibility checks).

### Commons Feed Query/Retrieval
- New query path (`mode=events`) performs bounded multi-index candidate retrieval:
  - public visibility path
  - actor path (viewer, followed users, close-circle users)
  - club path (member clubs)
  - project path (owner/creator + club-linked project scope using existing entities)
- Candidate sets are deduped by event id, stably sorted by `sortTimestamp DESC, id DESC`, then filtered by policy + block/mute/moderation/deleted checks.
- Cursor pagination uses opaque base64 cursor over `{ sortTimestamp, id }`.

## Content Model
- **Posts:** text-first content with visibility + optional club/project context + tags
- **Clubs:** hobby/category-based groups with owner/admin/member roles
- **Projects:** category-scoped work items with optional club association
- **Project Milestones/Tasks:** ordered milestone flow + task checklist per milestone
- **Project Highlights:** project updates, mirrored into commons activity stream
- **Reactions:** fixed reaction vocabulary
- **Threaded responses:** `COMMENTS`, `QUESTIONS`, `THANK_YOU`, `SUGGESTIONS`
- **Reports/Moderation actions:** report queue + admin action records

## Moderation / Safety Rules
- Core principle: hobby/interests/positivity.
- Prohibited: political discussion/content.
- Explicit report categories include political content and extremism/hate.
- Current enforcement pattern:
  - server-side text normalization and keyword matching (`evaluateText`)
  - blocked submissions return `POLITICAL_CONTENT_BLOCKED`
  - moderation state + admin actions available for content management
- See also: `docs/moderation-policy.md`

## Data Model
Important entities (architecture-level):
- **User**: id, handle, displayName, optional profile metadata
- **Follow**: followerId -> followeeId, createdAt
- **CloseCircleInvite**: inviter/invitee/status lifecycle
- **Category**: allowed hobby taxonomy (`allowedCategories`)
- **Club**: id, categoryId, ownerId, visibility/public flag, metadata
- **ClubMember**: clubId/userId/role (MEMBER|MODERATOR|OWNER)
- **Project**: ownerId, categoryId, title/description, optional clubId/createdBy
- **ProjectClubLink** (local runtime model): project-to-multi-club association with approval state
- **Post**: author/text/visibility/club/project/tags/moderation
- **Reaction**: per user per post type
- **Comment**: threaded response with type/depth/moderation
- **Report**: reporter + target + reason + status
- **ModerationAction**: action log over post/comment/user targets
- **FeedEvent**: Commons activity projection entity keyed by source entity references and visibility context

## API / Service Layer
Primary local service is Express with modular composition:
- `backend/src/server.ts` initializes middleware and mounts routes
- `backend/src/api/routes/socialRoutes.ts` contains endpoint definitions
- `backend/src/services/socialService.ts` contains shared business logic helpers
- `backend/src/services/feedEventService.ts` emits FeedEvents from canonical write flows
- `backend/src/services/feedQueryService.ts` builds and filters Commons event feeds
- `backend/src/repositories/store.ts` selects repository mode abstraction
- `backend/src/repositories/inMemoryStore.ts` owns in-memory persistence state
- `backend/src/repositories/feedEventRepository.ts` provides FeedEvent query paths/index-like accessors
- `backend/src/localServer.ts` is now a thin bootstrap wrapper calling `startServer()`

High-value route groups:
- **Health/config:** `/health`, `/categories`, `/users`, `/search`
- **Social graph:** `/follow`, `/close-circle/*`, relationship/mute/block routes
- **Feeds:** `/feed/commons`, `/feed/clubs`, `/feed/projects`, `/posts`
- **Clubs:** `/clubs`, `/clubs/:clubId/*`
- **Projects:** `/projects`, `/projects/:projectId/*`, milestones/tasks/highlights
- **Project-club links:** `/projects/:projectId/clubs` + review route
- **Engagement/moderation:** `/comments`, `/reactions`, `/reports`, `/admin/*`, `/moderation/check`

Notes:
- local API is currently the main runtime backend used by the mobile app
- separate Lambda-style handlers also exist under `backend/src/handlers/` for serverless direction
- endpoint URLs and behavior were preserved during modular extraction
- repository mode abstraction keeps current in-memory behavior while preparing for `file`/`sqlite` and future `dynamodb` adapters
- Commons migration path is dual-read: `/feed/commons` defaults to legacy posts; `mode=events` enables FeedEvent-based response with optional `shape=legacy` adaptation for existing UI safety.

### Backend Source Structure (Current)
```text
backend/src/
  server.ts
  localServer.ts
  api/
    routes/
      index.ts
      socialRoutes.ts
  services/
    socialService.ts
    feedEventService.ts
    feedQueryService.ts
  repositories/
    store.ts
    inMemoryStore.ts
    feedEventRepository.ts
  middleware/
    notFound.ts
  domain/
    policy.ts
    feedEvent.ts
    seedData.ts
    types.ts
  handlers/
    moderation.ts
    posts.ts
  lib/
    db.ts
    moderationEngine.ts
    politicalTerms.ts
```

## Frontend Structure
- `mobile/App.tsx`: top-level nav, dev user switcher, global search UI
- `mobile/src/api/client.ts`: typed API client and route wrappers
- `mobile/src/screens/FeedScreen.tsx`: commons feed + composer + threaded responses
- `mobile/src/screens/ClubsScreen.tsx`: clubs UX
- `mobile/src/screens/ProjectsScreen.tsx`: project detail and workflow UIs
- `mobile/src/screens/ProfileScreen.tsx`: profile content tabs + network management
- `mobile/src/auth/session.ts`: mock user/session helpers
- `mobile/src/config.ts`: environment-driven client config

## State Management
- No Redux/Zustand/global store currently.
- State is managed screen-locally via `useState`/`useEffect`.
- Data refreshes are API-call driven per screen/flow.

## Environment / Configuration
- Mobile env:
  - `EXPO_PUBLIC_DATA_MODE` (`local-api` default; supported: `mock`, `local-api`, `remote-dev`)
  - `EXPO_PUBLIC_LOCAL_API_BASE_URL` (default `http://127.0.0.1:3001`)
  - `EXPO_PUBLIC_REMOTE_DEV_API_BASE_URL` (remote shared dev backend when using `remote-dev`)
  - `EXPO_PUBLIC_API_BASE_URL` (defaults to `http://127.0.0.1:3001`)
  - `EXPO_PUBLIC_AUTH_MODE` (`mock` default)
- Backend local port:
  - `PORT` (default 3001 in `localServer.ts`)
- Backend repository mode:
  - `SOCIALAPP_REPOSITORY_MODE` (`memory` default; prepared values: `memory`, `file`, `sqlite`, `dynamodb`)
- Infra/deployment assumptions captured in:
  - `backend/template.yaml`
  - `README.md`

## Development Data Modes (Local-First)

SocialApp supports multiple development data modes without requiring AWS for day-to-day work.

- **`local-api` (default):**
  - Mobile app targets local Express API on `127.0.0.1`
  - Preserves current behavior and endpoint flow
  - Best for full-stack local dev and Android testing

- **`mock` (prepared mode):**
  - Uses the same local API base URL today to avoid breaking current behavior
  - Reserved for future in-app mock/fixture data adapters

- **`remote-dev` (prepared mode):**
  - Allows frontend to target a shared remote development API endpoint
  - Useful for team testing without local backend on every machine

### How to switch modes locally

1. Edit `mobile/.env` (copy from `.env.example` if needed).
2. Set `EXPO_PUBLIC_DATA_MODE` to one of: `mock`, `local-api`, `remote-dev`.
3. Set base URL variables:
   - Local mode: `EXPO_PUBLIC_LOCAL_API_BASE_URL=http://127.0.0.1:3001`
   - Remote mode: `EXPO_PUBLIC_REMOTE_DEV_API_BASE_URL=https://<your-dev-api>`
4. Restart Expo after env changes.

For backend repository behavior:
- Leave unset (or `SOCIALAPP_REPOSITORY_MODE=memory`) for current in-memory local flow.
- `file`/`sqlite`/`dynamodb` values are scaffolded for future adapters, but intentionally not implemented yet.

## Known Gaps / TODOs
- Local backend uses in-memory state (non-persistent).
- Serverless handlers and local Express runtime are not yet fully unified.
- Auth is mock-first; Cognito not wired as active runtime path.
- Search currently routes to major tabs/profile focus, not deep-linked object detail pages.
- Commons activity/event model is implemented but still text-template-based (not structured activity types).
- Web/iOS deployment paths are planned but not yet fully productized.

## Related Documentation
- `README.md`
- `docs/moderation-policy.md`
- `docs/mvp-blueprint.md`
- `docs/roadmap.md`
- `docs/android-beta-checklist.md`

## Development Notes for Future Cline Tasks
- Read this file first before making major architecture/product changes.
- Update this file whenever any of the following changes:
  - navigation structure
  - database schema/data model
  - API routes/service boundaries
  - auth flow
  - visibility logic
  - moderation rules
  - folder structure
  - major UI flow
- Do **not** update this doc for tiny cosmetic-only changes unless they alter behavior/structure.
