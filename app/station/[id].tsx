import { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import * as ImagePicker from "expo-image-picker";

import { ThemedText } from "@/components/themed-text";
import { StarRating } from "@/components/star-rating";
import { uploadReviewPhoto } from "@/lib/supabase";
import { fetchStation, submitReview, StationDetail, Review } from "@/lib/api";

// ── Design tokens (same as feed) ─────────────────────────────────
const M = "#500000";
const M_SOFT = "#FFF0F0";
const BG = "#FBF5EE";
const CARD = "#FFFFFF";
const BORDER = "#EDD8D8";
const MUTED = "#9B7B7B";
const GOLD = "#C9913D";

// ── Helpers ───────────────────────────────────────────────────────
type MealStatus = "open" | "closing_soon" | "closed" | "upcoming" | "unknown";

function getMealStatus(start: string | null, end: string | null) {
  if (!start || !end) return { status: "unknown" as MealStatus, label: "", timeRange: "" };
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const s = new Date(`${today}T${start}`);
  const e = new Date(`${today}T${end}`);
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const timeRange = `${fmt(s)} – ${fmt(e)}`;
  if (now < s) {
    const m = Math.round((s.getTime() - now.getTime()) / 60000);
    return { status: "upcoming" as MealStatus, label: m < 60 ? `Opens in ${m} min` : `Opens at ${fmt(s)}`, timeRange };
  }
  if (now > e) return { status: "closed" as MealStatus, label: "Closed", timeRange };
  const m = Math.round((e.getTime() - now.getTime()) / 60000);
  if (m <= 30) return { status: "closing_soon" as MealStatus, label: `Closing in ${m} min`, timeRange };
  return { status: "open" as MealStatus, label: `Open until ${fmt(e)}`, timeRange };
}

const STATUS_COLOR: Record<MealStatus, string> = {
  open: "#16a34a",
  closing_soon: "#d97706",
  closed: "#9ca3af",
  upcoming: "#2563eb",
  unknown: "transparent",
};

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const COMMON_ALLERGENS: Record<string, string> = {
  Eggs: "🥚",
  Milk: "🥛",
  Gluten: "🌾",
  Wheat: "🌾",
  Peanuts: "🥜",
  "Tree Nuts": "🌰",
  Fish: "🐟",
  Shellfish: "🦐",
  Soy: "🫘",
  Sesame: "🌿",
};

// ── ReviewCard ────────────────────────────────────────────────────
function ReviewCard({ review }: { review: Review }) {
  return (
    <View style={d.reviewCard}>
      <View style={d.reviewHeader}>
        <View style={d.reviewAvatar}>
          <ThemedText style={d.reviewAvatarText}>
            {(review.username?.[0] ?? "A").toUpperCase()}
          </ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <View style={d.reviewMeta}>
            <ThemedText style={d.reviewUser}>{review.username}</ThemedText>
            <ThemedText style={d.reviewDate}>
              {new Date(review.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </ThemedText>
          </View>
          <StarRating rating={review.rating} size={12} />
        </View>
      </View>
      {review.text ? (
        <ThemedText style={d.reviewText}>{review.text}</ThemedText>
      ) : null}
      {review.photo_urls && review.photo_urls.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={d.photoRow}>
          {review.photo_urls.map((url, i) => (
            <Image key={i} source={{ uri: url }} style={d.photoThumb} resizeMode="cover" />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Page ──────────────────────────────────────────────────────────
export default function StationPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [station, setStation] = useState<StationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Review form state
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const data = await fetchStation(Number(id));
      setStation(data);
    } catch {
      Alert.alert("Error", "Could not load station.");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  };

  const handleSubmit = async () => {
    if (!isSignedIn) { router.push("/sign-in"); return; }
    if (rating === 0) { Alert.alert("Rate first", "Tap a star to set your rating."); return; }
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      let uploadedUrls: string[] = [];
      if (photos.length > 0) {
        uploadedUrls = await Promise.all(photos.map(uploadReviewPhoto));
      }
      await submitReview({
        token,
        station_id: Number(id),
        rating,
        text: text.trim() || undefined,
        photo_urls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
      });
      setRating(0);
      setText("");
      setPhotos([]);
      await load(); // refresh to show new review
    } catch {
      Alert.alert("Error", "Failed to post review.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !station) {
    return (
      <View style={[d.root, d.centered]}>
        <ActivityIndicator size="large" color={M} />
      </View>
    );
  }

  const { status, label: statusLabel, timeRange } = getMealStatus(
    station.start_time,
    station.end_time
  );

  // Collect all photos from reviews
  const allPhotos = station.reviews.flatMap((r) => r.photo_urls ?? []);

  // All unique allergens across all items
  const allAllergens = [
    ...new Set(station.items.flatMap((item) => item.allergens)),
  ];

  // ── Left panel ──────────────────────────────────────────────
  const LeftPanel = (
    <ScrollView
      style={[d.leftPanel, isWide && d.leftPanelWide]}
      showsVerticalScrollIndicator={false}
    >
      {/* Location card */}
      <View style={d.infoCard}>
        <ThemedText style={d.infoCardLabel}>📍 Location</ThemedText>
        <ThemedText style={d.infoCardValue}>{station.dining_hall}</ThemedText>
        <ThemedText style={d.infoCardSub}>
          {MEAL_LABELS[station.meal_type ?? ""] ?? station.meal_type} at {station.dining_hall}
        </ThemedText>
      </View>

      {/* Hours card */}
      <View style={d.infoCard}>
        <ThemedText style={d.infoCardLabel}>🕐 Hours</ThemedText>
        {timeRange ? (
          <ThemedText style={d.infoCardValue}>{timeRange}</ThemedText>
        ) : (
          <ThemedText style={d.infoCardValue}>Hours unavailable</ThemedText>
        )}
        {statusLabel ? (
          <View style={d.statusRow}>
            <View style={[d.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
            <ThemedText style={[d.statusLabel, { color: STATUS_COLOR[status] }]}>
              {statusLabel}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Allergens summary */}
      {allAllergens.length > 0 && (
        <View style={d.infoCard}>
          <ThemedText style={d.infoCardLabel}>⚠️ Allergens Present</ThemedText>
          <View style={d.allergenGrid}>
            {allAllergens.map((a) => (
              <View key={a} style={d.allergenTag}>
                <ThemedText style={d.allergenTagText}>
                  {COMMON_ALLERGENS[a] ?? "⚠️"} {a}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Items list with per-item allergens */}
      <View style={d.infoCard}>
        <ThemedText style={d.infoCardLabel}>🍽 Menu Items</ThemedText>
        {station.items.map((item) => (
          <View key={item.id} style={d.itemRow}>
            <ThemedText style={d.itemName}>{item.name}</ThemedText>
            {item.allergens.length > 0 && (
              <View style={d.itemAllergens}>
                {item.allergens.map((a) => (
                  <View key={a} style={d.allergenTagSmall}>
                    <ThemedText style={d.allergenTagSmallText}>
                      {COMMON_ALLERGENS[a] ?? "⚠️"} {a}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Photo gallery from reviews */}
      {allPhotos.length > 0 && (
        <View style={d.infoCard}>
          <ThemedText style={d.infoCardLabel}>📷 Community Photos</ThemedText>
          <View style={d.photoGrid}>
            {allPhotos.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={d.photoGridImg} resizeMode="cover" />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );

  // ── Right panel ─────────────────────────────────────────────
  const RightPanel = (
    <ScrollView
      style={d.rightPanel}
      showsVerticalScrollIndicator={false}
    >
      {/* Rating summary */}
      <View style={d.ratingCard}>
        <View style={d.ratingBig}>
          <ThemedText style={d.ratingBigNumber}>
            {station.avg_rating ? station.avg_rating.toFixed(1) : "—"}
          </ThemedText>
          <View>
            <StarRating rating={station.avg_rating ?? 0} size={20} />
            <ThemedText style={d.ratingSubText}>
              {station.review_count > 0
                ? `${station.review_count} review${station.review_count !== 1 ? "s" : ""}`
                : "No reviews yet"}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Review form */}
      {isSignedIn ? (
        <View style={d.reviewForm}>
          <ThemedText style={d.reviewFormTitle}>Leave a Review</ThemedText>
          <StarRating rating={rating} size={32} interactive onRate={setRating} />
          <TextInput
            style={d.textInput}
            placeholder="How was it? (optional)"
            placeholderTextColor={MUTED}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
          />
          <Pressable style={d.photoBtn} onPress={pickPhotos}>
            <ThemedText style={d.photoBtnText}>📷 Attach Photos</ThemedText>
          </Pressable>
          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {photos.map((uri, i) => (
                <View key={i} style={d.photoPreviewWrap}>
                  <Image source={{ uri }} style={d.photoPreview} resizeMode="cover" />
                  <Pressable
                    style={d.removePhoto}
                    onPress={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <ThemedText style={d.removePhotoText}>×</ThemedText>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          <Pressable
            style={[d.submitBtn, (rating === 0 || submitting) && d.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={rating === 0 || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={d.submitBtnText}>Post Review</ThemedText>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable style={d.signInBanner} onPress={() => router.push("/sign-in")}>
          <ThemedText style={d.signInBannerText}>Sign in to leave a review →</ThemedText>
        </Pressable>
      )}

      {/* Reviews list */}
      <ThemedText style={d.reviewsHeading}>
        {station.review_count > 0 ? "Reviews" : "No reviews yet"}
      </ThemedText>
      {station.reviews.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
    </ScrollView>
  );

  return (
    <View style={d.root}>
      {/* Page header */}
      <View style={d.header}>
        <Pressable style={d.backBtn} onPress={() => router.back()}>
          <ThemedText style={d.backBtnText}>← Back</ThemedText>
        </Pressable>
        <View style={d.headerCenter}>
          <ThemedText style={d.headerTitle}>{station.name}</ThemedText>
          <ThemedText style={d.headerSub}>
            {station.dining_hall} · {MEAL_LABELS[station.meal_type ?? ""] ?? station.meal_type}
          </ThemedText>
        </View>
      </View>

      {/* Two-column layout */}
      <View style={[d.body, isWide && d.bodyRow]}>
        {LeftPanel}
        {RightPanel}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const d = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  centered: { justifyContent: "center", alignItems: "center" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 14,
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: M,
  },
  backBtnText: { fontSize: 13, fontWeight: "600", color: M },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#1a0a0a" },
  headerSub: { fontSize: 12, color: MUTED, marginTop: 2 },

  // Body layout
  body: { flex: 1 },
  bodyRow: { flexDirection: "row" },

  // Left panel
  leftPanel: { flex: 1, padding: 14 },
  leftPanelWide: { maxWidth: 380, borderRightWidth: 1, borderRightColor: BORDER },

  // Right panel
  rightPanel: { flex: 1, padding: 14 },

  // Info cards
  infoCard: {
    backgroundColor: CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 12,
    shadowColor: M,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  infoCardLabel: { fontSize: 12, fontWeight: "700", color: MUTED, marginBottom: 6, letterSpacing: 0.4 },
  infoCardValue: { fontSize: 16, fontWeight: "700", color: "#1a0a0a", marginBottom: 3 },
  infoCardSub: { fontSize: 13, color: MUTED },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 13, fontWeight: "700" },

  // Allergens
  allergenGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  allergenTag: {
    backgroundColor: "#FFF3F3",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  allergenTagText: { fontSize: 12, color: "#7f1d1d", fontWeight: "600" },

  // Items
  itemRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  itemName: { fontSize: 14, fontWeight: "600", color: "#1a0a0a", marginBottom: 4 },
  itemAllergens: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  allergenTagSmall: {
    backgroundColor: "#FFF3F3",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  allergenTagSmallText: { fontSize: 10, color: "#7f1d1d", fontWeight: "600" },

  // Photo gallery
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  photoGridImg: { width: 100, height: 100, borderRadius: 8, backgroundColor: BORDER },

  // Rating summary card
  ratingCard: {
    backgroundColor: CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
  },
  ratingBig: { flexDirection: "row", alignItems: "center", gap: 16 },
  ratingBigNumber: { fontSize: 48, fontWeight: "800", color: M, lineHeight: 56 },
  ratingSubText: { fontSize: 12, color: MUTED, marginTop: 4 },

  // Review form
  reviewForm: {
    backgroundColor: CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  reviewFormTitle: { fontSize: 15, fontWeight: "700", color: "#1a0a0a" },
  textInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#1a0a0a",
    minHeight: 72,
    textAlignVertical: "top",
    backgroundColor: BG,
  },
  photoBtn: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
    backgroundColor: BG,
  },
  photoBtnText: { fontSize: 13, color: MUTED, fontWeight: "600" },
  photoPreviewWrap: { position: "relative", marginRight: 8 },
  photoPreview: { width: 80, height: 80, borderRadius: 8 },
  removePhoto: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: M,
    alignItems: "center",
    justifyContent: "center",
  },
  removePhotoText: { fontSize: 14, color: "#fff", lineHeight: 19 },
  submitBtn: {
    backgroundColor: M,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  signInBanner: {
    backgroundColor: M_SOFT,
    borderWidth: 1.5,
    borderColor: M,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  signInBannerText: { color: M, fontWeight: "700", fontSize: 14 },

  // Reviews
  reviewsHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a0a0a",
    marginBottom: 10,
    marginTop: 4,
  },
  reviewCard: {
    backgroundColor: CARD,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 10,
  },
  reviewHeader: { flexDirection: "row", gap: 10, marginBottom: 8 },
  reviewAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: M,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewAvatarText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  reviewMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  reviewUser: { fontSize: 14, fontWeight: "700", color: "#1a0a0a", flex: 1 },
  reviewDate: { fontSize: 11, color: MUTED },
  reviewText: { fontSize: 14, color: "#3d2020", lineHeight: 20, marginBottom: 8 },
  photoRow: { marginTop: 4 },
  photoThumb: { width: 130, height: 100, borderRadius: 8, marginRight: 8, backgroundColor: BORDER },
});
