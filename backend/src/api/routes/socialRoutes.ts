import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { canReplyAtDepth, canViewPost } from "../../domain/policy";
import { FeedCursor, FeedEvent } from "../../domain/feedEvent";
import { allowedCategories, controlledPostTags } from "../../domain/seedData";
import {
  Club,
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
  canManageProject,
  getProjectMilestonesOrdered,
  publishActivityPost,
  relationKey
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
    clubMembers: store.clubMembers.length,
    projects: store.projects.length,
    projectClubLinks: store.projectClubLinks.length,
    milestones: store.projectMilestones.length,
    highlights: store.projectHighlights.length,
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
  projects,
  projectClubLinks,
  projectMilestones,
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

  if (project.ownerId === viewerId || project.createdBy === viewerId) {
    return true;
  }

  const memberClubIds = new Set(clubMembers.filter((member) => member.userId === viewerId).map((member) => member.clubId));

  if (project.clubId && memberClubIds.has(project.clubId)) {
    return true;
  }

  return projectClubLinks.some(
    (link) => link.projectId === projectId && link.status === "APPROVED" && memberClubIds.has(link.clubId)
  );
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
      | "PROJECT_MILESTONE_COMPLETED"
      | "PROJECT_TASK_COMPLETED"
      | "PROJECT_CLUB_REQUEST_APPROVED"
      | "PROJECT_CLUB_REQUEST_REJECTED"
      | "CLUB_MEMBERSHIP_UPDATED";
    actorId: string;
    message: string;
    relatedType: "POST" | "PROJECT" | "CLUB";
    relatedId: string;
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

  clubMembers
    .filter((member) => member.userId === viewerId)
    .forEach((member) => {
      const club = clubs.find((entry) => entry.id === member.clubId);
      if (!club) return;
      notificationItems.push({
        id: `club-membership:${member.clubId}:${member.userId}:${member.role}:${member.createdAt}`,
        type: "CLUB_MEMBERSHIP_UPDATED",
        actorId: club.ownerId,
        message: `Your role in ${club.name} is ${member.role}`,
        relatedType: "CLUB",
        relatedId: member.clubId,
        clubId: member.clubId,
        createdAt: member.createdAt
      });
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

  res.json(filtered);
});

router.post("/clubs", (req, res) => {
  const ownerId = String(req.body?.ownerId ?? "");
  const categoryId = String(req.body?.categoryId ?? "");
  const name = String(req.body?.name ?? "").trim();
  const description = req.body?.description ? String(req.body.description) : undefined;
  const isPublic = req.body?.isPublic !== false;

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

  const club = clubs.find((entry) => entry.id === clubId);
  if (!club) {
    return res.status(404).json({ message: "Club not found." });
  }

  if (!viewerId || club.ownerId !== viewerId) {
    return res.status(403).json({ message: "Only the club owner can modify club information." });
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

  return res.json(club);
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

  if (!club.isPublic) {
    const isCloseCircleWithOwner = closeCircleInvites.some(
      (invite) =>
        invite.status === "ACCEPTED" &&
        ((invite.inviterId === userId && invite.inviteeId === club.ownerId) ||
          (invite.inviterId === club.ownerId && invite.inviteeId === userId))
    );

    if (!isCloseCircleWithOwner && club.ownerId !== userId) {
      return res.status(403).json({ message: "This club is private. Only owner close-circle members can join." });
    }
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

  return res.status(201).json({ ok: true });
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

  membership.role = role;

  try {
    assertFounderImmutable(club, req.body?.founderId !== undefined ? String(req.body.founderId) : undefined);
    assertClubHasExactlyOneOwner(club.id);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "Club governance invariant failed." });
  }

  return res.json(membership);
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

  const project: Project = {
    id: uuidv4(),
    ownerId,
    categoryId,
    title: title.trim(),
    description,
    clubId,
    createdBy,
    createdAt: new Date().toISOString()
  };

  projects.push(project);

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
      visibility: "PUBLIC"
    });
  });

  return res.status(201).json(project);
});

