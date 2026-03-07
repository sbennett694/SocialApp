import { v4 as uuidv4 } from "uuid";
import {
  Club,
  CloseCircleInvite,
  ClubMember,
  Comment,
  Follow,
  ModerationAction,
  PostTag,
  Project,
  Reaction,
  Report,
  User,
  Visibility
} from "../domain/types";
import { FeedEvent } from "../domain/feedEvent";
import { ClubHistoryEvent } from "../domain/clubHistory";

export type LocalPost = {
  postId: string;
  userId: string;
  text: string;
  createdAt: string;
  moderationStatus: "approved" | "flagged" | "hidden";
  visibility: Visibility;
  clubId?: string;
  projectId?: string;
  postedAsClub?: boolean;
  clubActorId?: string;
  tags: PostTag[];
};

export type GlobalSearchResult = {
  users: Array<{ id: string; handle: string; displayName: string; type: "USER" }>;
  clubs: Array<{ id: string; name: string; categoryId: string; type: "CLUB" }>;
  projects: Array<{ id: string; title: string; categoryId: string; type: "PROJECT" }>;
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

export type ProjectHighlight = {
  id: string;
  projectId: string;
  text: string;
  authorId: string;
  createdAt: string;
};

export type ProjectClubLink = {
  projectId: string;
  clubId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedBy: string;
  createdAt: string;
};

function isoMinutesAgo(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function clearArray<T>(target: T[]) {
  target.splice(0, target.length);
}

export const store = {
  users: [] as Array<Pick<User, "id" | "handle" | "displayName">>,
  follows: [] as Follow[],
  closeCircleInvites: [] as CloseCircleInvite[],
  clubMembers: [] as ClubMember[],
  clubs: [] as Club[],
  projects: [] as Project[],
  projectClubLinks: [] as ProjectClubLink[],
  projectMilestones: [] as ProjectMilestone[],
  projectHighlights: [] as ProjectHighlight[],
  reactions: [] as Reaction[],
  comments: [] as Comment[],
  reports: [] as Report[],
  moderationActions: [] as ModerationAction[],
  feedEvents: [] as FeedEvent[],
  clubHistoryEvents: [] as ClubHistoryEvent[],
  mutedPairs: new Set<string>(),
  blockedPairs: new Set<string>(),
  posts: [] as LocalPost[]
};

export function resetStoreToDefault() {
  clearArray(store.users);
  clearArray(store.follows);
  clearArray(store.closeCircleInvites);
  clearArray(store.clubMembers);
  clearArray(store.clubs);
  clearArray(store.projects);
  clearArray(store.projectClubLinks);
  clearArray(store.projectMilestones);
  clearArray(store.projectHighlights);
  clearArray(store.reactions);
  clearArray(store.comments);
  clearArray(store.reports);
  clearArray(store.moderationActions);
  clearArray(store.feedEvents);
  clearArray(store.clubHistoryEvents);
  clearArray(store.posts);
  store.mutedPairs.clear();
  store.blockedPairs.clear();

  store.users.push(
    { id: "alex", handle: "alex", displayName: "Alex" },
    { id: "jamie", handle: "jamie", displayName: "Jamie" },
    { id: "taylor", handle: "taylor", displayName: "Taylor" },
    { id: "welcome", handle: "welcome", displayName: "Welcome User" }
  );

  store.posts.push({
    postId: uuidv4(),
    userId: "welcome",
    text: "Welcome to SocialApp — share hobbies, interests, and positivity.",
    createdAt: new Date().toISOString(),
    moderationStatus: "approved",
    visibility: "PUBLIC",
    tags: ["SHOWCASE"]
  });
}

export function seedStoreWithDemoData() {
  resetStoreToDefault();

  store.users.push(
    { id: "morgan", handle: "morgan", displayName: "Morgan" },
    { id: "riley", handle: "riley", displayName: "Riley" }
  );

  store.follows.push(
    { followerId: "alex", followeeId: "jamie", createdAt: isoMinutesAgo(420) },
    { followerId: "alex", followeeId: "taylor", createdAt: isoMinutesAgo(410) },
    { followerId: "jamie", followeeId: "alex", createdAt: isoMinutesAgo(405) },
    { followerId: "taylor", followeeId: "alex", createdAt: isoMinutesAgo(400) },
    { followerId: "morgan", followeeId: "alex", createdAt: isoMinutesAgo(395) }
  );

  store.closeCircleInvites.push(
    { inviterId: "alex", inviteeId: "jamie", status: "ACCEPTED", createdAt: isoMinutesAgo(360) },
    { inviterId: "taylor", inviteeId: "riley", status: "ACCEPTED", createdAt: isoMinutesAgo(350) },
    { inviterId: "alex", inviteeId: "morgan", status: "PENDING", createdAt: isoMinutesAgo(20) }
  );

  const clubWood = {
    id: "club-woodworking-lab",
    categoryId: "woodworking",
    name: "Weekend Woodworking Lab",
    founderId: "alex",
    ownerId: "alex",
    isPublic: true,
    description: "Build logs, shop tips, and progress updates.",
    createdAt: isoMinutesAgo(500)
  } satisfies Club;

  const clubPhoto = {
    id: "club-city-photo-walk",
    categoryId: "photography",
    name: "City Photo Walk",
    founderId: "jamie",
    ownerId: "jamie",
    isPublic: true,
    description: "Street and nature photo challenges.",
    createdAt: isoMinutesAgo(470)
  } satisfies Club;

  const clubHomelab = {
    id: "club-homelab-night",
    categoryId: "homelab",
    name: "Homelab Night Shift",
    founderId: "taylor",
    ownerId: "taylor",
    isPublic: false,
    description: "Private infra tinkering and setup notes.",
    createdAt: isoMinutesAgo(450)
  } satisfies Club;

  store.clubs.push(clubWood, clubPhoto, clubHomelab);

  store.clubMembers.push(
    { clubId: clubWood.id, userId: "alex", role: "OWNER", createdAt: isoMinutesAgo(500) },
    { clubId: clubWood.id, userId: "jamie", role: "MODERATOR", createdAt: isoMinutesAgo(320) },
    { clubId: clubWood.id, userId: "taylor", role: "MEMBER", createdAt: isoMinutesAgo(315) },
    { clubId: clubPhoto.id, userId: "jamie", role: "OWNER", createdAt: isoMinutesAgo(470) },
    { clubId: clubPhoto.id, userId: "alex", role: "MEMBER", createdAt: isoMinutesAgo(300) },
    { clubId: clubPhoto.id, userId: "morgan", role: "MEMBER", createdAt: isoMinutesAgo(280) },
    { clubId: clubHomelab.id, userId: "taylor", role: "OWNER", createdAt: isoMinutesAgo(450) },
    { clubId: clubHomelab.id, userId: "riley", role: "MEMBER", createdAt: isoMinutesAgo(200) }
  );

  const projectPlanter = {
    id: "project-planter-series",
    ownerId: "alex",
    categoryId: "woodworking",
    title: "Cedar Planter Box Series",
    description: "Build 6 outdoor planters with weatherproof finish.",
    clubId: clubWood.id,
    createdBy: "alex",
    createdAt: isoMinutesAgo(290)
  } satisfies Project;

  const projectPhotoZine = {
    id: "project-photo-zine",
    ownerId: "jamie",
    categoryId: "photography",
    title: "Neighborhood Photo Zine",
    description: "Curate and print a 20-page mini zine.",
    clubId: clubPhoto.id,
    createdBy: "jamie",
    createdAt: isoMinutesAgo(260)
  } satisfies Project;

  const projectLabRack = {
    id: "project-lab-rack",
    ownerId: "taylor",
    categoryId: "homelab",
    title: "Quiet Mini Rack Setup",
    description: "Low-noise rack with backup node and monitoring.",
    clubId: clubHomelab.id,
    createdBy: "taylor",
    createdAt: isoMinutesAgo(240)
  } satisfies Project;

  store.projects.push(projectPlanter, projectPhotoZine, projectLabRack);

  store.projectClubLinks.push(
    {
      projectId: projectPlanter.id,
      clubId: clubWood.id,
      status: "APPROVED",
      requestedBy: "alex",
      createdAt: isoMinutesAgo(288)
    },
    {
      projectId: projectPhotoZine.id,
      clubId: clubPhoto.id,
      status: "APPROVED",
      requestedBy: "jamie",
      createdAt: isoMinutesAgo(258)
    },
    {
      projectId: projectPlanter.id,
      clubId: clubPhoto.id,
      status: "APPROVED",
      requestedBy: "alex",
      createdAt: isoMinutesAgo(55)
    }
  );

  const planterMilestoneCut = {
    id: "ms-planter-cut-panels",
    projectId: projectPlanter.id,
    title: "Cut and prep cedar panels",
    status: "DONE",
    order: 1,
    createdBy: "alex",
    createdAt: isoMinutesAgo(225),
    tasks: [
      { id: "task-planter-cut-sides", text: "Cut side panels", isDone: true, createdBy: "alex", createdAt: isoMinutesAgo(220) },
      { id: "task-planter-sand", text: "Sand all edges", isDone: true, createdBy: "jamie", createdAt: isoMinutesAgo(210) }
    ]
  } satisfies ProjectMilestone;

  const planterMilestoneAssembly = {
    id: "ms-planter-assembly",
    projectId: projectPlanter.id,
    title: "Assembly and finish",
    status: "OPEN",
    order: 2,
    createdBy: "alex",
    createdAt: isoMinutesAgo(160),
    tasks: [
      { id: "task-planter-joinery", text: "Dry-fit joinery", isDone: true, createdBy: "jamie", createdAt: isoMinutesAgo(90) },
      { id: "task-planter-seal", text: "Apply outdoor sealant", isDone: false, createdBy: "alex", createdAt: isoMinutesAgo(70) }
    ]
  } satisfies ProjectMilestone;

  const zineMilestone = {
    id: "ms-zine-selects",
    projectId: projectPhotoZine.id,
    title: "Select final photo set",
    status: "OPEN",
    order: 1,
    createdBy: "jamie",
    createdAt: isoMinutesAgo(150),
    tasks: [
      { id: "task-zine-shortlist", text: "Shortlist 40 photos", isDone: true, createdBy: "jamie", createdAt: isoMinutesAgo(120) },
      { id: "task-zine-edit", text: "Edit top 20 photos", isDone: false, createdBy: "morgan", createdAt: isoMinutesAgo(80) }
    ]
  } satisfies ProjectMilestone;

  store.projectMilestones.push(planterMilestoneCut, planterMilestoneAssembly, zineMilestone);

  const highlightPlanter = {
    id: "highlight-planter-1",
    projectId: projectPlanter.id,
    text: "First batch is assembled and fitting cleanly. Final finish next.",
    authorId: "alex",
    createdAt: isoMinutesAgo(65)
  } satisfies ProjectHighlight;

  const highlightZine = {
    id: "highlight-zine-1",
    projectId: projectPhotoZine.id,
    text: "We picked cover candidates and narrowed to 24 photos.",
    authorId: "jamie",
    createdAt: isoMinutesAgo(50)
  } satisfies ProjectHighlight;

  store.projectHighlights.push(highlightPlanter, highlightZine);

  const postWelcome: LocalPost = {
    postId: uuidv4(),
    userId: "welcome",
    text: "Welcome to SocialApp — share hobbies, interests, and positivity.",
    createdAt: isoMinutesAgo(520),
    moderationStatus: "approved",
    visibility: "PUBLIC",
    tags: ["SHOWCASE"]
  };

  const postCommons1: LocalPost = {
    postId: uuidv4(),
    userId: "jamie",
    text: "Tried a new low-light camera setup and it worked great on tonight’s walk.",
    createdAt: isoMinutesAgo(58),
    moderationStatus: "approved",
    visibility: "FOLLOWERS",
    tags: ["TIP", "PROGRESS"]
  };

  const postClubWood: LocalPost = {
    postId: uuidv4(),
    userId: "alex",
    text: "Weekend challenge: share your best clamp setup in the shop.",
    createdAt: isoMinutesAgo(45),
    moderationStatus: "approved",
    visibility: "CLUB",
    clubId: clubWood.id,
    postedAsClub: true,
    clubActorId: "alex",
    tags: ["QUESTION"]
  };

  const postProjectPlanter: LocalPost = {
    postId: uuidv4(),
    userId: "alex",
    text: "Planter project update: assembly speed improved after a jig tweak.",
    createdAt: isoMinutesAgo(40),
    moderationStatus: "approved",
    visibility: "PUBLIC",
    projectId: projectPlanter.id,
    clubId: clubWood.id,
    tags: ["PROGRESS"]
  };

  const postClubPhoto: LocalPost = {
    postId: uuidv4(),
    userId: "jamie",
    text: "Photo prompt for this week: reflections after rain.",
    createdAt: isoMinutesAgo(32),
    moderationStatus: "approved",
    visibility: "CLUB",
    clubId: clubPhoto.id,
    tags: ["QUESTION", "TIP"]
  };

  store.posts.push(postWelcome, postCommons1, postClubWood, postProjectPlanter, postClubPhoto);
  store.posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  store.reactions.push(
    { postId: postProjectPlanter.postId, userId: "jamie", type: "INSPIRED", createdAt: isoMinutesAgo(30) },
    { postId: postProjectPlanter.postId, userId: "taylor", type: "HELPFUL", createdAt: isoMinutesAgo(29) }
  );

  store.comments.push(
    {
      id: uuidv4(),
      postId: postProjectPlanter.postId,
      authorId: "jamie",
      createdAt: isoMinutesAgo(28),
      threadType: "COMMENTS",
      depth: 0,
      textContent: "Great update — the jig idea is super helpful.",
      moderationState: "OK"
    },
    {
      id: uuidv4(),
      postId: postClubWood.postId,
      authorId: "taylor",
      createdAt: isoMinutesAgo(26),
      threadType: "SUGGESTIONS",
      depth: 0,
      textContent: "Maybe a mini how-to thread would be useful for new members.",
      moderationState: "OK"
    }
  );

  const feedEvents: FeedEvent[] = [
    {
      id: uuidv4(),
      eventType: "PROJECT_CREATED",
      contextType: "PROJECT",
      entityType: "PROJECT",
      entityId: projectPlanter.id,
      actorId: "alex",
      source: "PROJECTS",
      visibility: "PUBLIC",
      clubId: clubWood.id,
      projectId: projectPlanter.id,
      createdAt: isoMinutesAgo(289),
      sortTimestamp: isoMinutesAgo(289),
      moderationState: "OK",
      isDeleted: false,
      summary: "Alex created Cedar Planter Box Series"
    },
    {
      id: uuidv4(),
      eventType: "PROJECT_CREATED",
      contextType: "PROJECT",
      entityType: "PROJECT",
      entityId: projectPhotoZine.id,
      actorId: "jamie",
      source: "PROJECTS",
      visibility: "PUBLIC",
      clubId: clubPhoto.id,
      projectId: projectPhotoZine.id,
      createdAt: isoMinutesAgo(259),
      sortTimestamp: isoMinutesAgo(259),
      moderationState: "OK",
      isDeleted: false,
      summary: "Jamie created Neighborhood Photo Zine"
    },
    {
      id: uuidv4(),
      eventType: "POST_CREATED",
      contextType: "POST",
      entityType: "POST",
      entityId: postCommons1.postId,
      actorId: "jamie",
      source: "COMMONS",
      visibility: "FOLLOWERS",
      createdAt: postCommons1.createdAt,
      sortTimestamp: postCommons1.createdAt,
      moderationState: "OK",
      isDeleted: false,
      summary: "Jamie shared a camera setup tip"
    },
    {
      id: uuidv4(),
      eventType: "CLUB_POST_CREATED",
      contextType: "POST",
      entityType: "POST",
      entityId: postClubWood.postId,
      actorId: "alex",
      source: "CLUBS",
      visibility: "CLUB",
      clubId: clubWood.id,
      projectId: projectPlanter.id,
      createdAt: postClubWood.createdAt,
      sortTimestamp: postClubWood.createdAt,
      moderationState: "OK",
      isDeleted: false,
      summary: "Weekend Woodworking Lab challenge posted"
    },
    {
      id: uuidv4(),
      eventType: "POST_CREATED",
      contextType: "POST",
      entityType: "POST",
      entityId: postProjectPlanter.postId,
      actorId: "alex",
      source: "COMMONS",
      visibility: "PUBLIC",
      clubId: clubWood.id,
      projectId: projectPlanter.id,
      createdAt: postProjectPlanter.createdAt,
      sortTimestamp: postProjectPlanter.createdAt,
      moderationState: "OK",
      isDeleted: false,
      summary: "Planter project progress update"
    },
    {
      id: uuidv4(),
      eventType: "PROJECT_HIGHLIGHT_CREATED",
      contextType: "PROJECT_HIGHLIGHT",
      entityType: "PROJECT_HIGHLIGHT",
      entityId: highlightPlanter.id,
      actorId: "alex",
      source: "PROJECTS",
      visibility: "PUBLIC",
      clubId: clubWood.id,
      projectId: projectPlanter.id,
      createdAt: highlightPlanter.createdAt,
      sortTimestamp: highlightPlanter.createdAt,
      moderationState: "OK",
      isDeleted: false,
      summary: "Planter build highlight posted"
    },
    {
      id: uuidv4(),
      eventType: "MILESTONE_COMPLETED",
      contextType: "MILESTONE",
      entityType: "PROJECT_MILESTONE",
      entityId: planterMilestoneCut.id,
      actorId: "jamie",
      source: "PROJECTS",
      visibility: "PUBLIC",
      clubId: clubWood.id,
      projectId: projectPlanter.id,
      createdAt: isoMinutesAgo(24),
      sortTimestamp: isoMinutesAgo(24),
      moderationState: "OK",
      isDeleted: false,
      summary: "Milestone completed on Cedar Planter Box Series"
    },
    {
      id: uuidv4(),
      eventType: "TASK_COMPLETED",
      contextType: "TASK",
      entityType: "PROJECT_TASK",
      entityId: "task-planter-joinery",
      actorId: "jamie",
      source: "PROJECTS",
      visibility: "PUBLIC",
      clubId: clubWood.id,
      projectId: projectPlanter.id,
      createdAt: isoMinutesAgo(18),
      sortTimestamp: isoMinutesAgo(18),
      moderationState: "OK",
      isDeleted: false,
      summary: "Task completed on Cedar Planter Box Series"
    },
    {
      id: uuidv4(),
      eventType: "CLUB_POST_CREATED",
      contextType: "POST",
      entityType: "POST",
      entityId: postClubPhoto.postId,
      actorId: "jamie",
      source: "CLUBS",
      visibility: "CLUB",
      clubId: clubPhoto.id,
      projectId: projectPhotoZine.id,
      createdAt: postClubPhoto.createdAt,
      sortTimestamp: postClubPhoto.createdAt,
      moderationState: "OK",
      isDeleted: false,
      summary: "City Photo Walk weekly prompt posted"
    },
    {
      id: uuidv4(),
      eventType: "PROJECT_HIGHLIGHT_CREATED",
      contextType: "PROJECT_HIGHLIGHT",
      entityType: "PROJECT_HIGHLIGHT",
      entityId: highlightZine.id,
      actorId: "jamie",
      source: "PROJECTS",
      visibility: "PUBLIC",
      clubId: clubPhoto.id,
      projectId: projectPhotoZine.id,
      createdAt: highlightZine.createdAt,
      sortTimestamp: highlightZine.createdAt,
      moderationState: "OK",
      isDeleted: false,
      summary: "Photo zine progress highlight"
    }
  ];

  clearArray(store.feedEvents);
  store.feedEvents.push(...feedEvents.sort((a, b) => b.sortTimestamp.localeCompare(a.sortTimestamp) || b.id.localeCompare(a.id)));
}

// Default local startup data remains minimal.
resetStoreToDefault();
