import { v4 as uuidv4 } from "uuid";
import { Club, ClubMember, PostTag, Project, ProjectVisibility, Visibility } from "../domain/types";
import { store } from "../repositories/store";

export function relationKey(viewerId: string, targetId: string): string {
  return `${viewerId}::${targetId}`;
}

export function getClubMembershipRole(clubId: string, userId: string): ClubMember["role"] | null {
  return store.clubMembers.find((member) => member.clubId === clubId && member.userId === userId)?.role ?? null;
}

export function canManageClub(clubId: string, userId: string): boolean {
  const role = getClubMembershipRole(clubId, userId);
  return role === "OWNER" || role === "MODERATOR";
}

export function canManageProject(project: Project, actorId: string): boolean {
  if (project.clubId) return canManageClub(project.clubId, actorId);
  return project.ownerId === actorId || project.createdBy === actorId;
}

export function canViewProject(project: Project, viewerId: string): boolean {
  if (project.ownerId === viewerId || project.createdBy === viewerId) return true;

  if (project.visibility === "PUBLIC") return true;
  if (project.visibility === "PRIVATE") return false;

  if (!project.clubId) return false;
  const viewerRole = getClubMembershipRole(project.clubId, viewerId);
  if (!viewerRole) return false;

  if (project.visibility === "CLUB_MEMBERS") return true;
  if (project.visibility === "CLUB_MODERATORS") {
    return viewerRole === "MODERATOR" || viewerRole === "OWNER";
  }
  if (project.visibility === "CLUB_OWNER_ONLY") {
    return viewerRole === "OWNER";
  }
  return false;
}

export function resolveProjectVisibility(input: {
  requestedVisibility?: string;
  clubId?: string;
  actorId: string;
}): ProjectVisibility {
  const requested = String(input.requestedVisibility ?? "").trim().toUpperCase() as ProjectVisibility | "";

  if (!input.clubId) {
    if (!requested || requested === "PUBLIC") return "PUBLIC";
    if (requested === "PRIVATE") return "PRIVATE";
    throw new Error("Non-club projects only support PUBLIC or PRIVATE visibility.");
  }

  const club = store.clubs.find((entry) => entry.id === input.clubId);
  if (!club) {
    throw new Error("Club not found.");
  }

  const actorRole = getClubMembershipRole(input.clubId, input.actorId);
  const requestedOrDefault = requested || (club.isPublic ? "PUBLIC" : "CLUB_MEMBERS");

  if (!club.isPublic) {
    if (requestedOrDefault === "PUBLIC") {
      throw new Error("Projects linked to private clubs cannot be PUBLIC.");
    }

    if (requestedOrDefault === "CLUB_MEMBERS") return "CLUB_MEMBERS";
    if (requestedOrDefault === "CLUB_MODERATORS") {
      if (actorRole === "MODERATOR" || actorRole === "OWNER") return "CLUB_MODERATORS";
      throw new Error("Only club moderators/owner can create CLUB_MODERATORS projects.");
    }
    if (requestedOrDefault === "CLUB_OWNER_ONLY") {
      if (actorRole === "OWNER") return "CLUB_OWNER_ONLY";
      throw new Error("Only club owner can create CLUB_OWNER_ONLY projects.");
    }

    throw new Error("Private-club projects must use CLUB_MEMBERS, CLUB_MODERATORS, or CLUB_OWNER_ONLY visibility.");
  }

  // Public club
  if (requestedOrDefault === "PUBLIC") return "PUBLIC";
  if (requestedOrDefault === "CLUB_MEMBERS") {
    if (actorRole === "MEMBER") {
      throw new Error("Club members cannot create CLUB_MEMBERS projects in public clubs.");
    }
    return "CLUB_MEMBERS";
  }
  if (requestedOrDefault === "CLUB_MODERATORS") {
    if (actorRole === "MODERATOR" || actorRole === "OWNER") return "CLUB_MODERATORS";
    throw new Error("Only club moderators/owner can create CLUB_MODERATORS projects.");
  }
  if (requestedOrDefault === "CLUB_OWNER_ONLY") {
    if (actorRole === "OWNER") return "CLUB_OWNER_ONLY";
    throw new Error("Only club owner can create CLUB_OWNER_ONLY projects.");
  }

  throw new Error("Invalid visibility for a public-club project.");
}

export function assertFounderImmutable(club: Club, proposedFounderId: string | undefined) {
  if (proposedFounderId !== undefined && proposedFounderId !== club.founderId) {
    throw new Error("Founder identity is immutable and cannot be changed.");
  }
}

export function assertClubHasExactlyOneOwner(clubId: string) {
  const ownerMemberships = store.clubMembers.filter((member) => member.clubId === clubId && member.role === "OWNER");
  if (ownerMemberships.length !== 1) {
    throw new Error("Club must have exactly one owner membership.");
  }

  const club = store.clubs.find((entry) => entry.id === clubId);
  if (!club) {
    throw new Error("Club not found.");
  }

  const ownerMembership = ownerMemberships[0];
  if (club.ownerId !== ownerMembership.userId) {
    throw new Error("Club ownerId must match the single OWNER club membership.");
  }
}

export function transferClubOwnershipAtomic(input: {
  clubId: string;
  actorId: string;
  newOwnerId: string;
  previousOwnerFallbackRole: Exclude<ClubMember["role"], "OWNER">;
}) {
  const { clubId, actorId, newOwnerId, previousOwnerFallbackRole } = input;
  const club = store.clubs.find((entry) => entry.id === clubId);
  if (!club) {
    throw new Error("Club not found.");
  }

  if (club.ownerId !== actorId) {
    throw new Error("Only current owner can transfer ownership.");
  }

  if (newOwnerId === club.ownerId) {
    throw new Error("New owner must differ from current owner.");
  }

  const currentOwnerMembership = store.clubMembers.find(
    (member) => member.clubId === clubId && member.userId === club.ownerId
  );
  const nextOwnerMembership = store.clubMembers.find(
    (member) => member.clubId === clubId && member.userId === newOwnerId
  );

  if (!currentOwnerMembership || !nextOwnerMembership) {
    throw new Error("Both current and next owner must be club members.");
  }

  // Apply as a single service operation after pre-validation.
  currentOwnerMembership.role = previousOwnerFallbackRole;
  nextOwnerMembership.role = "OWNER";
  club.ownerId = newOwnerId;

  assertFounderImmutable(club, club.founderId);
  assertClubHasExactlyOneOwner(clubId);
}

export function getProjectMilestonesOrdered(projectId: string) {
  return store.projectMilestones
    .filter((item) => item.projectId === projectId)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function publishActivityPost(input: {
  userId: string;
  text: string;
  visibility?: Visibility;
  clubId?: string;
  projectId?: string;
  postedAsClub?: boolean;
  clubActorId?: string;
  tags?: PostTag[];
}) {
  store.posts.unshift({
    postId: uuidv4(),
    userId: input.userId,
    text: input.text,
    createdAt: new Date().toISOString(),
    moderationStatus: "approved",
    visibility: input.visibility ?? "PUBLIC",
    clubId: input.clubId,
    projectId: input.projectId,
    postedAsClub: input.postedAsClub,
    clubActorId: input.clubActorId,
    tags: input.tags ?? ["PROGRESS"]
  });
}
