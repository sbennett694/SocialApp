import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  Club,
  Comment,
  createComment,
  createPost,
  FeedEvent,
  FeedEventType,
  getClubs,
  getComments,
  getCommonsFeedEvents,
  getFeed,
  getProjectHighlights,
  getProjectMilestones,
  getProjects,
  Post,
  Project,
  ThreadType,
  Visibility
} from "../api/client";
import { config } from "../config";
import { AuthUser } from "../auth/session";
import { useTemporaryHighlight } from "../lib/useTemporaryHighlight";

const threadLabels: Record<ThreadType, string> = {
  COMMENTS: "Comments",
  QUESTIONS: "Questions",
  THANK_YOU: "Gratitude",
  SUGGESTIONS: "Suggestions"
};

const interactionThreadTypes: ThreadType[] = ["COMMENTS", "THANK_YOU", "SUGGESTIONS", "QUESTIONS"];
const COMMENT_PREVIEW_MAX_LENGTH = 80;

function formatProjectVisibilityLabel(visibility: string | undefined): string {
  switch (visibility) {
    case "PUBLIC":
      return "Public";
    case "PRIVATE":
      return "Private";
    case "CLUB_MEMBERS":
      return "Club Members";
    case "CLUB_MODERATORS":
      return "Club Moderators";
    case "CLUB_OWNER_ONLY":
      return "Club Owner Only";
    default:
      return "Unknown";
  }
}

