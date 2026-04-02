import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DINING_HALLS: Record<string, string> = {
  Commons: "59972586ee596fe55d2eef75",
  Sbisa: "587909deee596f31cedc179c",
  Duncan: "5878eb5cee596f847636f114",
};

const PERIOD_MAP: Record<string, string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  brunch: "lunch",
};

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
};

// Parse a time out of an ISO datetime string ("2026-04-02T11:00:00") or a bare
// time string ("11:00:00" / "11:00"). Returns "HH:MM:SS" or null.
function parseTime(raw: string | undefined): string | null {
  if (!raw) return null;
  const timePart = raw.includes("T") ? raw.split("T")[1] : raw;
  if (/^\d{1,2}:\d{2}/.test(timePart)) {
    // Pad to HH:MM:SS
    const parts = timePart.substring(0, 8).split(":");
    return parts
      .slice(0, 3)
      .map((p) => p.padStart(2, "0"))
      .join(":");
  }
  return null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const date =
    url.searchParams.get("date") || new Date().toISOString().split("T")[0];

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const log: string[] = [`Scraping menus for ${date}`];

  for (const [hallName, locationId] of Object.entries(DINING_HALLS)) {
    log.push(`--- ${hallName} ---`);

    const { data: hall } = await supabase
      .from("dining_halls")
      .select("id")
      .eq("name", hallName)
      .single();

    if (!hall) {
      log.push(`  Not found in DB, skipping`);
      continue;
    }

    const periodsResp = await fetch(
      `https://apiv4.dineoncampus.com/locations/${locationId}/periods/?date=${date}`,
      { headers: FETCH_HEADERS }
    );

    if (!periodsResp.ok) {
      log.push(`  Failed to fetch periods: ${periodsResp.status}`);
      continue;
    }

    const periodsData = await periodsResp.json();
    const periods: any[] = periodsData.periods || [];

    if (!periods.length) {
      log.push(`  No periods found (dining hall may be closed)`);
      continue;
    }

    for (const period of periods) {
      const mealType = PERIOD_MAP[period.name?.toLowerCase()];
      if (!mealType) continue;

      const startTime = parseTime(period.start_time);
      const endTime = parseTime(period.end_time);

      const menuResp = await fetch(
        `https://apiv4.dineoncampus.com/locations/${locationId}/menu?date=${date}&period=${period.id}`,
        { headers: FETCH_HEADERS }
      );

      if (!menuResp.ok) {
        log.push(`  ${mealType}: failed (${menuResp.status})`);
        continue;
      }

      const menuData = await menuResp.json();
      const categories: any[] = menuData.period?.categories || [];

      // Find or create meal record, always updating the hours
      const { data: existingMeal } = await supabase
        .from("meals")
        .select("id")
        .eq("meal_type", mealType)
        .eq("date", date)
        .eq("dining_hall_id", hall.id)
        .single();

      let mealId: number;
      if (existingMeal) {
        mealId = existingMeal.id;
        if (startTime || endTime) {
          await supabase
            .from("meals")
            .update({ start_time: startTime, end_time: endTime })
            .eq("id", mealId);
        }
      } else {
        const { data: newMeal, error: mealErr } = await supabase
          .from("meals")
          .insert({
            meal_type: mealType,
            date,
            dining_hall_id: hall.id,
            start_time: startTime,
            end_time: endTime,
          })
          .select("id")
          .single();
        if (mealErr || !newMeal) {
          log.push(`  ${mealType}: failed to create meal record`);
          continue;
        }
        mealId = newMeal.id;
      }

      // Clear old items first (they FK into stations), then clear stations
      await supabase.from("menu_items").delete().eq("meal_id", mealId);
      await supabase.from("stations").delete().eq("meal_id", mealId);

      const uniqueCategories = [
        ...new Set(
          categories.map((cat: any) => cat.name?.trim()).filter(Boolean)
        ),
      ] as string[];

      const { data: stationData, error: stationErr } = await supabase
        .from("stations")
        .upsert(
          uniqueCategories.map((name) => ({ meal_id: mealId, name })),
          { onConflict: "meal_id,name" }
        )
        .select("id, name");

      if (stationErr || !stationData) {
        log.push(`  ${mealType}: failed to upsert stations`);
        continue;
      }

      const stationMap: Record<string, number> = {};
      for (const s of stationData) {
        stationMap[s.name] = s.id;
      }

      const itemRows = categories.flatMap((cat: any) => {
        const catName: string = cat.name?.trim() || "";
        const stationId = stationMap[catName] ?? null;
        return (cat.items || [])
          .filter((item: any) => item.name?.trim())
          .map((item: any) => {
            const allergens = (item.allergens || [])
              .filter((a: any) => a.value && a.name)
              .map((a: any) => a.name as string);
            return {
              name: item.name.trim(),
              category: catName,
              meal_id: mealId,
              station_id: stationId,
              allergens,
            };
          });
      });

      if (itemRows.length > 0) {
        await supabase.from("menu_items").insert(itemRows);
      }

      log.push(
        `  ${mealType}: ${uniqueCategories.length} stations, ${itemRows.length} items (${startTime ?? "?"} – ${endTime ?? "?"})`
      );
    }
  }

  return new Response(JSON.stringify({ date, log }), {
    headers: { "Content-Type": "application/json" },
  });
});
