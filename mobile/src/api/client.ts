import { config } from "../config";

export type Visibility = "PUBLIC" | "FOLLOWERS" | "CLOSE_CIRCLE" | "CLUB" | "PROJECT";
export type ThreadType = "COMMENTS" | "QUESTIONS" | "THANK_YOU" | "SUGGESTIONS";

export type Category = {
  id: string;
  name: string;
  isActive: boolean;
};

export type UserBasic = {
  id: string;
  handle: string;
  displayName: string;
};

export type GlobalSearchResult = {
  users: Array<{ id: string; handle: string; displayName: string; type: "USER" }>;
  clubs: Array<{ id: string; name: string; categoryId: string; type: "CLUB" }>;
  projects: Array<{ id: string; title: string; categoryId: string; type: "PROJECT" }>;
};

export type Club = {
  id: string;
  categoryId: string;
  name: string;
  ownerId?: string;
  isPublic?: boolean;
  description?: string;
};

export type ClubHighlight = {
  club: Club;
  samplePost: Post | null;
};

export type Project = {
  id: string;
  ownerId: string;
  categoryId: string;
  title: string;
  description?: string;
  clubId?: string;
  createdBy?: string;
  createdAt: string;
};

export type UserProfileSummary = {
  id: string;
  handle: string;
  displayName: string;
  bio?: string;
  avatar?: string | null;
  counts: {
    followerCount: number;
    followingCount: number;
    closeCircleCount: number;
    projectCount: number;
  };
};

export type RelationshipToMe = {
  isFollowing: boolean;
  isFollowedBy: boolean;
  closeCircleStatus: "NONE" | "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";
  isMuted: boolean;
  isBlocked: boolean;
};

export type CloseCircleInviteRecord = {
  inviterId: string;
  inviteeId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";
  createdAt: string;
};

export type Post = {
  postId: string;
  userId: string;
  text: string;
  createdAt: string;
  visibility?: Visibility;
  clubId?: string;
  projectId?: string;
  postedAsClub?: boolean;
  clubActorId?: string;
};

export type FeedEventType =
  | "POST_CREATED"
  | "CLUB_POST_CREATED"
  | "PROJECT_HIGHLIGHT_CREATED"
  | "MILESTONE_COMPLETED"
  | "TASK_COMPLETED"
  | "PROJECT_CREATED";

export type FeedEvent = {
  id: string;
  eventType: FeedEventType;
  contextType: "POST" | "PROJECT_HIGHLIGHT" | "MILESTONE" | "TASK" | "CLUB" | "PROJECT";
  entityType: "POST" | "PROJECT_HIGHLIGHT" | "PROJECT_MILESTONE" | "PROJECT_TASK" | "PROJECT";
  entityId: string;
  actorId: string;
  source: "COMMONS" | "CLUBS" | "PROJECTS";
  visibility: Visibility;
  clubId?: string;
  projectId?: string;
  createdAt: string;
  sortTimestamp: string;
  moderationState: "OK" | "FLAGGED" | "HIDDEN";
  isDeleted: boolean;
  summary?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type CommonsFeedMode = "posts" | "events";

export type CommonsFeedOptions = {
  mode?: CommonsFeedMode;
  shape?: "legacy" | "events";
  cursor?: string;
  limit?: number;
  source?: "COMMONS" | "CLUBS" | "PROJECTS";
  eventType?: FeedEventType;
  clubId?: string;
  projectId?: string;
  actorId?: string;
};

export type CommonsFeedResponse = {
  mode: CommonsFeedMode;
  shape?: "legacy" | "events";
  items: Post[] | FeedEvent[];
  nextCursor?: string;
};

export type ProjectHighlight = {
  id: string;
  projectId: string;
  text: string;
  authorId: string;
  createdAt: string;
};

export type ProjectMilestone = {
  id: string;
  projectId: string;
  title: string;
  status: "OPEN" | "DONE";
  order: number;
  tasks: ProjectMilestoneTask[];
  createdBy: string;
  createdAt: string;
};

export type ProjectMilestoneTask = {
  id: string;
  text: string;
  isDone: boolean;
  createdBy: string;
  createdAt: string;
};

export type ProjectClubLink = {
  projectId: string;
  clubId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedBy: string;
  createdAt: string;
  club?: Club;
  canApprove?: boolean;
};

export type ClubMember = {
  clubId: string;
  userId: string;
  role: "MEMBER" | "MODERATOR" | "OWNER";
  createdAt: string;
};

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  createdAt: string;
  threadType: ThreadType;
  textContent: string;
  depth: number;
  parentCommentId?: string;
};

