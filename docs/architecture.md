# Architecture

**Last Updated:** 2026-03-07 (America/Los_Angeles)

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

# AI Implementation Contract

This repository is developed using AI-assisted tooling.

The following rules apply to all AI agents working on this codebase (ChatGPT, Cline, or other assistants).

## Architecture Authority

The system architecture defined in this document is the **canonical source of truth**.

If an AI assistant proposes changes that conflict with this architecture, the assistant must:

1. Stop implementation
2. Ask for clarification
3. Avoid improvising architectural changes

AI assistants must **not redesign existing systems** without an explicit instruction.

---

## Prompt-Based Development

Development tasks are executed using numbered prompts.

Example sequence:

056 – Club Events Design  
056B – ClubEvent Backend Foundation  
056C – Events Tab UI  
056D – Home Upcoming Events Card  

AI assistants must:

- follow prompts sequentially
- avoid inventing new prompt numbers
- avoid expanding prompt scope

---

## Scope Discipline

When implementing a prompt, AI assistants must:

- modify only files required for the prompt
- avoid unrelated refactors
- avoid modifying seed systems unless requested
- avoid introducing new entities or routes

---

## Architecture Drift Protection

AI assistants must not introduce new entities, routes, or systems unless explicitly required by the prompt.

Examples of prohibited drift:

- inventing new event attendance systems
- introducing global `/events` routes
- redesigning governance models
- adding premature feature expansions

If a prompt appears to require architectural changes, the assistant must ask for clarification first.

---

## Build Health Rule

Before architectural review or feature expansion, the project must be build-clean.

Example command:

npm --prefix backend run build

Broken builds must be fixed with minimal cleanup rather than redesign.

---

## Canonical References

AI assistants should use the following documents for guidance:

docs/architecture.md  
docs/data-model.md  
docs/AI_CONTEXT.md  
docs/AI_RULES.md  
docs/AI_LIMITS.md  

If conflicts occur, `architecture.md` takes precedence.

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
- **Home**: dashboard-style landing screen with capped sections (active projects, change summary, project progress signals, club updates, recent activity, notifications preview)
- **Commons**: main feed + composer + thread responses
- **Clubs**: 3-tab clubs hub (`My Clubs`, `Discover`, `Club Feed`) plus per-club detail tabs (`Highlights`, `Members`, `Projects`, `Project Requests` for owner/admin, `History` audit timeline)
- **Projects**: project detail, milestones, tasks, highlights, project-club links
- **Notifications**: personalized notifications list for viewer-relevant activity
- **Profile**: user profile content tabs + unified **All** view (aggregated Commons + Projects + Clubs) + network management kept separate
- **Search**: nav action opens search UI; supports live suggestions and explicit Find/Enter execution

Current nav row pattern: **SocialApp (Home) | Commons | Clubs | Projects | Profile | Search | Notifications (bell icon + unread badge)**

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
- Mobile Commons UI now renders event-backed activity cards by event type (post/club post/project highlight/project created/milestone completed/task completed) for improved scanability.
- Mobile Commons UI also applies lightweight progress compaction for repetitive `TASK_COMPLETED` events (same actor + same project + close time window), presenting grouped summary cards while leaving canonical FeedEvents unchanged.
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
- **Club**: id, categoryId, founderId (immutable), ownerId (active), visibility/public flag, metadata
- **ClubMember**: clubId/userId/role (MEMBER|MODERATOR|OWNER)
- **Project**: ownerId, categoryId, title/description, optional clubId/createdBy
- **ProjectClubLink** (local runtime model): project-to-multi-club association with approval state
- **Post**: author/text/visibility/club/project/tags/moderation
- **Reaction**: per user per post type
- **Comment**: threaded response with type/depth/moderation
- **Report**: reporter + target + reason + status
- **ModerationAction**: action log over post/comment/user targets
- **FeedEvent**: Commons activity projection entity keyed by source entity references and visibility context
- **ClubHistoryEvent**: club governance timeline entity with per-club sequence ordering

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
- `backend/src/repositories/clubHistoryRepository.ts` appends and queries per-club governance history with monotonic sequence
- `backend/src/localServer.ts` is now a thin bootstrap wrapper calling `startServer()`

