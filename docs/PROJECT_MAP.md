# PROJECT MAP (SocialApp)

## 1) Repository Overview

- `backend/`
  - Express API, domain models, service logic, repositories, local server bootstrap.
- `mobile/`
  - React Native (Expo) app, screen-level UX flows, API client, auth/session helpers.
- `docs/`
  - Architecture/data-model references, AI guardrails, onboarding and handoff docs.
- `scripts/`
  - Local development launch/relaunch helpers and dev workflow automation scripts.


## 2) Mobile App Map

### Core files/directories

- `mobile/App.tsx`
  - Root app container.
  - Top-level tab navigation and cross-tab routing state.
  - Focus-ID handoff between tabs/screens.

- `mobile/src/screens/`
  - Feature screen implementations and user interaction flows.

- `mobile/src/api/client.ts`
  - Typed API client layer for backend HTTP calls.
  - Shared request/response contracts used by screens.

- `mobile/src/auth/session.ts`
  - Mock/auth session utilities and current-user context helpers.

- `mobile/src/lib/`
  - Shared UI/behavior utilities (e.g., temporary highlight behavior).

### Screen map (`mobile/src/screens/`)

- `mobile/src/screens/HomeScreen.tsx`
  - Home dashboard surface.
  - Activity cards and summary sections.
  - Cross-tab navigation entry points.

- `mobile/src/screens/FeedScreen.tsx`
  - Commons feed.
  - Post threads and response interactions.
  - Comment/post-target navigation handling.

- `mobile/src/screens/ClubsScreen.tsx`
  - Clubs hub and club detail views.
  - Club highlight posts and club events.
  - Membership/project-request/governance interactions.

- `mobile/src/screens/ProjectsScreen.tsx`
  - Project detail views.
  - Milestones and tasks.
  - Task scheduling and task time entries.

- `mobile/src/screens/NotificationsScreen.tsx`
  - Notifications list UI.
  - Read/unread handling and destination routing triggers.

- `mobile/src/screens/ProfileScreen.tsx`
  - Profile and user-centric content views.
  - Navigation to related detail surfaces.


## 3) Backend Map

- `backend/src/server.ts`
  - Main Express app composition (middleware + routes).

- `backend/src/localServer.ts`
  - Local runtime bootstrap/entrypoint for development API server.

- `backend/src/api/routes/socialRoutes.ts`
  - Primary API route definitions for social/club/project/feed functionality.

- `backend/src/services/`
  - Business logic orchestration (social flows, feed/event query logic).

- `backend/src/repositories/`
  - Persistence abstraction and repository implementations.

- `backend/src/domain/`
  - Core types, policy logic, feed/club-history domain models, seed-related domain definitions.

- `backend/src/repositories/inMemoryStore.ts`
  - Development-only in-memory persistence layer.
  - **Do not modify unless explicitly required.**


## 4) Documentation Map

- `docs/architecture.md`
  - Canonical architecture source of truth and system boundaries.

- `docs/data-model.md`
  - Entity/relationship definitions and model semantics.

- `docs/AI_CONTEXT.md`
  - AI-facing working context and project-specific implementation background.

- `docs/AI_RULES.md`
  - Required AI workflow rules and execution constraints.

- `docs/AI_LIMITS.md`
  - Scope/behavior limits for AI contributors.

- `docs/CLAUDE_HANDOFF.md`
  - Onboarding handoff for new coding agents (technical + workflow pain points).

- `docs/PROJECT_MAP.md`
  - Fast repository navigation map for AI/human contributors.


## 5) Navigation System Overview

- Cross-tab navigation and focus-ID orchestration is centralized in:
  - `mobile/App.tsx`

- Tab/screen destinations and target behaviors are implemented primarily in:
  - `mobile/src/screens/HomeScreen.tsx`
  - `mobile/src/screens/FeedScreen.tsx`
  - `mobile/src/screens/ClubsScreen.tsx`
  - `mobile/src/screens/ProjectsScreen.tsx`

- General behavior model:
  - Container navigation opens destination tab/screen.
  - Child-target navigation passes focus IDs.
  - Destination screen scrolls to target and applies temporary orientation highlight.


## 6) AI Safety Notes

- Avoid modifying `backend/src/repositories/inMemoryStore.ts` unless explicitly required.
- Prefer minimal, scoped changes over broad refactors.
- Follow:
  - `docs/AI_RULES.md`
  - `docs/AI_LIMITS.md`
