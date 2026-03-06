import { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { NotificationItem } from "../api/client";

type NotificationsScreenProps = {
  notifications: NotificationItem[];
  loading: boolean;
  message: string | null;
  onRefresh: () => Promise<void> | void;
  readIds: Record<string, true>;
  onMarkRead: (notificationId: string) => void;
  onOpenNotification?: (item: NotificationItem) => void;
};

export function NotificationsScreen({
  notifications,
  loading,
  message,
  onRefresh,
  readIds,
  onMarkRead,
  onOpenNotification
}: NotificationsScreenProps) {

  const unreadCount = useMemo(
    () => notifications.filter((item) => !readIds[item.id]).length,
    [notifications, readIds]
  );

  function handlePressNotification(item: NotificationItem) {
    onMarkRead(item.id);
    onOpenNotification?.(item);
  }

  if (loading && notifications.length === 0) {
    return <ActivityIndicator style={{ marginTop: 28 }} />;
  }

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshing={loading}
      onRefresh={onRefresh}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <Text style={styles.hint}>Important activity related to you.</Text>
          <Text style={styles.hint}>{unreadCount} unread</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      }
      ListEmptyComponent={<Text style={styles.hint}>No notifications yet.</Text>}
      renderItem={({ item }) => {
        const unread = !readIds[item.id];
        return (
          <Pressable
            onPress={() => handlePressNotification(item)}
            style={[styles.card, unread && styles.cardUnread]}
          >
            <View style={styles.rowTop}>
              <Text style={styles.actor}>@{item.actorId}</Text>
              {unread ? <View style={styles.unreadDot} /> : null}
            </View>
            <Text style={styles.body}>{item.message}</Text>
            <Text style={styles.meta}>
              {item.relatedType}: {item.relatedId}
            </Text>
            <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString()}</Text>
            <Text style={styles.tapHint}>Tap to open</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
    gap: 10
  },
  headerBlock: {
    marginBottom: 8
  },
  sectionTitle: {
    fontWeight: "700",
    fontSize: 18,
    marginBottom: 4
  },
  hint: {
    color: "#666",
    marginBottom: 4
  },
  message: {
    color: "#0b57d0",
    marginTop: 4
  },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#fff"
  },
  cardUnread: {
    borderColor: "#0b57d0",
    backgroundColor: "#f4f8ff"
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  actor: {
    fontWeight: "700"
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0b57d0"
  },
  body: {
    color: "#222",
    marginBottom: 4
  },
  meta: {
    color: "#666",
    fontSize: 12
  },
  tapHint: {
    marginTop: 6,
    color: "#0b57d0",
    fontSize: 12,
    fontWeight: "600"
  }
});