export type CreatePostInput = {
  userId: string;
  text: string;
  visibility?: Visibility;
  tags?: string[];
  clubId?: string;
  projectId?: string;
  postedAsClub?: boolean;
  clubActorId?: string;
};

export type CreatePostError = {
  message: string;
  code?: string;
  matchedTerms?: string[];
};

async function extractApiError(response: Response, fallback: string): Promise<Error> {
  const payload = (await response.json().catch(() => ({}))) as CreatePostError;
  const message = payload?.message ?? `${fallback}: ${response.status}`;
  return new Error(message);
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${config.apiBaseUrl}${path}`, init);
  } catch (_err) {
    const localhostHint = config.apiBaseUrl.includes("127.0.0.1")
      ? " If you are testing on a physical device, set EXPO_PUBLIC_API_BASE_URL to your computer LAN IP (for example http://192.168.x.x:3001)."
      : "";
    throw new Error(
      `Cannot reach backend at ${config.apiBaseUrl}. Make sure the API is running (npm --prefix backend run local-api).${localhostHint}`
    );
  }
}

export async function getFeed(viewerId?: string): Promise<Post[]> {
  const params = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
  const response = await apiFetch(`/posts${params}`);
  if (!response.ok) {
    throw new Error(`Feed request failed: ${response.status}`);
  }
  return response.json();
}

export async function getUsers(): Promise<UserBasic[]> {
  const response = await apiFetch(`/users`);
  if (!response.ok) {
    throw new Error(`Users request failed: ${response.status}`);
  }
  return response.json();
}

export async function searchGlobal(query: string): Promise<GlobalSearchResult> {
  const response = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status}`);
  }
  return response.json();
}

export async function getCommonsFeed(viewerId: string, options?: CommonsFeedOptions): Promise<Post[]> {
  const query = new URLSearchParams();
  query.set("viewerId", viewerId);
  if (options?.mode) query.set("mode", options.mode);
  if (options?.shape) query.set("shape", options.shape);
  if (options?.cursor) query.set("cursor", options.cursor);
  if (typeof options?.limit === "number") query.set("limit", String(options.limit));
  if (options?.source) query.set("source", options.source);
  if (options?.eventType) query.set("eventType", options.eventType);
  if (options?.clubId) query.set("clubId", options.clubId);
  if (options?.projectId) query.set("projectId", options.projectId);
  if (options?.actorId) query.set("actorId", options.actorId);

  const response = await apiFetch(`/feed/commons?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Commons feed request failed: ${response.status}`);
  }

  const payload = (await response.json()) as Post[] | CommonsFeedResponse;
  if (Array.isArray(payload)) {
    return payload;
  }

  return (payload.items as Post[]) ?? [];
}

export async function getClubsFeed(viewerId: string, clubId?: string): Promise<Post[]> {
  const query = new URLSearchParams();
  query.set("viewerId", viewerId);
  if (clubId) query.set("clubId", clubId);
  const response = await apiFetch(`/feed/clubs?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Clubs feed request failed: ${response.status}`);
  }
  return response.json();
}

export async function getProjectsFeed(viewerId: string): Promise<Post[]> {
  const response = await apiFetch(`/feed/projects?viewerId=${encodeURIComponent(viewerId)}`);
  if (!response.ok) {
    throw new Error(`Projects feed request failed: ${response.status}`);
  }
  return response.json();
}

export async function createPost(input: CreatePostInput): Promise<Post> {
  const response = await apiFetch(`/posts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as CreatePostError;
    throw new Error(payload.message ?? `Create post failed: ${response.status}`);
  }

  return response.json();
}

export async function followUser(followerId: string, followeeId: string): Promise<void> {
  const response = await apiFetch(`/follow`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ followerId, followeeId })
  });

  if (!response.ok) {
    throw new Error(`Follow failed: ${response.status}`);
  }
}

export async function unfollowUser(followerId: string, followeeId: string): Promise<void> {
  const response = await apiFetch(`/follow`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ followerId, followeeId })
  });

  if (!response.ok) {
    throw new Error(`Unfollow failed: ${response.status}`);
  }
}

export async function inviteCloseCircle(inviterId: string, inviteeId: string): Promise<void> {
  const response = await apiFetch(`/close-circle/invite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviterId, inviteeId })
  });

  if (!response.ok) {
    throw new Error(`Close circle invite failed: ${response.status}`);
  }
}

