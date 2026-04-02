import { useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";

import { ThemedText } from "@/components/themed-text";
import { StarRating } from "@/components/star-rating";
import { fetchMenus, MealMenu, Station } from "@/lib/api";

// ── Design tokens ─────────────────────────────────────────────────
const M = "#500000"; // maroon
const M_SOFT = "#FFF0F0"; // light maroon tint
const BG = "#FBF5EE"; // warm cream background
const CARD = "#FFFFFF"; // white card
const BORDER = "#EDD8D8"; // warm pinkish border
const MUTED = "#9B7B7B"; // muted maroon-grey text
const GOLD = "#C9913D"; // warm gold for stars

// ── Helpers ───────────────────────────────────────────────────────
const DINING_HALLS = ["Commons", "Sbisa", "Duncan"];
const MEAL_ORDER = ["breakfast", "lunch", "dinner"];
const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

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

// ── Station card ──────────────────────────────────────────────────
function StationCard({
  station,
  mealLabel,
  status,
  statusLabel,
  timeRange,
  onPress,
}: {
  station: Station;
  mealLabel: string;
  status: MealStatus;
  statusLabel: string;
  timeRange: string;
  onPress: () => void;
}) {
  const PREVIEW = 4;
  const extra = station.items.length - PREVIEW;

  return (
    <Pressable style={c.card} onPress={onPress}>
      {/* Left accent bar */}
      <View style={[c.cardAccent, { backgroundColor: station.avg_rating ? GOLD : BORDER }]} />

      {/* Rating column */}
      <View style={c.ratingCol}>
        <ThemedText style={c.ratingStarIcon}>★</ThemedText>
        <ThemedText style={c.ratingScore}>
          {station.avg_rating ? station.avg_rating.toFixed(1) : "—"}
        </ThemedText>
        {station.review_count > 0 && (
          <ThemedText style={c.ratingCount}>{station.review_count}</ThemedText>
        )}
      </View>

      {/* Main content */}
      <View style={c.cardBody}>
        {/* Top badges */}
        <View style={c.badgeRow}>
          <View style={c.mealBadge}>
            <ThemedText style={c.mealBadgeText}>{mealLabel}</ThemedText>
          </View>
          {timeRange ? (
            <ThemedText style={c.timeText}>{timeRange}</ThemedText>
          ) : null}
          {statusLabel ? (
            <View style={[c.statusPill, { borderColor: STATUS_COLOR[status] }]}>
              <View style={[c.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
              <ThemedText style={[c.statusPillText, { color: STATUS_COLOR[status] }]}>
                {statusLabel}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {/* Station name */}
        <ThemedText style={c.stationName}>{station.name}</ThemedText>

        {/* Items preview */}
        <View style={c.itemList}>
          {station.items.slice(0, PREVIEW).map((item) => (
            <ThemedText key={item.id} style={c.itemText}>
              {item.name}
            </ThemedText>
          ))}
          {extra > 0 && (
            <ThemedText style={c.itemMore}>+{extra} more items</ThemedText>
          )}
        </View>

        {/* Footer */}
        <View style={c.cardFooter}>
          <View style={c.footerLeft}>
            {station.avg_rating ? (
              <StarRating rating={station.avg_rating} size={12} />
            ) : null}
            <ThemedText style={c.footerReviews}>
              {station.review_count > 0
                ? `${station.review_count} review${station.review_count !== 1 ? "s" : ""}`
                : "No reviews yet"}
            </ThemedText>
          </View>
          <View style={c.viewBtn}>
            <ThemedText style={c.viewBtnText}>View & Review →</ThemedText>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { user } = useUser();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [menus, setMenus] = useState<MealMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeHall, setActiveHall] = useState("Commons");
  const [activeMeal, setActiveMeal] = useState<string | null>(null);

  const today = useCallback(() => new Date().toLocaleDateString("en-CA"), []);

  const loadMenus = useCallback(async () => {
    try {
      const data = await fetchMenus({ date: today() });
      setMenus(data);
    } catch {
      console.error("Failed to load menus");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today]);

  useEffect(() => { loadMenus(); }, [loadMenus]);

  const hallMenus = menus
    .filter((m) => m.dining_hall === activeHall)
    .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type));

  const filteredMenus = activeMeal
    ? hallMenus.filter((m) => m.meal_type === activeMeal)
    : hallMenus;

  // ── Sidebar ──────────────────────────────────────────────────
  const Sidebar = (
    <View style={c.sidebar}>
      <View style={c.sidebarBrand}>
        <ThemedText style={c.sidebarTitle}>Aggie Dining</ThemedText>
        <ThemedText style={c.sidebarDate}>
          {new Date().toLocaleDateString("en-US", {
            weekday: "long", month: "short", day: "numeric",
          })}
        </ThemedText>
      </View>

      {/* Auth */}
      <View style={c.sidebarBlock}>
        {isSignedIn ? (
          <View style={c.sidebarUser}>
            <View style={c.sidebarAvatar}>
              <ThemedText style={c.sidebarAvatarText}>
                {(user?.firstName?.[0] ?? user?.username?.[0] ?? "A").toUpperCase()}
              </ThemedText>
            </View>
            <View>
              <ThemedText style={c.sidebarUserName}>
                {user?.firstName ?? user?.username ?? "Aggie"}
              </ThemedText>
              <Pressable onPress={() => router.push("/sign-in")}>
                <ThemedText style={c.sidebarUserSub}>Manage account</ThemedText>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={c.sidebarSignInBtn} onPress={() => router.push("/sign-in")}>
            <ThemedText style={c.sidebarSignInText}>Sign in to leave reviews</ThemedText>
          </Pressable>
        )}
      </View>

      {/* Dining halls */}
      <View style={c.sidebarBlock}>
        <ThemedText style={c.sidebarBlockLabel}>DINING HALLS</ThemedText>
        {DINING_HALLS.map((hall) => (
          <Pressable
            key={hall}
            style={[c.sidebarLink, activeHall === hall && c.sidebarLinkActive]}
            onPress={() => { setActiveHall(hall); setActiveMeal(null); }}
          >
            <ThemedText style={[c.sidebarLinkText, activeHall === hall && c.sidebarLinkTextActive]}>
              {hall}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* Meal filter */}
      {hallMenus.length > 0 && (
        <View style={c.sidebarBlock}>
          <ThemedText style={c.sidebarBlockLabel}>MEAL PERIOD</ThemedText>
          {[null, ...hallMenus.map((m) => m.meal_type)].map((meal) => {
            const menu = hallMenus.find((m) => m.meal_type === meal);
            const { status } = menu
              ? getMealStatus(menu.start_time, menu.end_time)
              : { status: "unknown" as MealStatus };
            return (
              <Pressable
                key={meal ?? "all"}
                style={[c.sidebarLink, activeMeal === meal && c.sidebarLinkActive]}
                onPress={() => setActiveMeal(meal)}
              >
                <ThemedText
                  style={[c.sidebarLinkText, activeMeal === meal && c.sidebarLinkTextActive]}
                >
                  {meal ? MEAL_LABELS[meal] : "All"}
                </ThemedText>
                {meal && (
                  <View style={[c.sidebarDot, { backgroundColor: STATUS_COLOR[status] }]} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  if (!authLoaded || loading) {
    return (
      <View style={[c.root, c.centered]}>
        <ActivityIndicator size="large" color={M} />
        <ThemedText style={c.loadingText}>Loading menus…</ThemedText>
      </View>
    );
  }

  return (
    <View style={c.root}>
      {isWide && Sidebar}

      <ScrollView
        style={c.feed}
        contentContainerStyle={c.feedContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMenus(); }} tintColor={M} />
        }
      >
        {/* Mobile dining hall tabs */}
        {!isWide && (
          <View style={c.mobileTabs}>
            {DINING_HALLS.map((hall) => (
              <Pressable
                key={hall}
                style={[c.mobileTab, activeHall === hall && c.mobileTabActive]}
                onPress={() => { setActiveHall(hall); setActiveMeal(null); }}
              >
                <ThemedText style={[c.mobileTabText, activeHall === hall && c.mobileTabTextActive]}>
                  {hall}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        {/* Feed header */}
        <View style={c.feedHeader}>
          <View>
            <ThemedText style={c.feedHall}>{activeHall}</ThemedText>
            <ThemedText style={c.feedSubhead}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </ThemedText>
          </View>
          {!isWide && !isSignedIn && (
            <Pressable style={c.headerSignIn} onPress={() => router.push("/sign-in")}>
              <ThemedText style={c.headerSignInText}>Sign In</ThemedText>
            </Pressable>
          )}
        </View>

        {/* Mobile meal pills */}
        {!isWide && hallMenus.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={c.pillRow}>
            {[null, ...hallMenus.map((m) => m.meal_type)].map((meal) => {
              const menu = hallMenus.find((m) => m.meal_type === meal);
              const { status } = menu
                ? getMealStatus(menu.start_time, menu.end_time)
                : { status: "unknown" as MealStatus };
              return (
                <Pressable
                  key={meal ?? "all"}
                  style={[c.pill, activeMeal === meal && c.pillActive]}
                  onPress={() => setActiveMeal(meal)}
                >
                  {meal && (
                    <View style={[c.pillDot, { backgroundColor: STATUS_COLOR[status] }]} />
                  )}
                  <ThemedText style={[c.pillText, activeMeal === meal && c.pillTextActive]}>
                    {meal ? MEAL_LABELS[meal] : "All"}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Station cards */}
        {filteredMenus.length === 0 ? (
          <View style={c.empty}>
            <ThemedText style={c.emptyText}>{activeHall} is closed today.</ThemedText>
          </View>
        ) : (
          filteredMenus.flatMap((meal) => {
            const { status, label, timeRange } = getMealStatus(meal.start_time, meal.end_time);
            return meal.stations.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                mealLabel={MEAL_LABELS[meal.meal_type] ?? meal.meal_type}
                status={status}
                statusLabel={label}
                timeRange={timeRange}
                onPress={() => router.push(`/station/${station.id}`)}
              />
            ));
          })
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const c = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: BG },
  centered: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: MUTED },

  // Sidebar
  sidebar: {
    width: 240,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    paddingTop: 56,
    backgroundColor: CARD,
  },
  sidebarBrand: { paddingHorizontal: 18, paddingBottom: 16 },
  sidebarTitle: { fontSize: 18, fontWeight: "800", color: M },
  sidebarDate: { fontSize: 12, color: MUTED, marginTop: 2 },
  sidebarBlock: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  sidebarBlockLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.8,
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  sidebarLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 2,
  },
  sidebarLinkActive: { backgroundColor: M_SOFT },
  sidebarLinkText: { fontSize: 14, color: "#3d2020" },
  sidebarLinkTextActive: { color: M, fontWeight: "700" },
  sidebarDot: { width: 7, height: 7, borderRadius: 4 },
  sidebarUser: { flexDirection: "row", alignItems: "center", gap: 10 },
  sidebarAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: M,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarAvatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  sidebarUserName: { fontSize: 14, fontWeight: "600", color: "#1a0a0a" },
  sidebarUserSub: { fontSize: 11, color: MUTED },
  sidebarSignInBtn: {
    backgroundColor: M,
    borderRadius: 20,
    paddingVertical: 9,
    alignItems: "center",
  },
  sidebarSignInText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Feed
  feed: { flex: 1 },
  feedContent: { paddingBottom: 60, paddingTop: 56 },
  feedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  feedHall: { fontSize: 24, fontWeight: "800", color: "#1a0a0a" },
  feedSubhead: { fontSize: 13, color: MUTED, marginTop: 2 },
  headerSignIn: {
    borderWidth: 1.5,
    borderColor: M,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  headerSignInText: { fontSize: 13, fontWeight: "700", color: M },

  // Mobile tabs
  mobileTabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: M,
  },
  mobileTab: { flex: 1, paddingVertical: 9, alignItems: "center" },
  mobileTabActive: { backgroundColor: M },
  mobileTabText: { fontSize: 14, fontWeight: "600", color: M },
  mobileTabTextActive: { color: "#fff" },

  // Meal pills
  pillRow: { paddingLeft: 16, marginBottom: 16 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BORDER,
    marginRight: 8,
    backgroundColor: CARD,
  },
  pillActive: { borderColor: M, backgroundColor: M_SOFT },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 13, color: MUTED, fontWeight: "600" },
  pillTextActive: { color: M },

  // Station card
  card: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    overflow: "hidden",
    // shadow
    shadowColor: "#500000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardAccent: { width: 4 },
  ratingCol: {
    width: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    backgroundColor: M_SOFT,
    gap: 3,
  },
  ratingStarIcon: { fontSize: 16, color: GOLD },
  ratingScore: { fontSize: 14, fontWeight: "800", color: M },
  ratingCount: { fontSize: 11, color: MUTED },
  cardBody: { flex: 1, padding: 14 },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  mealBadge: {
    backgroundColor: M_SOFT,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: BORDER,
  },
  mealBadgeText: { fontSize: 11, color: M, fontWeight: "700" },
  timeText: { fontSize: 11, color: MUTED },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: "600" },
  stationName: { fontSize: 17, fontWeight: "800", color: "#1a0a0a", marginBottom: 8 },
  itemList: { gap: 2, marginBottom: 12 },
  itemText: { fontSize: 13, color: "#5a3a3a" },
  itemMore: { fontSize: 12, color: MUTED, fontStyle: "italic" },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  footerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  footerReviews: { fontSize: 12, color: MUTED },
  viewBtn: {
    backgroundColor: M,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  viewBtnText: { fontSize: 12, color: "#fff", fontWeight: "700" },

  // Empty
  empty: { padding: 48, alignItems: "center" },
  emptyText: { color: MUTED, fontSize: 15 },
});
