# CLAUDE HANDOFF (SocialApp)

## PROJECT OVERVIEW

SocialApp is a mobile-first collaboration and social coordination platform designed to help people organize work and progress in a social, lightweight way.

The app combines:
- Commons feed (posts/comments)
- Clubs
- Projects
- Milestones
- Tasks
- Club events
- Task time tracking

Primary goals:
- coordinate work socially
- show activity across projects/clubs
- track progress through milestones/tasks/events
- provide lightweight time tracking


## CURRENT FEATURE SYSTEMS

### Commons
- **Posts:** users can create feed posts with visibility and optional context.
- **Comments:** threaded response model is implemented for post interaction.
- **Feed navigation:** Commons supports navigation from other surfaces (Home/Notifications) into specific post targets where possible.

### Clubs
- **Club pages:** clubs have dedicated detail pages with tabs and role-aware actions.
- **Club highlight posts:** club-related highlights can be posted and surfaced.
- **Club events:** events can be created and browsed in club context.
- **Club history:** governance/history trail exists for auditability and timeline context.

### Projects
- **Projects:** projects can be created and viewed with ownership/context.
- **Milestones:** ordered milestone progression is supported.
- **Tasks:** milestone tasks support completion tracking.
- **Task scheduling:** milestone/task scheduling fields and editing flows exist.
- **Task time entries:** manual time logging exists (lightweight time tracking model).

### Activity / Notifications
- **Cross-system activity feed:** activity from Commons/Clubs/Projects is surfaced in unified feed-style experiences.
- **Notification routing:** notification taps are intended to route into the correct destination tab/screen and target item.

### Navigation Focus System
- **Container navigation vs child-target navigation:** navigation supports opening a destination container and optionally focusing a specific nested item.
- **Scroll-to-target behavior:** screens attempt to scroll target items into view when focus IDs are provided.
- **Highlight orientation behavior:** target items receive temporary visual emphasis to orient the user after cross-screen navigation.


## ARCHITECTURE OVERVIEW

### Mobile
- React Native app (Expo-based).
- Main navigation orchestration is centralized in:
  - `mobile/App.tsx`

### Backend
- Express API backend.
- Primary route surface is in:
  - `backend/src/api/routes/socialRoutes.ts`

### Data Layer
- Temporary in-memory persistence for local/dev/demo runs is in:
  - `backend/src/repositories/inMemoryStore.ts`

This store is used for development/demo data only.

**Important:**
`inMemoryStore.ts` is fragile and should not be modified unless explicitly required.


## IMPORTANT FILES

### Mobile
- `mobile/App.tsx`
  - Root app shell, top-level tab/navigation state, and cross-screen target handoff plumbing.
- `mobile/src/screens/`
  - Feature screens for Commons, Clubs, Projects, Home, Notifications, Profile.
  - Primary UI/UX behavior and focus/scroll handling live here.
- `mobile/src/api/client.ts`
  - Mobile API contract layer (typed request/response wrappers).
  - Changes here often cascade to multiple screens.
- `mobile/src/lib/`
  - Shared mobile utilities/hooks (e.g., temporary highlight behavior and common helpers).

### Backend
- `backend/src/api/routes/socialRoutes.ts`
  - Main route definitions for social/project/club/feed endpoints.
- `backend/src/domain/types.ts`
  - Core domain/type contracts shared across backend logic.
- `backend/src/repositories/inMemoryStore.ts`
  - Dev/demo in-memory persistence and seed/reset behavior.
  - Treat as sensitive; avoid modifications unless explicitly requested.

### Docs
- `docs/`
  - Architecture, data model, policy, roadmap, and AI-operational references.
  - Must be updated when architecture/behavior changes, not for cosmetic-only edits.


## DEVELOPMENT WORKFLOW USED SO FAR

The project follows an iterative, approval-driven workflow to reduce regressions and scope drift:

1. **Planning**
   - AI proposes an implementation plan.
2. **Approval**
   - Developer reviews and confirms scope.
3. **Implementation**
   - AI executes only the approved scope.
4. **Validation**
   - Typecheck/build commands are run before handoff.

This workflow exists specifically to prevent scope drift and accidental cross-layer changes.


## KNOWN PAIN POINTS FROM PREVIOUS AI WORK

### 1) Scope drift
- Agents have sometimes modified unrelated backend files during mobile-only tasks.
- Specific example: accidental edits to `backend/src/repositories/inMemoryStore.ts`.
- This must be avoided unless backend work is explicitly requested.

### 2) Navigation bugs
- Cross-screen navigation has at times highlighted the wrong element.
- Correct behavior:
  - container navigation should not highlight container
  - child-target navigation should scroll and highlight only the target item

### 3) Overly aggressive animations
- Highlight animations should be subtle and temporary.
- Avoid pulsing/looping effects.

### 4) Context loss
- Agents sometimes lose track of navigation architecture or feature boundaries during long sessions.
- Future agents should read this document before implementing changes.


## DEVELOPMENT GUARDRAILS

- Prefer minimal, safe fixes.
- Avoid architecture refactors unless explicitly requested.
- Keep mobile navigation logic centralized.
- Keep backend demo store stable.
- Apply highlight behavior only to granular target items.


## BUILD AND VALIDATION COMMANDS

### Mobile
```bash
npm --prefix mobile run typecheck
```

### Backend
```bash
npm --prefix backend run build
```


## CURRENT KNOWN ISSUES

- Notification → milestone highlighting
- Notification → task highlighting
- Notification → comment navigation

Expected behavior for all:
- scroll to the specific target item
- highlight only that item (not container-level cards)


## NEXT SUGGESTED TASKS

Small, logical backlog items:

1. **Navigation polish**
   - Standardize focus-ID contracts across Home/Notifications/Commons/Clubs/Projects.
   - Harden fallback behavior when target items are missing/filtered out.

2. **Time-entry UX improvements**
   - Improve manual time-entry affordances (quick add, clearer totals, cleaner edit/delete flows).
   - Add stronger visual linkage from task rows to their time logs.

3. **Timeline views**
   - Add richer timeline/history views for project progress and club activity.
   - Improve event grouping/readability for high-volume activity.

4. **Notification UX**
   - Improve destination precision (deep-link quality) and read-state feedback.
   - Reduce noisy/low-value notifications and clarify notification categories.
