import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  ClubEvent,
  FeedEvent,
  getClubEvents,
  getClubsFeed,
  getCommonsFeedEvents,
  getProjectMilestones,
  getProjects,
  getUserClubs,
  NotificationItem,
  Post,
  Project,
  ProjectMilestone
} from "../api/client";
import { AuthUser } from "../auth/session";

type HomeNavigationTarget = "COMMONS" | "NOTIFICATIONS" | "CLUBS" | "PROJECTS";

type HomeScreenProps = {
  user: AuthUser;
  notifications: NotificationItem[];
  notificationReadIds: Record<string, true>;
  notificationsLoading: boolean;
  onRefreshNotifications: () => Promise<void> | void;
  onMarkNotificationRead: (notificationId: string) => void;
  onOpenNotification: (item: NotificationItem) => void;
  onNavigate: (
    target: HomeNavigationTarget,
    options?: {
      projectId?: string;
      clubId?: string;
      postId?: string;
      focusItemId?: string;
      focusItemType?: "POST" | "MILESTONE" | "TASK";
    }
  ) => void;
};

type ProjectSummary = {
  project: Project;
  activeMilestoneTitle?: string;
  taskProgressHint?: string;
  recentUpdateAt?: string;
};

type UpcomingClubEventSummary = {
  event: ClubEvent;
  clubName?: string;
};

const ACTIVE_PROJECT_LIMIT = 5;
const PROGRESS_SIGNAL_LIMIT = 5;
const CLUB_UPDATES_LIMIT = 6;
const RECENT_ACTIVITY_LIMIT = 5;
const NOTIFICATIONS_PREVIEW_LIMIT = 3;
const UPCOMING_CLUB_EVENTS_LIMIT = 5;

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

