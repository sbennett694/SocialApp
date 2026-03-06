import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  Comment,
  createComment,
  createPost,
  getCommonsFeed,
  getComments,
  Post,
  ThreadType,
  Visibility
} from "../api/client";
import { config } from "../config";
import { AuthUser, getMockUsers } from "../auth/session";

const threadLabels: Record<ThreadType, string> = {
  COMMENTS: "Comments",
  QUESTIONS: "Questions",
  THANK_YOU: "Thank You",
  SUGGESTIONS: "Suggestions"
};

type CommonsScreenProps = {
  user: AuthUser;
};

export function FeedScreen({ user }: CommonsScreenProps) {
  const mockUsers = getMockUsers();
  const [posts, setPosts] = useState<Post[]>([]);
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
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentMessage, setCommentMessage] = useState<string | null>(null);

  async function loadComments(postId: string, threadType: ThreadType) {
    setCommentsLoading(true);
    setCommentMessage(null);
    try {
      const data = await getComments(postId, threadType);
      setComments(data);
    } catch (err) {
      setCommentMessage((err as Error).message);
    } finally {
      setCommentsLoading(false);
    }
  }

  async function loadFeed() {
    setLoading(true);
    setError(null);
    try {
      const data = await getCommonsFeed(user.userId);
      setPosts(data);
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

  async function handleCreatePost() {
    if (!newPostText.trim()) {
      setSubmitMessage("Post text is required.");
      return;
    }

    setSubmitting(true);
    setSubmitMessage(null);

    try {
      const created = await createPost({
        userId: user.userId,
        text: newPostText.trim(),
        visibility: selectedVisibility,
        tags: ["PROGRESS"]
      });
      setPosts((prev) => [created, ...prev]);
      setNewPostText("");
      setSubmitMessage("Post published.");
    } catch (err) {
      setSubmitMessage((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOpenThread(postId: string, threadType: ThreadType) {
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
      setCommentMessage("Comment posted.");
      loadComments(postId, threadType);
    } catch (err) {
      setCommentMessage((err as Error).message);
    }
  }

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} />;
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.postId}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.author}>
            {item.postedAsClub && item.clubId
              ? `@${item.clubId} by ${item.clubActorId ?? item.userId} - Highlight`
              : `@${item.userId}`}
          </Text>
          <Text>{item.text}</Text>
          <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString()}</Text>

          <View style={styles.threadCard}>
            <Text style={styles.switcherLabel}>Respond to this post:</Text>
            <View style={styles.mockUserButtons}>
              {(["COMMENTS", "QUESTIONS", "THANK_YOU", "SUGGESTIONS"] as ThreadType[]).map((threadType) => {
                const active = activePostId === item.postId && activeThreadType === threadType;
                return (
                  <Pressable
                    key={`${item.postId}-${threadType}`}
                    onPress={() => handleOpenThread(item.postId, threadType)}
                    style={[styles.userButton, active && styles.userButtonActive]}
                  >
                    <Text style={[styles.userButtonText, active && styles.userButtonTextActive]}>
                      {threadLabels[threadType]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {activePostId === item.postId ? (
              <>
                <TextInput
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder={`Add ${activeThreadType.toLowerCase()} response...`}
                  style={styles.commentInput}
                />
                {activeReplyParentId ? (
                  <Text style={styles.hint}>Replying to a response • tap “Cancel Reply” to post top-level</Text>
                ) : null}
                <Pressable onPress={() => handleAddComment(item.postId, activeThreadType)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Add Response</Text>
                </Pressable>
                {activeReplyParentId ? (
                  <Pressable onPress={() => setActiveReplyParentId(undefined)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Cancel Reply</Text>
                  </Pressable>
                ) : null}
                {commentMessage ? <Text style={styles.submitMessage}>{commentMessage}</Text> : null}
                {commentsLoading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
                {comments.map((comment) => (
                  <View key={comment.id} style={[styles.commentRow, { marginLeft: comment.depth * 14 }]}>
                    <Text style={styles.author}>@{comment.authorId}</Text>
                    <Text>{comment.textContent}</Text>
                    {user.userId === item.userId ? (
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
                  </View>
                ))}
              </>
            ) : null}
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.message}>No posts yet.</Text>}
      ListHeaderComponent={
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
  switcherRow: {
    marginBottom: 10
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
    alignItems: "center"
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
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e4",
    paddingTop: 12
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
    padding: 12
  },
  author: {
    fontWeight: "600",
    marginBottom: 6
  },
  meta: {
    marginTop: 8,
    color: "#666",
    fontSize: 12
  },
  message: {
    paddingHorizontal: 16,
    color: "#444"
  }
});
