export type Visibility = "PUBLIC" | "FOLLOWERS" | "CLOSE_CIRCLE" | "CLUB" | "PROJECT";

export type ReactionType =
  | "INSPIRED"
  | "HELPFUL"
  | "BEAUTIFUL"
  | "MADE_ME_SMILE"
  | "GREAT_IDEA";

export type ThreadType = "COMMENTS" | "QUESTIONS" | "THANK_YOU" | "SUGGESTIONS";

export type ReportReason =
  | "POLITICAL_CONTENT"
  | "EXTREMISM_OR_HATE"
  | "HARASSMENT"
  | "OFF_TOPIC"
  | "SPAM";

export type ModerationState = "OK" | "FLAGGED" | "HIDDEN";

export type ModerationActionType =
  | "HIDE_FROM_DISCOVERY"
  | "CONTENT_WARNING"
  | "TEMP_SUSPEND"
  | "BAN"
  | "RESTORE";

export type CloseCircleInviteStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";

export type ClubMemberRole = "MEMBER" | "MODERATOR" | "OWNER";

export type ClubJoinPolicy = "OPEN" | "REQUEST_REQUIRED" | "INVITE_ONLY";

export type ClubJoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ClubEventVisibility = "CLUB_MEMBERS" | "PUBLIC_CLUB";

export type ClubEventStatus = "SCHEDULED" | "CANCELLED";

export type ProjectVisibility =
  | "PUBLIC"
  | "PRIVATE"
  | "CLUB_MEMBERS"
  | "CLUB_MODERATORS"
  | "CLUB_OWNER_ONLY";

export type TaskTimeEntryType = "MANUAL";

export type PostTag = "WIN" | "PROGRESS" | "TIP" | "QUESTION" | "SHOWCASE";

export type User = {
  id: string;
  handle: string;
  displayName: string;
  bio?: string;
  createdAt: string;
};

export type Follow = {
  followerId: string;
  followeeId: string;
  createdAt: string;
};

export type CloseCircleInvite = {
  inviterId: string;
  inviteeId: string;
  status: CloseCircleInviteStatus;
  createdAt: string;
};

export type Category = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

export type Club = {
  id: string;
  categoryId: string;
  name: string;
  founderId: string;
  ownerId: string;
  isPublic: boolean;
  joinPolicy?: ClubJoinPolicy;
  createdAt: string;
  description?: string;
  rules?: string;
  memberCount?: number;
  pendingJoinRequestCount?: number;
};

export type ClubJoinRequest = {
  clubId: string;
  userId: string;
  status: ClubJoinRequestStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
};

export type ClubMember = {
  clubId: string;
  userId: string;
  role: ClubMemberRole;
  createdAt: string;
};

export type ClubEvent = {
  id: string;
  clubId: string;
  title: string;
  description?: string;
  isAllDay?: boolean;
  startAt: string;
  endAt?: string;
  locationText?: string;
  visibility: ClubEventVisibility;
  status: ClubEventStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  ownerId: string;
  categoryId: string;
  title: string;
  description?: string;
  clubId?: string;
  visibility: ProjectVisibility;
  createdBy?: string;
  createdAt: string;
};

export type Post = {
  id: string;
  authorId: string;
  createdAt: string;
  visibility: Visibility;
  textContent: string;
  mediaRefs: string[];
  clubId?: string;
  projectId?: string;
  tags: PostTag[];
  moderationState: ModerationState;
};

export type Reaction = {
  postId: string;
  userId: string;
  type: ReactionType;
  createdAt: string;
};

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  createdAt: string;
  threadType: ThreadType;
  parentCommentId?: string;
  depth: number;
  textContent: string;
  moderationState: ModerationState;
};

export type Report = {
  id: string;
  reporterId: string;
  targetType: "POST" | "COMMENT" | "USER";
  targetId: string;
  reason: ReportReason;
  details?: string;
  status: "OPEN" | "REVIEWED" | "ACTIONED";
  createdAt: string;
};

export type ModerationAction = {
  id: string;
  targetType: "POST" | "COMMENT" | "USER";
  targetId: string;
  actionType: ModerationActionType;
  actorId: string;
  reason: string;
  createdAt: string;
};

export type TaskTimeEntry = {
  id: string;
  taskId: string;
  userId: string;
  entryType: TaskTimeEntryType;
  durationMinutes: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
};
