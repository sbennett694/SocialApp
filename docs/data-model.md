# Data Model

## High-Level Relationship Overview

SocialApp’s data model centers on **users**, their **social graph** (follow + close circle), and their **content/collaboration spaces** (clubs, projects, posts, comments). Categories provide controlled topic taxonomy. Moderation and safety are layered across content and user behavior through reports and moderation actions.

At a high level:
- Users connect to each other via `Follow` and `CloseCircleInvite`.
- Users create and join `Club` spaces, and create `Project` work items.
- Projects can be linked to multiple clubs via `ProjectClubLink`.
- Users publish `Post` content (including club/project-context posts), which can receive `Reaction` and `Comment` entries.
- Safety controls are captured through `Report` and `ModerationAction` records.

## Identity and ID Conventions

All entities use stable unique identifiers (`id` or `{entity}Id`) as primary references.
Relationships are expressed through explicit foreign-key style fields rather than implicit nesting.

Examples:
- `userId`
- `clubId`
- `projectId`
- `postId`

This keeps the model compatible with both relational storage and future key-value/document stores (e.g., DynamoDB).

## Relationship Diagram (Text)

```text
Category 1---* Club
Category 1---* Project

User 1---* Follow (as follower)
User 1---* Follow (as followee)

User 1---* CloseCircleInvite (as inviter)
User 1---* CloseCircleInvite (as invitee)

User 1---* Club (as owner)
Club 1---* ClubMember *---1 User

User 1---* Project (as owner/creator)
Project *---* Club (via ProjectClubLink)

User 1---* Post
Club 0..1 --- * Post
Project 0..1 --- * Post

Post/Project/Milestone/Task 1---* FeedEvent (projection)

Post 1---* Reaction *---1 User
Post 1---* Comment *---1 User

User 1---* Report
Report *---1 (target: User | Post | Comment)

ModerationAction *---1 (target: User | Post | Comment)
```

---

## Entity Summaries

### User
- **Purpose:** Core actor identity for social graph, content, clubs, and projects.
- **Key fields:** `id`, `handle`, `displayName` (plus optional profile metadata).
- **Relationships:**
  - One-to-many with `Follow` (as follower and followee)
  - One-to-many with `CloseCircleInvite` (as inviter/invitee)
  - One-to-many with `Club` (owner)
  - Many-to-many with `Club` via `ClubMember`
  - One-to-many with `Project` (owner/creator)
  - One-to-many with `Post`, `Comment`, `Reaction`, `Report`
- **Important constraints/rules:** User context drives visibility and permission checks in policy/service logic.

### Follow
- **Purpose:** One-way user-to-user relationship for audience/visibility decisions.
- **Key fields:** `followerId`, `followeeId`, `createdAt`.
- **Relationships:** Links two `User` records.
- **Important constraints/rules:** Direction matters (`follower -> followee`); used in feed visibility and relationship state.

### CloseCircleInvite
- **Purpose:** Managed invite lifecycle for close-circle relationships.
- **Key fields:** `inviterId`, `inviteeId`, `status`, `createdAt`.
- **Relationships:** Links two `User` records with status transitions.
- **Important constraints/rules:** Status lifecycle (`PENDING`, `ACCEPTED`, `DECLINED`, `BLOCKED`) gates close-circle visibility and permissions.

### Category
- **Purpose:** Controlled taxonomy for clubs and projects.
- **Key fields:** `id`, `name`, `isActive`.
- **Relationships:** One-to-many with `Club` and `Project`.
- **Important constraints/rules:** Only allowed/active categories are valid for creation flows.

### Club
- **Purpose:** Hobby/community grouping with ownership and membership roles.
- **Key fields:** `id`, `categoryId`, `name`, `ownerId`, `isPublic`, `description`, `createdAt`.
- **Relationships:**
  - Belongs to one `Category`
  - Owned by one `User`
  - Many-to-many with `User` through `ClubMember`
  - Linked to `Project` through `ProjectClubLink`
  - May scope `Post` visibility/content
- **Important constraints/rules:** Membership and role checks (`OWNER`, `MODERATOR`, `MEMBER`) drive admin actions, posting, and joins.

### ClubMember
- **Purpose:** Membership bridge between users and clubs, with role metadata.
- **Key fields:** `clubId`, `userId`, `role`, `createdAt`.
- **Relationships:** Bridge entity between `Club` and `User`.
- **Important constraints/rules:** Role-based authorization for moderation/admin operations inside clubs.

