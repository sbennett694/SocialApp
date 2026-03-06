import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  Club,
  ClubMember,
  createPost,
  createClub,
  getCategories,
  getProjectClubLinks,
  getClubMembers,
  getClubProjects,
  getClubsFeed,
  getProjects,
  getUserClubs,
  joinClub,
  Post,
  Project,
  ProjectClubLink,
  reviewProjectClubLink,
  searchClubs,
  updateClubMemberRole,
  updateClub
} from "../api/client";
import { AuthUser } from "../auth/session";

type ClubsScreenProps = {
  user: AuthUser;
  rootResetSignal?: number;
};

type ClubProjectRequest = {
  project: Project;
  link: ProjectClubLink;
};

export function ClubsScreen({ user, rootResetSignal = 0 }: ClubsScreenProps) {
  const [clubsPageTab, setClubsPageTab] = useState<"MY_CLUBS" | "DISCOVER" | "CLUB_FEED">("MY_CLUBS");
  const [clubs, setClubs] = useState<Club[]>([]);
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [joinableClubs, setJoinableClubs] = useState<Club[]>([]);
  const [clubFeed, setClubFeed] = useState<Post[]>([]);
  const [detailClubFeed, setDetailClubFeed] = useState<Post[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const [clubSearch, setClubSearch] = useState("");
  const [discoverCategoryId, setDiscoverCategoryId] = useState("");
  const [discoverCategoryPickerOpen, setDiscoverCategoryPickerOpen] = useState(false);
  const [discoverCategorySearch, setDiscoverCategorySearch] = useState("");
  const [clubFeedFilterClubId, setClubFeedFilterClubId] = useState("");

  const [newClubTitle, setNewClubTitle] = useState("");
  const [newClubDescription, setNewClubDescription] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [newClubIsPublic, setNewClubIsPublic] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [editClubName, setEditClubName] = useState("");
  const [editClubDescription, setEditClubDescription] = useState("");
  const [editClubIsPublic, setEditClubIsPublic] = useState(true);

  const [viewingClub, setViewingClub] = useState<Club | null>(null);
  const [clubDetailTab, setClubDetailTab] = useState<"HIGHLIGHTS" | "MEMBERS" | "PROJECTS" | "PROJECT_REQUESTS">("HIGHLIGHTS");
  const [clubMembers, setClubMembers] = useState<ClubMember[]>([]);
  const [clubProjects, setClubProjects] = useState<Project[]>([]);
  const [clubProjectRequests, setClubProjectRequests] = useState<ClubProjectRequest[]>([]);
  const [clubDetailLoading, setClubDetailLoading] = useState(false);
  const [clubHighlightText, setClubHighlightText] = useState("");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setMessage(null);
    try {
      const [clubData, myClubData, joinableData, clubPosts, categoryData] = await Promise.all([
        searchClubs({ viewerId: user.userId, search: clubSearch }),
        getUserClubs(user.userId),
        searchClubs({ viewerId: user.userId, search: clubSearch, joinableOnly: true }),
        getClubsFeed(user.userId, clubFeedFilterClubId || undefined),
        getCategories()
      ]);

      setClubs(clubData);
      setMyClubs(myClubData);
      setJoinableClubs(joinableData);
      setClubFeed(clubPosts);
      setCategories(categoryData.categories);

      if (!selectedCategoryId && categoryData.categories.length > 0) {
        setSelectedCategoryId(categoryData.categories[0].id);
      }
      if (!discoverCategoryId && categoryData.categories.length > 0) {
        setDiscoverCategoryId(categoryData.categories[0].id);
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user.userId, clubSearch, clubFeedFilterClubId]);

  useEffect(() => {
    setViewingClub(null);
    setClubFeedFilterClubId("");
    setClubsPageTab("MY_CLUBS");
  }, [rootResetSignal]);

  async function handleJoinClub(clubId: string, clubName: string) {
    try {
      await joinClub(clubId, user.userId);
      setMessage(`Joined ${clubName}`);
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleCreateClub() {
    if (!newClubTitle.trim() || !selectedCategoryId) {
      setMessage("Club title and category are required.");
      return;
    }

    try {
      await createClub({
        ownerId: user.userId,
        categoryId: selectedCategoryId,
        name: newClubTitle.trim(),
        description: newClubDescription.trim() || undefined,
        isPublic: newClubIsPublic
      });
      setNewClubTitle("");
      setNewClubDescription("");
      setCreateModalOpen(false);
      setMessage("Club created successfully.");
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function openClubDetail(club: Club) {
    setViewingClub(club);
    setClubDetailTab("HIGHLIGHTS");
    setClubDetailLoading(true);
    try {
      const [members, projects, clubPosts] = await Promise.all([
        getClubMembers(club.id),
        getClubProjects(club.id),
        getClubsFeed(user.userId, club.id)
      ]);
      setClubMembers(members);
      setClubProjects(projects);
      setDetailClubFeed(clubPosts);

      const viewerRole = members.find((member) => member.userId === user.userId)?.role;
      const canManage = viewerRole === "OWNER" || viewerRole === "MODERATOR";

      if (!canManage) {
        setClubProjectRequests([]);
        return;
      }

      const allProjects = await getProjects();
      const pendingRequests = (
        await Promise.all(
          allProjects.map(async (project) => {
            const links = await getProjectClubLinks(project.id, user.userId);
            const pendingLink = links.find((link) => link.clubId === club.id && link.status === "PENDING");
            if (!pendingLink) return null;
            return { project, link: pendingLink };
          })
        )
      ).filter((entry): entry is ClubProjectRequest => !!entry);

      pendingRequests.sort((a, b) => b.link.createdAt.localeCompare(a.link.createdAt));
      setClubProjectRequests(pendingRequests);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setClubDetailLoading(false);
    }
  }

  async function handleReviewClubProjectRequest(projectId: string, status: "APPROVED" | "REJECTED") {
    if (!viewingClub) return;
    try {
      await reviewProjectClubLink({
        projectId,
        clubId: viewingClub.id,
        actorId: user.userId,
        status
      });
      setMessage(status === "APPROVED" ? "Project request approved." : "Project request rejected.");
      await openClubDetail(viewingClub);
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handlePostClubHighlight() {
    if (!viewingClub || !clubHighlightText.trim()) {
      setMessage("Club highlight text is required.");
      return;
    }
    try {
      await createPost({
        userId: user.userId,
        text: clubHighlightText.trim(),
        visibility: "CLUB",
        clubId: viewingClub.id,
        postedAsClub: true,
        clubActorId: user.userId,
        tags: ["SHOWCASE"]
      });
      setClubHighlightText("");
      setMessage("Club highlight posted.");
      await openClubDetail(viewingClub);
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleSetMemberRole(memberId: string, role: "MEMBER" | "MODERATOR") {
    if (!viewingClub) return;
    try {
      await updateClubMemberRole({
        clubId: viewingClub.id,
        memberId,
        actorId: user.userId,
        role
      });
      setMessage(`Updated @${memberId} role to ${role}.`);
      await openClubDetail(viewingClub);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  function openEditModal(club: Club) {
    setEditingClub(club);
    setEditClubName(club.name);
    setEditClubDescription(club.description ?? "");
    setEditClubIsPublic(club.isPublic !== false);
    setEditModalOpen(true);
  }

  async function handleSaveClubEdit() {
    if (!editingClub) return;
    if (!editClubName.trim()) {
      setMessage("Club name is required.");
      return;
    }

    try {
      await updateClub({
        clubId: editingClub.id,
        viewerId: user.userId,
        name: editClubName.trim(),
        description: editClubDescription.trim(),
        isPublic: editClubIsPublic
      });
      setEditModalOpen(false);
      setEditingClub(null);
      setMessage("Club updated.");
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  const discoverCategoryFilteredClubs = useMemo(
    () => (discoverCategoryId ? clubs.filter((club) => club.categoryId === discoverCategoryId) : clubs),
    [clubs, discoverCategoryId]
  );
  const discoverCategoryFilteredJoinable = useMemo(
    () => (discoverCategoryId ? joinableClubs.filter((club) => club.categoryId === discoverCategoryId) : joinableClubs),
    [joinableClubs, discoverCategoryId]
  );
  const featuredDiscoverCategories = useMemo(() => categories.slice(0, 4), [categories]);
  const discoverSelectedCategory = useMemo(
    () => categories.find((category) => category.id === discoverCategoryId) ?? null,
    [categories, discoverCategoryId]
  );
  const discoverModalCategories = useMemo(() => {
    const query = discoverCategorySearch.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter((category) => category.name.toLowerCase().includes(query));
  }, [categories, discoverCategorySearch]);

  const isInitialLoad =
    loading &&
    clubs.length === 0 &&
    myClubs.length === 0 &&
    joinableClubs.length === 0 &&
    clubFeed.length === 0 &&
    !viewingClub;

  if (isInitialLoad) return <ActivityIndicator style={{ marginTop: 24 }} />;

  const ownerMembers = clubMembers.filter((member) => member.role === "OWNER");
  const nonOwnerMembers = clubMembers.filter((member) => member.role !== "OWNER");
  const viewerMembership = viewingClub
    ? clubMembers.find((member) => member.clubId === viewingClub.id && member.userId === user.userId)
    : null;
  const canManageClub = viewerMembership?.role === "OWNER" || viewerMembership?.role === "MODERATOR";
  const isOwner = viewerMembership?.role === "OWNER";

  if (viewingClub) {
    return (
      <FlatList
        data={[]}
        keyExtractor={(_, index) => `club-detail-${index}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Pressable onPress={() => setViewingClub(null)} style={styles.buttonInline}>
              <Text style={styles.buttonText}>← Back to Clubs</Text>
            </Pressable>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{viewingClub.name}</Text>
              <Text style={styles.hint}>Founder: @{viewingClub.ownerId ?? "unknown"}</Text>
              <Text style={styles.hint}>{viewingClub.description || "No club description yet."}</Text>
            </View>

            <View style={styles.rowWrap}>
              <Pressable
                onPress={() => setClubDetailTab("HIGHLIGHTS")}
                style={[styles.pill, clubDetailTab === "HIGHLIGHTS" && styles.pillActive]}
              >
                <Text style={[styles.pillText, clubDetailTab === "HIGHLIGHTS" && styles.pillTextActive]}>Highlights</Text>
              </Pressable>
              <Pressable
                onPress={() => setClubDetailTab("MEMBERS")}
                style={[styles.pill, clubDetailTab === "MEMBERS" && styles.pillActive]}
              >
                <Text style={[styles.pillText, clubDetailTab === "MEMBERS" && styles.pillTextActive]}>Members</Text>
              </Pressable>
              <Pressable
                onPress={() => setClubDetailTab("PROJECTS")}
                style={[styles.pill, clubDetailTab === "PROJECTS" && styles.pillActive]}
              >
                <Text style={[styles.pillText, clubDetailTab === "PROJECTS" && styles.pillTextActive]}>Projects</Text>
              </Pressable>
              {canManageClub ? (
                <Pressable
                  onPress={() => setClubDetailTab("PROJECT_REQUESTS")}
                  style={[styles.pill, clubDetailTab === "PROJECT_REQUESTS" && styles.pillActive]}
                >
                  <Text style={[styles.pillText, clubDetailTab === "PROJECT_REQUESTS" && styles.pillTextActive]}>
                    Project Requests
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {clubDetailLoading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}

            {clubDetailTab === "HIGHLIGHTS" ? (
              <>
                <Text style={styles.sectionTitle}>Club Highlights</Text>
                {canManageClub ? (
                  <View style={styles.card}>
                    <Text style={styles.filterLabel}>Post highlight as club</Text>
                    <TextInput
                      value={clubHighlightText}
                      onChangeText={setClubHighlightText}
                      placeholder="Share a club highlight"
                      style={styles.input}
                    />
                    <Pressable onPress={handlePostClubHighlight} style={styles.buttonInline}>
                      <Text style={styles.buttonText}>Post as @{viewingClub.name}</Text>
                    </Pressable>
                  </View>
                ) : null}
                {detailClubFeed.length === 0 ? <Text style={styles.hint}>No club posts yet.</Text> : null}
                {detailClubFeed.map((post) => (
                  <View key={`club-feed-${post.postId}`} style={styles.card}>
                    <Text style={styles.clubName}>
                      {post.postedAsClub ? `@${viewingClub.name} by ${post.clubActorId ?? post.userId}` : `@${post.userId}`}
                    </Text>
                    <Text>{post.text}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {clubDetailTab === "MEMBERS" ? (
              <>
                <Text style={styles.sectionTitle}>Club Members</Text>
                <Text style={styles.filterLabel}>Owner</Text>
                {ownerMembers.map((member) => (
                  <View key={`${member.clubId}-${member.userId}`} style={styles.card}>
                    <Text style={styles.clubName}>@{member.userId}</Text>
                    <Text style={styles.hint}>{member.role}</Text>
                  </View>
                ))}

                <Text style={styles.filterLabel}>Members</Text>
                {nonOwnerMembers.length === 0 ? <Text style={styles.hint}>No members found yet.</Text> : null}
                {nonOwnerMembers.map((member) => (
                  <View key={`${member.clubId}-${member.userId}`} style={styles.card}>
                    <Text style={styles.clubName}>@{member.userId}</Text>
                    <Text style={styles.hint}>{member.role}</Text>
                    {isOwner ? (
                      <View style={styles.rowWrap}>
                        <Pressable
                          onPress={() => handleSetMemberRole(member.userId, "MODERATOR")}
                          style={[styles.pill, member.role === "MODERATOR" && styles.pillActive]}
                        >
                          <Text style={[styles.pillText, member.role === "MODERATOR" && styles.pillTextActive]}>Admin</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleSetMemberRole(member.userId, "MEMBER")}
                          style={[styles.pill, member.role === "MEMBER" && styles.pillActive]}
                        >
                          <Text style={[styles.pillText, member.role === "MEMBER" && styles.pillTextActive]}>Member</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </>
            ) : null}

            {clubDetailTab === "PROJECTS" ? (
              <>
                <Text style={styles.sectionTitle}>Projects</Text>
                {clubProjects.length === 0 ? <Text style={styles.hint}>No approved projects linked to this club yet.</Text> : null}
                {clubProjects.map((item) => (
                  <View key={`club-project-${item.id}`} style={styles.card}>
                    <Text style={styles.clubName}>{item.title}</Text>
                    <Text style={styles.hint}>{item.description || "No description"}</Text>
                    <Text style={styles.hint}>Owner: @{item.ownerId}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {clubDetailTab === "PROJECT_REQUESTS" ? (
              <>
                <Text style={styles.sectionTitle}>Project Requests</Text>
                {canManageClub && clubProjectRequests.length === 0 ? <Text style={styles.hint}>No pending project requests.</Text> : null}
                {canManageClub
                  ? clubProjectRequests.map((request) => (
                      <View key={`club-request-${request.project.id}`} style={styles.card}>
                        <Text style={styles.clubName}>{request.project.title}</Text>
                        <Text style={styles.hint}>Owner: @{request.project.ownerId}</Text>
                        {request.project.description ? <Text style={styles.hint}>{request.project.description}</Text> : null}
                        <Text style={styles.hint}>Requested: {new Date(request.link.createdAt).toLocaleString()}</Text>
                        <View style={styles.rowWrap}>
                          <Pressable
                            onPress={() => handleReviewClubProjectRequest(request.project.id, "APPROVED")}
                            style={styles.buttonInline}
                          >
                            <Text style={styles.buttonText}>Approve</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleReviewClubProjectRequest(request.project.id, "REJECTED")}
                            style={styles.buttonInline}
                          >
                            <Text style={styles.buttonText}>Reject</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  : <Text style={styles.hint}>Only club owner/admin can review requests.</Text>}
              </>
            ) : null}
          </View>
        }
        renderItem={() => null}
      />
    );
  }

  return (
    <>
      <View style={styles.list}>
        <Text style={styles.sectionTitle}>Clubs</Text>
        <Text style={styles.hint}>View your clubs, discover clubs to join, and browse club activity.</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.rowWrap}>
          <Pressable onPress={() => setClubsPageTab("MY_CLUBS")} style={[styles.pill, clubsPageTab === "MY_CLUBS" && styles.pillActive]}>
            <Text style={[styles.pillText, clubsPageTab === "MY_CLUBS" && styles.pillTextActive]}>My Clubs</Text>
          </Pressable>
          <Pressable onPress={() => setClubsPageTab("DISCOVER")} style={[styles.pill, clubsPageTab === "DISCOVER" && styles.pillActive]}>
            <Text style={[styles.pillText, clubsPageTab === "DISCOVER" && styles.pillTextActive]}>Discover</Text>
          </Pressable>
          <Pressable onPress={() => setClubsPageTab("CLUB_FEED")} style={[styles.pill, clubsPageTab === "CLUB_FEED" && styles.pillActive]}>
            <Text style={[styles.pillText, clubsPageTab === "CLUB_FEED" && styles.pillTextActive]}>Club Feed</Text>
          </Pressable>
        </View>
      </View>

      {clubsPageTab === "MY_CLUBS" ? (
        <FlatList
          data={myClubs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={loadData}
          ListHeaderComponent={
            <View>
              <Pressable onPress={() => setCreateModalOpen(true)} style={styles.button}>
                <Text style={styles.buttonText}>Create a Club</Text>
              </Pressable>
              <Text style={styles.hint}>Clubs you are currently part of.</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.hint}>You are not in any clubs yet.</Text>}
          renderItem={({ item }) => {
            const isOwnerClub = item.ownerId === user.userId;
            return (
              <View style={styles.card}>
                <Text style={styles.clubName}>{item.name}</Text>
                <Text style={styles.hint}>{item.description || "No description yet"}</Text>
                <View style={styles.rowWrap}>
                  <Pressable onPress={() => openClubDetail(item)} style={styles.pill}>
                    <Text style={styles.pillText}>View Club</Text>
                  </Pressable>
                  {isOwnerClub ? (
                    <Pressable onPress={() => openEditModal(item)} style={styles.pill}>
                      <Text style={styles.pillText}>Modify Info</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      ) : null}

      {clubsPageTab === "DISCOVER" ? (
        <FlatList
          data={discoverCategoryFilteredJoinable}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={loadData}
          ListHeaderComponent={
            <View>
              <Text style={styles.sectionTitle}>Discover Clubs</Text>
              <TextInput
                value={clubSearch}
                onChangeText={setClubSearch}
                placeholder="Search clubs or categories"
                style={styles.input}
              />
              <Text style={styles.filterLabel}>Category</Text>
              <View style={styles.rowWrap}>
                <Pressable onPress={() => setDiscoverCategoryId("")} style={[styles.pill, discoverCategoryId === "" && styles.pillActive]}>
                  <Text style={[styles.pillText, discoverCategoryId === "" && styles.pillTextActive]}>All</Text>
                </Pressable>
                {featuredDiscoverCategories.map((category) => {
                  const active = discoverCategoryId === category.id;
                  return (
                    <Pressable
                      key={`discover-category-${category.id}`}
                      onPress={() => setDiscoverCategoryId(category.id)}
                      style={[styles.pill, active && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{category.name}</Text>
                    </Pressable>
                  );
                })}
                {discoverSelectedCategory && !featuredDiscoverCategories.some((category) => category.id === discoverSelectedCategory.id) ? (
                  <Pressable
                    onPress={() => setDiscoverCategoryPickerOpen(true)}
                    style={[styles.pill, styles.pillActive]}
                  >
                    <Text style={[styles.pillText, styles.pillTextActive]}>{discoverSelectedCategory.name}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    setDiscoverCategorySearch("");
                    setDiscoverCategoryPickerOpen(true);
                  }}
                  style={styles.pill}
                >
                  <Text style={styles.pillText}>Filter</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>Matching Clubs</Text>
              {discoverCategoryFilteredClubs.slice(0, 8).map((club) => (
                <View key={`discover-preview-${club.id}`} style={styles.card}>
                  <Text style={styles.clubName}>{club.name}</Text>
                  <Text style={styles.hint}>{club.description || "No description"}</Text>
                </View>
              ))}

              <Text style={styles.sectionTitle}>Available to Join</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.hint}>No clubs available to join for this filter.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.clubName}>{item.name}</Text>
              <Text style={styles.hint}>{item.description || "User-created club"}</Text>
              <Pressable onPress={() => handleJoinClub(item.id, item.name)} style={styles.button}>
                <Text style={styles.buttonText}>Join Club</Text>
              </Pressable>
            </View>
          )}
        />
      ) : null}

      {clubsPageTab === "CLUB_FEED" ? (
        <FlatList
          data={clubFeed}
          keyExtractor={(item) => item.postId}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={loadData}
          ListHeaderComponent={
            <View>
              <Text style={styles.sectionTitle}>Club Feed</Text>
              <Text style={styles.hint}>Recent club-related posts and activity.</Text>
              <Text style={styles.filterLabel}>Filter by Club</Text>
              <View style={styles.rowWrap}>
                <Pressable
                  onPress={() => setClubFeedFilterClubId("")}
                  style={[styles.pill, clubFeedFilterClubId === "" && styles.pillActive]}
                >
                  <Text style={[styles.pillText, clubFeedFilterClubId === "" && styles.pillTextActive]}>All Clubs</Text>
                </Pressable>
                {myClubs.slice(0, 20).map((club) => {
                  const active = clubFeedFilterClubId === club.id;
                  return (
                    <Pressable
                      key={`feed-filter-${club.id}`}
                      onPress={() => setClubFeedFilterClubId(club.id)}
                      style={[styles.pill, active && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{club.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.hint}>No club posts yet. Join clubs to see activity.</Text>}
          renderItem={({ item: post }) => (
            <View style={styles.card}>
              <Text style={styles.clubName}>@{post.userId}</Text>
              <Text>{post.text}</Text>
            </View>
          )}
        />
      ) : null}

      <Modal
        visible={discoverCategoryPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDiscoverCategoryPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.categoryModalCard]}>
            <Text style={styles.sectionTitle}>Select Category</Text>
            <TextInput
              value={discoverCategorySearch}
              onChangeText={setDiscoverCategorySearch}
              placeholder="Search categories"
              style={styles.input}
            />

            <Pressable
              onPress={() => {
                setDiscoverCategoryId("");
                setDiscoverCategoryPickerOpen(false);
              }}
              style={[styles.categoryRow, discoverCategoryId === "" && styles.categoryRowActive]}
            >
              <Text style={[styles.categoryRowText, discoverCategoryId === "" && styles.categoryRowTextActive]}>All</Text>
            </Pressable>

            <FlatList
              data={discoverModalCategories}
              keyExtractor={(item) => item.id}
              style={styles.categoryList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.hint}>No categories match your search.</Text>}
              renderItem={({ item }) => {
                const active = discoverCategoryId === item.id;
                return (
                  <Pressable
                    onPress={() => {
                      setDiscoverCategoryId(item.id);
                      setDiscoverCategoryPickerOpen(false);
                    }}
                    style={[styles.categoryRow, active && styles.categoryRowActive]}
                  >
                    <Text style={[styles.categoryRowText, active && styles.categoryRowTextActive]}>{item.name}</Text>
                  </Pressable>
                );
              }}
            />

            <Pressable onPress={() => setDiscoverCategoryPickerOpen(false)} style={styles.buttonInline}>
              <Text style={styles.buttonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={createModalOpen} transparent animationType="fade" onRequestClose={() => setCreateModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Create a Club</Text>
            <TextInput value={newClubTitle} onChangeText={setNewClubTitle} placeholder="Club title" style={styles.input} />
            <TextInput
              value={newClubDescription}
              onChangeText={setNewClubDescription}
              placeholder="Description (optional)"
              style={styles.input}
            />

            <Text style={styles.filterLabel}>Category</Text>
            <View style={styles.rowWrap}>
              {categories.map((item) => {
                const active = selectedCategoryId === item.id;
                return (
                  <Pressable key={`create-${item.id}`} onPress={() => setSelectedCategoryId(item.id)} style={[styles.pill, active && styles.pillActive]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{item.name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.rowWrap}>
              <Pressable onPress={() => setNewClubIsPublic(true)} style={[styles.pill, newClubIsPublic && styles.pillActive]}>
                <Text style={[styles.pillText, newClubIsPublic && styles.pillTextActive]}>Public</Text>
              </Pressable>
              <Pressable onPress={() => setNewClubIsPublic(false)} style={[styles.pill, !newClubIsPublic && styles.pillActive]}>
                <Text style={[styles.pillText, !newClubIsPublic && styles.pillTextActive]}>Private</Text>
              </Pressable>
            </View>

            <View style={styles.rowWrap}>
              <Pressable onPress={handleCreateClub} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Post Club</Text>
              </Pressable>
              <Pressable onPress={() => setCreateModalOpen(false)} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editModalOpen} transparent animationType="fade" onRequestClose={() => setEditModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Modify Club</Text>
            <TextInput value={editClubName} onChangeText={setEditClubName} placeholder="Club title" style={styles.input} />
            <TextInput value={editClubDescription} onChangeText={setEditClubDescription} placeholder="Description" style={styles.input} />

            <View style={styles.rowWrap}>
              <Pressable onPress={() => setEditClubIsPublic(true)} style={[styles.pill, editClubIsPublic && styles.pillActive]}>
                <Text style={[styles.pillText, editClubIsPublic && styles.pillTextActive]}>Public</Text>
              </Pressable>
              <Pressable onPress={() => setEditClubIsPublic(false)} style={[styles.pill, !editClubIsPublic && styles.pillActive]}>
                <Text style={[styles.pillText, !editClubIsPublic && styles.pillTextActive]}>Private</Text>
              </Pressable>
            </View>

            <View style={styles.rowWrap}>
              <Pressable onPress={handleSaveClubEdit} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setEditModalOpen(false)} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8
  },
  filterLabel: {
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 6
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8
  },
  pill: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  pillActive: {
    backgroundColor: "#111",
    borderColor: "#111"
  },
  pillText: { fontSize: 12, fontWeight: "600", color: "#333" },
  pillTextActive: { color: "#fff" },
  sectionTitle: { fontWeight: "700", fontSize: 18, marginBottom: 6 },
  hint: { color: "#666", marginBottom: 8 },
  message: { color: "#0b57d0", marginBottom: 10 },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8
  },
  clubName: { fontWeight: "600", marginBottom: 6 },
  button: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center"
  },
  buttonInline: {
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    maxHeight: "85%"
  },
  categoryModalCard: {
    maxHeight: "80%"
  },
  categoryList: {
    marginBottom: 12
  },
  categoryRow: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8
  },
  categoryRowActive: {
    backgroundColor: "#111",
    borderColor: "#111"
  },
  categoryRowText: {
    fontWeight: "600",
    color: "#222"
  },
  categoryRowTextActive: {
    color: "#fff"
  },
  buttonText: { fontWeight: "600" }
});