export async function respondCloseCircleInvite(input: {
  inviterId: string;
  inviteeId: string;
  status: "ACCEPTED" | "DECLINED";
}): Promise<void> {
  const response = await apiFetch(`/close-circle/respond`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`Close circle response failed: ${response.status}`);
  }
}

export async function getCloseCircleInvites(userId: string): Promise<{
  incoming: CloseCircleInviteRecord[];
  outgoing: CloseCircleInviteRecord[];
}> {
  const response = await apiFetch(`/users/${encodeURIComponent(userId)}/close-circle/invites`);
  if (!response.ok) {
    throw new Error(`Close circle invites failed: ${response.status}`);
  }
  return response.json();
}

export async function getCloseCircle(userId: string): Promise<CloseCircleInviteRecord[]> {
  const response = await apiFetch(`/users/${encodeURIComponent(userId)}/close-circle`);
  if (!response.ok) {
    throw new Error(`Close circle load failed: ${response.status}`);
  }
  return response.json();
}

export async function removeCloseCircle(userA: string, userB: string): Promise<void> {
  const response = await apiFetch(`/close-circle`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userA, userB })
  });
  if (!response.ok) {
    throw new Error(`Close circle removal failed: ${response.status}`);
  }
}

export async function getRelationshipToMe(targetUserId: string, viewerId: string): Promise<RelationshipToMe> {
  const response = await apiFetch(
    `/users/${encodeURIComponent(targetUserId)}/relationship-to-me?viewerId=${encodeURIComponent(viewerId)}`
  );
  if (!response.ok) {
    throw new Error(`Relationship lookup failed: ${response.status}`);
  }
  return response.json();
}

export async function blockUser(targetUserId: string, viewerId: string): Promise<void> {
  const response = await apiFetch(`/users/${encodeURIComponent(targetUserId)}/block`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ viewerId })
  });
  if (!response.ok) {
    throw new Error(`Block failed: ${response.status}`);
  }
}

export async function unblockUser(targetUserId: string, viewerId: string): Promise<void> {
  const response = await apiFetch(`/users/${encodeURIComponent(targetUserId)}/block`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ viewerId })
  });
  if (!response.ok) {
    throw new Error(`Unblock failed: ${response.status}`);
  }
}

export async function getProfileSummary(userId: string): Promise<UserProfileSummary> {
  const response = await apiFetch(`/users/${encodeURIComponent(userId)}/profile-summary`);
  if (!response.ok) {
    throw new Error(`Profile summary failed: ${response.status}`);
  }
  return response.json();
}

export async function getUserPosts(userId: string): Promise<Post[]> {
  const response = await apiFetch(`/users/${encodeURIComponent(userId)}/posts`);
  if (!response.ok) {
    throw new Error(`User posts failed: ${response.status}`);
  }
  return response.json();
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  const response = await apiFetch(`/users/${encodeURIComponent(userId)}/projects`);
  if (!response.ok) {
    throw new Error(`User projects failed: ${response.status}`);
  }
  return response.json();
}

export async function getUserClubs(userId: string): Promise<Club[]> {
  const response = await apiFetch(`/users/${encodeURIComponent(userId)}/clubs`);
  if (!response.ok) {
    throw new Error(`User clubs failed: ${response.status}`);
  }
  return response.json();
}

export async function getFollowers(userId: string): Promise<FollowRelation[]> {
  const response = await apiFetch(`/users/${encodeURIComponent(userId)}/followers`);
  if (!response.ok) {
    throw new Error(`Followers request failed: ${response.status}`);
  }
  return response.json();
}

export async function getFollowing(userId: string): Promise<FollowRelation[]> {
  const response = await apiFetch(`/users/${encodeURIComponent(userId)}/following`);
  if (!response.ok) {
    throw new Error(`Following request failed: ${response.status}`);
  }
  return response.json();
}

export type FollowRelation = {
  followerId: string;
  followeeId: string;
  createdAt: string;
};

export async function getComments(postId: string, threadType: ThreadType): Promise<Comment[]> {
  const response = await apiFetch(`/posts/${encodeURIComponent(postId)}/comments?threadType=${threadType}`);
  if (!response.ok) {
    throw await extractApiError(response, "Comment load failed");
  }
  return response.json();
}

