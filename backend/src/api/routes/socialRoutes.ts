import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { canReplyAtDepth, canViewPost } from "../../domain/policy";
import { FeedCursor, FeedEvent } from "../../domain/feedEvent";
import { allowedCategories, controlledPostTags } from "../../domain/seedData";
import {
  Club,
  ClubEvent,
  ClubEventStatus,
  ClubEventVisibility,
  ClubJoinPolicy,
  ClubJoinRequest,
  ClubMember,
  Comment,
  CloseCircleInvite,
  ModerationAction,
  PostTag,
  Project,
  ReactionType,
  Reaction,
  Report,
  ReportReason,
  TaskTimeEntry,
  ThreadType,
  Visibility
} from "../../domain/types";
import { evaluateText } from "../../lib/moderationEngine";
import {
  GlobalSearchResult,
  LocalPost as Post,
  ProjectClubLink,
  ProjectHighlight,
  ProjectMilestone,
  ProjectMilestoneTask,
  resetStoreToDefault,
  seedStoreWithDemoData,
  store
} from "../../repositories/store";
import {
  assertClubHasExactlyOneOwner,
  assertFounderImmutable,
  canManageClub,
  canViewProject,
  getClubMembershipRole,
  canManageProject,
  getProjectMilestonesOrdered,
  publishActivityPost,
  resolveProjectVisibility,
  relationKey
  ,transferClubOwnershipAtomic
} from "../../services/socialService";
import { feedEventService } from "../../services/feedEventService";
import { feedQueryService } from "../../services/feedQueryService";
import { clubHistoryRepository } from "../../repositories/clubHistoryRepository";

const router = Router();