High-value route groups:
- **Health/config:** `/health`, `/categories`, `/users`, `/search`
- **Dev data utilities (non-production):** `/dev/reset-data`, `/dev/seed-demo-data`
- **Social graph:** `/follow`, `/close-circle/*`, relationship/mute/block routes
- **Feeds:** `/feed/commons`, `/feed/clubs`, `/feed/projects`, `/posts`
- **Notifications:** `/notifications` (viewer-scoped MVP notification aggregation)
- **Clubs:** `/clubs`, `/clubs/:clubId/*`
- **Projects:** `/projects`, `/projects/:projectId/*`, milestones/tasks/highlights
- **Project-club links:** `/projects/:projectId/clubs` + review route
- **Club governance history:** `/clubs/:clubId/history` (read-only, newest-first, limitable)
- **Engagement/moderation:** `/comments`, `/reactions`, `/reports`, `/admin/*`, `/moderation/check`

Notes:
- local API is currently the main runtime backend used by the mobile app
- separate Lambda-style handlers also exist under `backend/src/handlers/` for serverless direction
- endpoint URLs and behavior were preserved during modular extraction
- repository mode abstraction keeps current in-memory behavior while preparing for `file`/`sqlite` and future `dynamodb` adapters
- Commons migration path is dual-read: `/feed/commons` defaults to legacy posts; `mode=events` enables FeedEvent-based response with optional `shape=legacy` adaptation for existing UI safety.
- Club creation now records governance history baseline events (`CLUB_CREATED`, `FOUNDER_RECORDED`) in ClubHistory.
- Club governance operations now emit ClubHistory events for ownership transfer, moderator/member role changes, member removal, and project-link lifecycle changes.
- Club-owned project creation now preserves `Project.createdBy` for user accountability and emits `PROJECT_CREATED_FOR_CLUB` in ClubHistory.
- Governance events remain out of `FeedEvent`; notifications are now limited to meaningful personal governance signals.

### Club Governance Behavior (Backend)
- Ownership transfer route: `PATCH /clubs/:clubId/ownership`
  - only current owner can transfer ownership
  - founder identity is immutable
  - transfer is atomic in service logic (`OWNER` -> fallback role, new member -> `OWNER`)
  - exactly-one-owner invariant is enforced after transfer
- Role governance route: `PATCH /clubs/:clubId/members/:memberId/role`
  - owner can promote/demote between `MEMBER` and `MODERATOR`
  - owner role cannot be changed through this endpoint
- Member removal route: `DELETE /clubs/:clubId/members/:memberId`
  - owner/moderator can remove eligible members
  - current owner cannot be removed

### Governance Notification Relevance
- Notifications include personal governance events only (ownership transferred to you, promoted/demoted moderator status for you, removed-from-club for you).
- Low-value/non-personal governance events are not notified and are represented in ClubHistory.

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
    clubHistory.ts
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
- `mobile/App.tsx`: top-level nav, dev user switcher, global search UI, and shared notifications unread state/badge wiring
- `mobile/src/screens/HomeScreen.tsx`: dashboard-style home surface composed from existing endpoints with capped sections and pull-to-refresh
- `mobile/src/api/client.ts`: typed API client and route wrappers
- `mobile/src/screens/FeedScreen.tsx`: event-backed commons activity cards + composer + threaded responses for post-backed events + lightweight feed-type filter bar (All/Posts/Projects/Progress), including tile press routing hints (project/club/post context) and response toggle counts/expand-collapse behavior
- `mobile/src/screens/NotificationsScreen.tsx`: personalized notifications list with lightweight unread/read visual state and tap-through routing to relevant tab
- `mobile/src/screens/ClubsScreen.tsx`: clubs 3-tab hub + club detail management flows (membership roles, highlight posting, project request review, history timeline, and creator accountability display for club projects)
- `mobile/src/screens/ProjectsScreen.tsx`: project detail and workflow UIs
- `mobile/src/components/CategorySelectorField.tsx`: shared searchable category selector used by create modals (club/project)
- `mobile/src/screens/ProfileScreen.tsx`: profile content tabs + unified All content aggregator (Commons/Projects/Clubs) with Network management remaining separate
- `mobile/src/auth/session.ts`: mock user/session helpers
- `mobile/src/config.ts`: environment-driven client config

