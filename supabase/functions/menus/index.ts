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
  const date =
    url.searchParams.get("date") || new Date().toISOString().split("T")[0];
  const hall = url.searchParams.get("hall");
  const meal = url.searchParams.get("meal");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let query = supabase
    .from("meals")
    .select(
      `
      id,
      meal_type,
      date,
      start_time,
      end_time,
      dining_hall_id,
      dining_halls ( name ),
      stations (
        id,
        name,
        menu_items ( id, name )
      )
    `
    )
    .eq("date", date);

  if (meal) query = query.eq("meal_type", meal);

  if (hall) {
    const { data: hallData } = await supabase
      .from("dining_halls")
      .select("id")
      .eq("name", hall)
      .single();

    if (!hallData) {
      return new Response(
        JSON.stringify({ error: `Dining hall '${hall}' not found` }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    query = query.eq("dining_hall_id", hallData.id);
  }

  const { data, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Collect all station IDs to fetch ratings in one query
  const stationIds = (data || []).flatMap((m: any) =>
    (m.stations || []).map((s: any) => s.id)
  );

  const ratingsMap: Record<
    number,
    { avg_rating: number; review_count: number }
  > = {};

  if (stationIds.length > 0) {
    const { data: reviews } = await supabase
      .from("reviews")
      .select("station_id, rating")
      .in("station_id", stationIds);

    if (reviews) {
      for (const r of reviews) {
        if (!ratingsMap[r.station_id]) {
          ratingsMap[r.station_id] = { avg_rating: 0, review_count: 0 };
        }
        ratingsMap[r.station_id].review_count++;
        ratingsMap[r.station_id].avg_rating += r.rating;
      }
      for (const id in ratingsMap) {
        ratingsMap[id].avg_rating =
          Math.round(
            (ratingsMap[id].avg_rating / ratingsMap[id].review_count) * 10
          ) / 10;
      }
    }
  }

  const result = (data || []).map((m: any) => ({
    dining_hall: (m.dining_halls as any)?.name,
    meal_type: m.meal_type,
    date: m.date,
    meal_id: m.id,
    start_time: m.start_time ?? null,
    end_time: m.end_time ?? null,
    stations: (m.stations || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      avg_rating: ratingsMap[s.id]?.avg_rating ?? null,
      review_count: ratingsMap[s.id]?.review_count ?? 0,
      items: (s.menu_items || []).map((item: any) => ({
        id: item.id,
        name: item.name,
      })),
    })),
  }));

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