function formatProjectVisibilityLabel(visibility: string): string {
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

function firstOpenMilestone(milestones: ProjectMilestone[]): ProjectMilestone | undefined {
  const ordered = [...milestones].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  return ordered.find((item) => item.status !== "DONE") ?? ordered[ordered.length - 1];
}

function isoFromNowWithinWindow(iso: string, windowMs: number): boolean {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return false;
  return Date.now() - parsed <= windowMs;
}

export function HomeScreen({
  user,
  notifications,
  notificationReadIds,
  notificationsLoading,
  onRefreshNotifications,
  onMarkNotificationRead,
  onOpenNotification,
  onNavigate
}: HomeScreenProps) {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [activeProjects, setActiveProjects] = useState<ProjectSummary[]>([]);
  const [progressSignals, setProgressSignals] = useState<FeedEvent[]>([]);
  const [clubUpdates, setClubUpdates] = useState<Post[]>([]);
  const [upcomingClubEvents, setUpcomingClubEvents] = useState<UpcomingClubEventSummary[]>([]);
  const [recentActivity, setRecentActivity] = useState<FeedEvent[]>([]);

  const unreadNotificationsCount = notifications.filter((item) => !notificationReadIds[item.id]).length;

  const notificationPreview = useMemo(() => {
    const unread = notifications.filter((item) => !notificationReadIds[item.id]);
    const read = notifications.filter((item) => !!notificationReadIds[item.id]);
    return [...unread, ...read]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, NOTIFICATIONS_PREVIEW_LIMIT);
  }, [notificationReadIds, notifications]);

  const progressSignalsCountInWindow = useMemo(
    () => progressSignals.filter((event) => isoFromNowWithinWindow(event.sortTimestamp, NEW_WINDOW_MS)).length,
    [progressSignals]
  );

  const clubUpdatesCountInWindow = useMemo(
    () => clubUpdates.filter((post) => isoFromNowWithinWindow(post.createdAt, NEW_WINDOW_MS)).length,
    [clubUpdates]
  );

  async function loadDashboard() {
    setLoading(true);
    setMessage(null);

    try {
      const [projects, commonsEvents, myClubs] = await Promise.all([
        getProjects(),
        getCommonsFeedEvents(user.userId, { limit: 40 }),
        getUserClubs(user.userId)
      ]);

      const relevantProjects = projects
        .filter((project) => project.ownerId === user.userId || project.createdBy === user.userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const selectedProjects = relevantProjects.slice(0, ACTIVE_PROJECT_LIMIT);
      const milestonesByProject = await Promise.all(
        selectedProjects.map(async (project) => {
          const milestones = await getProjectMilestones(project.id);
          return [project.id, milestones] as const;
        })
      );

      const milestoneMap = new Map<string, ProjectMilestone[]>(milestonesByProject);
      const projectSummaries: ProjectSummary[] = selectedProjects.map((project) => {
        const milestones = milestoneMap.get(project.id) ?? [];
        const active = milestones.length > 0 ? firstOpenMilestone(milestones) : undefined;
        const allTasks = milestones.flatMap((milestone) => milestone.tasks ?? []);
        const doneTasks = allTasks.filter((task) => task.isDone).length;
        const recentMilestoneTime = milestones.reduce<string | undefined>((latest, milestone) => {
          if (!latest) return milestone.createdAt;
          return milestone.createdAt > latest ? milestone.createdAt : latest;
        }, undefined);
        const recentTaskTime = allTasks.reduce<string | undefined>((latest, task) => {
          if (!latest) return task.createdAt;
          return task.createdAt > latest ? task.createdAt : latest;
        }, undefined);

        const recentUpdateAt = [project.createdAt, recentMilestoneTime, recentTaskTime]
          .filter((value): value is string => !!value)
          .sort((a, b) => b.localeCompare(a))[0];

        return {
          project,
          activeMilestoneTitle: active?.title,
          taskProgressHint: allTasks.length > 0 ? `${doneTasks}/${allTasks.length} done` : undefined,
          recentUpdateAt
        };
      });

      const projectIdSet = new Set(relevantProjects.map((project) => project.id));
      const progress = commonsEvents
        .filter(
          (event) =>
            (event.eventType === "MILESTONE_COMPLETED" || event.eventType === "TASK_COMPLETED") &&
            !!event.projectId &&
            projectIdSet.has(event.projectId)
        )
        .slice(0, PROGRESS_SIGNAL_LIMIT);

      const myClubIdSet = new Set(myClubs.map((club) => club.id));
      const clubNameById = new Map(myClubs.map((club) => [club.id, club.name]));
      const clubsFeed = await getClubsFeed(user.userId);
      const clubFeedSubset = clubsFeed
        .filter((post) => !!post.clubId && myClubIdSet.has(post.clubId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, CLUB_UPDATES_LIMIT);

      const upcomingByClub = await Promise.all(
        myClubs.map(async (club) => {
          const events = await getClubEvents(club.id, user.userId, "upcoming");
          return events.map((event) => ({ event, clubName: clubNameById.get(club.id) }));
        })
      );
      const upcomingFlattened = upcomingByClub.flat();
      upcomingFlattened.sort((a, b) => {
        const timeDiff = new Date(a.event.startAt).getTime() - new Date(b.event.startAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.event.id.localeCompare(b.event.id);
      });

      setActiveProjects(projectSummaries);
      setProgressSignals(progress);
      setClubUpdates(clubFeedSubset);
      setUpcomingClubEvents(upcomingFlattened.slice(0, UPCOMING_CLUB_EVENTS_LIMIT));
      setRecentActivity(commonsEvents.slice(0, RECENT_ACTIVITY_LIMIT));
    } catch (err) {
      setMessage((err as Error).message);
      setActiveProjects([]);
      setProgressSignals([]);
      setClubUpdates([]);
      setUpcomingClubEvents([]);
      setRecentActivity([]);
    } finally {
      setLoading(false);
    }
  }

  function formatEventStart(isoValue: string): string {
    const parsed = new Date(isoValue);
    if (Number.isNaN(parsed.getTime())) return isoValue;
    return parsed.toLocaleString();
  }

  async function handleRefresh() {
    await Promise.all([loadDashboard(), Promise.resolve(onRefreshNotifications())]);
  }

  useEffect(() => {
    loadDashboard();
  }, [user.userId]);

  if (loading && activeProjects.length === 0 && recentActivity.length === 0 && notificationsLoading) {
    return <ActivityIndicator style={{ marginTop: 32 }} />;
  }

  return (
    <FlatList
      data={[]}
      keyExtractor={(_, index) => `home-row-${index}`}
      contentContainerStyle={styles.list}
      refreshing={loading || notificationsLoading}
      onRefresh={handleRefresh}
      ListHeaderComponent={
        <View>
          <Text style={styles.pageTitle}>Home</Text>
          <Text style={styles.hint}>Your dashboard: what changed, what needs attention, and where to go next.</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>My Active Projects</Text>
              <Pressable onPress={() => onNavigate("PROJECTS")}>
                <Text style={styles.linkText}>View all projects</Text>
              </Pressable>
            </View>
            {activeProjects.length === 0 ? <Text style={styles.hint}>No active projects yet.</Text> : null}
            {activeProjects.map((item) => (
              <Pressable key={item.project.id} onPress={() => onNavigate("PROJECTS", { projectId: item.project.id })} style={styles.itemCard}>
                <Text style={styles.itemTitle}>{item.project.title}</Text>
                <Text style={styles.openHint}>Tap to open project</Text>
                <View style={styles.visibilityRow}>
                  <Text style={styles.itemMeta}>Visibility:</Text>
                  <View style={styles.visibilityBadge}>
                    <Text style={styles.visibilityBadgeText}>{formatProjectVisibilityLabel(item.project.visibility)}</Text>
                  </View>
                </View>
                {item.activeMilestoneTitle ? <Text style={styles.itemMeta}>Active milestone: {item.activeMilestoneTitle}</Text> : null}
                {item.taskProgressHint ? <Text style={styles.itemMeta}>Tasks: {item.taskProgressHint}</Text> : null}
                {item.recentUpdateAt ? (
                  <Text style={styles.itemMeta}>Updated: {new Date(item.recentUpdateAt).toLocaleString()}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>What Changed Since Last Visit</Text>
            <View style={styles.chipRow}>
              <Pressable style={styles.summaryChip} onPress={() => onNavigate("NOTIFICATIONS")}>
                <Text style={styles.summaryChipTitle}>{unreadNotificationsCount}</Text>
                <Text style={styles.summaryChipLabel}>Unread notifications</Text>
              </Pressable>
              <Pressable style={styles.summaryChip} onPress={() => onNavigate("PROJECTS")}>
                <Text style={styles.summaryChipTitle}>{progressSignalsCountInWindow}</Text>
                <Text style={styles.summaryChipLabel}>Project progress updates</Text>
              </Pressable>
              <Pressable style={styles.summaryChip} onPress={() => onNavigate("CLUBS")}>
                <Text style={styles.summaryChipTitle}>{clubUpdatesCountInWindow}</Text>
                <Text style={styles.summaryChipLabel}>Club updates</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Project Progress Signals</Text>
              <Pressable onPress={() => onNavigate("PROJECTS")}>
                <Text style={styles.linkText}>Open Projects</Text>
              </Pressable>
            </View>
            {progressSignals.length === 0 ? <Text style={styles.hint}>No recent project progress.</Text> : null}
            {progressSignals.map((event) => (
              <Pressable
                key={event.id}
                onPress={() =>
                  onNavigate(
                    "PROJECTS",
                    event.projectId
                      ? {
                          projectId: event.projectId,
                          focusItemId: event.entityId,
                          focusItemType: event.eventType === "MILESTONE_COMPLETED" ? "MILESTONE" : "TASK"
                        }
                      : undefined
                  )
                }
                style={styles.itemCard}
              >
                <Text style={styles.itemTitle}>
                  {event.eventType === "MILESTONE_COMPLETED" ? "Milestone completed" : "Task completed"}
                </Text>
                <Text style={styles.openHint}>Tap to open project</Text>
                <Text style={styles.itemMeta}>By @{event.actorId}</Text>
                <Text style={styles.itemMeta}>{new Date(event.sortTimestamp).toLocaleString()}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Club Updates</Text>
              <Pressable onPress={() => onNavigate("CLUBS")}>
                <Text style={styles.linkText}>Open Clubs</Text>
              </Pressable>
            </View>
            {clubUpdates.length === 0 ? <Text style={styles.hint}>No recent updates from your clubs.</Text> : null}
            {clubUpdates.map((post) => (
              <Pressable
                key={post.postId}
                onPress={() => onNavigate("CLUBS", post.clubId ? { clubId: post.clubId, postId: post.postId } : undefined)}
                style={styles.itemCard}
              >
                <Text style={styles.itemTitle}>@{post.userId}</Text>
                <Text style={styles.openHint}>Tap to open club</Text>
                <Text style={styles.itemBody} numberOfLines={2}>{post.text}</Text>
                <Text style={styles.itemMeta}>{new Date(post.createdAt).toLocaleString()}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Upcoming Club Events</Text>
              <Pressable onPress={() => onNavigate("CLUBS")}>
                <Text style={styles.linkText}>Open Clubs</Text>
              </Pressable>
            </View>
            {upcomingClubEvents.length === 0 ? <Text style={styles.hint}>No upcoming club events.</Text> : null}
            {upcomingClubEvents.map((entry) => (
              <Pressable
                key={entry.event.id}
                onPress={() => onNavigate("CLUBS", { clubId: entry.event.clubId })}
                style={styles.itemCard}
              >
                <Text style={styles.itemTitle}>{entry.event.title}</Text>
                {entry.clubName ? <Text style={styles.itemMeta}>Club: {entry.clubName}</Text> : null}
                <Text style={styles.itemMeta}>Starts: {formatEventStart(entry.event.startAt)}</Text>
                {entry.event.locationText ? <Text style={styles.itemMeta}>Location: {entry.event.locationText}</Text> : null}
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <Pressable onPress={() => onNavigate("COMMONS")}>
                <Text style={styles.linkText}>Open Commons Feed</Text>
              </Pressable>
            </View>
            {recentActivity.length === 0 ? <Text style={styles.hint}>No recent activity.</Text> : null}
            {recentActivity.map((event) => (
              <Pressable
                key={event.id}
                onPress={() => {
                  if (event.projectId || event.source === "PROJECTS") {
                    onNavigate("PROJECTS", {
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
                  if (event.clubId) {
                    onNavigate("CLUBS", {
                      clubId: event.clubId,
                      postId: event.entityType === "POST" ? event.entityId : undefined
                    });
                    return;
                  }
                  onNavigate("COMMONS", {
                    postId: event.entityType === "POST" ? event.entityId : undefined
                  });
                }}
                style={styles.itemCard}
              >
                <Text style={styles.itemTitle}>{event.eventType.replaceAll("_", " ")}</Text>
                <Text style={styles.itemMeta}>@{event.actorId}</Text>
                <Text style={styles.itemMeta}>{new Date(event.sortTimestamp).toLocaleString()}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Notifications Preview</Text>
              <Pressable onPress={() => onNavigate("NOTIFICATIONS")}>
                <Text style={styles.linkText}>See all notifications</Text>
              </Pressable>
            </View>
            {notificationPreview.length === 0 ? <Text style={styles.hint}>No notifications yet.</Text> : null}
            {notificationPreview.map((item) => {
              const unread = !notificationReadIds[item.id];
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    onMarkNotificationRead(item.id);
                    onOpenNotification(item);
                  }}
                  style={[styles.itemCard, unread && styles.unreadCard]}
                >
                  <Text style={styles.itemTitle}>{item.message}</Text>
                  {item.previewText ? <Text style={styles.itemBody}>Preview: {item.previewText}</Text> : null}
                  <Text style={styles.itemMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      }
      renderItem={() => null}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
    paddingBottom: 24,
    gap: 10
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6
  },
  hint: {
    color: "#666",
    marginBottom: 6
  },
  message: {
    color: "#0b57d0",
    marginBottom: 8
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    marginTop: 10
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700"
  },
  linkText: {
    color: "#0b57d0",
    fontWeight: "600",
    fontSize: 12
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  summaryChip: {
    borderWidth: 1,
    borderColor: "#cfd8ea",
    backgroundColor: "#f5f8ff",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 110
  },
  summaryChipTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0b57d0"
  },
  summaryChipLabel: {
    color: "#444",
    fontSize: 12
  },
  itemCard: {
    borderWidth: 1,
    borderColor: "#ececec",
    borderRadius: 8,
    padding: 8,
    marginTop: 6
  },
  unreadCard: {
    borderColor: "#0b57d0",
    backgroundColor: "#f4f8ff"
  },
  itemTitle: {
    fontWeight: "700",
    marginBottom: 2
  },
  openHint: {
    color: "#0b57d0",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2
  },
  itemBody: {
    color: "#222",
    marginBottom: 2
  },
  itemMeta: {
    color: "#666",
    fontSize: 12
  },
  visibilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4
  },
  visibilityBadge: {
    borderWidth: 1,
    borderColor: "#a8c2ff",
    backgroundColor: "#eaf1ff",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8
  },
  visibilityBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1b2a57"
  }
});
