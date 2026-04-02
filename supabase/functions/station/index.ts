import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const stationId = url.searchParams.get("id");

  if (!stationId) {
    return new Response(JSON.stringify({ error: "id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch station + meal context + items with allergens
  const { data: station, error } = await supabase
    .from("stations")
    .select(
      `
      id,
      name,
      meals (
        id,
        meal_type,
        date,
        start_time,
        end_time,
        dining_halls ( name )
      ),
      menu_items ( id, name, allergens )
    `
    )
    .eq("id", parseInt(stationId))
    .single();

  if (error || !station) {
    return new Response(JSON.stringify({ error: "Station not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch reviews with photos
  const { data: reviews } = await supabase
    .from("reviews")
    .select(`id, rating, text, photo_urls, created_at, users ( username )`)
    .eq("station_id", parseInt(stationId))
    .order("created_at", { ascending: false });

  const meal = station.meals as any;
  const avgRating =
    reviews && reviews.length > 0
      ? Math.round(
          (reviews.reduce((sum: number, r: any) => sum + r.rating, 0) /
            reviews.length) *
            10
        ) / 10
      : null;

  const result = {
    id: station.id,
    name: station.name,
    meal_id: meal?.id ?? null,
    meal_type: meal?.meal_type ?? null,
    date: meal?.date ?? null,
    start_time: meal?.start_time ?? null,
    end_time: meal?.end_time ?? null,
    dining_hall: (meal?.dining_halls as any)?.name ?? null,
    avg_rating: avgRating,
    review_count: reviews?.length ?? 0,
    items: (station.menu_items || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      allergens: item.allergens ?? [],
    })),
    reviews: (reviews || []).map((r: any) => ({
      id: r.id,
      username: r.users?.username ?? "Aggie",
      rating: r.rating,
      text: r.text,
      photo_urls: r.photo_urls ?? [],
      created_at: r.created_at,
    })),
  };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
