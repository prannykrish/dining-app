import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
}

export function StarRating({
  rating,
  maxStars = 5,
  size = 20,
  interactive = false,
  onRate,
}: StarRatingProps) {
  const stars = [];

  for (let i = 1; i <= maxStars; i++) {
    const filled = i <= Math.round(rating);
    const star = (
      <Pressable
        key={i}
        onPress={() => interactive && onRate?.(i)}
        disabled={!interactive}
      >
        <ThemedText style={[styles.star, { fontSize: size }]}>
          {filled ? "\u2605" : "\u2606"}
        </ThemedText>
      </Pressable>
    );
    stars.push(star);
  }

  return <View style={styles.container}>{stars}</View>;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  star: {
    color: "#f5a623",
    marginRight: 2,
  },
});