### Project
- **Purpose:** User- or club-associated project collaboration unit.
- **Key fields:** `id`, `ownerId`, `categoryId`, `title`, `description`, optional `clubId`, `createdBy`, `createdAt`.
- **Relationships:**
  - Belongs to one `Category`
  - Owned/created by `User`
  - Optional primary club association via `clubId`
  - Additional club associations via `ProjectClubLink`
  - Parent context for project-related `Post` activity
- **Important constraints/rules:** Project management actions depend on owner/admin permissions (including club admin context where applicable).

### ProjectClubLink
- **Purpose:** Approval-based association between projects and clubs.
- **Key fields:** `projectId`, `clubId`, `status`, `requestedBy`, `createdAt`.
- **Relationships:** Bridge between `Project` and `Club`.
- **Important constraints/rules:** Status-driven workflow (`PENDING`, `APPROVED`, `REJECTED`) controls visibility/association.

### Post
- **Purpose:** Primary social content item in commons/clubs/projects feeds.
- **Key fields:** `id`, `userId`, `text`, `createdAt`, `visibility`, optional `clubId`, optional `projectId`, moderation status, tags.
- **Relationships:**
  - Authored by `User`
  - Optional scope to `Club` and/or `Project`
  - Parent of `Reaction` and `Comment`
- **Important constraints/rules:** Visibility and moderation policy determine discoverability (`PUBLIC`, `FOLLOWERS`, `CLOSE_CIRCLE`, `CLUB`, `PROJECT`; hidden/flagged states).

### Reaction
- **Purpose:** Lightweight feedback signal on posts.
- **Key fields:** `postId`, `userId`, `type`, `createdAt`.
- **Relationships:** Belongs to one `Post` and one `User`.
- **Important constraints/rules:** Controlled reaction type vocabulary; one reaction per user per post (enforced by unique constraint on `userId + postId`).

### Comment
- **Purpose:** Threaded conversation attached to posts.
- **Key fields:** `id`, `postId`, `authorId`, `threadType`, `textContent`, `parentCommentId`, `depth`, `moderationState`, `createdAt`.
- **Relationships:**
  - Belongs to one `Post`
  - Authored by one `User`
  - Optional parent-child self-reference for threading
- **Important constraints/rules:** Reply depth and thread access are policy-controlled by relationship context and moderation checks.

### Report
- **Purpose:** User-generated moderation intake for unsafe/off-topic behavior.
- **Key fields:** `id`, `reporterId`, `targetType`, `targetId`, `reason`, `details`, `status`, `createdAt`.
- **Relationships:**
  - Reporter is a `User`
  - Target references `User`, `Post`, or `Comment`
- **Important constraints/rules:** Reason taxonomy includes political content and extremism/hate; reports feed moderation workflows.

### ModerationAction
- **Purpose:** Administrative enforcement log over moderated targets.
- **Key fields:** `id`, `targetType`, `targetId`, `actionType`, `actorId`, `reason`, `createdAt`.
- **Relationships:** Targets `User`, `Post`, or `Comment`; `actorId` references the user performing the moderation action (admin/moderator role).
- **Important constraints/rules:** Actions (e.g., hide/restore/suspend/ban) directly influence visibility and enforcement outcomes.

### FeedEvent
- **Purpose:** Feed projection record for Commons activity aggregation across canonical source entities.
- **Key fields:**
  - identity/order: `id`, `createdAt`, `sortTimestamp`
  - taxonomy: `eventType`, `contextType`
  - source pointer: `entityType`, `entityId`
  - actor/scope: `actorId`, `source`, `visibility`, optional `clubId`, optional `projectId`
  - moderation/lifecycle: `moderationState`, `isDeleted`
  - optional render payload: `summary`, `metadata`
- **Relationships:**
  - References canonical source entities via `entityType + entityId` (e.g., `Post`, `ProjectHighlight`, milestone, task, `Project`)
  - Carries the actor/scope context required for feed visibility checks
- **Important constraints/rules:**
  - Projection only: canonical entities remain source of truth
  - Emit only for feed-worthy user-visible actions (not every internal state change)
  - MVP event taxonomy:
    - `POST_CREATED`
    - `CLUB_POST_CREATED`
    - `PROJECT_HIGHLIGHT_CREATED`
    - `MILESTONE_COMPLETED`
    - `TASK_COMPLETED`
    - `PROJECT_CREATED`
  - Feed reads use deterministic ordering (`sortTimestamp DESC`, then `id DESC`)
  - Cursor pagination is based on `{ sortTimestamp, id }`
  - Visibility enforcement uses existing relationship model only:
    - follow and close-circle actor relationships
    - club membership (`ClubMember`)
    - project scope via existing fields/links (`Project.ownerId`, `Project.createdBy`, optional `Project.clubId`, approved `ProjectClubLink` + club membership)