router.get("/projects/:projectId/clubs", (req, res) => {
  const projectId = String(req.params.projectId);
  const viewerId = req.query.viewerId ? String(req.query.viewerId) : "";

  const project = projects.find((entry) => entry.id === projectId);
  if (!project) {
    return res.status(404).json({ message: "Project not found." });
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
    return res.status(201).json(existing);
  }

  projectClubLinks.push(link);
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

  link.status = status;
  return res.json(link);
});

router.get("/projects", (req, res) => {
  const ownerId = req.query.ownerId ? String(req.query.ownerId) : undefined;
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
  const clubId = req.query.clubId ? String(req.query.clubId) : undefined;

  const filtered = projects.filter((p) => {
    if (ownerId && p.ownerId !== ownerId) return false;
    if (categoryId && p.categoryId !== categoryId) return false;
    if (clubId && p.clubId !== clubId) return false;
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
      visibility: "PUBLIC"
    });
  });

  const highlightPrefix = project.clubId
    ? `@${clubs.find((club) => club.id === project.clubId)?.name ?? "club"} by ${authorId} - Highlight`
    : `@${authorId} - Project Highlight`;

  publishActivityPost({
    userId: authorId,
    text: `${highlightPrefix}\n${text}`,
    visibility: "PUBLIC",
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
  res.json(getProjectMilestonesOrdered(projectId));
});

router.post("/projects/:projectId/milestones", (req, res) => {
  const projectId = String(req.params.projectId);
  const actorId = String(req.body?.actorId ?? "");
  const title = String(req.body?.title ?? "").trim();

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

  const milestone: ProjectMilestone = {
    id: uuidv4(),
    projectId,
    title,
    status: "OPEN",
    order: getProjectMilestonesOrdered(projectId).length + 1,
    tasks: [],
    createdBy: actorId,
    createdAt: new Date().toISOString()
  };
  projectMilestones.push(milestone);

  publishActivityPost({
    userId: actorId,
    text: `@${actorId} created project milestone on ${project.title}!`,
    visibility: "PUBLIC",
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
          visibility: "PUBLIC"
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

  return res.json(milestone);
});

router.post("/projects/:projectId/milestones/:milestoneId/tasks", (req, res) => {
  const projectId = String(req.params.projectId);
  const milestoneId = String(req.params.milestoneId);
  const actorId = String(req.body?.actorId ?? "");
  const text = String(req.body?.text ?? "").trim();

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

  const milestone = projectMilestones.find((item) => item.id === milestoneId && item.projectId === projectId);
  if (!milestone) {
    return res.status(404).json({ message: "Milestone not found." });
  }

  const task: ProjectMilestoneTask = {
    id: uuidv4(),
    text,
    isDone: false,
    createdBy: actorId,
    createdAt: new Date().toISOString()
  };
  milestone.tasks.push(task);

  publishActivityPost({
    userId: actorId,
    text: `@${actorId} created tasks for ${milestone.title} on ${project.title}!`,
    visibility: "PUBLIC",
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

  const project = projects.find((entry) => entry.id === projectId);
  if (!project) {
    return res.status(404).json({ message: "Project not found." });
  }

  if (!canManageProject(project, actorId)) {
    return res.status(403).json({ message: "Only project owner/admin can manage milestone tasks." });
  }

  if (typeof isDone !== "boolean") {
    return res.status(400).json({ message: "isDone must be boolean." });
  }

  const milestone = projectMilestones.find((item) => item.id === milestoneId && item.projectId === projectId);
  if (!milestone) {
    return res.status(404).json({ message: "Milestone not found." });
  }

  const task = milestone.tasks.find((item) => item.id === taskId);
  if (!task) {
    return res.status(404).json({ message: "Task not found." });
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
        visibility: "PUBLIC"
      });
    });
  }

  return res.json(task);
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
