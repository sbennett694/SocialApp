import { canViewEvent } from "../domain/policy";
import { FeedCursor, FeedEvent, FeedQueryFilters } from "../domain/feedEvent";
import { feedEventRepository } from "../repositories/feedEventRepository";
import { store } from "../repositories/store";
import { relationKey } from "./socialService";

export type CommonsFeedQueryInput = {
  viewerId: string;
  filters?: FeedQueryFilters;
  limit?: number;
  cursor?: FeedCursor;
};

export type CommonsFeedQueryResult = {
  events: FeedEvent[];
  nextCursor?: FeedCursor;
};

function compareFeedEventsDesc(a: FeedEvent, b: FeedEvent): number {
  if (a.sortTimestamp === b.sortTimestamp) {
    return b.id.localeCompare(a.id);
  }
  return b.sortTimestamp.localeCompare(a.sortTimestamp);
}

function isViewerProjectScoped(viewerId: string, memberClubIds: Set<string>, projectId?: string): boolean {
  if (!projectId) return false;
  const project = store.projects.find((entry) => entry.id === projectId);
  if (!project) return false;

  if (project.ownerId === viewerId || project.createdBy === viewerId) {
    return true;
  }

  if (project.clubId && memberClubIds.has(project.clubId)) {
    return true;
  }

  const approvedLinkedClubIds = store.projectClubLinks
    .filter((link) => link.projectId === projectId && link.status === "APPROVED")
    .map((link) => link.clubId);
  return approvedLinkedClubIds.some((clubId) => memberClubIds.has(clubId));
}

function isPostHiddenOrMissing(postId: string): boolean {
  const post = store.posts.find((entry) => entry.postId === postId);
  if (!post) return true;
  return post.moderationStatus === "hidden";
}

function encodeCursor(event: FeedEvent | undefined): FeedCursor | undefined {
  if (!event) return undefined;
  return { sortTimestamp: event.sortTimestamp, id: event.id };
}

function dedupeMerge(candidateLists: FeedEvent[][]): FeedEvent[] {
  const deduped = new Map<string, FeedEvent>();
  candidateLists.forEach((list) => {
    list.forEach((event) => {
      if (!deduped.has(event.id)) {
        deduped.set(event.id, event);
      }
    });
  });
  return Array.from(deduped.values());
}

function buildProjectScopeIds(viewerId: string, memberClubIds: Set<string>): Set<string> {
  const projectIds = new Set<string>();
  store.projects.forEach((project) => {
    if (project.ownerId === viewerId || project.createdBy === viewerId) {
      projectIds.add(project.id);
      return;
    }

    if (project.clubId && memberClubIds.has(project.clubId)) {
      projectIds.add(project.id);
      return;
    }

    const linkedApproved = store.projectClubLinks.some(
      (link) => link.projectId === project.id && link.status === "APPROVED" && memberClubIds.has(link.clubId)
    );
    if (linkedApproved) {
      projectIds.add(project.id);
    }
  });
  return projectIds;
}

export const feedQueryService = {
  queryCommonsFeed(input: CommonsFeedQueryInput): CommonsFeedQueryResult {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const filters = input.filters;

    const followedUserIds = new Set(
      store.follows.filter((follow) => follow.followerId === input.viewerId).map((follow) => follow.followeeId)
    );
    const closeCircleUserIds = new Set(
      store.closeCircleInvites
        .filter(
          (invite) =>
            invite.status === "ACCEPTED" &&
            (invite.inviterId === input.viewerId || invite.inviteeId === input.viewerId)
        )
        .map((invite) => (invite.inviterId === input.viewerId ? invite.inviteeId : invite.inviterId))
    );
    const memberClubIds = new Set(
      store.clubMembers.filter((member) => member.userId === input.viewerId).map((member) => member.clubId)
    );
    const projectScopeIds = buildProjectScopeIds(input.viewerId, memberClubIds);

    const actorIds = Array.from(new Set([input.viewerId, ...followedUserIds, ...closeCircleUserIds]));
    const clubIds = Array.from(memberClubIds);
    const projectIds = Array.from(projectScopeIds);

    const perPathLimit = Math.max(limit * 3, 20);
    const perKeyLimit = 5;

    const publicCandidates = feedEventRepository.listByVisibility("PUBLIC", {
      cursor: input.cursor,
      limit: perPathLimit
    });

    const actorCandidates = actorIds.flatMap((actorId) =>
      feedEventRepository.listByActor(actorId, {
        cursor: input.cursor,
        limit: perKeyLimit
      })
    );

    const clubCandidates = clubIds.flatMap((clubId) =>
      feedEventRepository.listByClub(clubId, {
        cursor: input.cursor,
        limit: perKeyLimit
      })
    );

    const projectCandidates = projectIds.flatMap((projectId) =>
      feedEventRepository.listByProject(projectId, {
        cursor: input.cursor,
        limit: perKeyLimit
      })
    );

    const merged = dedupeMerge([publicCandidates, actorCandidates, clubCandidates, projectCandidates]).sort(
      compareFeedEventsDesc
    );

    const filtered = merged.filter((event) => {
      if (filters?.source && event.source !== filters.source) return false;
      if (filters?.eventType && event.eventType !== filters.eventType) return false;
      if (filters?.clubId && event.clubId !== filters.clubId) return false;
      if (filters?.projectId && event.projectId !== filters.projectId) return false;
      if (filters?.actorId && event.actorId !== filters.actorId) return false;

      if (event.isDeleted || event.moderationState === "HIDDEN") return false;

      if (event.entityType === "POST" && isPostHiddenOrMissing(event.entityId)) {
        return false;
      }

      if (store.mutedPairs.has(relationKey(input.viewerId, event.actorId))) return false;
      if (
        store.blockedPairs.has(relationKey(input.viewerId, event.actorId)) ||
        store.blockedPairs.has(relationKey(event.actorId, input.viewerId))
      ) {
        return false;
      }

      const isFollower = followedUserIds.has(event.actorId);
      const isCloseCircle = closeCircleUserIds.has(event.actorId);
      const isClubMember = !!event.clubId && memberClubIds.has(event.clubId);
      const canViewProject = isViewerProjectScoped(input.viewerId, memberClubIds, event.projectId);

      return canViewEvent({
        viewerId: input.viewerId,
        actorId: event.actorId,
        visibility: event.visibility,
        moderationState: event.moderationState,
        isFollower,
        isCloseCircle,
        isClubMember,
        canViewProject
      });
    });

    const events = filtered.slice(0, limit);
    return {
      events,
      nextCursor: encodeCursor(events[events.length - 1])
    };
  }
};