function isDevSeedRoutesEnabled(): boolean {
  if (process.env.SOCIALAPP_ENABLE_DEV_SEED_ROUTES === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function buildSeedSummary() {
  return {
    users: store.users.length,
    follows: store.follows.length,
    closeCircleInvites: store.closeCircleInvites.length,
    clubs: store.clubs.length,
    clubEvents: store.clubEvents.length,
    clubMembers: store.clubMembers.length,
    projects: store.projects.length,
    projectClubLinks: store.projectClubLinks.length,
    milestones: store.projectMilestones.length,
    highlights: store.projectHighlights.length,
    taskTimeEntries: store.taskTimeEntries.length,
    posts: store.posts.length,
    comments: store.comments.length,
    reactions: store.reactions.length,
    feedEvents: store.feedEvents.length,
    clubHistoryEvents: store.clubHistoryEvents.length
  };
}

const {
  users,
  follows,
  closeCircleInvites,
  clubMembers,
  clubs,
  clubJoinRequests,
  clubEvents,
  projects,
  projectClubLinks,
  projectMilestones,
  taskTimeEntries,
  projectHighlights,
  reactions,
  comments,
  reports,
  moderationActions,
  mutedPairs,
  blockedPairs,
  posts
} = store;

function emitFeedEventSafely(action: () => void) {
  try {
    action();
  } catch (error) {
    // Keep canonical write successful; event projection can be retried/backfilled later.
    console.error("FeedEvent emission failed", error);
  }
}

function decodeFeedCursor(rawCursor: string | undefined): FeedCursor | undefined {
  if (!rawCursor) return undefined;
  try {
    const decoded = Buffer.from(rawCursor, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as FeedCursor;
    if (!parsed?.sortTimestamp || !parsed?.id) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function encodeFeedCursor(cursor: FeedCursor | undefined): string | undefined {
  if (!cursor) return undefined;
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

const allowedClubEventVisibility: ClubEventVisibility[] = ["CLUB_MEMBERS", "PUBLIC_CLUB"];
const allowedClubEventStatuses: ClubEventStatus[] = ["SCHEDULED", "CANCELLED"];
const allowedClubJoinPolicies: ClubJoinPolicy[] = ["OPEN", "REQUEST_REQUIRED", "INVITE_ONLY"];

function resolveClubJoinPolicy(club: Club): ClubJoinPolicy {
  if (club.joinPolicy && allowedClubJoinPolicies.includes(club.joinPolicy)) {
    return club.joinPolicy;
  }
  return club.isPublic ? "OPEN" : "REQUEST_REQUIRED";
}

function parseIsoDate(rawValue: unknown): string | null {
  if (typeof rawValue !== "string" || !rawValue.trim()) return null;
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseOptionalIsoDateField(
  rawValue: unknown,
  fieldName: "startAt" | "dueAt"
): { provided: boolean; value: string | undefined; error?: string } {
  if (rawValue === undefined) {
    return { provided: false, value: undefined };
  }

  if (rawValue === null) {
    return { provided: true, value: undefined };
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return { provided: true, value: undefined };
    }
    const parsed = parseIsoDate(trimmed);
    if (!parsed) {
      return { provided: true, value: undefined, error: `${fieldName} must be a valid ISO date string when provided.` };
    }
    return { provided: true, value: parsed };
  }

  return { provided: true, value: undefined, error: `${fieldName} must be a valid ISO date string when provided.` };
}

function validateStartDueOrder(startAt: string | undefined, dueAt: string | undefined): string | null {
  if (!startAt || !dueAt) return null;
  if (new Date(startAt).getTime() > new Date(dueAt).getTime()) {
    return "startAt must be before or equal to dueAt.";
  }
  return null;
}

function getProjectMilestoneTaskContext(projectId: string, milestoneId: string, taskId: string): {
  project: Project;
  milestone: ProjectMilestone;
  task: ProjectMilestoneTask;
} | null {
  const project = projects.find((entry) => entry.id === projectId);
  if (!project) return null;

  const milestone = projectMilestones.find((item) => item.id === milestoneId && item.projectId === projectId);
  if (!milestone) return null;

  const task = milestone.tasks.find((item) => item.id === taskId);
  if (!task) return null;

  return { project, milestone, task };
}

function getTaskTimeEntries(taskId: string): TaskTimeEntry[] {
  return taskTimeEntries.filter((entry) => entry.taskId === taskId && !entry.isDeleted);
}

function getTaskTotalMinutes(taskId: string): number {
  return getTaskTimeEntries(taskId).reduce((sum, entry) => sum + entry.durationMinutes, 0);
}

function toLegacyPostFromFeedEvent(event: FeedEvent): Post | null {
  if (event.entityType === "POST") {
    return posts.find((post) => post.postId === event.entityId) ?? null;
  }

  if (event.entityType === "PROJECT_HIGHLIGHT") {
    const highlight = projectHighlights.find((item) => item.id === event.entityId);
    if (!highlight) return null;
    return {
      postId: `event:${event.id}`,
      userId: event.actorId,
      text: highlight.text,
      createdAt: event.sortTimestamp,
      moderationStatus: "approved",
      visibility: event.visibility,
      clubId: event.clubId,
      projectId: event.projectId,
      postedAsClub: !!event.clubId,
      clubActorId: event.clubId ? event.actorId : undefined,
      tags: ["SHOWCASE"]
    };
  }

  if (event.entityType === "PROJECT_MILESTONE") {
    const milestone = projectMilestones.find((item) => item.id === event.entityId);
    if (!milestone) return null;
    const project = projects.find((item) => item.id === milestone.projectId);
    return {
      postId: `event:${event.id}`,
      userId: event.actorId,
      text: `Milestone completed: ${milestone.title}`,
      createdAt: event.sortTimestamp,
      moderationStatus: "approved",
      visibility: event.visibility,
      clubId: event.clubId,
      projectId: event.projectId ?? project?.id,
      tags: ["PROGRESS"]
    };
  }

  if (event.entityType === "PROJECT_TASK") {
    let taskText = "Task completed";
    for (const milestone of projectMilestones) {
      const task = milestone.tasks.find((item) => item.id === event.entityId);
      if (task) {
        taskText = `Task completed: ${task.text}`;
        break;
      }
    }

    return {
      postId: `event:${event.id}`,
      userId: event.actorId,
      text: taskText,
      createdAt: event.sortTimestamp,
      moderationStatus: "approved",
      visibility: event.visibility,
      clubId: event.clubId,
      projectId: event.projectId,
      tags: ["PROGRESS"]
    };
  }

  if (event.entityType === "PROJECT") {
    const project = projects.find((item) => item.id === event.entityId);
    if (!project) return null;
    return {
      postId: `event:${event.id}`,
      userId: event.actorId,
      text: `Project created: ${project.title}`,
      createdAt: event.sortTimestamp,
      moderationStatus: "approved",
      visibility: event.visibility,
      clubId: event.clubId,
      projectId: event.projectId ?? project.id,
      tags: ["SHOWCASE"]
    };
  }

  return null;
}

function isViewerProjectScoped(viewerId: string, projectId?: string): boolean {
  if (!projectId) return false;
  const project = projects.find((entry) => entry.id === projectId);
  if (!project) return false;
  return canViewProject(project, viewerId);
}

function projectFeedVisibility(project: Project): Visibility {
  return project.visibility === "PUBLIC" ? "PUBLIC" : "PROJECT";
}

function ensureProjectReadable(projectId: string, viewerId: string): Project | null {
  const project = projects.find((entry) => entry.id === projectId);
  if (!project) return null;
  if (!canViewProject(project, viewerId)) return null;
  return project;
}

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.post("/dev/reset-data", (_req, res) => {
  if (!isDevSeedRoutesEnabled()) {
    return res.status(404).json({ message: "Not found." });
  }

  resetStoreToDefault();
  return res.json({ ok: true, mode: "default", summary: buildSeedSummary() });
});

router.post("/dev/seed-demo-data", (_req, res) => {
  if (!isDevSeedRoutesEnabled()) {
    return res.status(404).json({ message: "Not found." });
  }

  seedStoreWithDemoData();
  return res.json({ ok: true, mode: "demo", summary: buildSeedSummary() });
});

router.get("/categories", (_req, res) => {
  res.json({ categories: allowedCategories, tags: controlledPostTags });
});

router.get("/users", (_req, res) => {
  res.json(users);
});

router.get("/search", (req, res) => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  if (!q) {
    const empty: GlobalSearchResult = { users: [], clubs: [], projects: [] };
    return res.json(empty);
  }

  const usersResult = users
    .filter((u) => `${u.handle} ${u.displayName}`.toLowerCase().includes(q))
    .slice(0, 8)
    .map((u) => ({ ...u, type: "USER" as const }));

  const clubsResult = clubs
    .filter((club) => `${club.name} ${club.categoryId}`.toLowerCase().includes(q))
    .slice(0, 8)
    .map((club) => ({ id: club.id, name: club.name, categoryId: club.categoryId, type: "CLUB" as const }));

  const projectsResult = projects
    .filter((project) => `${project.title} ${project.description ?? ""}`.toLowerCase().includes(q))
    .slice(0, 8)
    .map((project) => ({ id: project.id, title: project.title, categoryId: project.categoryId, type: "PROJECT" as const }));

  const result: GlobalSearchResult = {
    users: usersResult,
    clubs: clubsResult,
    projects: projectsResult
  };
  return res.json(result);
});

router.post("/follow", (req, res) => {
  const followerId = String(req.body?.followerId ?? "");
  const followeeId = String(req.body?.followeeId ?? "");

  if (!followerId || !followeeId || followerId === followeeId) {
    return res.status(400).json({ message: "Valid followerId and followeeId are required." });
  }

  if (blockedPairs.has(relationKey(followeeId, followerId))) {
    return res.status(403).json({ message: "You are blocked by this user." });
  }

  const existing = follows.find((f) => f.followerId === followerId && f.followeeId === followeeId);
  if (!existing) {
    follows.push({ followerId, followeeId, createdAt: new Date().toISOString() });
  }

  return res.status(201).json({ ok: true });
});

router.delete("/follow", (req, res) => {
  const followerId = String(req.body?.followerId ?? "");
  const followeeId = String(req.body?.followeeId ?? "");

  const index = follows.findIndex((f) => f.followerId === followerId && f.followeeId === followeeId);
  if (index >= 0) {
    follows.splice(index, 1);
  }

  return res.json({ ok: true });
});

router.get("/users/:userId/following", (req, res) => {
  const userId = String(req.params.userId);
  res.json(follows.filter((f) => f.followerId === userId));
});

router.get("/users/:userId/followers", (req, res) => {
  const userId = String(req.params.userId);
  res.json(follows.filter((f) => f.followeeId === userId));
});

router.post("/close-circle/invite", (req, res) => {
  const inviterId = String(req.body?.inviterId ?? "");
  const inviteeId = String(req.body?.inviteeId ?? "");

  if (!inviterId || !inviteeId || inviterId === inviteeId) {
    return res.status(400).json({ message: "Valid inviterId and inviteeId are required." });
  }

  const existing = closeCircleInvites.find(
    (i) => i.inviterId === inviterId && i.inviteeId === inviteeId && i.status === "PENDING"
  );

  if (!existing) {
    closeCircleInvites.push({
      inviterId,
      inviteeId,
      status: "PENDING",
      createdAt: new Date().toISOString()
    });
  }

  return res.status(201).json({ ok: true });
});

router.post("/close-circle/respond", (req, res) => {
  const inviterId = String(req.body?.inviterId ?? "");
  const inviteeId = String(req.body?.inviteeId ?? "");
  const status = String(req.body?.status ?? "").toUpperCase() as CloseCircleInvite["status"];

  const invite = closeCircleInvites.find(
    (i) => i.inviterId === inviterId && i.inviteeId === inviteeId && i.status === "PENDING"
  );

  if (!invite) {
    return res.status(404).json({ message: "Pending invite not found." });
  }

  if (!["ACCEPTED", "DECLINED", "BLOCKED"].includes(status)) {
    return res.status(400).json({ message: "Invalid response status." });
  }

  invite.status = status;
  return res.json(invite);
});

router.delete("/close-circle", (req, res) => {
  const userA = String(req.body?.userA ?? "");
  const userB = String(req.body?.userB ?? "");

  if (!userA || !userB || userA === userB) {
    return res.status(400).json({ message: "Valid userA and userB are required." });
  }

  for (let i = closeCircleInvites.length - 1; i >= 0; i--) {
    const invite = closeCircleInvites[i];
    const isPair =
      (invite.inviterId === userA && invite.inviteeId === userB) ||
      (invite.inviterId === userB && invite.inviteeId === userA);
    if (isPair && invite.status === "ACCEPTED") {
      closeCircleInvites.splice(i, 1);
    }
  }

  return res.json({ ok: true });
});

router.get("/users/:userId/close-circle", (req, res) => {
  const userId = String(req.params.userId);
  const accepted = closeCircleInvites.filter(
    (i) => i.status === "ACCEPTED" && (i.inviterId === userId || i.inviteeId === userId)
  );
  res.json(accepted);
});

router.get("/users/:userId/close-circle/invites", (req, res) => {
  const userId = String(req.params.userId);
  const incoming = closeCircleInvites.filter((i) => i.inviteeId === userId && i.status === "PENDING");
  const outgoing = closeCircleInvites.filter((i) => i.inviterId === userId && i.status === "PENDING");
  res.json({ incoming, outgoing });
});

router.get("/users/:userId/profile-summary", (req, res) => {
  const userId = String(req.params.userId);
  const profile = users.find((u) => u.id === userId);

  if (!profile) {
    return res.status(404).json({ message: "User not found." });
  }

  const followerCount = follows.filter((f) => f.followeeId === userId).length;
  const followingCount = follows.filter((f) => f.followerId === userId).length;
  const closeCircleCount = closeCircleInvites.filter(
    (i) => i.status === "ACCEPTED" && (i.inviterId === userId || i.inviteeId === userId)
  ).length;
  const projectCount = projects.filter((p) => p.ownerId === userId).length;

  res.json({
    ...profile,
    bio: "Hobby enthusiast",
    avatar: null,
    counts: { followerCount, followingCount, closeCircleCount, projectCount }
  });
});

router.get("/users/:userId/relationship-to-me", (req, res) => {
  const targetUserId = String(req.params.userId);
  const viewerId = String(req.query.viewerId ?? "");

  const isFollowing = follows.some((f) => f.followerId === viewerId && f.followeeId === targetUserId);
  const isFollowedBy = follows.some((f) => f.followerId === targetUserId && f.followeeId === viewerId);
  const invite = closeCircleInvites.find(
    (i) =>
      (i.inviterId === viewerId && i.inviteeId === targetUserId) ||
      (i.inviterId === targetUserId && i.inviteeId === viewerId)
  );

  const closeCircleStatus = invite?.status ?? "NONE";
  const isMuted = mutedPairs.has(relationKey(viewerId, targetUserId));
  const isBlocked = blockedPairs.has(relationKey(viewerId, targetUserId));

  res.json({ isFollowing, isFollowedBy, closeCircleStatus, isMuted, isBlocked });
});

router.post("/users/:userId/mute", (req, res) => {
  const targetUserId = String(req.params.userId);
  const viewerId = String(req.body?.viewerId ?? "");
  mutedPairs.add(relationKey(viewerId, targetUserId));
  res.status(201).json({ ok: true });
});

router.delete("/users/:userId/mute", (req, res) => {
  const targetUserId = String(req.params.userId);
  const viewerId = String(req.body?.viewerId ?? "");
  mutedPairs.delete(relationKey(viewerId, targetUserId));
  res.json({ ok: true });
});

router.post("/users/:userId/block", (req, res) => {
  const targetUserId = String(req.params.userId);
  const viewerId = String(req.body?.viewerId ?? "");
  blockedPairs.add(relationKey(viewerId, targetUserId));
  res.status(201).json({ ok: true });
});

router.delete("/users/:userId/block", (req, res) => {
  const targetUserId = String(req.params.userId);
  const viewerId = String(req.body?.viewerId ?? "");
  blockedPairs.delete(relationKey(viewerId, targetUserId));
  res.json({ ok: true });
});

router.get("/users/:userId/posts", (req, res) => {
  const userId = String(req.params.userId);
  res.json(posts.filter((p) => p.userId === userId));
});

router.get("/users/:userId/projects", (req, res) => {
  const userId = String(req.params.userId);
  res.json(projects.filter((p) => p.ownerId === userId));
});

router.get("/users/:userId/clubs", (req, res) => {
  const userId = String(req.params.userId);
  const memberClubIds = new Set(clubMembers.filter((m) => m.userId === userId).map((m) => m.clubId));
  res.json(clubs.filter((club) => club.ownerId === userId || memberClubIds.has(club.id)));
});

router.get("/feed/commons", (req, res) => {
  const viewerId = String(req.query.viewerId ?? "");
  const mode = String(req.query.mode ?? "posts").toLowerCase();

  if (mode === "events") {
    const source = req.query.source ? String(req.query.source).toUpperCase() : undefined;
    const eventType = req.query.eventType ? String(req.query.eventType).toUpperCase() : undefined;
    const clubId = req.query.clubId ? String(req.query.clubId) : undefined;
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const actorId = req.query.actorId ? String(req.query.actorId) : undefined;
    const limitRaw = req.query.limit ? Number(req.query.limit) : undefined;
    const cursor = decodeFeedCursor(req.query.cursor ? String(req.query.cursor) : undefined);
    const shape = String(req.query.shape ?? "events").toLowerCase();

    const result = feedQueryService.queryCommonsFeed({
      viewerId,
      filters: {
        source: source as "COMMONS" | "CLUBS" | "PROJECTS" | undefined,
        eventType: eventType as
          | "POST_CREATED"
          | "CLUB_POST_CREATED"
          | "PROJECT_HIGHLIGHT_CREATED"
          | "MILESTONE_COMPLETED"
          | "TASK_COMPLETED"
          | "PROJECT_CREATED"
          | undefined,
        clubId,
        projectId,
        actorId
      },
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
      cursor
    });

    if (shape === "legacy") {
      const legacyItems = result.events.map(toLegacyPostFromFeedEvent).filter((item): item is Post => !!item);
      return res.json({
        mode: "events",
        shape: "legacy",
        items: legacyItems,
        nextCursor: encodeFeedCursor(result.nextCursor)
      });
    }

    return res.json({
      mode: "events",
      shape: "events",
      items: result.events,
      nextCursor: encodeFeedCursor(result.nextCursor)
    });
  }

  const commons = posts.filter(
    (post) => {
      if (mutedPairs.has(relationKey(viewerId, post.userId))) {
        return false;
      }

      if (blockedPairs.has(relationKey(viewerId, post.userId)) || blockedPairs.has(relationKey(post.userId, viewerId))) {
        return false;
      }

      return canViewPost({
        viewerId,
        authorId: post.userId,
        visibility: post.visibility,
        moderationState:
          post.moderationStatus === "hidden" ? "HIDDEN" : post.moderationStatus === "flagged" ? "FLAGGED" : "OK",
        isFollower: follows.some((f) => f.followerId === viewerId && f.followeeId === post.userId),
        isCloseCircle: closeCircleInvites.some(
          (i) =>
            i.status === "ACCEPTED" &&
            ((i.inviterId === viewerId && i.inviteeId === post.userId) ||
              (i.inviterId === post.userId && i.inviteeId === viewerId))
        ),
        isClubMember: !!post.clubId && clubMembers.some((m) => m.clubId === post.clubId && m.userId === viewerId),
        canViewProject: isViewerProjectScoped(viewerId, post.projectId)
      });
    }
  );
  res.json(commons);
});

router.get("/feed/clubs", (req, res) => {
  const viewerId = String(req.query.viewerId ?? "");
  const clubId = req.query.clubId ? String(req.query.clubId) : undefined;
  const memberClubIds = new Set(clubMembers.filter((m) => m.userId === viewerId).map((m) => m.clubId));
  const accessibleClubIds = new Set(
    clubs
      .filter((club) => club.isPublic || club.ownerId === viewerId || memberClubIds.has(club.id))
      .map((club) => club.id)
  );

  const clubPosts = posts.filter((p) => {
    if (p.visibility !== "CLUB" || !p.clubId) return false;
    if (!accessibleClubIds.has(p.clubId)) return false;
    if (clubId && p.clubId !== clubId) return false;
    return true;
  });

  res.json(clubPosts);
});

router.get("/clubs/highlights", (req, res) => {
  const viewerId = String(req.query.viewerId ?? "");
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  const followingIds = new Set(follows.filter((f) => f.followerId === viewerId).map((f) => f.followeeId));
  const memberClubIds = new Set(clubMembers.filter((m) => m.userId === viewerId).map((m) => m.clubId));

  const categoryFiltered = clubs.filter((club) => (categoryId ? club.categoryId === categoryId : true));

  const mine = categoryFiltered.filter((club) => club.ownerId === viewerId);
  const joined = categoryFiltered.filter((club) => memberClubIds.has(club.id) && club.ownerId !== viewerId);
  const friends = categoryFiltered.filter(
    (club) => followingIds.has(club.ownerId) || clubMembers.some((m) => followingIds.has(m.userId) && m.clubId === club.id)
  );
  const suggested = categoryFiltered.filter(
    (club) => club.isPublic && club.ownerId !== viewerId && !memberClubIds.has(club.id)
  );

  const latestPostByClub = new Map<string, Post>();
  posts
    .filter((post) => post.visibility === "CLUB" && post.clubId)
    .forEach((post) => {
      if (!post.clubId) return;
      if (!latestPostByClub.has(post.clubId)) {
        latestPostByClub.set(post.clubId, post);
      }
    });

  const withSample = (items: Club[]) =>
    items.map((club) => ({
      club,
      samplePost: latestPostByClub.get(club.id) ?? null
    }));

  res.json({
    joined: withSample(joined),
    friends: withSample(friends),
    mine: withSample(mine),
    suggested: withSample(suggested).slice(0, 12)
  });
});

router.get("/feed/projects", (req, res) => {
  const viewerId = String(req.query.viewerId ?? "");
  const projectIds = projects.filter((p) => p.ownerId === viewerId).map((p) => p.id);
  const projectPosts = posts.filter((p) => !!p.projectId && projectIds.includes(p.projectId));
  res.json(projectPosts);
});

router.get("/notifications", (req, res) => {
  const viewerId = String(req.query.viewerId ?? "").trim();
  const limitRaw = req.query.limit ? Number(req.query.limit) : 80;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 80;

  if (!viewerId) {
    return res.status(400).json({ message: "viewerId is required." });
  }

  const viewerPostIds = new Set(posts.filter((post) => post.userId === viewerId).map((post) => post.postId));
  const viewerProjectIds = new Set(projects.filter((project) => project.ownerId === viewerId).map((project) => project.id));

  const notificationItems: Array<{
    id: string;
    type:
      | "POST_COMMENTED"
      | "POST_REACTED"
      | "CLUB_OWNERSHIP_TRANSFERRED_TO_YOU"
      | "CLUB_MODERATOR_PROMOTED"
      | "CLUB_MODERATOR_DEMOTED"
      | "CLUB_MEMBER_REMOVED"
      | "PROJECT_MILESTONE_COMPLETED"
      | "PROJECT_TASK_COMPLETED"
      | "PROJECT_CLUB_REQUEST_APPROVED"
      | "PROJECT_CLUB_REQUEST_REJECTED";
    actorId: string;
    message: string;
    relatedType: "POST" | "PROJECT" | "CLUB";
    relatedId: string;
    entityId?: string;
    threadType?: ThreadType;
    postId?: string;
    projectId?: string;
    clubId?: string;
    createdAt: string;
  }> = [];

  comments
    .filter((comment) => viewerPostIds.has(comment.postId) && comment.authorId !== viewerId)
    .forEach((comment) => {
      notificationItems.push({
        id: `comment:${comment.id}`,
        type: "POST_COMMENTED",
        actorId: comment.authorId,
        message: `@${comment.authorId} commented on your post`,
        relatedType: "POST",
        relatedId: comment.postId,
        entityId: comment.id,
        threadType: comment.threadType,
        postId: comment.postId,
        createdAt: comment.createdAt
      });
    });

  reactions
    .filter((reaction) => viewerPostIds.has(reaction.postId) && reaction.userId !== viewerId)
    .forEach((reaction) => {
      notificationItems.push({
        id: `reaction:${reaction.postId}:${reaction.userId}:${reaction.createdAt}`,
        type: "POST_REACTED",
        actorId: reaction.userId,
        message: `@${reaction.userId} reacted to your post`,
        relatedType: "POST",
        relatedId: reaction.postId,
        postId: reaction.postId,
        createdAt: reaction.createdAt
      });
    });

  store.feedEvents
    .filter(
      (event) =>
        (event.eventType === "MILESTONE_COMPLETED" || event.eventType === "TASK_COMPLETED") &&
        !!event.projectId &&
        viewerProjectIds.has(event.projectId) &&
        event.actorId !== viewerId
    )
    .forEach((event) => {
      const project = event.projectId ? projects.find((entry) => entry.id === event.projectId) : undefined;
      const projectTitle = project?.title ?? "your project";

      notificationItems.push({
        id: `project-progress:${event.id}`,
        type: event.eventType === "MILESTONE_COMPLETED" ? "PROJECT_MILESTONE_COMPLETED" : "PROJECT_TASK_COMPLETED",
        actorId: event.actorId,
        message:
          event.eventType === "MILESTONE_COMPLETED"
            ? `@${event.actorId} completed a milestone in ${projectTitle}`
            : `@${event.actorId} completed a task in ${projectTitle}`,
        relatedType: "PROJECT",
        relatedId: event.projectId ?? event.entityId,
        entityId: event.entityId,
        projectId: event.projectId,
        clubId: event.clubId,
        createdAt: event.sortTimestamp
      });
    });

  projectClubLinks
    .filter((link) => link.requestedBy === viewerId && (link.status === "APPROVED" || link.status === "REJECTED"))
    .forEach((link) => {
      const club = clubs.find((entry) => entry.id === link.clubId);
      const project = projects.find((entry) => entry.id === link.projectId);
      const clubName = club?.name ?? "club";
      const projectTitle = project?.title ?? "project";
      notificationItems.push({
        id: `project-club-link:${link.projectId}:${link.clubId}:${link.status}:${link.createdAt}`,
        type: link.status === "APPROVED" ? "PROJECT_CLUB_REQUEST_APPROVED" : "PROJECT_CLUB_REQUEST_REJECTED",
        actorId: club?.ownerId ?? "club-admin",
        message:
          link.status === "APPROVED"
            ? `Your project ${projectTitle} was approved to join ${clubName}`
            : `Your project ${projectTitle} was rejected by ${clubName}`,
        relatedType: "PROJECT",
        relatedId: link.projectId,
        projectId: link.projectId,
        clubId: link.clubId,
        createdAt: link.createdAt
      });
    });

  store.clubHistoryEvents
    .filter((event) => event.subjectUserId === viewerId)
    .forEach((event) => {
      const club = clubs.find((entry) => entry.id === event.clubId);
      const clubName = club?.name ?? "club";
      const actorId = event.actorId ?? "club-admin";

      if (event.eventType === "OWNERSHIP_TRANSFERRED") {
        notificationItems.push({
          id: `club-history:${event.id}`,
          type: "CLUB_OWNERSHIP_TRANSFERRED_TO_YOU",
          actorId,
          message: `Ownership of ${clubName} was transferred to you`,
          relatedType: "CLUB",
          relatedId: event.clubId,
          clubId: event.clubId,
          createdAt: event.createdAt
        });
        return;
      }

      if (event.eventType === "MODERATOR_ADDED") {
        notificationItems.push({
          id: `club-history:${event.id}`,
          type: "CLUB_MODERATOR_PROMOTED",
          actorId,
          message: `You were promoted to moderator in ${clubName}`,
          relatedType: "CLUB",
          relatedId: event.clubId,
          clubId: event.clubId,
          createdAt: event.createdAt
        });
        return;
      }

      if (event.eventType === "MODERATOR_REMOVED") {
        notificationItems.push({
          id: `club-history:${event.id}`,
          type: "CLUB_MODERATOR_DEMOTED",
          actorId,
          message: `You were demoted from moderator in ${clubName}`,
          relatedType: "CLUB",
          relatedId: event.clubId,
          clubId: event.clubId,
          createdAt: event.createdAt
        });
        return;
      }

      if (event.eventType === "MEMBER_REMOVED") {
        notificationItems.push({
          id: `club-history:${event.id}`,
          type: "CLUB_MEMBER_REMOVED",
          actorId,
          message: `You were removed from ${clubName}`,
          relatedType: "CLUB",
          relatedId: event.clubId,
          clubId: event.clubId,
          createdAt: event.createdAt
        });
      }
    });

  const sorted = notificationItems
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, limit);

  return res.json(sorted);
});

router.get("/clubs", (_req, res) => {
  const viewerId = _req.query.viewerId ? String(_req.query.viewerId) : "";
  const search = _req.query.search ? String(_req.query.search).toLowerCase() : "";
  const onlyShareTargets = String(_req.query.onlyShareTargets ?? "false").toLowerCase() === "true";
  const joinableOnly = String(_req.query.joinableOnly ?? "false").toLowerCase() === "true";
  const viewerMemberClubIds = new Set(clubMembers.filter((m) => m.userId === viewerId).map((m) => m.clubId));

  const isCloseCircleWithViewer = (ownerId: string): boolean =>
    closeCircleInvites.some(
      (invite) =>
        invite.status === "ACCEPTED" &&
        ((invite.inviterId === viewerId && invite.inviteeId === ownerId) ||
          (invite.inviterId === ownerId && invite.inviteeId === viewerId))
    );

  const filtered = clubs.filter((club) => {
    if (search) {
      const categoryName = allowedCategories.find((c) => c.id === club.categoryId)?.name ?? "";
      const searchable = `${club.name} ${categoryName}`.toLowerCase();
      if (!searchable.includes(search)) return false;
    }

    if (onlyShareTargets && viewerId) {
      return club.isPublic || club.ownerId === viewerId || isCloseCircleWithViewer(club.ownerId);
    }

    if (joinableOnly && viewerId) {
      return club.ownerId !== "system" && club.ownerId !== viewerId && !viewerMemberClubIds.has(club.id);
    }

    return true;
  });

  res.json(
    filtered.map((club) => ({
      ...club,
      joinPolicy: resolveClubJoinPolicy(club)
    }))
  );
});

router.post("/clubs", (req, res) => {
  const ownerId = String(req.body?.ownerId ?? "");
  const categoryId = String(req.body?.categoryId ?? "");
  const name = String(req.body?.name ?? "").trim();
  const description = req.body?.description ? String(req.body.description) : undefined;
  const isPublic = req.body?.isPublic !== false;
  const requestedJoinPolicy = req.body?.joinPolicy ? String(req.body.joinPolicy).toUpperCase() as ClubJoinPolicy : undefined;

  if (!ownerId || !categoryId || !name) {
    return res.status(400).json({ message: "ownerId, categoryId, and name are required." });
  }

  const categoryExists = allowedCategories.some((category) => category.id === categoryId && category.isActive);
  if (!categoryExists) {
    return res.status(400).json({ message: "categoryId must be from allowed categories." });
  }

  const existingName = clubs.find((club) => club.name.toLowerCase() === name.toLowerCase());
  if (existingName) {
    return res.status(409).json({ message: "Club name already exists. Please choose a different title." });
  }

  const club: Club = {
    id: uuidv4(),
    categoryId,
    name,
    founderId: ownerId,
    ownerId,
    isPublic,
    joinPolicy: requestedJoinPolicy && allowedClubJoinPolicies.includes(requestedJoinPolicy)
      ? requestedJoinPolicy
      : isPublic
        ? "OPEN"
        : "REQUEST_REQUIRED",
    description,
    createdAt: new Date().toISOString()
  };

  clubs.push(club);
  clubMembers.push({
    clubId: club.id,
    userId: ownerId,
    role: "OWNER",
    createdAt: new Date().toISOString()
  });

  try {
    assertClubHasExactlyOneOwner(club.id);
  } catch (error) {
    clubs.splice(clubs.findIndex((entry) => entry.id === club.id), 1);
    const ownerMembershipIndex = clubMembers.findIndex(
      (member) => member.clubId === club.id && member.userId === ownerId && member.role === "OWNER"
    );
    if (ownerMembershipIndex >= 0) {
      clubMembers.splice(ownerMembershipIndex, 1);
    }
    return res.status(500).json({ message: error instanceof Error ? error.message : "Failed to create club." });
  }

  clubHistoryRepository.append({
    clubId: club.id,
    eventType: "CLUB_CREATED",
    actorId: ownerId,
    subjectUserId: ownerId,
    visibility: "CLUB_MEMBERS",
    metadata: {
      founderId: club.founderId,
      ownerId: club.ownerId
    },
    createdAt: club.createdAt
  });

  clubHistoryRepository.append({
    clubId: club.id,
    eventType: "FOUNDER_RECORDED",
    actorId: ownerId,
    subjectUserId: ownerId,
    visibility: "CLUB_MEMBERS",
    metadata: {
      founderId: club.founderId
    },
    createdAt: club.createdAt
  });

  publishActivityPost({
    userId: ownerId,
    text: `@${ownerId} created club ${club.name}!`,
    visibility: "PUBLIC",
    clubId: club.id,
    tags: ["SHOWCASE"]
  });

  return res.status(201).json(club);
});

router.patch("/clubs/:clubId", (req, res) => {
  const clubId = String(req.params.clubId);
  const viewerId = String(req.body?.viewerId ?? "");
  const name = req.body?.name ? String(req.body.name).trim() : undefined;
  const description = req.body?.description !== undefined ? String(req.body.description) : undefined;
  const isPublic = req.body?.isPublic;
  const requestedJoinPolicy = req.body?.joinPolicy ? String(req.body.joinPolicy).toUpperCase() as ClubJoinPolicy : undefined;

  const club = clubs.find((entry) => entry.id === clubId);
  if (!club) {
    return res.status(404).json({ message: "Club not found." });
  }

  const viewerRole = getClubMembershipRole(clubId, viewerId);
  if (!viewerId || (viewerRole !== "OWNER" && viewerRole !== "MODERATOR")) {
    return res.status(403).json({ message: "Only club owner/admin can modify club information." });
  }

  const proposedFounderId = req.body?.founderId !== undefined ? String(req.body.founderId) : undefined;
  try {
    assertFounderImmutable(club, proposedFounderId);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid founder update." });
  }

  if (name) {
    const duplicateName = clubs.find(
      (entry) => entry.id !== clubId && entry.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicateName) {
      return res.status(409).json({ message: "Club name already exists. Please choose a different title." });
    }
    club.name = name;
  }

  if (description !== undefined) {
    club.description = description.trim() || undefined;
  }

  if (typeof isPublic === "boolean") {
    club.isPublic = isPublic;
  }

  if (requestedJoinPolicy !== undefined) {
    if (!allowedClubJoinPolicies.includes(requestedJoinPolicy)) {
      return res.status(400).json({ message: "joinPolicy must be OPEN, REQUEST_REQUIRED, or INVITE_ONLY." });
    }
    club.joinPolicy = requestedJoinPolicy;
  } else {
    club.joinPolicy = resolveClubJoinPolicy(club);
  }

  return res.json({
    ...club,
    joinPolicy: resolveClubJoinPolicy(club)
  });
});

router.post("/clubs/:clubId/join", (req, res) => {
  const clubId = String(req.params.clubId);
  const userId = String(req.body?.userId ?? "");

  if (!clubId || !userId) {
    return res.status(400).json({ message: "clubId and userId are required." });
  }

  const club = clubs.find((entry) => entry.id === clubId);
  if (!club) {
    return res.status(404).json({ message: "Club not found." });
  }

  const joinPolicy = resolveClubJoinPolicy(club);
  if (joinPolicy !== "OPEN") {
    if (joinPolicy === "REQUEST_REQUIRED") {
      return res.status(409).json({ message: "This club requires a join request." });
    }
    return res.status(403).json({ message: "This club is invite-only." });
  }

  const existing = clubMembers.find((m) => m.clubId === clubId && m.userId === userId);
  if (!existing) {
    clubMembers.push({
      clubId,
      userId,
      role: "MEMBER",
      createdAt: new Date().toISOString()
    });
  }

  const requestIndex = clubJoinRequests.findIndex((request) => request.clubId === clubId && request.userId === userId);
  if (requestIndex >= 0) {
    clubJoinRequests.splice(requestIndex, 1);
  }

  return res.status(201).json({ ok: true });
});

router.get("/clubs/:clubId/join-request-status", (req, res) => {
  const clubId = String(req.params.clubId);
  const userId = String(req.query.userId ?? "");

  if (!userId) {
    return res.status(400).json({ message: "userId is required." });
  }

  const request = clubJoinRequests.find((entry) => entry.clubId === clubId && entry.userId === userId);
  return res.json(request ?? null);
});

router.post("/clubs/:clubId/join-request", (req, res) => {
  const clubId = String(req.params.clubId);
  const userId = String(req.body?.userId ?? "");

  if (!clubId || !userId) {
    return res.status(400).json({ message: "clubId and userId are required." });
  }

  const club = clubs.find((entry) => entry.id === clubId);
  if (!club) {
    return res.status(404).json({ message: "Club not found." });
  }

  const joinPolicy = resolveClubJoinPolicy(club);
  if (joinPolicy === "OPEN") {
    return res.status(409).json({ message: "This club is open. Join directly instead of requesting." });
  }
  if (joinPolicy === "INVITE_ONLY") {
    return res.status(403).json({ message: "This club is invite-only." });
  }

  const existingMember = clubMembers.find((member) => member.clubId === clubId && member.userId === userId);
  if (existingMember) {
    return res.status(409).json({ message: "You are already a club member." });
  }

  const existingRequest = clubJoinRequests.find((request) => request.clubId === clubId && request.userId === userId);
  if (existingRequest) {
    if (existingRequest.status === "REJECTED") {
      existingRequest.status = "PENDING";
      existingRequest.createdAt = new Date().toISOString();
      existingRequest.resolvedAt = undefined;
      existingRequest.resolvedBy = undefined;
    }
    return res.status(201).json(existingRequest);
  }

  const joinRequest: ClubJoinRequest = {
    clubId,
    userId,
    status: "PENDING",
    createdAt: new Date().toISOString()
  };
  clubJoinRequests.push(joinRequest);
  return res.status(201).json(joinRequest);
});

router.get("/clubs/:clubId/join-requests", (req, res) => {
  const clubId = String(req.params.clubId);
  const actorId = String(req.query.actorId ?? "");

  if (!actorId || !canManageClub(clubId, actorId)) {
    return res.status(403).json({ message: "Only club owner/admin can view join requests." });
  }

  const pending = clubJoinRequests
    .filter((request) => request.clubId === clubId && request.status === "PENDING")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return res.json(pending);
});

router.patch("/clubs/:clubId/join-requests/:userId", (req, res) => {
  const clubId = String(req.params.clubId);
  const userId = String(req.params.userId);
  const actorId = String(req.body?.actorId ?? "");
  const status = String(req.body?.status ?? "").toUpperCase() as ClubJoinRequest["status"];

  if (!actorId || !canManageClub(clubId, actorId)) {
    return res.status(403).json({ message: "Only club owner/admin can review join requests." });
  }

  if (status !== "APPROVED" && status !== "REJECTED") {
    return res.status(400).json({ message: "status must be APPROVED or REJECTED." });
  }

  const request = clubJoinRequests.find((entry) => entry.clubId === clubId && entry.userId === userId);
  if (!request) {
    return res.status(404).json({ message: "Join request not found." });
  }

  request.status = status;
  request.resolvedAt = new Date().toISOString();
  request.resolvedBy = actorId;

  if (status === "APPROVED") {
    const existingMember = clubMembers.find((member) => member.clubId === clubId && member.userId === userId);
    if (!existingMember) {
      clubMembers.push({
        clubId,
        userId,
        role: "MEMBER",
        createdAt: new Date().toISOString()
      });
    }
  }

  return res.json(request);
});

router.patch("/clubs/:clubId/members/:memberId/role", (req, res) => {
  const clubId = String(req.params.clubId);
  const memberId = String(req.params.memberId);
  const actorId = String(req.body?.actorId ?? "");
  const role = String(req.body?.role ?? "").toUpperCase() as ClubMember["role"];

  const club = clubs.find((entry) => entry.id === clubId);
  if (!club) {
    return res.status(404).json({ message: "Club not found." });
  }

  if (club.ownerId !== actorId) {
    return res.status(403).json({ message: "Only the club owner can delegate admins." });
  }

  if (!["MEMBER", "MODERATOR"].includes(role)) {
    return res.status(400).json({ message: "role must be MEMBER or MODERATOR." });
  }

  const membership = clubMembers.find((member) => member.clubId === clubId && member.userId === memberId);
  if (!membership) {
    return res.status(404).json({ message: "Club member not found." });
  }

  if (membership.role === "OWNER") {
    return res.status(400).json({ message: "Cannot change owner role." });
  }

  const previousRole = membership.role;
  if (previousRole === role) {
    return res.json(membership);
  }

  membership.role = role;

  clubHistoryRepository.append({
    clubId: club.id,
    eventType: "MEMBER_ROLE_CHANGED",
    actorId,
    subjectUserId: memberId,
    visibility: "CLUB_MEMBERS",
    metadata: {
      previousRole,
      newRole: role
    }
  });

  if (previousRole === "MEMBER" && role === "MODERATOR") {
    clubHistoryRepository.append({
      clubId: club.id,
      eventType: "MODERATOR_ADDED",
      actorId,
      subjectUserId: memberId,
      visibility: "CLUB_MEMBERS",
      metadata: {
        previousRole,
        newRole: role
      }
    });
  }

  if (previousRole === "MODERATOR" && role === "MEMBER") {
    clubHistoryRepository.append({
      clubId: club.id,
      eventType: "MODERATOR_REMOVED",
      actorId,
      subjectUserId: memberId,
      visibility: "CLUB_MEMBERS",
      metadata: {
        previousRole,
        newRole: role
      }
    });
  }

  try {
    assertFounderImmutable(club, req.body?.founderId !== undefined ? String(req.body.founderId) : undefined);
    assertClubHasExactlyOneOwner(club.id);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Club governance invariant failed." });
  }

  return res.json(membership);
});

router.patch("/clubs/:clubId/ownership", (req, res) => {
  const clubId = String(req.params.clubId);
  const actorId = String(req.body?.actorId ?? "");
  const newOwnerId = String(req.body?.newOwnerId ?? "");
  const previousOwnerFallbackRole = String(req.body?.previousOwnerFallbackRole ?? "MODERATOR").toUpperCase() as
    | "MEMBER"
    | "MODERATOR";

  if (!actorId || !newOwnerId) {
    return res.status(400).json({ message: "actorId and newOwnerId are required." });
  }

  if (!["MEMBER", "MODERATOR"].includes(previousOwnerFallbackRole)) {
    return res.status(400).json({ message: "previousOwnerFallbackRole must be MEMBER or MODERATOR." });
  }

  const club = clubs.find((entry) => entry.id === clubId);
  if (!club) {
    return res.status(404).json({ message: "Club not found." });
  }

  const previousOwnerId = club.ownerId;
  const previousNewOwnerRole = getClubMembershipRole(clubId, newOwnerId);

  try {
    assertFounderImmutable(club, req.body?.founderId !== undefined ? String(req.body.founderId) : undefined);
    if (getClubMembershipRole(clubId, actorId) !== "OWNER") {
      return res.status(403).json({ message: "Only the current club owner can transfer ownership." });
    }

    const newOwnerMembership = clubMembers.find((member) => member.clubId === clubId && member.userId === newOwnerId);
    if (!newOwnerMembership) {
      return res.status(400).json({ message: "New owner must already be a club member." });
    }

    const previousOwnerMembership = clubMembers.find(
      (member) => member.clubId === clubId && member.userId === previousOwnerId
    );
    if (!previousOwnerMembership) {
      return res.status(500).json({ message: "Current owner membership not found." });
    }

    transferClubOwnershipAtomic({
      clubId,
      actorId,
      newOwnerId,
      previousOwnerFallbackRole
    });

    clubHistoryRepository.append({
      clubId,
      eventType: "OWNERSHIP_TRANSFERRED",
      actorId,
      subjectUserId: newOwnerId,
      visibility: "CLUB_MEMBERS",
      metadata: {
        previousOwnerId,
        newOwnerId,
        previousOwnerFallbackRole
      }
    });

    if (previousOwnerFallbackRole === "MODERATOR") {
      clubHistoryRepository.append({
        clubId,
        eventType: "MODERATOR_ADDED",
        actorId,
        subjectUserId: previousOwnerId,
        visibility: "CLUB_MEMBERS",
        metadata: {
          previousRole: "OWNER",
          newRole: "MODERATOR"
        }
      });
    }

    clubHistoryRepository.append({
      clubId,
      eventType: "MEMBER_ROLE_CHANGED",
      actorId,
      subjectUserId: previousOwnerId,
      visibility: "CLUB_MEMBERS",
      metadata: {
        previousRole: "OWNER",
        newRole: previousOwnerFallbackRole
      }
    });

    clubHistoryRepository.append({
      clubId,
      eventType: "MEMBER_ROLE_CHANGED",
      actorId,
      subjectUserId: newOwnerId,
      visibility: "CLUB_MEMBERS",
      metadata: {
        previousRole: previousNewOwnerRole,
        newRole: "OWNER"
      }
    });

    assertClubHasExactlyOneOwner(clubId);
    assertFounderImmutable(club, club.founderId);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Ownership transfer failed." });
  }

  return res.json(club);
});

router.delete("/clubs/:clubId/members/:memberId", (req, res) => {
  const clubId = String(req.params.clubId);
  const memberId = String(req.params.memberId);
  const actorId = String(req.body?.actorId ?? "");

  const club = clubs.find((entry) => entry.id === clubId);
  if (!club) {
    return res.status(404).json({ message: "Club not found." });
  }

  const actorRole = getClubMembershipRole(clubId, actorId);
  if (actorRole !== "OWNER" && actorRole !== "MODERATOR") {
    return res.status(403).json({ message: "Only club owner/moderator can remove members." });
  }

  const membership = clubMembers.find((member) => member.clubId === clubId && member.userId === memberId);
  if (!membership) {
    return res.status(404).json({ message: "Club member not found." });
  }

  if (membership.role === "OWNER") {
    return res.status(400).json({ message: "Cannot remove the current owner. Transfer ownership first." });
  }

  if (actorRole === "MODERATOR" && membership.role === "MODERATOR") {
    return res.status(403).json({ message: "Moderators cannot remove other moderators." });
  }

  const index = clubMembers.findIndex((member) => member.clubId === clubId && member.userId === memberId);
  if (index >= 0) {
    clubMembers.splice(index, 1);
  }

  clubHistoryRepository.append({
    clubId,
    eventType: "MEMBER_REMOVED",
    actorId,
    subjectUserId: memberId,
    visibility: "CLUB_MEMBERS",
    metadata: {
      removedRole: membership.role
    }
  });

  assertClubHasExactlyOneOwner(clubId);

  return res.json({ ok: true });
});

router.get("/clubs/:clubId/events", (req, res) => {
  const clubId = String(req.params.clubId);
  const viewerId = req.query.viewerId ? String(req.query.viewerId) : "";
  const timing = req.query.timing ? String(req.query.timing).toLowerCase() : "all";

  const club = clubs.find((entry) => entry.id === clubId);
  if (!club) {
    return res.status(404).json({ message: "Club not found." });
  }

  const isMember = !!viewerId && !!getClubMembershipRole(clubId, viewerId);
  if (!club.isPublic && !isMember) {
    return res.status(403).json({ message: "Only club members can view events for private clubs." });
  }

  const now = Date.now();
  const visibleEvents = clubEvents.filter((event) => {
    if (event.clubId !== clubId) return false;
    if (!isMember && event.visibility !== "PUBLIC_CLUB") return false;
    const startAtMs = new Date(event.startAt).getTime();
    if (timing === "upcoming") return startAtMs >= now;
    if (timing === "past") return startAtMs < now;
    return true;
  });

  visibleEvents.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
  return res.json(visibleEvents);
});

router.post("/clubs/:clubId/events", (req, res) => {
  const clubId = String(req.params.clubId);
  const actorId = String(req.body?.actorId ?? "");
  const title = String(req.body?.title ?? "").trim();
  const description = req.body?.description !== undefined ? String(req.body.description).trim() : undefined;
  const startAt = parseIsoDate(req.body?.startAt);
  const endAt = req.body?.endAt !== undefined ? parseIsoDate(req.body.endAt) : undefined;
  const isAllDay = req.body?.isAllDay === true;
  const status = String(req.body?.status ?? "SCHEDULED").toUpperCase() as ClubEventStatus;
  const visibility = String(req.body?.visibility ?? "CLUB_MEMBERS").toUpperCase() as ClubEventVisibility;
  const locationText = req.body?.locationText !== undefined ? String(req.body.locationText).trim() : undefined;

  const club = clubs.find((entry) => entry.id === clubId);
  if (!club) {
    return res.status(404).json({ message: "Club not found." });
  }

  if (!actorId || !canManageClub(clubId, actorId)) {
    return res.status(403).json({ message: "Only club owner/admin can create club events." });
  }

  if (!title) {
    return res.status(400).json({ message: "Event title is required." });
  }

  if (!startAt) {
    return res.status(400).json({ message: "startAt must be a valid ISO date string." });
  }

  if (endAt === null) {
    return res.status(400).json({ message: "endAt must be a valid ISO date string when provided." });
  }

  if (endAt && endAt < startAt) {
    return res.status(400).json({ message: "endAt must be after startAt." });
  }

  if (!allowedClubEventStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  if (!allowedClubEventVisibility.includes(visibility)) {
    return res.status(400).json({ message: "Invalid visibility." });
  }

  if (visibility === "PUBLIC_CLUB" && !club.isPublic) {
    return res.status(400).json({ message: "Private clubs cannot create PUBLIC_CLUB events." });
  }

  const nowIso = new Date().toISOString();
  const event: ClubEvent = {
    id: uuidv4(),
    clubId,
    title,
    description: description || undefined,
    isAllDay,
    startAt,
    endAt: endAt || undefined,
    locationText: locationText || undefined,
    visibility,
    status,
    createdBy: actorId,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  clubEvents.push(event);

  clubHistoryRepository.append({
    clubId,
    eventType: "CLUB_EVENT_CREATED",
    actorId,
    visibility: "CLUB_MEMBERS",
    metadata: {
      eventId: event.id,
      title: event.title,
      status: event.status,
      startAt: event.startAt,
      endAt: event.endAt,
      visibility: event.visibility,
      locationText: event.locationText
    },
    createdAt: event.createdAt
  });

  return res.status(201).json(event);
});

router.get("/clubs/:clubId/history", (req, res) => {
  const clubId = String(req.params.clubId);
  const limitRaw = req.query.limit ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  const club = clubs.find((entry) => entry.id === clubId);
  if (!club) {
    return res.status(404).json({ message: "Club not found." });
  }

  const history = clubHistoryRepository.listByClub(clubId).slice(0, limit);
  return res.json(history);
});

router.get("/clubs/:clubId/members", (req, res) => {
  const clubId = String(req.params.clubId);
  res.json(clubMembers.filter((m) => m.clubId === clubId));
});

router.get("/clubs/:clubId/projects", (req, res) => {
  const clubId = String(req.params.clubId);
  const projectIds = Array.from(new Set(projectClubLinks.filter((link) => link.clubId === clubId && link.status === "APPROVED").map((link) => link.projectId)));

  const clubProjects = projects.filter((project) => projectIds.includes(project.id));
  res.json(clubProjects);
});

router.post("/projects", (req, res) => {
  const ownerId = String(req.body?.ownerId ?? "");
  const createdBy = String(req.body?.createdBy ?? ownerId);
  const categoryId = String(req.body?.categoryId ?? "");
  const clubId = req.body?.clubId ? String(req.body.clubId) : undefined;
  const title = String(req.body?.title ?? "");
  const description = String(req.body?.description ?? "");
  const requestedVisibility = req.body?.visibility ? String(req.body.visibility) : undefined;

  if (!ownerId || !categoryId || !title.trim()) {
    return res.status(400).json({ message: "ownerId, categoryId, and title are required." });
  }

  if (clubId) {
    const club = clubs.find((entry) => entry.id === clubId);
    if (!club) {
      return res.status(404).json({ message: "Club not found." });
    }

    if (!canManageClub(clubId, createdBy)) {
      return res.status(403).json({ message: "Only club owner/admin can create club projects." });
    }
  }

  const categoryExists = allowedCategories.some((c) => c.id === categoryId && c.isActive);
  if (!categoryExists) {
    return res.status(400).json({ message: "categoryId must be from allowed categories." });
  }

  let visibility: Project["visibility"];
  try {
    visibility = resolveProjectVisibility({
      requestedVisibility,
      clubId,
      actorId: createdBy
    });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid project visibility." });
  }

  const project: Project = {
    id: uuidv4(),
    ownerId,
    categoryId,
    title: title.trim(),
    description,
    clubId,
    visibility,
    createdBy,
    createdAt: new Date().toISOString()
  };

  projects.push(project);

  const isClubOwnedProject = !!clubId && ownerId === clubId;

  if (isClubOwnedProject) {
    clubHistoryRepository.append({
      clubId,
      eventType: "PROJECT_CREATED_FOR_CLUB",
      actorId: createdBy,
      subjectProjectId: project.id,
      visibility: "CLUB_MEMBERS",
      metadata: {
        projectTitle: project.title,
        ownerId: project.ownerId,
        createdBy: project.createdBy
      },
      createdAt: project.createdAt
    });
  }

  if (clubId) {
    projectClubLinks.push({
      projectId: project.id,
      clubId,
      status: "APPROVED",
      requestedBy: createdBy,
      createdAt: new Date().toISOString()
    });
  }

  emitFeedEventSafely(() => {
    feedEventService.emitProjectCreated({
      entityId: project.id,
      actorId: createdBy,
      projectId: project.id,
      clubId: project.clubId,
      visibility: projectFeedVisibility(project)
    });
  });

  return res.status(201).json(project);
});

router.get("/projects/:projectId/clubs", (req, res) => {
  const projectId = String(req.params.projectId);
  const viewerId = req.query.viewerId ? String(req.query.viewerId) : "";

  const project = viewerId ? ensureProjectReadable(projectId, viewerId) : projects.find((entry) => entry.id === projectId);
  if (!project) {
    return res.status(404).json({ message: viewerId ? "Project not found or not visible." : "Project not found." });
  }

  const links = projectClubLinks
    .filter((link) => link.projectId === projectId)
    .map((link) => {
      const club = clubs.find((entry) => entry.id === link.clubId);
      const canApprove = viewerId ? canManageClub(link.clubId, viewerId) : false;
      return {
        ...link,
        club,
        canApprove
      };
    })
    .filter((item) => {
      if (item.status === "APPROVED") return true;
      if (!viewerId) return false;
      return item.requestedBy === viewerId || item.canApprove;
    });

  return res.json(links);
});

router.post("/projects/:projectId/clubs", (req, res) => {
  const projectId = String(req.params.projectId);
  const clubId = String(req.body?.clubId ?? "");
  const actorId = String(req.body?.actorId ?? "");

  const project = projects.find((entry) => entry.id === projectId);
  if (!project) {
    return res.status(404).json({ message: "Project not found." });
  }

  const club = clubs.find((entry) => entry.id === clubId);
  if (!club) {
    return res.status(404).json({ message: "Club not found." });
  }

  const actorMembershipRole = getClubMembershipRole(clubId, actorId);
  if (!actorMembershipRole) {
    return res.status(400).json({
      error: "You must be a member of this club to request linking a project.",
      message: "You must be a member of this club to request linking a project."
    });
  }

  const existing = projectClubLinks.find((link) => link.projectId === projectId && link.clubId === clubId);
  if (existing && existing.status !== "REJECTED") {
    return res.status(409).json({ message: "Project already linked/requested for this club." });
  }

  const status: ProjectClubLink["status"] = canManageClub(clubId, actorId) ? "APPROVED" : "PENDING";
  const link: ProjectClubLink = {
    projectId,
    clubId,
    status,
    requestedBy: actorId,
    createdAt: new Date().toISOString()
  };

  if (existing) {
    existing.status = status;
    existing.requestedBy = actorId;
    existing.createdAt = link.createdAt;

    clubHistoryRepository.append({
      clubId,
      eventType: "PROJECT_LINK_REQUESTED",
      actorId,
      subjectProjectId: projectId,
      visibility: "CLUB_MEMBERS",
      metadata: {
        status: existing.status,
        requestedBy: actorId
      }
    });

    if (status === "APPROVED") {
      clubHistoryRepository.append({
        clubId,
        eventType: "PROJECT_LINK_APPROVED",
        actorId,
        subjectProjectId: projectId,
        visibility: "CLUB_MEMBERS",
        metadata: {
          requestedBy: actorId
        }
      });
    }

    return res.status(201).json(existing);
  }

  projectClubLinks.push(link);

  clubHistoryRepository.append({
    clubId,
    eventType: "PROJECT_LINK_REQUESTED",
    actorId,
    subjectProjectId: projectId,
    visibility: "CLUB_MEMBERS",
    metadata: {
      status,
      requestedBy: actorId
    }
  });

  if (status === "APPROVED") {
    clubHistoryRepository.append({
      clubId,
      eventType: "PROJECT_LINK_APPROVED",
      actorId,
      subjectProjectId: projectId,
      visibility: "CLUB_MEMBERS",
      metadata: {
        requestedBy: actorId
      }
    });
  }

  return res.status(201).json(link);
});

router.patch("/projects/:projectId/clubs/:clubId", (req, res) => {
  const projectId = String(req.params.projectId);
  const clubId = String(req.params.clubId);
  const actorId = String(req.body?.actorId ?? "");
  const status = String(req.body?.status ?? "").toUpperCase() as ProjectClubLink["status"];

  if (!["APPROVED", "REJECTED"].includes(status)) {
    return res.status(400).json({ message: "status must be APPROVED or REJECTED." });
  }

  if (!canManageClub(clubId, actorId)) {
    return res.status(403).json({ message: "Only club owner/admin can review project requests." });
  }

  const link = projectClubLinks.find((entry) => entry.projectId === projectId && entry.clubId === clubId);
  if (!link) {
    return res.status(404).json({ message: "Project-club link not found." });
  }

  const previousStatus = link.status;
  link.status = status;

  if (previousStatus !== status) {
    clubHistoryRepository.append({
      clubId,
      eventType: status === "APPROVED" ? "PROJECT_LINK_APPROVED" : "PROJECT_LINK_REJECTED",
      actorId,
      subjectProjectId: projectId,
      visibility: "CLUB_MEMBERS",
      metadata: {
        previousStatus,
        status,
        requestedBy: link.requestedBy
      }
    });
  }

  return res.json(link);
});

router.delete("/projects/:projectId/clubs/:clubId", (req, res) => {
  const projectId = String(req.params.projectId);
  const clubId = String(req.params.clubId);
  const actorId = String(req.body?.actorId ?? "");

  if (!canManageClub(clubId, actorId)) {
    return res.status(403).json({ message: "Only club owner/admin can remove project links." });
  }

  const index = projectClubLinks.findIndex((entry) => entry.projectId === projectId && entry.clubId === clubId);
  if (index < 0) {
    return res.status(404).json({ message: "Project-club link not found." });
  }

  const [removed] = projectClubLinks.splice(index, 1);

  clubHistoryRepository.append({
    clubId,
    eventType: "PROJECT_LINK_REMOVED",
    actorId,
    subjectProjectId: projectId,
    visibility: "CLUB_MEMBERS",
    metadata: {
      previousStatus: removed.status,
      requestedBy: removed.requestedBy
    }
  });

  return res.json({ ok: true });
});

router.get("/projects", (req, res) => {
  const ownerId = req.query.ownerId ? String(req.query.ownerId) : undefined;
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  const clubId = req.query.clubId ? String(req.query.clubId) : undefined;
  const viewerId = req.query.viewerId ? String(req.query.viewerId) : undefined;

  const filtered = projects.filter((p) => {
    if (ownerId && p.ownerId !== ownerId) return false;
    if (categoryId && p.categoryId !== categoryId) return false;
    if (clubId && p.clubId !== clubId) return false;
    if (viewerId && !canViewProject(p, viewerId)) return false;
    return true;
  });

  res.json(filtered);
});

router.get("/posts", (_req, res) => {
  const viewerId = _req.query.viewerId ? String(_req.query.viewerId) : "";

  const visible = posts.filter((post) => {
    const isFollower = follows.some((f) => f.followerId === viewerId && f.followeeId === post.userId);
    const isCloseCircle = closeCircleInvites.some(
      (i) =>
        i.status === "ACCEPTED" &&
        ((i.inviterId === viewerId && i.inviteeId === post.userId) ||
          (i.inviterId === post.userId && i.inviteeId === viewerId))
    );
    const isClubMember = !!post.clubId && clubMembers.some((m) => m.clubId === post.clubId && m.userId === viewerId);
    const canViewProject = !!post.projectId;

    return canViewPost({
      viewerId,
      authorId: post.userId,
      visibility: post.visibility,
      moderationState:
        post.moderationStatus === "hidden"
          ? "HIDDEN"
          : post.moderationStatus === "flagged"
            ? "FLAGGED"
            : "OK",
      isFollower,
      isCloseCircle,
      isClubMember,
      canViewProject
    });
  });

  res.json(visible);
});

router.post("/posts", (req, res) => {
  const userId = String(req.body?.userId ?? "anonymous");
  const text = String(req.body?.text ?? "");
  const visibility = String(req.body?.visibility ?? "FOLLOWERS").toUpperCase() as Visibility;
  const clubId = req.body?.clubId ? String(req.body.clubId) : undefined;
  const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
  const postedAsClub = req.body?.postedAsClub === true;
  const clubActorId = req.body?.clubActorId ? String(req.body.clubActorId) : undefined;
  const tags = Array.isArray(req.body?.tags)
    ? (req.body.tags.filter((tag: string) => controlledPostTags.includes(tag as PostTag)) as PostTag[])
    : [];

  if (!text.trim()) {
    return res.status(400).json({ message: "Post text is required" });
  }

  if (!["PUBLIC", "FOLLOWERS", "CLOSE_CIRCLE", "CLUB", "PROJECT"].includes(visibility)) {
    return res.status(400).json({ message: "Invalid visibility" });
  }

  if (visibility === "CLUB" && !clubId) {
    return res.status(400).json({ message: "clubId is required when visibility is CLUB" });
  }

  if (visibility === "CLUB" && clubId) {
    const club = clubs.find((entry) => entry.id === clubId);
    if (!club) {
      return res.status(404).json({ message: "Club not found." });
    }

    const isMember = clubMembers.some((member) => member.clubId === clubId && member.userId === userId);
    if (!club.isPublic && !isMember && club.ownerId !== userId) {
      return res.status(403).json({ message: "Cannot post to this private club unless you are a member." });
    }

    if (postedAsClub) {
      const actorId = clubActorId || userId;
      if (!canManageClub(clubId, actorId)) {
        return res.status(403).json({ message: "Only club owner/admin can post highlights as club." });
      }
    }
  }

  const moderation = evaluateText(text);
  if (!moderation.allowed) {
    return res.status(422).json({
      message: moderation.reason,
      code: "POLITICAL_CONTENT_BLOCKED",
      matchedTerms: moderation.matchedTerms
    });
  }

  const item: Post = {
    postId: uuidv4(),
    userId,
    text,
    createdAt: new Date().toISOString(),
    moderationStatus: "approved",
    visibility,
    clubId,
    projectId,
    postedAsClub,
    clubActorId: postedAsClub ? clubActorId || userId : undefined,
    tags
  };

  posts.unshift(item);

  emitFeedEventSafely(() => {
    if (item.visibility === "CLUB" && item.clubId) {
      feedEventService.emitClubPostCreated({
        entityId: item.postId,
        actorId: item.userId,
        visibility: item.visibility,
        clubId: item.clubId,
        projectId: item.projectId
      });
      return;
    }

    feedEventService.emitPostCreated({
      entityId: item.postId,
      actorId: item.userId,
      visibility: item.visibility,
      clubId: item.clubId,
      projectId: item.projectId
    });
  });

  return res.status(201).json(item);
});

router.get("/projects/:projectId/highlights", (req, res) => {
  const projectId = String(req.params.projectId);
  const viewerId = req.query.viewerId ? String(req.query.viewerId) : "";
  if (viewerId && !ensureProjectReadable(projectId, viewerId)) {
    return res.status(404).json({ message: "Project not found or not visible." });
  }
  res.json(projectHighlights.filter((item) => item.projectId === projectId));
});

router.post("/projects/:projectId/highlights", (req, res) => {
  const projectId = String(req.params.projectId);
  const authorId = String(req.body?.authorId ?? "");
  const text = String(req.body?.text ?? "").trim();

  const project = projects.find((entry) => entry.id === projectId);
  if (!project) {
    return res.status(404).json({ message: "Project not found." });
  }

  if (!text) {
    return res.status(400).json({ message: "Highlight text is required." });
  }

  if (!canManageProject(project, authorId)) {
    return res.status(403).json({ message: "Only project owner/admin can post project highlights." });
  }

  const moderation = evaluateText(text);
  if (!moderation.allowed) {
    return res.status(422).json({
      message: moderation.reason,
      code: "POLITICAL_CONTENT_BLOCKED",
      matchedTerms: moderation.matchedTerms
    });
  }

  const highlight: ProjectHighlight = {
    id: uuidv4(),
    projectId,
    text,
    authorId,
    createdAt: new Date().toISOString()
  };
  projectHighlights.unshift(highlight);

  emitFeedEventSafely(() => {
    feedEventService.emitProjectHighlightCreated({
      entityId: highlight.id,
      actorId: authorId,
      projectId,
      clubId: project.clubId,
      visibility: projectFeedVisibility(project)
    });
  });

  const highlightPrefix = project.clubId
    ? `@${clubs.find((club) => club.id === project.clubId)?.name ?? "club"} by ${authorId} - Highlight`
    : `@${authorId} - Project Highlight`;

  publishActivityPost({
    userId: authorId,
    text: `${highlightPrefix}\n${text}`,
    visibility: projectFeedVisibility(project),
    projectId,
    clubId: project.clubId,
    postedAsClub: !!project.clubId,
    clubActorId: project.clubId ? authorId : undefined,
    tags: ["SHOWCASE"]
  });

  return res.status(201).json(highlight);
});

router.get("/projects/:projectId/milestones", (req, res) => {
  const projectId = String(req.params.projectId);
  const viewerId = req.query.viewerId ? String(req.query.viewerId) : "";
  if (viewerId && !ensureProjectReadable(projectId, viewerId)) {
    return res.status(404).json({ message: "Project not found or not visible." });
  }
  res.json(getProjectMilestonesOrdered(projectId));
});

router.post("/projects/:projectId/milestones", (req, res) => {
  const projectId = String(req.params.projectId);
  const actorId = String(req.body?.actorId ?? "");
  const title = String(req.body?.title ?? "").trim();
  const parsedStartAt = parseOptionalIsoDateField(req.body?.startAt, "startAt");
  const parsedDueAt = parseOptionalIsoDateField(req.body?.dueAt, "dueAt");

  const project = projects.find((entry) => entry.id === projectId);
  if (!project) {
    return res.status(404).json({ message: "Project not found." });
  }

  if (!canManageProject(project, actorId)) {
    return res.status(403).json({ message: "Only project owner/admin can manage milestones." });
  }

  if (!title) {
    return res.status(400).json({ message: "Milestone title is required." });
  }

  if (parsedStartAt.error) {
    return res.status(400).json({ message: parsedStartAt.error });
  }

  if (parsedDueAt.error) {
    return res.status(400).json({ message: parsedDueAt.error });
  }

  const scheduleError = validateStartDueOrder(parsedStartAt.value, parsedDueAt.value);
  if (scheduleError) {
    return res.status(400).json({ message: scheduleError });
  }

  const milestone: ProjectMilestone = {
    id: uuidv4(),
    projectId,
    title,
    status: "OPEN",
    startAt: parsedStartAt.value,
    dueAt: parsedDueAt.value,
    order: getProjectMilestonesOrdered(projectId).length + 1,
    tasks: [],
    createdBy: actorId,
    createdAt: new Date().toISOString()
  };
  projectMilestones.push(milestone);

  publishActivityPost({
    userId: actorId,
    text: `@${actorId} created project milestone on ${project.title}!`,
    visibility: projectFeedVisibility(project),
    projectId,
    clubId: project.clubId,
    tags: ["PROGRESS"]
  });

  return res.status(201).json(milestone);
});

router.patch("/projects/:projectId/milestones/:milestoneId", (req, res) => {
  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);
  const actorId = String(req.body?.actorId ?? "");
  const status = req.body?.status ? String(req.body.status).toUpperCase() : undefined;
  const title = req.body?.title !== undefined ? String(req.body.title).trim() : undefined;
  const parsedStartAt = parseOptionalIsoDateField(req.body?.startAt, "startAt");
  const parsedDueAt = parseOptionalIsoDateField(req.body?.dueAt, "dueAt");

  const project = projects.find((entry) => entry.id === projectId);
  if (!project) {
    return res.status(404).json({ message: "Project not found." });
  }

  if (!canManageProject(project, actorId)) {
    return res.status(403).json({ message: "Only project owner/admin can manage milestones." });
  }

  const milestone = projectMilestones.find((item) => item.id === milestoneId && item.projectId === projectId);
  if (!milestone) {
    return res.status(404).json({ message: "Milestone not found." });
  }

  if (parsedStartAt.error) {
    return res.status(400).json({ message: parsedStartAt.error });
  }

  if (parsedDueAt.error) {
    return res.status(400).json({ message: parsedDueAt.error });
  }

  const nextStartAt = parsedStartAt.provided ? parsedStartAt.value : milestone.startAt;
  const nextDueAt = parsedDueAt.provided ? parsedDueAt.value : milestone.dueAt;
  const scheduleError = validateStartDueOrder(nextStartAt, nextDueAt);
  if (scheduleError) {
    return res.status(400).json({ message: scheduleError });
  }

  if (status) {
    if (!["OPEN", "DONE"].includes(status)) {
      return res.status(400).json({ message: "status must be OPEN or DONE." });
    }

    const ordered = getProjectMilestonesOrdered(projectId);
    const milestoneIndex = ordered.findIndex((item) => item.id === milestone.id);
    if (milestoneIndex === -1) {
      return res.status(404).json({ message: "Milestone not found." });
    }

    if (status === "DONE") {
      const blockedByEarlier = ordered.slice(0, milestoneIndex).some((item) => item.status !== "DONE");
      if (blockedByEarlier) {
        return res.status(400).json({ message: "Complete milestones in chronological order." });
      }
    }

    const previousStatus = milestone.status;
    milestone.status = status as "OPEN" | "DONE";

    if (previousStatus !== "DONE" && milestone.status === "DONE") {
      emitFeedEventSafely(() => {
        feedEventService.emitMilestoneCompleted({
          entityId: milestone.id,
          actorId,
          projectId,
          clubId: project.clubId,
          visibility: projectFeedVisibility(project)
        });
      });
    }

    if (status === "OPEN") {
      ordered.slice(milestoneIndex + 1).forEach((item) => {
        item.status = "OPEN";
      });
    }
  }

  if (title !== undefined && title.length > 0) {
    milestone.title = title;
  }

  if (parsedStartAt.provided) {
    milestone.startAt = parsedStartAt.value;
  }

  if (parsedDueAt.provided) {
    milestone.dueAt = parsedDueAt.value;
  }

  return res.json(milestone);
});

router.post("/projects/:projectId/milestones/:milestoneId/tasks", (req, res) => {
  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);
  const actorId = String(req.body?.actorId ?? "");
  const text = String(req.body?.text ?? "").trim();
  const parsedStartAt = parseOptionalIsoDateField(req.body?.startAt, "startAt");
  const parsedDueAt = parseOptionalIsoDateField(req.body?.dueAt, "dueAt");

  const project = projects.find((entry) => entry.id === projectId);
  if (!project) {
    return res.status(404).json({ message: "Project not found." });
  }

  if (!canManageProject(project, actorId)) {
    return res.status(403).json({ message: "Only project owner/admin can manage milestone tasks." });
  }

  if (!text) {
    return res.status(400).json({ message: "Task text is required." });
  }

  if (parsedStartAt.error) {
    return res.status(400).json({ message: parsedStartAt.error });
  }

  if (parsedDueAt.error) {
    return res.status(400).json({ message: parsedDueAt.error });
  }

  const scheduleError = validateStartDueOrder(parsedStartAt.value, parsedDueAt.value);
  if (scheduleError) {
    return res.status(400).json({ message: scheduleError });
  }

  const milestone = projectMilestones.find((item) => item.id === milestoneId && item.projectId === projectId);
  if (!milestone) {
    return res.status(404).json({ message: "Milestone not found." });
  }

  const task: ProjectMilestoneTask = {
    id: uuidv4(),
    text,
    isDone: false,
    startAt: parsedStartAt.value,
    dueAt: parsedDueAt.value,
    createdBy: actorId,
    createdAt: new Date().toISOString()
  };
  milestone.tasks.push(task);

  publishActivityPost({
    userId: actorId,
    text: `@${actorId} created tasks for ${milestone.title} on ${project.title}!`,
    visibility: projectFeedVisibility(project),
    projectId,
    clubId: project.clubId,
    tags: ["PROGRESS"]
  });

  return res.status(201).json(task);
});

router.patch("/projects/:projectId/milestones/:milestoneId/tasks/:taskId", (req, res) => {
  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);
  const taskId = String(req.params.taskId);
  const actorId = String(req.body?.actorId ?? "");
  const isDone = req.body?.isDone;
  const hasIsDone = typeof isDone === "boolean";
  const text = req.body?.text !== undefined ? String(req.body.text).trim() : undefined;
  const parsedStartAt = parseOptionalIsoDateField(req.body?.startAt, "startAt");
  const parsedDueAt = parseOptionalIsoDateField(req.body?.dueAt, "dueAt");

  const project = projects.find((entry) => entry.id === projectId);
  if (!project) {
    return res.status(404).json({ message: "Project not found." });
  }

  if (!canManageProject(project, actorId)) {
    return res.status(403).json({ message: "Only project owner/admin can manage milestone tasks." });
  }

  if (isDone !== undefined && typeof isDone !== "boolean") {
    return res.status(400).json({ message: "isDone must be boolean when provided." });
  }

  if (parsedStartAt.error) {
    return res.status(400).json({ message: parsedStartAt.error });
  }

  if (parsedDueAt.error) {
    return res.status(400).json({ message: parsedDueAt.error });
  }

  if (text !== undefined && !text) {
    return res.status(400).json({ message: "Task text must not be empty when provided." });
  }

  if (!hasIsDone && text === undefined && !parsedStartAt.provided && !parsedDueAt.provided) {
    return res.status(400).json({ message: "Provide at least one field to update." });
  }

  const milestone = projectMilestones.find((item) => item.id === milestoneId && item.projectId === projectId);
  if (!milestone) {
    return res.status(404).json({ message: "Milestone not found." });
  }

  const task = milestone.tasks.find((item) => item.id === taskId);
  if (!task) {
    return res.status(404).json({ message: "Task not found." });
  }

  const nextStartAt = parsedStartAt.provided ? parsedStartAt.value : task.startAt;
  const nextDueAt = parsedDueAt.provided ? parsedDueAt.value : task.dueAt;
  const scheduleError = validateStartDueOrder(nextStartAt, nextDueAt);
  if (scheduleError) {
    return res.status(400).json({ message: scheduleError });
  }

  if (text !== undefined) {
    task.text = text;
  }

  if (parsedStartAt.provided) {
    task.startAt = parsedStartAt.value;
  }

  if (parsedDueAt.provided) {
    task.dueAt = parsedDueAt.value;
  }

  if (!hasIsDone) {
    return res.json(task);
  }

  const wasDone = task.isDone;
  task.isDone = isDone;

  if (!wasDone && task.isDone) {
    emitFeedEventSafely(() => {
      feedEventService.emitTaskCompleted({
        entityId: task.id,
        actorId,
        projectId,
        clubId: project.clubId,
        visibility: projectFeedVisibility(project)
      });
    });
  }

  return res.json(task);
});

router.get("/projects/:projectId/milestones/:milestoneId/tasks/:taskId/time-entries", (req, res) => {
  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);
  const taskId = String(req.params.taskId);
  const viewerId = String(req.query.viewerId ?? "");

  const context = getProjectMilestoneTaskContext(projectId, milestoneId, taskId);
  if (!context) {
    return res.status(404).json({ message: "Project, milestone, or task not found." });
  }

  if (!viewerId || !isViewerProjectScoped(viewerId, projectId)) {
    return res.status(403).json({ message: "Only project participants can view task time entries." });
  }

  const entries = getTaskTimeEntries(taskId).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  );

  return res.json({
    taskId,
    entries,
    taskTotalMinutes: getTaskTotalMinutes(taskId)
  });
});

router.post("/projects/:projectId/milestones/:milestoneId/tasks/:taskId/time-entries", (req, res) => {
  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);
  const taskId = String(req.params.taskId);
  const actorId = String(req.body?.actorId ?? "");
  const durationMinutesRaw = Number(req.body?.durationMinutes);
  const note = req.body?.note !== undefined ? String(req.body.note).trim() : undefined;

  const context = getProjectMilestoneTaskContext(projectId, milestoneId, taskId);
  if (!context) {
    return res.status(404).json({ message: "Project, milestone, or task not found." });
  }

  if (!actorId || !isViewerProjectScoped(actorId, projectId)) {
    return res.status(403).json({ message: "Only project participants can create task time entries." });
  }

  if (!Number.isInteger(durationMinutesRaw) || durationMinutesRaw <= 0) {
    return res.status(400).json({ message: "durationMinutes must be a positive integer." });
  }

  const nowIso = new Date().toISOString();
  const entry: TaskTimeEntry = {
    id: uuidv4(),
    taskId,
    userId: actorId,
    entryType: "MANUAL",
    durationMinutes: durationMinutesRaw,
    note: note || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
    isDeleted: false
  };

  taskTimeEntries.push(entry);
  return res.status(201).json(entry);
});

