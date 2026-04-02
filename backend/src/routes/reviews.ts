import { Router, Request, Response } from "express";
import supabase from "../db";

const router = Router();

// GET /reviews?menu_item_id=101
router.get("/", async (req: Request, res: Response) => {
  const menuItemId = req.query.menu_item_id as string;

  if (!menuItemId) {
    res.status(400).json({ error: "menu_item_id is required" });
    return;
  }

  const { data, error } = await supabase
    .from("reviews")
    .select(`
      id,
      rating,
      text,
      created_at,
      users ( username )
    `)
    .eq("menu_item_id", parseInt(menuItemId))
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const result = (data || []).map((r: any) => ({
    id: r.id,
    username: r.users?.username,
    rating: r.rating,
    text: r.text,
    created_at: r.created_at,
  }));

  res.json(result);
});

// POST /reviews
router.post("/", async (req: Request, res: Response) => {
  const { user_id, menu_item_id, rating, text } = req.body;

  // Validate required fields
  if (!user_id || !menu_item_id || !rating) {
    res.status(400).json({ error: "user_id, menu_item_id, and rating are required" });
    return;
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "rating must be an integer between 1 and 5" });
    return;
  }

  if (text && text.length > 500) {
    res.status(400).json({ error: "text must be 500 characters or fewer" });
    return;
  }

  // Upsert: one review per user per menu item
  const { data, error } = await supabase
    .from("reviews")
    .upsert(
      {
        user_id,
        menu_item_id,
        rating,
        text: text || null,
      },
      { onConflict: "user_id,menu_item_id" }
    )
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

export default router;
