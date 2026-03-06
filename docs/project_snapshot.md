# Project Snapshot

## 1. Repository Structure

Tree (up to ~3 levels, excluding build/generated folders):

```text
SocialApp/
  .gitignore
  package-lock.json
  README.md
  backend/
    package.json
    package-lock.json
    template.yaml
    tsconfig.json
    events/
      create-post.json
    src/
      localServer.ts
      domain/
      handlers/
      lib/
  docs/
    android-beta-checklist.md
    architecture.md
    moderation-policy.md
    mvp-blueprint.md
    roadmap.md
  mobile/
    app.json
    App.tsx
    babel.config.js
    package.json
    package-lock.json
    tsconfig.json
    src/
      config.ts
      api/
      auth/
      screens/
```

## 2. Tech Stack

- **Frontend framework:** React Native + Expo + TypeScript
- **Backend framework:** Node.js + Express (TypeScript local API in `backend/src/localServer.ts`)
- **Database (current):** In-memory collections in local backend
- **Database (target infra):** DynamoDB (via SAM template)
- **Auth:** Mock/session switching in app (`mobile/src/auth/session.ts`); Cognito planned in infra docs/template
- **Hosting/infrastructure path:** AWS SAM (`backend/template.yaml`) with API/Lambda/Dynamo/S3/Cognito intent
- **Build/tooling:** npm scripts, TypeScript compiler, Expo tooling
- **State management:** React local state (`useState`, `useEffect`), API-driven refreshes
- **UI/CSS libraries:** React Native core components + StyleSheet (no external UI framework detected)

## 3. App Navigation

Top-level navigation (from `mobile/App.tsx`):

- **Commons** — primary feed, post composer, threaded responses
- **Clubs** — club browse/create/manage/join flows
- **Projects** — project management (milestones, tasks, highlights, club links)
- **Profile** — user profile tabs + network management actions
- **Search** (nav action) — live suggestions while typing + explicit Find/Enter results

Current nav pattern: **SocialApp | Commons | Clubs | Projects | Profile | Search**

## 4. Major Features Implemented

Implemented or partially implemented in current code:

- Mock multi-user switching for local testing
- Follow system (one-way)
- Close Circle invite/respond/remove flow
- Mute and block relationship controls
- Global search endpoint + UI (users/clubs/projects)
- Posts with visibility controls (`PUBLIC`, `FOLLOWERS`, `CLOSE_CIRCLE`, `CLUB`, `PROJECT`)
- Commons feed + club feed + project feed routes
- Clubs: create/update/join/member roles (owner/moderator/member)
- Projects: create/list, project-club link requests and approvals
- Project milestones + milestone tasks
- Project highlights (also emits commons activity posts)
- Reactions on posts
- Threaded comments (Comments/Questions/Thank You/Suggestions)
- Report submission + admin moderation actions
- Moderation check endpoint and text gate against political content

## 5. Data Model Overview

Primary entities and key fields:

- **User**: `id`, `handle`, `displayName`, `bio?`, `createdAt`
- **Follow**: `followerId`, `followeeId`, `createdAt`
- **CloseCircleInvite**: `inviterId`, `inviteeId`, `status`, `createdAt`
- **Category**: `id`, `name`, `isActive`, `createdAt`
- **Club**: `id`, `categoryId`, `name`, `ownerId`, `isPublic`, `description?`, `createdAt`
- **ClubMember**: `clubId`, `userId`, `role`, `createdAt`
- **Project**: `id`, `ownerId`, `categoryId`, `title`, `description?`, `clubId?`, `createdBy?`, `createdAt`
- **ProjectClubLink** (local runtime type in server): `projectId`, `clubId`, `status`, `requestedBy`, `createdAt`
- **Post**: post identifiers + author + text + visibility + optional `clubId`/`projectId` + `tags` + moderation status
- **Reaction**: `postId`, `userId`, `type`, `createdAt`
- **Comment**: `id`, `postId`, `authorId`, `threadType`, `parentCommentId?`, `depth`, `textContent`, moderation state
- **Report**: `id`, `reporterId`, `targetType`, `targetId`, `reason`, `status`, `createdAt`
- **ModerationAction**: `id`, `targetType`, `targetId`, `actionType`, `actorId`, `reason`, `createdAt`

## 6. Backend Structure

Current backend organization:

- **`backend/src/localServer.ts`**: main Express API containing route handlers and in-memory state
- **`backend/src/domain/`**: core policy/types/seeded vocabularies
  - `types.ts` (domain model types)
  - `policy.ts` (visibility/reply rules)
  - `seedData.ts` (allowed categories/tags)
- **`backend/src/lib/`**: moderation engine + political term list + db utility stubs
- **`backend/src/handlers/`**: Lambda-style handlers (present for serverless direction)

Important endpoint groups visible:

- Health/config/search: `/health`, `/categories`, `/users`, `/search`
- Relationship graph: `/follow`, `/close-circle/*`, `/users/:id/*relationship*`, mute/block routes
- Feeds/posts: `/feed/commons`, `/feed/clubs`, `/feed/projects`, `/posts`
- Clubs/projects: `/clubs*`, `/projects*`, `/projects/:id/clubs*`, milestones/tasks/highlights routes
- Engagement/moderation: `/reactions`, `/comments`, `/reports`, `/admin/reports`, `/admin/moderation-actions`, `/moderation/check`

## 7. Frontend Structure

Frontend organization:

- **`mobile/App.tsx`**: root shell, nav, dev user selector, search interactions
- **`mobile/src/screens/`**:
  - `FeedScreen.tsx` (Commons)
  - `ClubsScreen.tsx`
  - `ProjectsScreen.tsx`
  - `ProfileScreen.tsx`
- **`mobile/src/api/client.ts`**: centralized API client and request wrappers
- **`mobile/src/auth/session.ts`**: mock auth/user session utilities
- **`mobile/src/config.ts`**: env-based runtime config (`EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_AUTH_MODE`)

Pattern: screen-centric UI with API-coupled state loading and mutation handlers.

## 8. Potential Structural Issues

- **Large backend file:** `localServer.ts` mixes routing, business rules, permissions, and in-memory persistence.
- **Boundary overlap:** some domain logic exists inline in routes rather than in dedicated services/modules.
- **Type duplication/drift risk:** API post shape in `localServer.ts` differs from domain `Post` model naming.
- **Mixed architecture direction:** Express local runtime + Lambda handler folders can diverge without shared service layer.
- **In-memory persistence:** useful for local dev but limits realistic integration and reliability testing.
- **Screen-level orchestration load:** some screens combine heavy UI + data orchestration, which may become hard to scale.

## 9. Recommended Improvements

- **Backend modularization:** split `localServer.ts` into feature route modules + service layer + repository layer.
- **Single shared domain contracts:** centralize DTOs/types for API payloads to reduce drift.
- **Feature folder boundaries:** align backend and frontend by feature (commons/clubs/projects/profile/moderation).
- **Persistence abstraction:** introduce repository interfaces now, then swap memory -> Dynamo implementations.
- **Shared policy services:** move visibility, permission, and moderation checks into reusable domain services.
- **AI-assist readiness:**
  - maintain `docs/architecture.md` as source of truth
  - keep per-feature docs/changelogs for major flows
  - enforce a “update architecture doc on meaningful change” completion checklist
- **Maintainability:** add targeted tests for policy/permission/moderation logic before deeper feature expansion.