router.patch("/projects/:projectId/milestones/:milestoneId/tasks/:taskId/time-entries/:entryId", (req, res) => {
  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);
  const taskId = String(req.params.taskId);
  const entryId = String(req.params.entryId);
  const actorId = String(req.body?.actorId ?? "");
  const note = req.body?.note !== undefined ? String(req.body.note).trim() : undefined;
  const hasDuration = req.body?.durationMinutes !== undefined;
  const durationMinutesRaw = Number(req.body?.durationMinutes);

  const context = getProjectMilestoneTaskContext(projectId, milestoneId, taskId);
  if (!context) {
    return res.status(404).json({ message: "Project, milestone, or task not found." });
  }

  const entry = taskTimeEntries.find((item) => item.id === entryId && item.taskId === taskId && !item.isDeleted);
  if (!entry) {
    return res.status(404).json({ message: "Task time entry not found." });
  }

  if (!actorId || entry.userId !== actorId) {
    return res.status(403).json({ message: "Only the entry owner can edit this task time entry." });
  }

  if (!hasDuration && note === undefined) {
    return res.status(400).json({ message: "Provide at least one field to update." });
  }

  if (hasDuration) {
    if (!Number.isInteger(durationMinutesRaw) || durationMinutesRaw <= 0) {
      return res.status(400).json({ message: "durationMinutes must be a positive integer." });
    }
    entry.durationMinutes = durationMinutesRaw;
  }

  if (note !== undefined) {
    entry.note = note || undefined;
  }

  entry.updatedAt = new Date().toISOString();
  return res.json(entry);
});

