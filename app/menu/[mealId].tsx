import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StarRating } from "@/components/star-rating";
import { fetchMenus, MealMenu, MenuItem } from "@/lib/api";

export default function MenuScreen() {
  const { mealId, hall, meal, data } = useLocalSearchParams<{
    mealId: string;
    hall: string;
    meal: string;
    data: string;
  }>();
  const router = useRouter();

  const [menu, setMenu] = useState<MealMenu | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (data) {
      try {
        setMenu(JSON.parse(data));
        setLoading(false);
        return;
      } catch {}
    }

    // Fallback: fetch from API
    const today = new Date().toISOString().split("T")[0];
    fetchMenus({ date: today, hall, meal })
      .then((menus) => {
        if (menus.length > 0) setMenu(menus[0]);
      })
      .finally(() => setLoading(false));
  }, [mealId]);

  const renderItem = ({ item }: { item: MenuItem }) => (
    <Pressable
      style={styles.itemRow}
      onPress={() =>
        router.push({
          pathname: "/review/[itemId]",
          params: {
            itemId: item.id.toString(),
            itemName: item.name,
          },
        })
      }
    >
      <View style={styles.itemInfo}>
        <ThemedText style={styles.itemName}>{item.name}</ThemedText>
        <View style={styles.ratingRow}>
          {item.avg_rating ? (
            <>
              <StarRating rating={item.avg_rating} size={14} />
              <ThemedText style={styles.ratingText}>
                {item.avg_rating.toFixed(1)} ({item.review_count})
              </ThemedText>
            </>
          ) : (
            <ThemedText style={styles.noRating}>No reviews yet</ThemedText>
          )}
        </View>
      </View>
      <ThemedText style={styles.chevron}>{"\u203A"}</ThemedText>
    </Pressable>
  );

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color="#500000" />
      </ThemedView>
    );
  }

  if (!menu || menu.items.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>No menu items found.</ThemedText>
      </ThemedView>
    );
  }

  const title = `${hall} - ${meal ? meal.charAt(0).toUpperCase() + meal.slice(1) : ""}`;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title, headerShown: true }} />
      <FlatList
        data={menu.items}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    padding: 16,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "500",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingText: {
    fontSize: 13,
    opacity: 0.6,
  },
  noRating: {
    fontSize: 13,
    opacity: 0.4,
    fontStyle: "italic",
  },
  chevron: {
    fontSize: 24,
    opacity: 0.3,
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: "#e0e0e0",
  },
});