export async function createComment(input: {
  postId: string;
  authorId: string;
  textContent: string;
  threadType: ThreadType;
  parentCommentId?: string;
}): Promise<Comment> {
  const response = await apiFetch(`/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw await extractApiError(response, "Comment create failed");
  }
  return response.json();
}

export async function getCategories(): Promise<{ categories: Category[]; tags: string[] }> {
  const response = await apiFetch(`/categories`);
  if (!response.ok) {
    throw new Error(`Categories load failed: ${response.status}`);
  }
  return response.json();
}

export async function getClubs(): Promise<Club[]> {
  const response = await apiFetch(`/clubs`);
  if (!response.ok) {
    throw new Error(`Clubs load failed: ${response.status}`);
  }
  return response.json();
}

export async function searchClubs(params: {
  viewerId: string;
  search?: string;
  onlyShareTargets?: boolean;
  joinableOnly?: boolean;
}): Promise<Club[]> {
  const query = new URLSearchParams();
  query.set("viewerId", params.viewerId);
  if (params.search) query.set("search", params.search);
  if (params.onlyShareTargets) query.set("onlyShareTargets", "true");
  if (params.joinableOnly) query.set("joinableOnly", "true");

  const response = await apiFetch(`/clubs?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Clubs search failed: ${response.status}`);
  }
  return response.json();
}

export async function createClub(input: {
  ownerId: string;
  categoryId: string;
  name: string;
  description?: string;
  isPublic?: boolean;
}): Promise<Club> {
  const response = await apiFetch(`/clubs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw await extractApiError(response, "Create club failed");
  }
  return response.json();
}

export async function updateClub(input: {
  clubId: string;
  viewerId: string;
  name?: string;
  description?: string;
  isPublic?: boolean;
}): Promise<Club> {
  const response = await apiFetch(`/clubs/${encodeURIComponent(input.clubId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      viewerId: input.viewerId,
      name: input.name,
      description: input.description,
      isPublic: input.isPublic
    })
  });

  if (!response.ok) {
    throw await extractApiError(response, "Update club failed");
  }
  return response.json();
}

export async function getClubHighlights(viewerId: string, categoryId?: string): Promise<{
  joined: ClubHighlight[];
  friends: ClubHighlight[];
  mine: ClubHighlight[];
  suggested: ClubHighlight[];
}> {
  const query = new URLSearchParams();
  query.set("viewerId", viewerId);
  if (categoryId) query.set("categoryId", categoryId);
  const response = await apiFetch(`/clubs/highlights?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Club highlights failed: ${response.status}`);
  }
  return response.json();
}

export async function joinClub(clubId: string, userId: string): Promise<void> {
  const response = await apiFetch(`/clubs/${encodeURIComponent(clubId)}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) {
    throw new Error(`Join club failed: ${response.status}`);
  }
}

export async function getClubMembers(clubId: string): Promise<ClubMember[]> {
  const response = await apiFetch(`/clubs/${encodeURIComponent(clubId)}/members`);
  if (!response.ok) {
    throw new Error(`Club members load failed: ${response.status}`);
  }
  return response.json();
}

export async function updateClubMemberRole(input: {
  clubId: string;
  memberId: string;
  actorId: string;
  role: "MEMBER" | "MODERATOR";
}): Promise<ClubMember> {
  const response = await apiFetch(
    `/clubs/${encodeURIComponent(input.clubId)}/members/${encodeURIComponent(input.memberId)}/role`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorId: input.actorId, role: input.role })
    }
  );
  if (!response.ok) {
    throw await extractApiError(response, "Update club member role failed");
  }
  return response.json();
}

export async function getClubProjects(clubId: string): Promise<Project[]> {
  const response = await apiFetch(`/clubs/${encodeURIComponent(clubId)}/projects`);
  if (!response.ok) {
    throw new Error(`Club projects load failed: ${response.status}`);
  }
  return response.json();
}

export async function getProjects(ownerId?: string, clubId?: string): Promise<Project[]> {
  const query = new URLSearchParams();
  if (ownerId) query.set("ownerId", ownerId);
  if (clubId) query.set("clubId", clubId);
  const response = await apiFetch(`/projects${query.toString() ? `?${query.toString()}` : ""}`);
  if (!response.ok) {
    throw new Error(`Projects load failed: ${response.status}`);
  }
  return response.json();
}