router.delete("/projects/:projectId/milestones/:milestoneId/tasks/:taskId/time-entries/:entryId", (req, res) => {
  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);
  const taskId = String(req.params.taskId);
  const entryId = String(req.params.entryId);
  const actorId = String(req.body?.actorId ?? "");

  const context = getProjectMilestoneTaskContext(projectId, milestoneId, taskId);
  if (!context) {
    return res.status(404).json({ message: "Project, milestone, or task not found." });
  }

  const entry = taskTimeEntries.find((item) => item.id === entryId && item.taskId === taskId && !item.isDeleted);
  if (!entry) {
    return res.status(404).json({ message: "Task time entry not found." });
  }

  const canDeleteOwn = entry.userId === actorId;
  const canDeleteAsManager = canManageProject(context.project, actorId);

  if (!actorId || (!canDeleteOwn && !canDeleteAsManager)) {
    return res.status(403).json({ message: "Only the entry owner or project owner/admin can delete this task time entry." });
  }

  entry.isDeleted = true;
  entry.updatedAt = new Date().toISOString();
  return res.json({ ok: true, entryId: entry.id, isDeleted: true });
});

router.post("/reactions", (req, res) => {
  const postId = String(req.body?.postId ?? "");
  const userId = String(req.body?.userId ?? "");
  const type = String(req.body?.type ?? "").toUpperCase() as ReactionType;

  if (!postId || !userId || !["INSPIRED", "HELPFUL", "BEAUTIFUL", "MADE_ME_SMILE", "GREAT_IDEA"].includes(type)) {
    return res.status(400).json({ message: "Valid postId, userId, and type are required." });
  }

  const existing = reactions.find((r) => r.postId === postId && r.userId === userId);
  if (existing) {
    existing.type = type;
    return res.json(existing);
  }

  const reaction: Reaction = {
    postId,
    userId,
    type,
    createdAt: new Date().toISOString()
  };

  reactions.push(reaction);
  return res.status(201).json(reaction);
});

