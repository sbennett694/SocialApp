import { ModerationState, Visibility } from "./types";

export type AccessContext = {
  viewerId: string;
  authorId: string;
  visibility: Visibility;
  moderationState: ModerationState;
  isFollower: boolean;
  isCloseCircle: boolean;
  isClubMember: boolean;
  canViewProject: boolean;
};

type SharedAccessContext = {
  viewerId: string;
  subjectId: string;
  visibility: Visibility;
  moderationState: ModerationState;
  isFollower: boolean;
  isCloseCircle: boolean;
  isClubMember: boolean;
  canViewProject: boolean;
};

function canViewByVisibility(ctx: SharedAccessContext): boolean {
  if (ctx.viewerId === ctx.subjectId) return true;
  if (ctx.moderationState === "HIDDEN") return false;

  switch (ctx.visibility) {
    case "PUBLIC":
      return true;
    case "FOLLOWERS":
      return ctx.isFollower;
    case "CLOSE_CIRCLE":
      return ctx.isCloseCircle;
    case "CLUB":
      return ctx.isClubMember;
    case "PROJECT":
      return ctx.canViewProject;
    default:
      return false;
  }
}

export function canViewPost(ctx: AccessContext): boolean {
  return canViewByVisibility({
    viewerId: ctx.viewerId,
    subjectId: ctx.authorId,
    visibility: ctx.visibility,
    moderationState: ctx.moderationState,
    isFollower: ctx.isFollower,
    isCloseCircle: ctx.isCloseCircle,
    isClubMember: ctx.isClubMember,
    canViewProject: ctx.canViewProject
  });
}

export type EventAccessContext = {
  viewerId: string;
  actorId: string;
  visibility: Visibility;
  moderationState: ModerationState;
  isFollower: boolean;
  isCloseCircle: boolean;
  isClubMember: boolean;
  canViewProject: boolean;
};

export function canViewEvent(ctx: EventAccessContext): boolean {
  return canViewByVisibility({
    viewerId: ctx.viewerId,
    subjectId: ctx.actorId,
    visibility: ctx.visibility,
    moderationState: ctx.moderationState,
    isFollower: ctx.isFollower,
    isCloseCircle: ctx.isCloseCircle,
    isClubMember: ctx.isClubMember,
    canViewProject: ctx.canViewProject
  });
}

export type ReplyPolicyInput = {
  parentDepth: number;
  isAuthor: boolean;
  isCloseCircle: boolean;
  isMutualFollower?: boolean;
};

export function canReplyAtDepth(input: ReplyPolicyInput): boolean {
  if (input.isAuthor || input.isCloseCircle || input.isMutualFollower) {
    return input.parentDepth < 5;
  }

  // Non-close-circle users: top-level comment allowed, one author reply allowed, then stop.
  return input.parentDepth < 1;
}
