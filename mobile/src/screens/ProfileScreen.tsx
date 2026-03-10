import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  blockUser,
  followUser,
  getCloseCircle,
  getCloseCircleInvites,
  getFollowers,
  getFollowing,
  getProfileSummary,
  getUserClubs,
  getUserPosts,
  getUserProjects,
  inviteCloseCircle,
  Post,
  Project,
  removeCloseCircle,
  respondCloseCircleInvite,
  unfollowUser,
  UserBasic,
  UserProfileSummary
} from "../api/client";
import { AuthUser } from "../auth/session";

type ProfileTab = "COMMONS" | "PROJECTS" | "CLUBS" | "NETWORK";

type ProfileScreenProps = {
  user: AuthUser;
  users: UserBasic[];
  focusUserId?: string;
  onNavigateToDetail?: (target: "COMMONS" | "CLUBS" | "PROJECTS", id?: string) => void;
};

function formatClubVisibilityLabel(isPublic: boolean | undefined): string {
  return isPublic === false ? "Private Club" : "Public Club";
}

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

export function ProfileScreen({ user, users, focusUserId, onNavigateToDetail }: ProfileScreenProps) {
  const [selectedProfileUserId, setSelectedProfileUserId] = useState(user.userId);
  const [profile, setProfile] = useState<UserProfileSummary | null>(null);
  const [commonsPosts, setCommonsPosts] = useState<Post[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clubs, setClubs] = useState<{ id: string; name: string; isPublic?: boolean }[]>([]);

  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [closeCircle, setCloseCircle] = useState<any[]>([]);
  const [invites, setInvites] = useState<{ incoming: any[]; outgoing: any[] }>({ incoming: [], outgoing: [] });

  const [tab, setTab] = useState<ProfileTab | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const userById = useMemo(() => new Map(users.map((item) => [item.id, item])), [users]);

  useEffect(() => {
    if (focusUserId) {
      setSelectedProfileUserId(focusUserId);
      setTab("ALL");
    }
  }, [focusUserId]);

  async function loadProfileData(targetUserId: string) {
    setLoading(true);
    setMessage(null);
    try {
      const [summary, userPosts, userProjects, userClubs] = await Promise.all([
        getProfileSummary(targetUserId),
        getUserPosts(targetUserId),
        getUserProjects(targetUserId),
        getUserClubs(targetUserId)
      ]);
      setProfile(summary);
      setCommonsPosts(userPosts);
      setProjects(userProjects);
      setClubs(userClubs);

      if (targetUserId === user.userId) {
        const [fwers, fwing, cc, inviteData] = await Promise.all([
          getFollowers(user.userId),
          getFollowing(user.userId),
          getCloseCircle(user.userId),
          getCloseCircleInvites(user.userId)
        ]);
        setFollowers(fwers);
        setFollowing(fwing);
        setCloseCircle(cc);
        setInvites(inviteData);
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfileData(selectedProfileUserId);
  }, [selectedProfileUserId, user.userId]);

  async function handleUnfollow(targetId: string) {
    try {
      await unfollowUser(user.userId, targetId);
      setMessage(`Unfollowed @${targetId}`);
      loadProfileData(selectedProfileUserId);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleFollow(targetId: string) {
    try {
      await followUser(user.userId, targetId);
      setMessage(`Following @${targetId}`);
      loadProfileData(selectedProfileUserId);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleInviteCloseCircle(targetId: string) {
    try {
      await inviteCloseCircle(user.userId, targetId);
      setMessage(`Close circle invite sent to @${targetId}`);
      loadProfileData(selectedProfileUserId);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleRemoveCloseCircle(targetId: string) {
    try {
      await removeCloseCircle(user.userId, targetId);
      setMessage(`Removed @${targetId} from close circle`);
      loadProfileData(selectedProfileUserId);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleBlock(targetId: string) {
    try {
      await blockUser(targetId, user.userId);
      setMessage(`Blocked @${targetId}`);
      loadProfileData(selectedProfileUserId);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleInviteResponse(inviterId: string, status: "ACCEPTED" | "DECLINED") {
    try {
      await respondCloseCircleInvite({ inviterId, inviteeId: user.userId, status });
      setMessage(`Invite ${status.toLowerCase()}.`);
      loadProfileData(selectedProfileUserId);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  function displayUser(id: string) {
    return userById.get(id)?.displayName ?? id;
  }

  function openUserContent(userId: string) {
    setSelectedProfileUserId(userId);
    setTab("ALL");
  }

  const allContentItems = useMemo(
    () => [
      ...commonsPosts.map((post) => ({
        id: `post-${post.postId}`,
        section: "Commons" as const,
        title: post.text,
        subtitle: `@${post.userId}`
      })),
      ...projects.map((project) => ({
        id: `project-${project.id}`,
        section: "Project" as const,
        title: project.title,
        subtitle: project.description || "No description",
        visibility: project.visibility
      })),
      ...clubs.map((club) => ({
        id: `club-${club.id}`,
        section: "Club" as const,
        title: club.name,
        subtitle: "Member club",
        isPublic: club.isPublic
      }))
    ],
    [commonsPosts, projects, clubs]
  );

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;

  const isOwnProfile = selectedProfileUserId === user.userId;

  return (
    <FlatList
      data={[]}
      renderItem={null}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>{profile?.displayName ?? user.displayName}</Text>
          <Text style={styles.subtitle}>@{profile?.handle ?? selectedProfileUserId}</Text>
          <Text style={styles.hint}>{profile?.bio ?? "Hobby enthusiast"}</Text>
          <Text style={styles.hint}>
            Followers {profile?.counts.followerCount ?? 0} • Following {profile?.counts.followingCount ?? 0} • Close Circle {profile?.counts.closeCircleCount ?? 0} • Projects {profile?.counts.projectCount ?? 0}
          </Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.tabRow}>
            {(["ALL", "COMMONS", "PROJECTS", "CLUBS", "NETWORK"] as Array<ProfileTab | "ALL">).map((tabName) => {
              const active = tab === tabName;
              return (
                <Pressable key={tabName} onPress={() => setTab(tabName)} style={[styles.pill, active && styles.pillActive]}>
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {tabName === "NETWORK" ? "Network" : tabName[0] + tabName.slice(1).toLowerCase()}
                  </Text>
                </Pressable>
              );
            })}
            {!isOwnProfile ? (
              <Pressable onPress={() => setSelectedProfileUserId(user.userId)} style={styles.pill}>
                <Text style={styles.pillText}>Back to My Profile</Text>
              </Pressable>
            ) : null}
          </View>

          {tab === "ALL" ? (
            <>
              {allContentItems.length === 0 ? <Text style={styles.hint}>No profile content yet.</Text> : null}
              {allContentItems.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.card}
                  onPress={() => {
                    if (item.section === "Commons") {
                      onNavigateToDetail?.("COMMONS", item.id.replace("post-", ""));
                    }
                    if (item.section === "Project") {
                      onNavigateToDetail?.("PROJECTS", item.id.replace("project-", ""));
                    }
                    if (item.section === "Club") {
                      onNavigateToDetail?.("CLUBS", item.id.replace("club-", ""));
                    }
                  }}
                >
                  <Text style={styles.sectionBadge}>{item.section}</Text>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.openHint}>Tap to open {item.section.toLowerCase()}</Text>
                  {item.section === "Project" ? (
                    <View style={styles.visibilityRow}>
                      <Text style={styles.hint}>Visibility:</Text>
                      <View style={styles.visibilityBadge}>
                        <Text style={styles.visibilityBadgeText}>{formatProjectVisibilityLabel((item as { visibility?: string }).visibility ?? "")}</Text>
                      </View>
                    </View>
                  ) : null}
                  {item.section === "Club" ? (
                    <View style={styles.visibilityRow}>
                      <Text style={styles.hint}>Visibility:</Text>
                      <View style={styles.visibilityBadge}>
                        <Text style={styles.visibilityBadgeText}>{formatClubVisibilityLabel((item as { isPublic?: boolean }).isPublic)}</Text>
                      </View>
                    </View>
                  ) : null}
                  <Text style={styles.hint}>{item.subtitle}</Text>
                </Pressable>
              ))}
            </>
          ) : null}

          {tab === "COMMONS" ? commonsPosts.map((post) => (
            <Pressable key={post.postId} style={styles.card} onPress={() => onNavigateToDetail?.("COMMONS", post.postId)}>
              <Text style={styles.cardTitle}>{post.text}</Text>
              <Text style={styles.openHint}>Tap to open commons</Text>
              <Text style={styles.hint}>@{post.userId}</Text>
            </Pressable>
          )) : null}

          {tab === "PROJECTS" ? projects.map((project) => (
            <Pressable key={project.id} style={styles.card} onPress={() => onNavigateToDetail?.("PROJECTS", project.id)}>
              <Text style={styles.cardTitle}>{project.title}</Text>
              <Text style={styles.openHint}>Tap to open project</Text>
              <View style={styles.visibilityRow}>
                <Text style={styles.hint}>Visibility:</Text>
                <View style={styles.visibilityBadge}>
                  <Text style={styles.visibilityBadgeText}>{formatProjectVisibilityLabel(project.visibility)}</Text>
                </View>
              </View>
              <Text>{project.description || "No description"}</Text>
            </Pressable>
          )) : null}

          {tab === "CLUBS" ? clubs.map((club) => (
            <Pressable key={club.id} style={styles.card} onPress={() => onNavigateToDetail?.("CLUBS", club.id)}>
              <Text style={styles.cardTitle}>{club.name}</Text>
              <Text style={styles.openHint}>Tap to open club</Text>
              <View style={styles.visibilityRow}>
                <Text style={styles.hint}>Visibility:</Text>
                <View style={styles.visibilityBadge}>
                  <Text style={styles.visibilityBadgeText}>{formatClubVisibilityLabel(club.isPublic)}</Text>
                </View>
              </View>
            </Pressable>
          )) : null}

          {tab === "NETWORK" ? (
            isOwnProfile ? (
              <View>
                <Text style={styles.sectionTitle}>Followers ({followers.length})</Text>
                {followers.map((f, idx) => (
                  <View key={`${f.followerId}-${idx}`} style={styles.card}>
                    <Pressable onPress={() => openUserContent(f.followerId)}>
                      <Text style={styles.cardTitle}>{displayUser(f.followerId)} (@{f.followerId})</Text>
                    </Pressable>
                    <View style={styles.actionRow}>
                      <Pressable onPress={() => handleFollow(f.followerId)} style={styles.actionButton}><Text style={styles.actionText}>Follow Back</Text></Pressable>
                      <Pressable onPress={() => handleBlock(f.followerId)} style={styles.actionButton}><Text style={styles.actionText}>Block</Text></Pressable>
                    </View>
                  </View>
                ))}

                <Text style={styles.sectionTitle}>Following ({following.length})</Text>
                {following.map((f, idx) => (
                  <View key={`${f.followeeId}-${idx}`} style={styles.card}>
                    <Pressable onPress={() => openUserContent(f.followeeId)}>
                      <Text style={styles.cardTitle}>{displayUser(f.followeeId)} (@{f.followeeId})</Text>
                    </Pressable>
                    <View style={styles.actionRow}>
                      <Pressable onPress={() => handleUnfollow(f.followeeId)} style={styles.actionButton}><Text style={styles.actionText}>Unfollow</Text></Pressable>
                      <Pressable onPress={() => handleInviteCloseCircle(f.followeeId)} style={styles.actionButton}><Text style={styles.actionText}>Invite Close Circle</Text></Pressable>
                    </View>
                  </View>
                ))}

                <Text style={styles.sectionTitle}>Close Circle ({closeCircle.length})</Text>
                {closeCircle.map((c, idx) => {
                  const otherId = c.inviterId === user.userId ? c.inviteeId : c.inviterId;
                  return (
                    <View key={`${c.inviterId}-${c.inviteeId}-${idx}`} style={styles.card}>
                      <Pressable onPress={() => openUserContent(otherId)}>
                        <Text style={styles.cardTitle}>{displayUser(otherId)} (@{otherId})</Text>
                      </Pressable>
                      <View style={styles.actionRow}>
                        <Pressable onPress={() => handleRemoveCloseCircle(otherId)} style={styles.actionButton}><Text style={styles.actionText}>Remove Close Circle</Text></Pressable>
                        <Pressable onPress={() => handleBlock(otherId)} style={styles.actionButton}><Text style={styles.actionText}>Block</Text></Pressable>
                      </View>
                    </View>
                  );
                })}

                <Text style={styles.sectionTitle}>Invites / Requests</Text>
                {invites.incoming.length === 0 ? <Text style={styles.hint}>No incoming invites.</Text> : null}
                {invites.incoming.map((invite, idx) => (
                  <View key={`${invite.inviterId}-${idx}`} style={styles.card}>
                    <Pressable onPress={() => openUserContent(invite.inviterId)}>
                      <Text style={styles.cardTitle}>From {displayUser(invite.inviterId)} (@{invite.inviterId})</Text>
                    </Pressable>
                    <View style={styles.actionRow}>
                      <Pressable onPress={() => handleInviteResponse(invite.inviterId, "ACCEPTED")} style={styles.actionButton}><Text style={styles.actionText}>Accept</Text></Pressable>
                      <Pressable onPress={() => handleInviteResponse(invite.inviterId, "DECLINED")} style={styles.actionButton}><Text style={styles.actionText}>Decline</Text></Pressable>
                    </View>
                  </View>
                ))}

                {invites.outgoing.length > 0 ? <Text style={styles.sectionTitle}>Outgoing</Text> : null}
                {invites.outgoing.map((invite, idx) => (
                  <View key={`${invite.inviteeId}-${idx}`} style={styles.card}>
                    <Pressable onPress={() => openUserContent(invite.inviteeId)}>
                      <Text style={styles.cardTitle}>To {displayUser(invite.inviteeId)} (@{invite.inviteeId})</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.hint}>Network management is available on your own profile.</Text>
            )
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { color: "#666", marginTop: 4 },
  hint: { color: "#666", marginTop: 6 },
  message: { color: "#0b57d0", marginTop: 8 },
  tabRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, marginBottom: 8 },
  pill: { borderWidth: 1, borderColor: "#aaa", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 10 },
  pillActive: { backgroundColor: "#111", borderColor: "#111" },
  pillText: { fontSize: 12, fontWeight: "600", color: "#333" },
  pillTextActive: { color: "#fff" },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 10, marginTop: 8 },
  sectionBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#c4c4c4",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    color: "#555",
    marginBottom: 6,
    fontWeight: "600"
  },
  cardTitle: { fontWeight: "600", marginBottom: 4 },
  openHint: { color: "#0b57d0", fontSize: 12, fontWeight: "600", marginBottom: 4 },
  visibilityRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  visibilityBadge: {
    borderWidth: 1,
    borderColor: "#a8c2ff",
    backgroundColor: "#eaf1ff",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8
  },
  visibilityBadgeText: { fontSize: 11, fontWeight: "700", color: "#1b2a57" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  actionButton: {
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: "center"
  },
  actionText: { fontWeight: "600", fontSize: 12 }
});