router.get("/posts/:postId/reactions", (req, res) => {
  const postId = String(req.params.postId);
  const postReactions = reactions.filter((r) => r.postId === postId);
  const counts = postReactions.reduce<Record<string, number>>((acc, reaction) => {
    acc[reaction.type] = (acc[reaction.type] ?? 0) + 1;
    return acc;
  }, {});

  res.json({ counts, total: postReactions.length });
});

router.post("/comments", (req, res) => {
  const postId = String(req.body?.postId ?? "");
  const authorId = String(req.body?.authorId ?? "");
  const threadType = String(req.body?.threadType ?? "COMMENTS").toUpperCase() as ThreadType;
  const parentCommentId = req.body?.parentCommentId ? String(req.body.parentCommentId) : undefined;
  const textContent = String(req.body?.textContent ?? "");

  if (!postId || !authorId || !textContent.trim()) {
    return res.status(400).json({ message: "postId, authorId, and textContent are required." });
  }

  if (!["COMMENTS", "QUESTIONS", "THANK_YOU", "SUGGESTIONS"].includes(threadType)) {
    return res.status(400).json({ message: "Invalid threadType." });
  }

  const moderation = evaluateText(textContent);
  if (!moderation.allowed) {
    return res.status(422).json({
      message: moderation.reason,
      code: "POLITICAL_CONTENT_BLOCKED",
      matchedTerms: moderation.matchedTerms
    });
  }

  const parent = parentCommentId ? comments.find((c) => c.id === parentCommentId) : undefined;
  const parentDepth = parent?.depth ?? -1;
  const post = posts.find((p) => p.postId === postId);

  if (!post) {
    return res.status(404).json({ message: "Post not found." });
  }

  const isCloseCircle = closeCircleInvites.some(
    (i) =>
      i.status === "ACCEPTED" &&
      ((i.inviterId === authorId && i.inviteeId === post.userId) ||
        (i.inviterId === post.userId && i.inviteeId === authorId))
  );
  const isMutualFollower =
    follows.some((f) => f.followerId === authorId && f.followeeId === post.userId) &&
    follows.some((f) => f.followerId === post.userId && f.followeeId === authorId);

  const canReply = canReplyAtDepth({
    parentDepth,
    isAuthor: authorId === post.userId,
    isCloseCircle,
    isMutualFollower
  });

  if (!canReply) {
    return res.status(403).json({ message: "Reply depth limit reached for this relationship." });
  }

  const comment: Comment = {
    id: uuidv4(),
    postId,
    authorId,
    createdAt: new Date().toISOString(),
    threadType,
    parentCommentId,
    depth: parent ? parent.depth + 1 : 0,
    textContent,
    moderationState: "OK"
  };

  comments.push(comment);
  return res.status(201).json(comment);
});

