import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { getUsers, searchGlobal, GlobalSearchResult, UserBasic } from "./src/api/client";
import { getCurrentUser, getMockUsers } from "./src/auth/session";
import { ClubsScreen } from "./src/screens/ClubsScreen";
import { FeedScreen } from "./src/screens/FeedScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { ProjectsScreen } from "./src/screens/ProjectsScreen";

type MainTab = "COMMONS" | "CLUBS" | "PROJECTS" | "PROFILE";

export default function App() {
  const mockUsers = getMockUsers();
  const [selectedMockUserId, setSelectedMockUserId] = useState(mockUsers[0].userId);
  const [activeTab, setActiveTab] = useState<MainTab>("COMMONS");
  const [clubsRootResetSignal, setClubsRootResetSignal] = useState(0);
  const [users, setUsers] = useState<UserBasic[]>([]);
  const [profileFocusUserId, setProfileFocusUserId] = useState<string | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<GlobalSearchResult>({ users: [], clubs: [], projects: [] });
  const [searchResults, setSearchResults] = useState<GlobalSearchResult>({ users: [], clubs: [], projects: [] });
  const [searchExecuted, setSearchExecuted] = useState(false);

  const user = getCurrentUser(selectedMockUserId);

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
      setActiveTab("CLUBS");
    } else {
      setActiveTab("PROJECTS");
    }
    setSearchOpen(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.switcherLabel}>Local dev user:</Text>
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
      </View>

      <View style={styles.navRow}>
        <View style={styles.brandItem}>
          <Text style={styles.brandText}>SocialApp</Text>
        </View>
        {([
          ["COMMONS", "Commons"],
          ["CLUBS", "Clubs"],
          ["PROJECTS", "Projects"],
          ["PROFILE", "Profile"]
        ] as [MainTab, string][]).map(([tab, label]) => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                if (tab === "CLUBS" && activeTab === "CLUBS") {
                  setClubsRootResetSignal((value) => value + 1);
                }
                setActiveTab(tab);
              }}
              style={[styles.navItem, active && styles.navItemActive]}
            >
              <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
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

      {activeTab === "COMMONS" ? (
        <FeedScreen user={user} />
      ) : null}
      {activeTab === "CLUBS" ? <ClubsScreen user={user} rootResetSignal={clubsRootResetSignal} /> : null}
      {activeTab === "PROJECTS" ? <ProjectsScreen user={user} /> : null}
      {activeTab === "PROFILE" ? <ProfileScreen user={user} users={users} focusUserId={profileFocusUserId} /> : null}

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
    marginBottom: 6,
    color: "#444",
    fontSize: 12
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
  navTextActive: {
    color: "#fff"
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