function truncateCommentPreview(text: string, maxLength = COMMENT_PREVIEW_MAX_LENGTH): string {
  const normalized = text.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(maxLength - 1, 0)).trimEnd()}…`;
}

function buildGratitudeSummary(gratitudeResponses: Comment[]): string | undefined {
  if (gratitudeResponses.length === 0) return undefined;
  const firstAuthor = gratitudeResponses[0]?.authorId;
  if (!firstAuthor) return undefined;
  if (gratitudeResponses.length === 1) {
    return `Gratitude from ${firstAuthor}`;
  }
  return `Gratitude from ${firstAuthor} and ${gratitudeResponses.length - 1} others`;
}

type CommonsScreenProps = {
  user: AuthUser;
  focusPostId?: string;
  focusCommentId?: string;
  focusThreadType?: ThreadType;
  focusFromCommentNotification?: boolean;
  onFocusPostConsumed?: (postId: string) => void;
  onFocusCommentConsumed?: (commentId: string) => void;
  onFocusThreadConsumed?: (threadType: ThreadType) => void;
  onCommentNavigationConsumed?: () => void;
  onNavigate?: (
    target: "CLUBS" | "PROJECTS",
    options?: {
      clubId?: string;
      postId?: string;
      projectId?: string;
      focusItemId?: string;
      focusItemType?: "MILESTONE" | "TASK";
    }
  ) => void;
};

type CommonsFeedFilter = "ALL" | "POSTS" | "PROJECTS" | "PROGRESS";

type FeedDisplayItem =
  | { kind: "EVENT"; id: string; event: FeedEvent }
  | {
      kind: "GROUPED_TASK_COMPLETION";
      id: string;
      actorId: string;
      projectId?: string;
      eventIds: string[];
      latestSortTimestamp: string;
      earliestSortTimestamp: string;
      count: number;
    };

const TASK_GROUP_WINDOW_MS = 15 * 60 * 1000;

function ActivityCard({
  label,
  title,
  subtitle,
  body,
  tone = "default",
  footer
}: {
  label: string;
  title: string;
  subtitle?: string;
  body?: string;
  tone?: "default" | "club" | "project" | "progress";
  footer?: string;
}) {
  return (
    <View style={[styles.card, tone === "club" ? styles.cardClub : null, tone === "project" ? styles.cardProject : null, tone === "progress" ? styles.cardProgress : null]}>
      <Text style={styles.eventLabel}>{label}</Text>
      <Text style={styles.author}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {body ? <Text style={styles.eventBody}>{body}</Text> : null}
      {footer ? <Text style={styles.meta}>{footer}</Text> : null}
    </View>
  );
}

export function FeedScreen({
  user,
  focusPostId,
  focusCommentId,
  focusThreadType,
  focusFromCommentNotification,
  onFocusPostConsumed,
  onFocusCommentConsumed,
  onFocusThreadConsumed,
  onCommentNavigationConsumed,
  onNavigate
}: CommonsScreenProps) {
  const feedListRef = useRef<FlatList<FeedDisplayItem> | null>(null);
  const postOffsetByIdRef = useRef<Record<string, number>>({});
  const threadOffsetByPostIdRef = useRef<Record<string, number>>({});
  const commentOffsetByKeyRef = useRef<Record<string, number>>({});
  const commentScrollRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [selectedFeedFilter, setSelectedFeedFilter] = useState<CommonsFeedFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPostText, setNewPostText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [selectedVisibility, setSelectedVisibility] = useState<Visibility>("FOLLOWERS");
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [activeThreadType, setActiveThreadType] = useState<ThreadType>("COMMENTS");
  const [activeReplyParentId, setActiveReplyParentId] = useState<string | undefined>(undefined);
  const [comments, setComments] = useState<Comment[]>([]);
  const [threadCountsByPostId, setThreadCountsByPostId] = useState<Record<string, Partial<Record<ThreadType, number>>>>({});
  const [interactionPreviewByPostId, setInteractionPreviewByPostId] = useState<
    Record<string, { firstCommentText?: string; gratitudeSummary?: string }>
  >({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentMessage, setCommentMessage] = useState<string | null>(null);
  const [commentNavigationMessage, setCommentNavigationMessage] = useState<string | null>(null);
  const [pendingFocusPostId, setPendingFocusPostId] = useState<string | null>(null);
  const [pendingFocusCommentId, setPendingFocusCommentId] = useState<string | null>(null);
  const [pendingScrollCommentKey, setPendingScrollCommentKey] = useState<string | null>(null);
  const [lastCompletedCommentsLoadKey, setLastCompletedCommentsLoadKey] = useState<string | null>(null);
  const [notificationFocusLock, setNotificationFocusLock] = useState(false);
  const { highlightedId: highlightedPostId, triggerHighlight, emphasisAnimatedStyle, glowAnimatedStyle } = useTemporaryHighlight();
  const {
    highlightedId: highlightedCommentId,
    triggerHighlight: triggerCommentHighlight,
    emphasisAnimatedStyle: commentEmphasisAnimatedStyle,
    glowAnimatedStyle: commentGlowAnimatedStyle
  } = useTemporaryHighlight();

  const [postById, setPostById] = useState<Record<string, Post>>({});
  const [clubById, setClubById] = useState<Record<string, Club>>({});
  const [projectById, setProjectById] = useState<Record<string, Project>>({});
  const [highlightTextById, setHighlightTextById] = useState<Record<string, string>>({});
  const [milestoneTitleById, setMilestoneTitleById] = useState<Record<string, string>>({});
  const [taskTextById, setTaskTextById] = useState<Record<string, string>>({});

  const projectIdsNeedingContext = useMemo(() => {
    const ids = new Set<string>();
    events.forEach((event) => {
      if (event.projectId) ids.add(event.projectId);
    });
    return Array.from(ids);
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (selectedFeedFilter === "ALL") return events;

    const eventTypeMap: Record<Exclude<CommonsFeedFilter, "ALL">, FeedEventType[]> = {
      POSTS: ["POST_CREATED", "CLUB_POST_CREATED"],
      PROJECTS: ["PROJECT_CREATED", "PROJECT_HIGHLIGHT_CREATED"],
      PROGRESS: ["MILESTONE_COMPLETED", "TASK_COMPLETED"]
    };

    const allowedTypes = new Set(eventTypeMap[selectedFeedFilter]);
    return events.filter((event) => allowedTypes.has(event.eventType));
  }, [events, selectedFeedFilter]);

  const displayItems = useMemo(() => {
    const items: FeedDisplayItem[] = [];

    for (let index = 0; index < filteredEvents.length; index += 1) {
      const event = filteredEvents[index];

      if (event.eventType !== "TASK_COMPLETED") {
        items.push({ kind: "EVENT", id: event.id, event });
        continue;
      }

      const group = [event];
      let previousTimestamp = Date.parse(event.sortTimestamp);

      for (let nextIndex = index + 1; nextIndex < filteredEvents.length; nextIndex += 1) {
        const nextEvent = filteredEvents[nextIndex];

        if (
          nextEvent.eventType !== "TASK_COMPLETED" ||
          nextEvent.actorId !== event.actorId ||
          nextEvent.projectId !== event.projectId
        ) {
          break;
        }

        const nextTimestamp = Date.parse(nextEvent.sortTimestamp);
        if (Number.isNaN(previousTimestamp) || Number.isNaN(nextTimestamp)) {
          break;
        }

        if (previousTimestamp - nextTimestamp > TASK_GROUP_WINDOW_MS) {
          break;
        }

        group.push(nextEvent);
        previousTimestamp = nextTimestamp;
      }

      if (group.length < 2) {
        items.push({ kind: "EVENT", id: event.id, event });
        continue;
      }

      const latestSortTimestamp = group[0].sortTimestamp;
      const earliestSortTimestamp = group[group.length - 1].sortTimestamp;
      items.push({
        kind: "GROUPED_TASK_COMPLETION",
        id: `group-task-${event.actorId}-${event.projectId ?? "none"}-${latestSortTimestamp}`,
        actorId: event.actorId,
        projectId: event.projectId,
        eventIds: group.map((entry) => entry.id),
        latestSortTimestamp,
        earliestSortTimestamp,
        count: group.length
      });

      index += group.length - 1;
    }

    return items;
  }, [filteredEvents]);

  async function loadComments(postId: string, threadType: ThreadType) {
    const loadKey = `${postId}:${threadType}`;
    setCommentsLoading(true);
    setCommentMessage(null);
    try {
      const data = await getComments(postId, threadType);
      setComments(data);
    } catch (err) {
      setCommentMessage((err as Error).message);
    } finally {
      setCommentsLoading(false);
      setLastCompletedCommentsLoadKey(loadKey);
    }
  }

  async function loadThreadCounts(postId: string) {
    const hasAllCounts = interactionThreadTypes.every((threadType) => threadCountsByPostId[postId]?.[threadType] !== undefined);
    if (hasAllCounts) {
      return;
    }

    try {
      const threadLists = await Promise.all(
        interactionThreadTypes.map(async (threadType) => {
          const list = await getComments(postId, threadType);
          return [threadType, list] as const;
        })
      );

      const nextCounts: Partial<Record<ThreadType, number>> = {};
      threadLists.forEach(([threadType, list]) => {
        nextCounts[threadType] = list.length;
      });

      const firstComment = threadLists.find(([threadType]) => threadType === "COMMENTS")?.[1]?.[0];
      const gratitudeResponses = threadLists.find(([threadType]) => threadType === "THANK_YOU")?.[1] ?? [];

      setThreadCountsByPostId((prev) => ({
        ...prev,
        [postId]: {
          ...prev[postId],
          ...nextCounts
        }
      }));

      setInteractionPreviewByPostId((prev) => ({
        ...prev,
        [postId]: {
          firstCommentText: firstComment?.textContent ? truncateCommentPreview(firstComment.textContent) : undefined,
          gratitudeSummary: buildGratitudeSummary(gratitudeResponses)
        }
      }));
    } catch {
      // Non-blocking for feed rendering.
    }
  }

  async function hydrateEventContext(feedEvents: FeedEvent[]) {
    try {
      const [clubs, projects, posts] = await Promise.all([getClubs(), getProjects(), getFeed(user.userId)]);

      setClubById(Object.fromEntries(clubs.map((club) => [club.id, club])));
      setProjectById(Object.fromEntries(projects.map((project) => [project.id, project])));
      setPostById(Object.fromEntries(posts.map((post) => [post.postId, post])));

      const highlightProjectIds = Array.from(
        new Set(
          feedEvents
            .filter((event) => event.eventType === "PROJECT_HIGHLIGHT_CREATED" && !!event.projectId)
            .map((event) => event.projectId as string)
        )
      );

      const milestoneOrTaskProjectIds = Array.from(
        new Set(
          feedEvents
            .filter((event) => event.eventType === "MILESTONE_COMPLETED" || event.eventType === "TASK_COMPLETED")
            .map((event) => event.projectId)
            .filter((value): value is string => !!value)
        )
      );

      if (highlightProjectIds.length > 0) {
        const highlightLists = await Promise.all(highlightProjectIds.map((projectId) => getProjectHighlights(projectId)));
        const highlights = highlightLists.flat();
        setHighlightTextById(Object.fromEntries(highlights.map((highlight) => [highlight.id, highlight.text])));
      } else {
        setHighlightTextById({});
      }

      if (milestoneOrTaskProjectIds.length > 0) {
        const milestonesByProject = await Promise.all(
          milestoneOrTaskProjectIds.map(async (projectId) => {
            const milestones = await getProjectMilestones(projectId);
            return milestones;
          })
        );

        const flattened = milestonesByProject.flat();
        const nextMilestoneMap: Record<string, string> = {};
        const nextTaskMap: Record<string, string> = {};

        flattened.forEach((milestone) => {
          nextMilestoneMap[milestone.id] = milestone.title;
          milestone.tasks.forEach((task) => {
            nextTaskMap[task.id] = task.text;
          });
        });

        setMilestoneTitleById(nextMilestoneMap);
        setTaskTextById(nextTaskMap);
      } else {
        setMilestoneTitleById({});
        setTaskTextById({});
      }
    } catch {
      // Non-blocking enrichment; feed still renders with fallback text.
    }
  }

  async function loadFeed() {
    setLoading(true);
    setError(null);
    try {
      const data = await getCommonsFeedEvents(user.userId, { limit: 40 });
      setEvents(data);
      hydrateEventContext(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, [user.userId]);

  useEffect(() => {
    if (activePostId) {
      loadComments(activePostId, activeThreadType);
    }
  }, [activePostId, activeThreadType]);

  useEffect(() => {
    if (!focusPostId) return;
    const targetThreadType = focusFromCommentNotification ? (focusThreadType ?? "COMMENTS") : "COMMENTS";
    setCommentNavigationMessage(null);
    setNotificationFocusLock(!!focusFromCommentNotification);
    setComments([]);
    setLastCompletedCommentsLoadKey(null);
    setSelectedFeedFilter("ALL");
    setPendingFocusPostId(focusPostId);
    setActivePostId(focusPostId);
    setActiveThreadType(targetThreadType);
    setActiveReplyParentId(undefined);
    setCommentText("");
    void loadComments(focusPostId, targetThreadType);
    onFocusPostConsumed?.(focusPostId);
    onFocusThreadConsumed?.(targetThreadType);
  }, [focusFromCommentNotification, focusPostId, focusThreadType, onFocusPostConsumed, onFocusThreadConsumed]);

  useEffect(() => {
    if (!focusCommentId) return;
    setPendingFocusCommentId(focusCommentId);
  }, [focusCommentId]);

  useEffect(() => {
    if (!pendingFocusPostId) return;

    const focusedIndex = displayItems.findIndex(
      (item) => item.kind === "EVENT" && item.event.entityType === "POST" && item.event.entityId === pendingFocusPostId
    );

    if (focusedIndex < 0) return;

    setTimeout(() => {
      feedListRef.current?.scrollToIndex({ index: focusedIndex, animated: true, viewPosition: 0.3 });
    }, 150);
    if (!focusFromCommentNotification) {
      triggerHighlight(pendingFocusPostId);
    }
    setPendingFocusPostId(null);
  }, [displayItems, focusFromCommentNotification, pendingFocusPostId]);

  useEffect(() => {
    if (!focusFromCommentNotification || !activePostId || commentsLoading) return;
    const completedCommentsKey = `${activePostId}:${activeThreadType}`;
    if (lastCompletedCommentsLoadKey !== completedCommentsKey) return;

    if (!pendingFocusCommentId) {
      setCommentNavigationMessage("Opened post comments; specific comment unavailable.");
      triggerHighlight(activePostId);
      setNotificationFocusLock(false);
      onCommentNavigationConsumed?.();
      return;
    }

    const existsInThread = comments.some((comment) => comment.id === pendingFocusCommentId);
    if (existsInThread) {
      setCommentNavigationMessage(null);
      triggerCommentHighlight(pendingFocusCommentId);
      setPendingScrollCommentKey(`${activePostId}:${pendingFocusCommentId}`);
      scrollToFocusedComment(activePostId, pendingFocusCommentId);
    } else {
      setCommentNavigationMessage("Opened post comments; specific comment unavailable.");
      triggerHighlight(activePostId);
    }

    onFocusCommentConsumed?.(pendingFocusCommentId);
    setNotificationFocusLock(false);
    onCommentNavigationConsumed?.();
    setPendingFocusCommentId(null);
  }, [
    activePostId,
    activeThreadType,
    comments,
    commentsLoading,
    focusFromCommentNotification,
    lastCompletedCommentsLoadKey,
    notificationFocusLock,
    onCommentNavigationConsumed,
    onFocusCommentConsumed,
    pendingFocusCommentId,
    triggerHighlight,
    triggerCommentHighlight
  ]);

  useEffect(() => {
    if (!activePostId) return;
    if (notificationFocusLock) return;
    const stillVisible = filteredEvents.some((event) => event.entityType === "POST" && event.entityId === activePostId);
    if (!stillVisible) {
      setActivePostId(null);
      setComments([]);
      setActiveReplyParentId(undefined);
      setCommentText("");
    }
  }, [activePostId, filteredEvents, notificationFocusLock]);

  useEffect(() => {
    if (events.length > 0 && projectIdsNeedingContext.length > 0) {
      hydrateEventContext(events);
    }
  }, [events, projectIdsNeedingContext.length]);

  useEffect(() => {
    const postIds = Array.from(
      new Set(
        filteredEvents
          .filter((event) => event.entityType === "POST")
          .map((event) => event.entityId)
      )
    );

    postIds.forEach((postId) => {
      void loadThreadCounts(postId);
    });
  }, [filteredEvents]);

  async function handleCreatePost() {
    if (!newPostText.trim()) {
      setSubmitMessage("Post text is required.");
      return;
    }

    setSubmitting(true);
    setSubmitMessage(null);

    try {
      await createPost({
        userId: user.userId,
        text: newPostText.trim(),
        visibility: selectedVisibility,
        tags: ["PROGRESS"]
      });
      setNewPostText("");
      setSubmitMessage("Post published.");
      await loadFeed();
    } catch (err) {
      setSubmitMessage((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOpenThread(postId: string, threadType: ThreadType) {
    if (activePostId === postId && activeThreadType === threadType) {
      setActivePostId(null);
      setComments([]);
      setActiveReplyParentId(undefined);
      setCommentText("");
      return;
    }

    setActivePostId(postId);
    setActiveThreadType(threadType);
    setActiveReplyParentId(undefined);
    setCommentText("");
    await loadComments(postId, threadType);
  }

  async function handleAddComment(postId: string, threadType: ThreadType) {
    if (!postId) {
      setCommentMessage("Pick a post first.");
      return;
    }
    if (!commentText.trim()) {
      setCommentMessage("Comment text is required.");
      return;
    }

    try {
      await createComment({
        postId,
        authorId: user.userId,
        textContent: commentText.trim(),
        threadType,
        parentCommentId: activeReplyParentId
      });
      setCommentText("");
      setActiveReplyParentId(undefined);
      setCommentMessage(`${threadLabels[threadType]} posted.`);
      loadComments(postId, threadType);
    } catch (err) {
      setCommentMessage((err as Error).message);
    }
  }

  function getEventCard(event: FeedEvent) {
    const clubName = event.clubId ? clubById[event.clubId]?.name ?? event.clubId : undefined;
    const projectName = event.projectId ? projectById[event.projectId]?.title ?? event.projectId : undefined;
    const projectVisibility = event.projectId ? formatProjectVisibilityLabel(projectById[event.projectId]?.visibility) : undefined;

    switch (event.eventType as FeedEventType) {
      case "POST_CREATED": {
        const text = postById[event.entityId]?.text ?? event.summary ?? "Post content unavailable.";
        return (
          <ActivityCard
            label="Post"
            title={`@${event.actorId}`}
            body={text}
            footer={new Date(event.sortTimestamp).toLocaleString()}
          />
        );
      }

      case "CLUB_POST_CREATED": {
        const text = postById[event.entityId]?.text ?? event.summary ?? "Club post content unavailable.";
        return (
          <ActivityCard
            label="Club Post"
            title={clubName ? clubName : "Club"}
            subtitle={`By @${event.actorId}`}
            body={text}
            tone="club"
            footer={new Date(event.sortTimestamp).toLocaleString()}
          />
        );
      }

      case "PROJECT_HIGHLIGHT_CREATED": {
        const text = highlightTextById[event.entityId] ?? event.summary ?? "Project highlight content unavailable.";
        return (
          <ActivityCard
            label="Project Highlight"
            title={projectName ? projectName : "Project"}
            subtitle={`By @${event.actorId}${projectVisibility ? ` • ${projectVisibility}` : ""}`}
            body={text}
            tone="project"
            footer={new Date(event.sortTimestamp).toLocaleString()}
          />
        );
      }

      case "PROJECT_CREATED": {
        return (
          <ActivityCard
            label="New Project"
            title={projectName ? projectName : "Project"}
            subtitle={`Created by @${event.actorId}${projectVisibility ? ` • ${projectVisibility}` : ""}`}
            tone="project"
            footer={new Date(event.sortTimestamp).toLocaleString()}
          />
        );
      }

      case "MILESTONE_COMPLETED": {
        const milestoneTitle = milestoneTitleById[event.entityId] ?? event.summary ?? "Milestone";
        return (
          <ActivityCard
            label="Milestone Completed"
            title={projectName ? projectName : "Project"}
            subtitle={`${milestoneTitle} • @${event.actorId}${projectVisibility ? ` • ${projectVisibility}` : ""}`}
            tone="progress"
            footer={new Date(event.sortTimestamp).toLocaleString()}
          />
        );
      }

      case "TASK_COMPLETED": {
        const taskTitle = taskTextById[event.entityId] ?? event.summary ?? "Task";
        return (
          <ActivityCard
            label="Task Completed"
            title={projectName ? projectName : "Project"}
            subtitle={`${taskTitle} • @${event.actorId}${projectVisibility ? ` • ${projectVisibility}` : ""}`}
            tone="progress"
            footer={new Date(event.sortTimestamp).toLocaleString()}
          />
        );
      }

      default:
        return (
          <ActivityCard
            label="Activity"
            title={`@${event.actorId}`}
            body={event.summary ?? "Activity update"}
            footer={new Date(event.sortTimestamp).toLocaleString()}
          />
        );
    }
  }

  async function handlePressFeedTile(item: FeedDisplayItem) {
    if (item.kind === "GROUPED_TASK_COMPLETION") {
      onNavigate?.("PROJECTS", {
        projectId: item.projectId,
        focusItemId: undefined,
        focusItemType: undefined
      });
      return;
    }

    const event = item.event;

    if (event.eventType === "CLUB_POST_CREATED" || event.source === "CLUBS") {
      onNavigate?.("CLUBS", {
        clubId: event.clubId,
        postId: event.entityType === "POST" ? event.entityId : undefined
      });
      return;
    }

    if (event.projectId || event.source === "PROJECTS") {
      onNavigate?.("PROJECTS", {
        projectId: event.projectId,
        focusItemId:
          event.eventType === "MILESTONE_COMPLETED" || event.eventType === "TASK_COMPLETED"
            ? event.entityId
            : undefined,
        focusItemType:
          event.eventType === "MILESTONE_COMPLETED"
            ? "MILESTONE"
            : event.eventType === "TASK_COMPLETED"
              ? "TASK"
              : undefined
      });
      return;
    }

    if (event.entityType === "POST") {
      await handleOpenThread(event.entityId, "COMMENTS");
    }
  }

  function scrollToFocusedComment(postId: string, commentId: string, attempt = 0) {
    const key = `${postId}:${commentId}`;
    const postOffset = postOffsetByIdRef.current[postId];
    const threadOffset = threadOffsetByPostIdRef.current[postId];
    const commentOffset = commentOffsetByKeyRef.current[key];

    if (postOffset === undefined || threadOffset === undefined || commentOffset === undefined) {
      if (attempt >= 12) {
        return;
      }

      if (commentScrollRetryTimeoutRef.current) {
        clearTimeout(commentScrollRetryTimeoutRef.current);
      }

      commentScrollRetryTimeoutRef.current = setTimeout(() => {
        scrollToFocusedComment(postId, commentId, attempt + 1);
      }, 80);
      return;
    }

    feedListRef.current?.scrollToOffset({
      offset: Math.max(0, postOffset + threadOffset + commentOffset - 140),
      animated: true
    });
  }

  useEffect(() => {
    return () => {
      if (commentScrollRetryTimeoutRef.current) {
        clearTimeout(commentScrollRetryTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} />;
  }

  return (
    <FlatList
      ref={feedListRef}
      data={displayItems}
      keyExtractor={(item) => item.id}
      onScrollToIndexFailed={(info) => {
        const estimatedOffset = Math.max(0, info.averageItemLength * Math.max(0, info.index - 1));
        feedListRef.current?.scrollToOffset({ offset: estimatedOffset, animated: true });
        setTimeout(() => {
          feedListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.3 });
        }, 140);
      }}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        if (item.kind === "GROUPED_TASK_COMPLETION") {
          const projectName = item.projectId ? projectById[item.projectId]?.title ?? item.projectId : "Project";
          const taskNames = item.eventIds
            .map((eventId) => {
              const matchedEvent = events.find((event) => event.id === eventId);
              if (!matchedEvent) return null;
              return taskTextById[matchedEvent.entityId] ?? null;
            })
            .filter((value): value is string => !!value)
            .slice(0, 3);

          const timespanText =
            item.latestSortTimestamp === item.earliestSortTimestamp
              ? new Date(item.latestSortTimestamp).toLocaleString()
              : `${new Date(item.earliestSortTimestamp).toLocaleTimeString()} - ${new Date(item.latestSortTimestamp).toLocaleTimeString()}`;

          return (
            <Pressable onPress={() => void handlePressFeedTile(item)}>
              <ActivityCard
                label="Task Progress"
                title={`@${item.actorId} completed ${item.count} tasks`}
                subtitle={`in ${projectName}`}
                body={taskNames.length > 0 ? `Includes: ${taskNames.join(", ")}${item.count > taskNames.length ? ", ..." : ""}` : undefined}
                tone="progress"
                footer={timespanText}
              />
            </Pressable>
          );
        }

        const event = item.event;
        const postId = event.entityType === "POST" ? event.entityId : null;
        const isThreadExpanded = !!postId && activePostId === postId;
        const isFocused = !!postId && highlightedPostId === postId;
        const interactionPreview = postId ? interactionPreviewByPostId[postId] : undefined;
        return (
          <Animated.View
            onLayout={
              postId
                ? (event) => {
                    postOffsetByIdRef.current[postId] = event.nativeEvent.layout.y;
                  }
                : undefined
            }
            style={[isFocused ? styles.focusedFeedItem : undefined, isFocused ? emphasisAnimatedStyle : undefined, isFocused ? glowAnimatedStyle : undefined]}
          >
            <Pressable onPress={() => void handlePressFeedTile(item)}>{getEventCard(event)}</Pressable>

            {postId ? (
              <View
                onLayout={(event) => {
                  threadOffsetByPostIdRef.current[postId] = event.nativeEvent.layout.y;
                }}
                style={styles.threadCard}
              >
                {!isThreadExpanded && interactionPreview?.firstCommentText ? (
                  <Text style={styles.interactionPreviewText} numberOfLines={1}>
                    💬 First comment: "{interactionPreview.firstCommentText}"
                  </Text>
                ) : null}
                {!isThreadExpanded && interactionPreview?.gratitudeSummary ? (
                  <Text style={styles.interactionPreviewText} numberOfLines={1}>
                    🙏 {interactionPreview.gratitudeSummary}
                  </Text>
                ) : null}
                <Text style={styles.switcherLabel}>Respond to this post:</Text>
                <View style={styles.mockUserButtons}>
                  {(["COMMENTS", "QUESTIONS", "THANK_YOU", "SUGGESTIONS"] as ThreadType[]).map((threadType) => {
                    const active = activePostId === postId && activeThreadType === threadType;
                    const count = threadCountsByPostId[postId]?.[threadType];
                    const label = `${threadLabels[threadType]} (${count ?? 0})`;
                    return (
                      <Pressable
                        key={`${item.id}-${threadType}`}
                        onPress={() => handleOpenThread(postId, threadType)}
                        style={[styles.userButton, active && styles.userButtonActive]}
                      >
                        <Text style={[styles.userButtonText, active && styles.userButtonTextActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {isThreadExpanded ? (
                  <>
                    <TextInput
                      value={commentText}
                      onChangeText={setCommentText}
                      placeholder={`Add ${threadLabels[activeThreadType].toLowerCase()} response...`}
                      style={styles.commentInput}
                    />
                    {activeReplyParentId ? (
                      <Text style={styles.hint}>Replying to a response • tap “Cancel Reply” to post top-level</Text>
                    ) : null}
                    <Pressable onPress={() => handleAddComment(postId, activeThreadType)} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Add Response</Text>
                    </Pressable>
                    {activeReplyParentId ? (
                      <Pressable onPress={() => setActiveReplyParentId(undefined)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Cancel Reply</Text>
                      </Pressable>
                    ) : null}
                    {commentMessage ? <Text style={styles.submitMessage}>{commentMessage}</Text> : null}
                    {commentNavigationMessage ? <Text style={styles.hint}>{commentNavigationMessage}</Text> : null}
                    {commentsLoading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
                    {comments.map((comment) => (
                      <Animated.View
                        key={comment.id}
                        onLayout={(event) => {
                          const key = `${postId}:${comment.id}`;
                          commentOffsetByKeyRef.current[key] = event.nativeEvent.layout.y;
                          if (pendingScrollCommentKey === key) {
                            setTimeout(() => {
                              scrollToFocusedComment(postId, comment.id);
                            }, 0);
                            setPendingScrollCommentKey(null);
                          }
                        }}
                        style={[
                          styles.commentRow,
                          { marginLeft: comment.depth * 14 },
                          highlightedCommentId === comment.id ? styles.focusedCommentRow : undefined,
                          highlightedCommentId === comment.id ? commentEmphasisAnimatedStyle : undefined,
                          highlightedCommentId === comment.id ? commentGlowAnimatedStyle : undefined
                        ]}
                      >
                        <Text style={styles.author}>@{comment.authorId}</Text>
                        <Text>{comment.textContent}</Text>
                        {user.userId === event.actorId ? (
                          <Pressable
                            onPress={() => {
                              setActiveReplyParentId(comment.id);
                              setCommentText("");
                            }}
                            style={styles.replyLink}
                          >
                            <Text style={styles.replyLinkText}>Reply</Text>
                          </Pressable>
                        ) : null}
                      </Animated.View>
                    ))}
                  </>
                ) : null}
              </View>
            ) : null}
          </Animated.View>
        );
      }}
      ListEmptyComponent={<Text style={styles.message}>No activity for this filter yet.</Text>}
      ListHeaderComponent={
        <>
          <View style={styles.composerCard}>
            <Text style={styles.sectionTitle}>Create Post</Text>
            <Text style={styles.hint}>Signed in as {user.displayName} ({config.authMode} auth mode)</Text>
            <Text style={styles.switcherLabel}>Post visibility:</Text>
            <View style={styles.mockUserButtons}>
              {(["FOLLOWERS", "CLOSE_CIRCLE", "CLUB"] as Visibility[]).map((visibility) => {
                const active = selectedVisibility === visibility;
                return (
                  <Pressable
                    key={visibility}
                    onPress={() => setSelectedVisibility(visibility)}
                    style={[styles.userButton, active && styles.userButtonActive]}
                  >
                    <Text style={[styles.userButtonText, active && styles.userButtonTextActive]}>
                      {visibility.toLowerCase().replace("_", " ")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={newPostText}
              onChangeText={setNewPostText}
              placeholder="Share something non-political..."
              multiline
              style={styles.input}
            />
            <Pressable onPress={handleCreatePost} disabled={submitting} style={styles.button}>
              <Text style={styles.buttonText}>{submitting ? "Posting..." : "Post"}</Text>
            </Pressable>
            {submitMessage ? <Text style={styles.submitMessage}>{submitMessage}</Text> : null}

            {error ? <Text style={styles.message}>Failed to load feed: {error}</Text> : null}
          </View>

          <View style={styles.filterBar}>
            {([
              { key: "ALL", label: "All" },
              { key: "POSTS", label: "Posts" },
              { key: "PROJECTS", label: "Projects" },
              { key: "PROGRESS", label: "Progress" }
            ] as Array<{ key: CommonsFeedFilter; label: string }>).map((filter) => {
              const active = selectedFeedFilter === filter.key;
              return (
                <Pressable
                  key={filter.key}
                  onPress={() => setSelectedFeedFilter(filter.key)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      }
      refreshing={loading}
      onRefresh={loadFeed}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
    gap: 12
  },
  composerCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12
  },
  sectionTitle: {
    fontWeight: "700",
    marginBottom: 6
  },
  hint: {
    color: "#666",
    marginBottom: 8,
    fontSize: 12
  },
  switcherLabel: {
    marginBottom: 6,
    color: "#444",
    fontSize: 12
  },
  mockUserButtons: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  userButton: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  userButtonActive: {
    backgroundColor: "#111",
    borderColor: "#111"
  },
  userButtonText: {
    color: "#333",
    fontSize: 12,
    fontWeight: "600"
  },
  userButtonTextActive: {
    color: "#fff"
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    marginBottom: 6
  },
  secondaryButtonText: {
    color: "#222",
    fontWeight: "600",
    fontSize: 12
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 10
  },
  button: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center"
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600"
  },
  submitMessage: {
    marginTop: 8,
    color: "#444"
  },
  threadCard: {
    marginTop: 8,
    marginBottom: 10,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e4",
    paddingTop: 10
  },
  interactionPreviewText: {
    color: "#555",
    fontSize: 12,
    marginBottom: 4
  },
  commentInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
    marginBottom: 8
  },
  commentRow: {
    borderWidth: 1,
    borderColor: "#ececec",
    borderRadius: 8,
    padding: 8,
    marginTop: 6
  },
  replyLink: {
    marginTop: 6
  },
  replyLinkText: {
    color: "#0b57d0",
    fontWeight: "600",
    fontSize: 12
  },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginBottom: 4
  },
  cardClub: {
    borderColor: "#89a7ff",
    backgroundColor: "#f7f9ff"
  },
  cardProject: {
    borderColor: "#8fcfbd",
    backgroundColor: "#f4fbf8"
  },
  cardProgress: {
    borderColor: "#f1c56b",
    backgroundColor: "#fffaf1"
  },
  eventLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#555",
    marginBottom: 6,
    textTransform: "uppercase"
  },
  author: {
    fontWeight: "700",
    marginBottom: 4
  },
  subtitle: {
    color: "#444",
    marginBottom: 6
  },
  eventBody: {
    color: "#1f1f1f"
  },
  meta: {
    marginTop: 8,
    color: "#666",
    fontSize: 12
  },
  message: {
    paddingHorizontal: 16,
    color: "#444"
  },
  filterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff"
  },
  filterChipActive: {
    backgroundColor: "#111",
    borderColor: "#111"
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333"
  },
  filterChipTextActive: {
    color: "#fff"
  },
  focusedFeedItem: {
    borderWidth: 1,
    borderColor: "#9bb8f5",
    borderRadius: 12,
    backgroundColor: "#f6f9ff",
    padding: 4,
    marginBottom: 4
  },
  focusedCommentRow: {
    borderColor: "#9bb8f5",
    borderWidth: 1,
    backgroundColor: "#f6f9ff"
  }
});
