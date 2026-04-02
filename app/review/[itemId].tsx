import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StarRating } from "@/components/star-rating";
import { fetchReviews, submitReview, Review } from "@/lib/api";

// Placeholder user ID until auth is implemented
const TEMP_USER_ID = 1;

export default function ReviewScreen() {
  const { itemId, itemName } = useLocalSearchParams<{
    itemId: string;
    itemName: string;
  }>();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadReviews = async () => {
    try {
      const data = await fetchReviews(parseInt(itemId));
      setReviews(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [itemId]);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert("Rating required", "Please select a star rating.");
      return;
    }

    setSubmitting(true);
    try {
      await submitReview({
        user_id: TEMP_USER_ID,
        menu_item_id: parseInt(itemId),
        rating,
        text: text.trim() || undefined,
      });
      setRating(0);
      setText("");
      await loadReviews();
    } catch (err) {
      Alert.alert("Error", "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderReview = ({ item }: { item: Review }) => (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <ThemedText style={styles.username}>{item.username}</ThemedText>
        <StarRating rating={item.rating} size={14} />
      </View>
      {item.text && <ThemedText style={styles.reviewText}>{item.text}</ThemedText>}
      <ThemedText style={styles.date}>
        {new Date(item.created_at).toLocaleDateString()}
      </ThemedText>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: itemName || "Review", headerShown: true }} />
      <ThemedView style={styles.container}>
        {/* Review form */}
        <ThemedView style={styles.formCard}>
          <ThemedText type="subtitle">Rate this item</ThemedText>
          <StarRating
            rating={rating}
            size={32}
            interactive
            onRate={setRating}
          />
          <TextInput
            style={styles.input}
            placeholder="Write a short review (optional)"
            placeholderTextColor="#999"
            value={text}
            onChangeText={setText}
            maxLength={500}
            multiline
            numberOfLines={3}
          />
          <Pressable
            style={[styles.submitButton, rating === 0 && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={rating === 0 || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.submitText}>Submit Review</ThemedText>
            )}
          </Pressable>
        </ThemedView>

        {/* Reviews list */}
        <ThemedText type="subtitle" style={styles.reviewsTitle}>
          Reviews ({reviews.length})
        </ThemedText>

        {loading ? (
          <ActivityIndicator size="large" color="#500000" style={styles.loader} />
        ) : reviews.length === 0 ? (
          <ThemedText style={styles.emptyText}>
            No reviews yet. Be the first!
          </ThemedText>
        ) : (
          <FlatList
            data={reviews}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderReview}
            contentContainerStyle={styles.reviewsList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  formCard: {
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
    color: "#333",
  },
  submitButton: {
    backgroundColor: "#500000",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  reviewsTitle: {
    marginBottom: 12,
  },
  reviewsList: {
    paddingBottom: 20,
  },
  reviewCard: {
    paddingVertical: 12,
    gap: 4,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  username: {
    fontWeight: "600",
    fontSize: 15,
  },
  reviewText: {
    fontSize: 14,
    opacity: 0.8,
    marginTop: 2,
  },
  date: {
    fontSize: 12,
    opacity: 0.4,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: "#e0e0e0",
  },
  loader: {
    marginTop: 20,
  },
  emptyText: {
    opacity: 0.5,
    textAlign: "center",
    marginTop: 20,
  },
});
