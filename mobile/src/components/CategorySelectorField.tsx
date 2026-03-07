import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type CategoryOption = { id: string; name: string };

type CategorySelectorFieldProps = {
  label?: string;
  categories: CategoryOption[];
  selectedCategoryId: string;
  associatedCategoryIds?: string[];
  onSelectCategory: (categoryId: string) => void;
};

const sessionRecentCategoryIds: string[] = [];

function trackRecentCategory(categoryId: string) {
  const withoutCurrent = sessionRecentCategoryIds.filter((item) => item !== categoryId);
  sessionRecentCategoryIds.splice(0, sessionRecentCategoryIds.length, categoryId, ...withoutCurrent);
  if (sessionRecentCategoryIds.length > 6) {
    sessionRecentCategoryIds.length = 6;
  }
}

function getFallbackSuggestedCategoryIds(categories: CategoryOption[]): string[] {
  const keywordPriority = ["music", "fitness", "gaming", "art", "travel", "food"];
  const byKeyword = keywordPriority
    .map((keyword) => categories.find((item) => item.name.toLowerCase().includes(keyword))?.id)
    .filter((value): value is string => !!value);

  const ordered = [...new Set([...byKeyword, ...categories.slice(0, 4).map((item) => item.id)])];
  return ordered.slice(0, 4);
}

export function CategorySelectorField({
  label = "Category",
  categories,
  selectedCategoryId,
  associatedCategoryIds = [],
  onSelectCategory
}: CategorySelectorFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((item) => item.name.toLowerCase().includes(q));
  }, [categories, query]);

  const suggestedCategoryIds = useMemo(() => {
    const ids: string[] = [];

    if (selectedCategoryId && categories.some((item) => item.id === selectedCategoryId)) {
      ids.push(selectedCategoryId);
    }

    sessionRecentCategoryIds.forEach((id) => {
      if (!ids.includes(id) && categories.some((item) => item.id === id)) {
        ids.push(id);
      }
    });

    associatedCategoryIds.forEach((id) => {
      if (!ids.includes(id) && categories.some((item) => item.id === id)) {
        ids.push(id);
      }
    });

    getFallbackSuggestedCategoryIds(categories).forEach((id) => {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    });

    return ids.slice(0, 6);
  }, [associatedCategoryIds, categories, selectedCategoryId]);

  const suggestedCategories = useMemo(
    () => suggestedCategoryIds
      .map((id) => categories.find((item) => item.id === id))
      .filter((item): item is CategoryOption => !!item),
    [categories, suggestedCategoryIds]
  );

  const showSuggestedSection = query.trim().length === 0 && suggestedCategories.length > 0;

  const visibleList = useMemo(() => {
    if (!showSuggestedSection) return filtered;
    const suggestedSet = new Set(suggestedCategories.map((item) => item.id));
    return filtered.filter((item) => !suggestedSet.has(item.id));
  }, [filtered, showSuggestedSection, suggestedCategories]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.trigger}>
        <Text style={styles.triggerText}>{selectedCategory?.name ?? "Select Category"}</Text>
        <Text style={styles.triggerChevron}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      {open ? (
        <View style={styles.dropdown}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search categories"
            style={styles.searchInput}
          />

          {showSuggestedSection ? (
            <>
              <Text style={styles.sectionLabel}>Suggested Categories</Text>
              <View style={styles.suggestedWrap}>
                {suggestedCategories.map((item) => {
                  const active = selectedCategoryId === item.id;
                  return (
                    <Pressable
                      key={`suggested-${item.id}`}
                      onPress={() => {
                        onSelectCategory(item.id);
                        trackRecentCategory(item.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      style={[styles.suggestedPill, active && styles.suggestedPillActive]}
                    >
                      <Text style={[styles.suggestedPillText, active && styles.suggestedPillTextActive]}>{item.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.sectionLabel}>All Categories</Text>
            </>
          ) : null}

          <FlatList
            data={visibleList}
            keyExtractor={(item) => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.emptyText}>No categories found.</Text>}
            renderItem={({ item }) => {
              const active = selectedCategoryId === item.id;
              return (
                <Pressable
                  onPress={() => {
                    onSelectCategory(item.id);
                    trackRecentCategory(item.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  style={[styles.optionRow, active && styles.optionRowActive]}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{item.name}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8
  },
  label: {
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 6
  },
  trigger: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  triggerText: {
    fontSize: 14,
    color: "#222",
    flexShrink: 1,
    marginRight: 8
  },
  triggerChevron: {
    fontSize: 11,
    color: "#555"
  },
  dropdown: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    marginTop: 8,
    padding: 8,
    backgroundColor: "#fff"
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8
  },
  list: {
    maxHeight: 220
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#555",
    marginBottom: 6
  },
  suggestedWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8
  },
  suggestedPill: {
    borderWidth: 1,
    borderColor: "#b8b8b8",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  suggestedPillActive: {
    borderColor: "#111",
    backgroundColor: "#111"
  },
  suggestedPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#222"
  },
  suggestedPillTextActive: {
    color: "#fff"
  },
  optionRow: {
    borderWidth: 1,
    borderColor: "#e1e1e1",
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 8
  },
  optionRowActive: {
    backgroundColor: "#111",
    borderColor: "#111"
  },
  optionText: {
    fontWeight: "600",
    color: "#222"
  },
  optionTextActive: {
    color: "#fff"
  },
  emptyText: {
    color: "#666",
    paddingVertical: 6
  }
});
