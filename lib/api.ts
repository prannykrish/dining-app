const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

export interface StationDetail {
  id: number;
  name: string;
  meal_id: number | null;
  meal_type: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  dining_hall: string | null;
  avg_rating: number | null;
  review_count: number;
  items: { id: number; name: string; allergens: string[] }[];
  reviews: Review[];
}

export async function fetchStation(id: number): Promise<StationDetail> {
  const res = await fetch(`${API_BASE}/station?id=${id}`);
  if (!res.ok) throw new Error(`Failed to fetch station: ${res.status}`);
  return res.json();
}

export interface StationItem {
  id: number;
  name: string;
}

export interface Station {
  id: number;
  name: string;
  avg_rating: number | null;
  review_count: number;
  items: StationItem[];
}

export interface MealMenu {
  dining_hall: string;
  meal_type: string;
  date: string;
  meal_id: number;
  /** "HH:MM:SS" in local (College Station) time, or null if unknown */
  start_time: string | null;
  end_time: string | null;
  stations: Station[];
}

export interface Review {
  id: number;
  username: string;
  rating: number;
  text: string | null;
  photo_urls: string[];
  created_at: string;
}

export async function fetchMenus(params: {
  date?: string;
  hall?: string;
  meal?: string;
}): Promise<MealMenu[]> {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.hall) query.set("hall", params.hall);
  if (params.meal) query.set("meal", params.meal);

  const res = await fetch(`${API_BASE}/menus?${query}`);
  if (!res.ok) throw new Error(`Failed to fetch menus: ${res.status}`);
  return res.json();
}

export async function fetchReviews(stationId: number): Promise<Review[]> {
  const res = await fetch(`${API_BASE}/reviews?station_id=${stationId}`);
  if (!res.ok) throw new Error(`Failed to fetch reviews: ${res.status}`);
  return res.json();
}

export async function submitReview(data: {
  token: string;
  station_id: number;
  rating: number;
  text?: string;
  photo_urls?: string[];
}): Promise<Review> {
  const { token, ...body } = data;
  const res = await fetch(`${API_BASE}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to submit review: ${res.status}`);
  return res.json();
}
