import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ClubWithCounts } from "../types/club";

type ClubCardProps = {
  club: ClubWithCounts;
  selected?: boolean;
  onPress?: () => void;
};

export function ClubCard({ club, selected = false, onPress }: ClubCardProps) {
  const pendingJoinRequestCount =
    typeof club.pendingJoinRequestCount === "number" ? club.pendingJoinRequestCount : null;

  return (
    <Pressable onPress={onPress} style={[styles.card, selected ? styles.cardSelected : null]}>
      <Text style={[styles.title, selected ? styles.titleSelected : null]} numberOfLines={1}>
        {club.name}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Members: {typeof club.memberCount === "number" ? club.memberCount : "—"}</Text>
        {pendingJoinRequestCount !== null ? (
          <Text style={styles.metaText}>Join Requests: {pendingJoinRequestCount}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
    minWidth: 140
  },
  cardSelected: {
    backgroundColor: "#111",
    borderColor: "#111"
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333"
  },
  titleSelected: {
    color: "#fff"
  },
  metaRow: {
    marginTop: 4,
    gap: 2
  },
  metaText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666"
  }
});