export async function createProject(input: {
  ownerId: string;
  createdBy?: string;
  categoryId: string;
  title: string;
  description?: string;
  clubId?: string;
}): Promise<Project> {
  const response = await apiFetch(`/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw await extractApiError(response, "Project create failed");
  }
  return response.json();
}

export async function getProjectHighlights(projectId: string): Promise<ProjectHighlight[]> {
  const response = await apiFetch(`/projects/${encodeURIComponent(projectId)}/highlights`);
  if (!response.ok) {
    throw new Error(`Project highlights load failed: ${response.status}`);
  }
  return response.json();
}

export async function createProjectHighlight(input: {
  projectId: string;
  authorId: string;
  text: string;
}): Promise<ProjectHighlight> {
  const response = await apiFetch(`/projects/${encodeURIComponent(input.projectId)}/highlights`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ authorId: input.authorId, text: input.text })
  });
  if (!response.ok) {
    throw await extractApiError(response, "Project highlight create failed");
  }
  return response.json();
}

export async function getProjectMilestones(projectId: string): Promise<ProjectMilestone[]> {
  const response = await apiFetch(`/projects/${encodeURIComponent(projectId)}/milestones`);
  if (!response.ok) {
    throw new Error(`Project milestones load failed: ${response.status}`);
  }
  return response.json();
}

export async function createProjectMilestone(input: {
  projectId: string;
  actorId: string;
  title: string;
}): Promise<ProjectMilestone> {
  const response = await apiFetch(`/projects/${encodeURIComponent(input.projectId)}/milestones`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actorId: input.actorId, title: input.title })
  });
  if (!response.ok) {
    throw await extractApiError(response, "Project milestone create failed");
  }
  return response.json();
}

export async function updateProjectMilestone(input: {
  projectId: string;
  milestoneId: string;
  actorId: string;
  title?: string;
  status?: "OPEN" | "DONE";
}): Promise<ProjectMilestone> {
  const response = await apiFetch(
    `/projects/${encodeURIComponent(input.projectId)}/milestones/${encodeURIComponent(input.milestoneId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorId: input.actorId, title: input.title, status: input.status })
    }
  );
  if (!response.ok) {
    throw await extractApiError(response, "Project milestone update failed");
  }
  return response.json();
}

export async function createProjectMilestoneTask(input: {
  projectId: string;
  milestoneId: string;
  actorId: string;
  text: string;
}): Promise<ProjectMilestoneTask> {
  const response = await apiFetch(
    `/projects/${encodeURIComponent(input.projectId)}/milestones/${encodeURIComponent(input.milestoneId)}/tasks`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorId: input.actorId, text: input.text })
    }
  );
  if (!response.ok) {
    throw await extractApiError(response, "Project milestone task create failed");
  }
  return response.json();
}

export async function updateProjectMilestoneTask(input: {
  projectId: string;
  milestoneId: string;
  taskId: string;
  actorId: string;
  isDone: boolean;
}): Promise<ProjectMilestoneTask> {
  const response = await apiFetch(
    `/projects/${encodeURIComponent(input.projectId)}/milestones/${encodeURIComponent(input.milestoneId)}/tasks/${encodeURIComponent(input.taskId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorId: input.actorId, isDone: input.isDone })
    }
  );
  if (!response.ok) {
    throw await extractApiError(response, "Project milestone task update failed");
  }
  return response.json();
}

export async function getProjectClubLinks(projectId: string, viewerId: string): Promise<ProjectClubLink[]> {
  const response = await apiFetch(
    `/projects/${encodeURIComponent(projectId)}/clubs?viewerId=${encodeURIComponent(viewerId)}`
  );
  if (!response.ok) {
    throw await extractApiError(response, "Project club links load failed");
  }
  return response.json();
}

export async function requestProjectClubLink(input: {
  projectId: string;
  clubId: string;
  actorId: string;
}): Promise<ProjectClubLink> {
  const response = await apiFetch(`/projects/${encodeURIComponent(input.projectId)}/clubs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clubId: input.clubId, actorId: input.actorId })
  });
  if (!response.ok) {
    throw await extractApiError(response, "Project-club request failed");
  }
  return response.json();
}

export async function reviewProjectClubLink(input: {
  projectId: string;
  clubId: string;
  actorId: string;
  status: "APPROVED" | "REJECTED";
}): Promise<ProjectClubLink> {
  const response = await apiFetch(
    `/projects/${encodeURIComponent(input.projectId)}/clubs/${encodeURIComponent(input.clubId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorId: input.actorId, status: input.status })
    }
  );
  if (!response.ok) {
    throw await extractApiError(response, "Project-club review failed");
  }
  return response.json();
}
