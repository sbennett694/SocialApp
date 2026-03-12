import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  getNotifications,
  getUsers,
  searchGlobal,
  GlobalSearchResult,
  NotificationItem,
  ThreadType,
  UserBasic
} from "./src/api/client";
import { getCurrentUser, getMockUsers } from "./src/auth/session";
import { ClubsScreen } from "./src/screens/ClubsScreen";
import { FeedScreen } from "./src/screens/FeedScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { ProjectsScreen } from "./src/screens/ProjectsScreen";

type MainTab = "HOME" | "COMMONS" | "NOTIFICATIONS" | "CLUBS" | "PROJECTS" | "PROFILE";
type DetailNavigationTarget = "COMMONS" | "CLUBS" | "PROJECTS";
type FocusItemType = "POST" | "MILESTONE" | "TASK";
type ProjectsNavigationIntent = {
  requestId: string;
  projectId: string;
  targetId?: string;
  targetType?: Extract<FocusItemType, "MILESTONE" | "TASK">;
};

export default function App() {
  const isDevBuild = typeof __DEV__ !== "undefined" && __DEV__;
  const mockUsers = getMockUsers();
  const [selectedMockUserId, setSelectedMockUserId] = useState(mockUsers[0].userId);
  const [showDevUserControls, setShowDevUserControls] = useState(isDevBuild);
  const [activeTab, setActiveTab] = useState<MainTab>("HOME");
  const [clubsRootResetSignal, setClubsRootResetSignal] = useState(0);
  const [projectsRootResetSignal, setProjectsRootResetSignal] = useState(0);
  const [users, setUsers] = useState<UserBasic[]>([]);
  const [profileFocusUserId, setProfileFocusUserId] = useState<string | undefined>(undefined);
  const [clubsFocusClubId, setClubsFocusClubId] = useState<string | undefined>(undefined);
  const [clubsFocusPostId, setClubsFocusPostId] = useState<string | undefined>(undefined);
  const [projectsNavigationIntent, setProjectsNavigationIntent] = useState<ProjectsNavigationIntent | undefined>(undefined);
  const [commonsFocusPostId, setCommonsFocusPostId] = useState<string | undefined>(undefined);
  const [commonsFocusCommentId, setCommonsFocusCommentId] = useState<string | undefined>(undefined);
  const [commonsFocusThreadType, setCommonsFocusThreadType] = useState<ThreadType | undefined>(undefined);
  const [commonsCommentNavigationPending, setCommonsCommentNavigationPending] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<GlobalSearchResult>({ users: [], clubs: [], projects: [] });
  const [searchResults, setSearchResults] = useState<GlobalSearchResult>({ users: [], clubs: [], projects: [] });
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsMessage, setNotificationsMessage] = useState<string | null>(null);
  const [notificationReadIds, setNotificationReadIds] = useState<Record<string, true>>({});

  const user = getCurrentUser(selectedMockUserId);
  const unreadNotificationsCount = notifications.filter((item) => !notificationReadIds[item.id]).length;

  function createProjectsNavigationIntent(
    projectId: string,
    targetId?: string,
    targetType?: Extract<FocusItemType, "MILESTONE" | "TASK">
  ): ProjectsNavigationIntent {
    return {
      requestId: `projects-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      targetId,
      targetType
    };
  }

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch(() => {
        setUsers(mockUsers.map((u) => ({ id: u.userId, handle: u.userId, displayName: u.displayName })));
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!searchQuery.trim()) {
        setSearchSuggestions({ users: [], clubs: [], projects: [] });
        setSearchResults({ users: [], clubs: [], projects: [] });
        setSearchExecuted(false);
        return;
      }
      try {
        const results = await searchGlobal(searchQuery.trim());
        if (!cancelled) {
          setSearchSuggestions({
            users: results.users.slice(0, 3),
            clubs: results.clubs.slice(0, 3),
            projects: results.projects.slice(0, 3)
          });
        }
      } catch {
        if (!cancelled) {
          setSearchSuggestions({ users: [], clubs: [], projects: [] });
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  async function loadNotifications() {
    setNotificationsLoading(true);
    setNotificationsMessage(null);
    try {
      const data = await getNotifications(user.userId, 100);
      setNotifications(data);
    } catch (err) {
      setNotificationsMessage((err as Error).message);
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }

  useEffect(() => {
    setNotificationReadIds({});
    loadNotifications();
  }, [user.userId]);

  async function executeSearch() {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults({ users: [], clubs: [], projects: [] });
      setSearchExecuted(false);
      return;
    }
    try {
      const results = await searchGlobal(query);
      setSearchResults(results);
      setSearchExecuted(true);
    } catch {
      setSearchResults({ users: [], clubs: [], projects: [] });
      setSearchExecuted(true);
    }
  }

  function hasAnyResults(results: GlobalSearchResult) {
    return results.users.length > 0 || results.clubs.length > 0 || results.projects.length > 0;
  }

  function handleSelectSearchResult(type: "USER" | "CLUB" | "PROJECT", id: string) {
    if (type === "USER") {
      setProfileFocusUserId(id);
      setActiveTab("PROFILE");
    } else if (type === "CLUB") {
      setClubsFocusClubId(id);
      setClubsFocusPostId(undefined);
      setActiveTab("CLUBS");
    } else {
      setProjectsNavigationIntent(createProjectsNavigationIntent(id));
      setActiveTab("PROJECTS");
    }
    setSearchOpen(false);
  }

  function handleOpenNotification(item: NotificationItem) {
    if (item.relatedType === "PROJECT") {
      const projectId = item.projectId ?? item.relatedId;
      if (item.type === "PROJECT_MILESTONE_COMPLETED" || item.type === "PROJECT_TASK_COMPLETED") {
        setProjectsNavigationIntent(
          createProjectsNavigationIntent(
            projectId,
            item.entityId,
            item.type === "PROJECT_MILESTONE_COMPLETED" ? "MILESTONE" : "TASK"
          )
        );
      } else {
        setProjectsNavigationIntent(createProjectsNavigationIntent(projectId));
      }
      setActiveTab("PROJECTS");
      return;
    }

    if (item.type === "POST_COMMENTED" && item.relatedType === "POST") {
      setCommonsFocusPostId(item.postId ?? item.relatedId);
      setCommonsFocusCommentId(item.entityId);
      setCommonsFocusThreadType(item.threadType ?? "COMMENTS");
      setCommonsCommentNavigationPending(true);
      setActiveTab("COMMONS");
      return;
    }

    if (item.relatedType === "CLUB") {
      setClubsFocusClubId(item.clubId ?? item.relatedId);
      setClubsFocusPostId(undefined);
      setActiveTab("CLUBS");
      return;
    }

    if (item.relatedType === "POST" && item.clubId) {
      setClubsFocusClubId(item.clubId);
      setClubsFocusPostId(item.postId ?? item.relatedId);
      setActiveTab("CLUBS");
      return;
    }

    if (item.relatedType === "POST") {
      setCommonsFocusPostId(item.postId ?? item.relatedId);
      setCommonsFocusCommentId(undefined);
      setCommonsFocusThreadType(undefined);
      setCommonsCommentNavigationPending(false);
    }
    setActiveTab("COMMONS");
  }

  function markNotificationRead(notificationId: string) {
    setNotificationReadIds((prev) => ({ ...prev, [notificationId]: true }));
  }

  function handleOpenDetailTarget(target: DetailNavigationTarget, id?: string) {
    if (target === "COMMONS") {
      setCommonsFocusPostId(id);
      setCommonsFocusCommentId(undefined);
      setCommonsFocusThreadType(undefined);
      setCommonsCommentNavigationPending(false);
      setActiveTab("COMMONS");
      return;
    }

    if (target === "PROJECTS") {
      if (id) {
        setProjectsNavigationIntent(createProjectsNavigationIntent(id));
      } else {
        setProjectsNavigationIntent(undefined);
      }
      setActiveTab("PROJECTS");
      return;
    }

    if (id) {
      setClubsFocusClubId(id);
    } else {
      setClubsFocusClubId(undefined);
    }
    setActiveTab("CLUBS");
  }

  function handleHomeNavigate(
    target: "COMMONS" | "NOTIFICATIONS" | "CLUBS" | "PROJECTS",
    options?: {
      projectId?: string;
      clubId?: string;
      postId?: string;
      focusItemId?: string;
      focusItemType?: FocusItemType;
    }
  ) {
    if (target === "COMMONS") {
      setCommonsFocusPostId(options?.postId);
      setCommonsFocusCommentId(undefined);
      setCommonsFocusThreadType(undefined);
      setCommonsCommentNavigationPending(false);
      setActiveTab("COMMONS");
      return;
    }

    if (target === "PROJECTS") {
      if (options?.focusItemType === "MILESTONE" || options?.focusItemType === "TASK") {
        if (options?.projectId) {
          setProjectsNavigationIntent(
            createProjectsNavigationIntent(options.projectId, options.focusItemId, options.focusItemType)
          );
        } else {
          setProjectsNavigationIntent(undefined);
        }
      } else {
        setProjectsNavigationIntent(
          options?.projectId ? createProjectsNavigationIntent(options.projectId) : undefined
        );
      }
      setActiveTab("PROJECTS");
      return;
    }

    if (target === "CLUBS") {
      if (options?.clubId) {
        setClubsFocusClubId(options.clubId);
        setClubsFocusPostId(options.postId);
      } else {
        setClubsFocusClubId(undefined);
        setClubsFocusPostId(undefined);
      }
      setActiveTab("CLUBS");
      return;
    }

    setActiveTab(target);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {isDevBuild && showDevUserControls ? (
          <>
            <View style={styles.devHeaderRow}>
              <Text style={styles.switcherLabel}>Local dev user:</Text>
              <Pressable onPress={() => setShowDevUserControls(false)} style={styles.devToggleButton}>
                <Text style={styles.devToggleButtonText}>Hide Dev Controls</Text>
              </Pressable>
            </View>
            <View style={styles.switcherRow}>
              {mockUsers.map((mockUser) => {
                const active = selectedMockUserId === mockUser.userId;
                return (
                  <Pressable
                    key={mockUser.userId}
                    onPress={() => setSelectedMockUserId(mockUser.userId)}
                    style={[styles.switcherPill, active && styles.switcherPillActive]}
                  >
                    <Text style={[styles.switcherPillText, active && styles.switcherPillTextActive]}>{mockUser.displayName}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {isDevBuild && !showDevUserControls ? (
          <View style={styles.devRestoreRow}>
            <Pressable onPress={() => setShowDevUserControls(true)} style={styles.devToggleButton}>
              <Text style={styles.devToggleButtonText}>Show Dev Controls</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.navRow}>
        <Pressable
          onPress={() => setActiveTab("HOME")}
          style={[styles.brandItem, activeTab === "HOME" && styles.brandItemActive]}
        >
          <Text style={styles.brandText}>SocialApp</Text>
        </Pressable>
        {([
          ["COMMONS", "Commons"],
          ["CLUBS", "Clubs"],
          ["PROJECTS", "Projects"],
          ["PROFILE", "Profile"],
          ["NOTIFICATIONS", "Notifications"]
        ] as [MainTab, string][]).map(([tab, label]) => {
          const active = activeTab === tab;
          const showBadge = tab === "NOTIFICATIONS" && unreadNotificationsCount > 0;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                if (tab === "CLUBS" && activeTab === "CLUBS") {
                  setClubsFocusClubId(undefined);
                  setClubsRootResetSignal((value) => value + 1);
                }
                if (tab === "PROJECTS" && activeTab === "PROJECTS") {
                  setProjectsNavigationIntent(undefined);
                  setProjectsRootResetSignal((value) => value + 1);
                }
                setActiveTab(tab);
              }}
              style={[styles.navItem, active && styles.navItemActive]}
            >
              <View style={styles.navTextRow}>
                {tab === "NOTIFICATIONS" ? (
                  <Text style={[styles.navIconText, active && styles.navIconTextActive]}>🔔</Text>
                ) : (
                  <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
                )}
                {showBadge ? (
                  <View style={[styles.badge, active && styles.badgeActive]}>
                    <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
                      {unreadNotificationsCount > 99 ? "99+" : String(unreadNotificationsCount)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setSearchOpen((value) => !value)}
          style={[styles.navItem, searchOpen && styles.navItemActive]}
        >
          <Text style={[styles.navText, searchOpen && styles.navTextActive]}>🔍 Search</Text>
        </Pressable>
      </View>

      {searchOpen ? (
        <View style={styles.searchBox}>
          <View style={styles.searchInputRow}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search users, clubs, projects"
              style={styles.searchInput}
              returnKeyType="search"
              onSubmitEditing={executeSearch}
            />
            <Pressable onPress={executeSearch} style={styles.findButton}>
              <Text style={styles.findButtonText}>Find</Text>
            </Pressable>
          </View>

          {searchQuery.trim() ? (
            <>
              <Text style={styles.searchSectionTitle}>Suggestions</Text>
              <View style={styles.searchResults}>
                {searchSuggestions.users.map((entry) => (
                  <Pressable
                    key={`suggest-user-${entry.id}`}
                    onPress={() => handleSelectSearchResult("USER", entry.id)}
                    style={styles.searchRow}
                  >
                    <Text style={styles.searchRowTitle}>User: {entry.displayName}</Text>
                    <Text style={styles.searchRowMeta}>@{entry.handle}</Text>
                  </Pressable>
                ))}
                {searchSuggestions.clubs.map((entry) => (
                  <Pressable
                    key={`suggest-club-${entry.id}`}
                    onPress={() => handleSelectSearchResult("CLUB", entry.id)}
                    style={styles.searchRow}
                  >
                    <Text style={styles.searchRowTitle}>Club: {entry.name}</Text>
                    <Text style={styles.searchRowMeta}>{entry.categoryId}</Text>
                  </Pressable>
                ))}
                {searchSuggestions.projects.map((entry) => (
                  <Pressable
                    key={`suggest-project-${entry.id}`}
                    onPress={() => handleSelectSearchResult("PROJECT", entry.id)}
                    style={styles.searchRow}
                  >
                    <Text style={styles.searchRowTitle}>Project: {entry.title}</Text>
                    <Text style={styles.searchRowMeta}>{entry.categoryId}</Text>
                  </Pressable>
                ))}
              </View>

              {searchExecuted ? (
                <>
                  <Text style={styles.searchSectionTitle}>Results</Text>
                  <View style={styles.searchResults}>
                    {searchResults.users.map((entry) => (
                      <Pressable
                        key={`result-user-${entry.id}`}
                        onPress={() => handleSelectSearchResult("USER", entry.id)}
                        style={styles.searchRow}
                      >
                        <Text style={styles.searchRowTitle}>User: {entry.displayName}</Text>
                        <Text style={styles.searchRowMeta}>@{entry.handle}</Text>
                      </Pressable>
                    ))}
                    {searchResults.clubs.map((entry) => (
                      <Pressable
                        key={`result-club-${entry.id}`}
                        onPress={() => handleSelectSearchResult("CLUB", entry.id)}
                        style={styles.searchRow}
                      >
                        <Text style={styles.searchRowTitle}>Club: {entry.name}</Text>
                        <Text style={styles.searchRowMeta}>{entry.categoryId}</Text>
                      </Pressable>
                    ))}
                    {searchResults.projects.map((entry) => (
                      <Pressable
                        key={`result-project-${entry.id}`}
                        onPress={() => handleSelectSearchResult("PROJECT", entry.id)}
                        style={styles.searchRow}
                      >
                        <Text style={styles.searchRowTitle}>Project: {entry.title}</Text>
                        <Text style={styles.searchRowMeta}>{entry.categoryId}</Text>
                      </Pressable>
                    ))}
                    {!hasAnyResults(searchResults) ? <Text style={styles.noResultsText}>No matches found.</Text> : null}
                  </View>
                </>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {activeTab === "HOME" ? (
        <HomeScreen
          user={user}
          notifications={notifications}
          notificationReadIds={notificationReadIds}
          notificationsLoading={notificationsLoading}
          onRefreshNotifications={loadNotifications}
          onMarkNotificationRead={markNotificationRead}
          onOpenNotification={handleOpenNotification}
          onNavigate={handleHomeNavigate}
        />
      ) : null}
      {activeTab === "COMMONS" ? (
        <FeedScreen
          user={user}
          focusPostId={commonsFocusPostId}
          focusCommentId={commonsFocusCommentId}
          focusThreadType={commonsFocusThreadType}
          focusFromCommentNotification={commonsCommentNavigationPending}
          onFocusPostConsumed={(postId) => {
            setCommonsFocusPostId((current) => (current === postId ? undefined : current));
          }}
          onFocusCommentConsumed={(commentId) => {
            setCommonsFocusCommentId((current) => (current === commentId ? undefined : current));
          }}
          onFocusThreadConsumed={(threadType) => {
            setCommonsFocusThreadType((current) => (current === threadType ? undefined : current));
          }}
          onCommentNavigationConsumed={() => {
            setCommonsCommentNavigationPending(false);
          }}
          onNavigate={(target, options) => {
            if (target === "PROJECTS") {
              setProjectsNavigationIntent(
                options?.projectId
                  ? createProjectsNavigationIntent(
                      options.projectId,
                      options?.focusItemType === "MILESTONE" || options?.focusItemType === "TASK"
                        ? options.focusItemId
                        : undefined,
                      options?.focusItemType === "MILESTONE" || options?.focusItemType === "TASK"
                        ? options.focusItemType
                        : undefined
                    )
                  : undefined
              );
              if (options?.focusItemType === "MILESTONE" || options?.focusItemType === "TASK") {
              }
              setActiveTab("PROJECTS");
              return;
            }

            setClubsFocusClubId(options?.clubId);
            setClubsFocusPostId(options?.postId);
            setActiveTab("CLUBS");
          }}
        />
      ) : null}
      {activeTab === "NOTIFICATIONS" ? (
        <NotificationsScreen
          notifications={notifications}
          loading={notificationsLoading}
          message={notificationsMessage}
          onRefresh={loadNotifications}
          readIds={notificationReadIds}
          onMarkRead={markNotificationRead}
          onOpenNotification={handleOpenNotification}
        />
      ) : null}
      {activeTab === "CLUBS" ? (
        <ClubsScreen
          user={user}
          rootResetSignal={clubsRootResetSignal}
          focusClubId={clubsFocusClubId}
          focusClubPostId={clubsFocusPostId}
          onFocusClubConsumed={(clubId) => {
            setClubsFocusClubId((current) => (current === clubId ? undefined : current));
          }}
          onFocusClubPostConsumed={(postId) => {
            setClubsFocusPostId((current) => (current === postId ? undefined : current));
          }}
          onBackToClubsRoot={() => {
            setClubsFocusClubId(undefined);
            setClubsFocusPostId(undefined);
          }}
          onNavigateToProject={(projectId) => {
            setProjectsNavigationIntent(createProjectsNavigationIntent(projectId));
            setActiveTab("PROJECTS");
          }}
        />
      ) : null}
      {activeTab === "PROJECTS" ? (
        <ProjectsScreen
          user={user}
          navigationIntent={projectsNavigationIntent}
          rootResetSignal={projectsRootResetSignal}
          onNavigationIntentComplete={(requestId) => {
            setProjectsNavigationIntent((current) => (current?.requestId === requestId ? undefined : current));
          }}
          onBackToProjectsRoot={() => {
            setProjectsNavigationIntent(undefined);
          }}
          onNavigateToClub={(clubId) => {
            setClubsFocusClubId(clubId);
            setActiveTab("CLUBS");
          }}
        />
      ) : null}
      {activeTab === "PROFILE" ? (
        <ProfileScreen
          user={user}
          users={users}
          focusUserId={profileFocusUserId}
          onNavigateToDetail={(target, id) => {
            handleOpenDetailTarget(target, id);
          }}
        />
      ) : null}

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff"
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8
  },
  switcherLabel: {
    marginTop: 4,
    color: "#444",
    fontSize: 12
  },
  devHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 8
  },
  devRestoreRow: {
    alignItems: "flex-end"
  },
  devToggleButton: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  devToggleButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#444"
  },
  switcherRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  switcherPill: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  switcherPillActive: {
    backgroundColor: "#111",
    borderColor: "#111"
  },
  switcherPillText: {
    color: "#333",
    fontSize: 12,
    fontWeight: "600"
  },
  switcherPillTextActive: {
    color: "#fff"
  },
  navRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  brandItem: {
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#111"
  },
  brandItemActive: {
    opacity: 0.88
  },
  brandText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff"
  },
  navItem: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  navItemActive: {
    backgroundColor: "#111",
    borderColor: "#111"
  },
  navText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333"
  },
  navTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  navTextActive: {
    color: "#fff"
  },
  navIconText: {
    fontSize: 14,
    color: "#333"
  },
  navIconTextActive: {
    color: "#fff"
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#d93025",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4
  },
  badgeActive: {
    backgroundColor: "#fff"
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700"
  },
  badgeTextActive: {
    color: "#111"
  },
  searchBox: {
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  searchInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  findButton: {
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#111"
  },
  findButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12
  },
  searchSectionTitle: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 12,
    color: "#555",
    fontWeight: "600"
  },
  searchResults: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    overflow: "hidden"
  },
  searchRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0"
  },
  searchRowTitle: {
    fontWeight: "600"
  },
  searchRowMeta: {
    color: "#666",
    fontSize: 12
  },
  noResultsText: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: "#666",
    fontSize: 12
  }
});