Create Club and Create Project modal UX now uses a shared mobile-friendly pattern:
- searchable category selector instead of always-visible large chip grid
- scrollable modal body for long content/category lists
- overlay tap-to-dismiss behavior while preserving in-modal interactions
- lightweight Suggested Categories section in the shared selector (selected + session recents + associated categories + fallback defaults)

## State Management
- No Redux/Zustand/global store currently.
- State is managed with `useState`/`useEffect`; notifications unread/read state is lifted to `App.tsx` so nav badge and screen stay in sync.
- Data refreshes are API-call driven per screen/flow.
- Home dashboard aggregation is client-side orchestration over existing endpoints (no dedicated home backend endpoint in MVP).

## Environment / Configuration
- Mobile env:
  - `EXPO_PUBLIC_DATA_MODE` (`local-api` default; supported: `mock`, `local-api`, `remote-dev`)
  - `EXPO_PUBLIC_LOCAL_API_BASE_URL_WEB` (optional web override; default `http://127.0.0.1:3001`)
  - `EXPO_PUBLIC_LOCAL_API_BASE_URL` (native local-api base URL; default `http://10.0.2.2:3001`)
  - `EXPO_PUBLIC_REMOTE_DEV_API_BASE_URL` (remote shared dev backend when using `remote-dev`)
  - `EXPO_PUBLIC_API_BASE_URL` (shared fallback used by native local mode and `remote-dev`; web local mode does not use this fallback)
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
   - Local mode (web): `EXPO_PUBLIC_LOCAL_API_BASE_URL_WEB=http://127.0.0.1:3001`
   - Local mode (Android emulator/native): `EXPO_PUBLIC_LOCAL_API_BASE_URL=http://10.0.2.2:3001`
   - Remote mode: `EXPO_PUBLIC_REMOTE_DEV_API_BASE_URL=https://<your-dev-api>`
4. Restart Expo after env changes.

For backend repository behavior:
- Leave unset (or `SOCIALAPP_REPOSITORY_MODE=memory`) for current in-memory local flow.
- `file`/`sqlite`/`dynamodb` values are scaffolded for future adapters, but intentionally not implemented yet.

### Developer demo-data seeding workflow

- `POST /dev/reset-data` resets local in-memory state to minimal default seed.
- `POST /dev/seed-demo-data` loads richer demo scenarios for local UX testing.
- Helper scripts (`backend/package.json`):
  - `npm run dev:reset`
  - `npm run dev:seed`
  - `npm run dev:reseed`

These routes are intended for local/development use and are disabled when `NODE_ENV=production`.

## Known Gaps / TODOs
- Local backend uses in-memory state (non-persistent).
- Serverless handlers and local Express runtime are not yet fully unified.
- Auth is mock-first; Cognito not wired as active runtime path.
- Search/notification/home/feed/profile surfaces now route into tab detail context for project/club targets using focus-id navigation props; deep-linking to arbitrary nested entities beyond current tab detail views remains limited.
- Commons activity/event model now has event-type card rendering in mobile; deeper metadata-driven card payloads remain a future enhancement.
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

## Dev Workflow Helpers (Windows)
- Root-level scripts now provide local orchestration for backend + mobile dev startup:
  - `npm run dev:launch` → launches backend local API + Expo dev server in separate windows; skips duplicate backend launch if port `3001` is already occupied and uses PID-file tracking to avoid duplicate frontend launches
  - `npm run dev:relaunch` → stops workflow-managed backend/mobile PIDs, performs fallback titled-window cleanup, frees backend/mobile dev ports (`3001`, `8081`) if needed, then relaunches both
- Optional reseed relaunch helper:
  - `scripts\\dev-relaunch.cmd -Reseed`
- Backend launch still uses `backend` `local-api` script (`build` before run) to reduce stale compiled runtime mismatches during iterative development.