router.get("/posts/:postId/comments", (req, res) => {
  const postId = String(req.params.postId);
  const threadType = req.query.threadType ? String(req.query.threadType).toUpperCase() : undefined;

  const filtered = comments.filter((c) => {
    if (c.postId !== postId) return false;
    if (threadType && c.threadType !== threadType) return false;
    return true;
  });

  res.json(filtered);
});

router.post("/reports", (req, res) => {
  const reporterId = String(req.body?.reporterId ?? "");
  const targetType = String(req.body?.targetType ?? "").toUpperCase() as Report["targetType"];
  const targetId = String(req.body?.targetId ?? "");
  const reason = String(req.body?.reason ?? "").toUpperCase() as ReportReason;
  const details = req.body?.details ? String(req.body.details) : undefined;

  if (
    !reporterId ||
    !targetId ||
    !["POST", "COMMENT", "USER"].includes(targetType) ||
    !["POLITICAL_CONTENT", "EXTREMISM_OR_HATE", "HARASSMENT", "OFF_TOPIC", "SPAM"].includes(reason)
  ) {
    return res.status(400).json({ message: "Invalid report payload." });
  }

  const report: Report = {
    id: uuidv4(),
    reporterId,
    targetType,
    targetId,
    reason,
    details,
    status: "OPEN",
    createdAt: new Date().toISOString()
  };

  reports.push(report);
  return res.status(201).json(report);
});

