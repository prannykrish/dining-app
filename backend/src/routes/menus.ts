import { Router, Request, Response } from "express";
import supabase from "../db";

const router = Router();

// GET /menus?date=2026-03-26&hall=Duncan&meal=lunch
router.get("/", async (req: Request, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
  const hall = req.query.hall as string | undefined;
  const meal = req.query.meal as string | undefined;

  // Build meals query with dining hall join
  let query = supabase
    .from("meals")
    .select(`
      id,
      meal_type,
      date,
      dining_hall_id,
      dining_halls ( name ),
      menu_items ( id, name )
    `)
    .eq("date", date);

  if (meal) {
    query = query.eq("meal_type", meal);
  }

  if (hall) {
    // Filter by dining hall name via subquery
    const { data: hallData } = await supabase
      .from("dining_halls")
      .select("id")
      .eq("name", hall)
      .single();

    if (!hallData) {
      res.status(404).json({ error: `Dining hall '${hall}' not found` });
      return;
    }
    query = query.eq("dining_hall_id", hallData.id);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Fetch average ratings for all menu items in the result
  const menuItemIds = (data || []).flatMap((m: any) =>
    (m.menu_items || []).map((item: any) => item.id)
  );

  let ratingsMap: Record<number, { avg_rating: number; review_count: number }> = {};

  if (menuItemIds.length > 0) {
    const { data: reviews } = await supabase
      .from("reviews")
      .select("menu_item_id, rating")
      .in("menu_item_id", menuItemIds);

    if (reviews) {
      for (const r of reviews) {
        if (!ratingsMap[r.menu_item_id]) {
          ratingsMap[r.menu_item_id] = { avg_rating: 0, review_count: 0 };
        }
        ratingsMap[r.menu_item_id].review_count++;
        ratingsMap[r.menu_item_id].avg_rating += r.rating;
      }
      for (const id in ratingsMap) {
        ratingsMap[id].avg_rating = Math.round(
          (ratingsMap[id].avg_rating / ratingsMap[id].review_count) * 10
        ) / 10;
      }
    }
  }

  // Shape the response
  const result = (data || []).map((m: any) => ({
    dining_hall: m.dining_halls?.name,
    meal_type: m.meal_type,
    date: m.date,
    meal_id: m.id,
    items: (m.menu_items || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      avg_rating: ratingsMap[item.id]?.avg_rating || null,
      review_count: ratingsMap[item.id]?.review_count || 0,
    })),
  }));

  res.json(result);
});

export default router;