router.get("/admin/reports", (_req, res) => {
  res.json(reports);
});

router.post("/admin/moderation-actions", (req, res) => {
  const targetType = String(req.body?.targetType ?? "").toUpperCase() as ModerationAction["targetType"];
  const targetId = String(req.body?.targetId ?? "");
  const actionType = String(req.body?.actionType ?? "").toUpperCase() as ModerationAction["actionType"];
  const actorId = String(req.body?.actorId ?? "admin");
  const reason = String(req.body?.reason ?? "No reason provided");

  if (
    !targetId ||
    !["POST", "COMMENT", "USER"].includes(targetType) ||
    !["HIDE_FROM_DISCOVERY", "CONTENT_WARNING", "TEMP_SUSPEND", "BAN", "RESTORE"].includes(actionType)
  ) {
    return res.status(400).json({ message: "Invalid moderation action payload." });
  }

  const action: ModerationAction = {
    id: uuidv4(),
    targetType,
    targetId,
    actionType,
    actorId,
    reason,
    createdAt: new Date().toISOString()
  };

  moderationActions.push(action);

  if (targetType === "POST") {
    const post = posts.find((p) => p.postId === targetId);
    if (post) {
      post.moderationStatus = actionType === "RESTORE" ? "approved" : "hidden";

      store.feedEvents.forEach((event) => {
        if (event.entityType !== "POST" || event.entityId !== targetId) return;
        event.moderationState = actionType === "RESTORE" ? "OK" : "HIDDEN";
      });
    }
  }

  return res.status(201).json(action);
});

router.get("/admin/moderation-actions", (_req, res) => {
  res.json(moderationActions);
});

router.post("/moderation/check", (req, res) => {
  const text = String(req.body?.text ?? "");
  return res.json(evaluateText(text));
});


export default router;
